import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { publishEvent } from '../services/commentary.js';

const BASE_URL = 'https://cricbuzz-cricket.p.rapidapi.com';
const headers = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
  'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
};

// T015 — fetchLiveMatches
export async function fetchLiveMatches() {
  const endpoint = `${BASE_URL}/matches/v1/live`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', message: 'cricbuzz_api_error', status: res.status, endpoint, timestamp: new Date().toISOString() }));
    throw new Error(`Cricbuzz error: ${res.status}`);
  }
  const data = await res.json();
  return data.typeMatches.flatMap(t =>
    t.seriesMatches.flatMap(s => s.seriesAdWrapper?.matches ?? [])
  );
}

// T016 — fetchCommentary
export async function fetchCommentary(cricbuzzMatchId) {
  const endpoint = `${BASE_URL}/mcenter/v1/${cricbuzzMatchId}/commentary`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', message: 'cricbuzz_api_error', status: res.status, endpoint, timestamp: new Date().toISOString() }));
    throw new Error(`Cricbuzz commentary error: ${res.status}`);
  }
  const data = await res.json();
  return data.commentaryList ?? [];
}

// T017 — deduplicateBall
const lastSeenBall = new Map(); // Map<matchId: number, ballKey: string>

export function deduplicateBall(matchId, ballKey) {
  if (lastSeenBall.get(matchId) === ballKey) return false;
  lastSeenBall.set(matchId, ballKey);
  return true;
}

// T018 — normalizeBall helpers

function mapEventType(event) {
  const map = {
    BOUNDARY: 'boundary_four',
    SIX: 'boundary_six',
    WICKET: 'wicket',
    WIDE: 'wide',
    'NO BALL': 'no_ball',
    'NO-BALL': 'no_ball',
    NOBALL: 'no_ball',
    DOT: 'dot_ball',
    OVER_COMPLETE: 'over_complete',
    INNINGS_START: 'innings_start',
    INNINGS_END: 'innings_end',
    MATCH_START: 'match_start',
    MATCH_END: 'match_end',
    REVIEW: 'review',
    RAIN: 'rain_delay',
  };
  return map[event?.toUpperCase?.()] ?? 'ball';
}

function buildTags(event) {
  const tags = [];
  const upper = event?.toUpperCase?.() ?? '';
  if (upper === 'BOUNDARY') tags.push('boundary', 'four');
  if (upper === 'SIX') tags.push('boundary', 'six');
  if (upper === 'WICKET') tags.push('wicket');
  if (upper === 'WIDE') tags.push('wide');
  if (upper === 'NO BALL' || upper === 'NO-BALL' || upper === 'NOBALL') tags.push('no_ball');
  return tags.length ? tags : null;
}

// T018 — normalizeBall
export function normalizeBall(rawBall, matchId) {
  const over = rawBall.overSep?.balls ?? '0.0';
  const overNum = parseInt(over.split('.')[0], 10);

  return {
    matchId,
    minute:    overNum,
    sequence:  0,         // assigned by DB insert (serial)
    period:    '1ST_INN', // refined by match state logic later
    eventType: mapEventType(rawBall.event),
    actor:     rawBall.batsman1?.batName ?? null,
    team:      rawBall.batTeamName ?? null,
    message:   rawBall.commentsInfo ?? '',
    metadata: {
      over,
      runs:          rawBall.runs ?? 0,
      bowler:        rawBall.bowler1?.bowlName ?? null,
      bowlerWickets: rawBall.bowler1?.bowlWkts ?? 0,
      bowlerRuns:    rawBall.bowler1?.bowlRuns ?? 0,
    },
    tags: buildTags(rawBall.event),
  };
}

// T043 — extractScoreUpdate
const SCORING_EVENTS = new Set(['BOUNDARY', 'SIX', 'RUNS', 'WICKET', 'NO_BALL', 'WIDE']);

export function extractScoreUpdate(rawBall) {
  if (!SCORING_EVENTS.has(rawBall.event)) return null;

  return {
    runs:       rawBall.runs ?? 0,
    wicketFell: rawBall.event === 'WICKET',
    isBoundary: rawBall.event === 'BOUNDARY',
    isSix:      rawBall.event === 'SIX',
  };
}

// T044 — fetchScore
export async function fetchScore(cricbuzzMatchId) {
  const endpoint = `${BASE_URL}/mcenter/v1/${cricbuzzMatchId}/score`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', message: 'cricbuzz_api_error', status: res.status, endpoint, timestamp: new Date().toISOString() }));
    throw new Error(`Cricbuzz score error: ${res.status}`);
  }
  const data = await res.json();
  const innings = data.scoreCard?.[0]; // current innings
  return {
    runs:        innings?.score      ?? 0,
    wickets:     innings?.wickets    ?? 0,
    overs:       innings?.overs?.toString() ?? '0.0',
    runRate:     innings?.runRate    ?? 0,
    inningsNum:  innings?.inningsId  ?? 1,
    battingTeam: innings?.batTeamName ?? '',
  };
}

// T019 — startPolling / stopPolling
const activePollers = new Map(); // Map<matchId, intervalId>
let lastPollTimestamp = null;

export function startPolling(internalMatchId, cricbuzzMatchId) {
  if (activePollers.has(internalMatchId)) return; // already polling

  const interval = setInterval(async () => {
    const matchId = internalMatchId;
    console.log(JSON.stringify({ level: 'info', message: 'poll_start', matchId, timestamp: new Date().toISOString() }));
    try {
      const list = await fetchCommentary(cricbuzzMatchId);
      lastPollTimestamp = new Date().toISOString();
      if (!list.length) return;
      const latest = list[0];
      const ballKey = latest.overSep?.balls;
      if (!ballKey || !deduplicateBall(internalMatchId, ballKey)) return;
      console.log(JSON.stringify({ level: 'info', message: 'new_ball', matchId, ballKey, timestamp: new Date().toISOString() }));
      const event = normalizeBall(latest, internalMatchId);
      await publishEvent(internalMatchId, { ...event, rawBall: latest });
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', message: 'poll_failed', matchId, error: err.message, timestamp: new Date().toISOString() }));
    }
  }, parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10));

  activePollers.set(internalMatchId, interval);
}

export function stopPolling(internalMatchId) {
  const interval = activePollers.get(internalMatchId);
  if (interval) {
    clearInterval(interval);
    activePollers.delete(internalMatchId);
  }
}

export function getActivePollerCount() {
  return activePollers.size;
}

export function getLastPollAt() {
  return lastPollTimestamp;
}

// T024 — startPollingAllLiveMatches
export async function startPollingAllLiveMatches() {
  try {
    const liveMatches = await db.select().from(matches).where(eq(matches.status, 'live'));
    for (const match of liveMatches) {
      if (match.cricbuzzMatchId) {
        startPolling(match.id, match.cricbuzzMatchId);
        console.log(JSON.stringify({
          level: 'info',
          message: 'Polling started',
          matchId: match.id,
          cricbuzzMatchId: match.cricbuzzMatchId,
          timestamp: new Date().toISOString(),
        }));
      }
    }
    console.log(JSON.stringify({
      level: 'info',
      message: `Polling started for ${liveMatches.length} live match(es)`,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to start polling',
      err: err.message,
      timestamp: new Date().toISOString(),
    }));
  }
}

// syncLiveMatches — auto-discovers live matches from Cricbuzz and upserts them into the DB
// Called on startup and every SYNC_INTERVAL_MS (default 5 min)
export async function syncLiveMatches() {
  try {
    const rawMatches = await fetchLiveMatches();
    console.log(JSON.stringify({
      level: 'info',
      message: `syncLiveMatches: found ${rawMatches.length} live match(es) on Cricbuzz`,
      timestamp: new Date().toISOString(),
    }));

    for (const raw of rawMatches) {
      try {
        const info  = raw.matchInfo;
        const score = raw.matchScore;
        if (!info?.matchId) continue;

        const cricbuzzMatchId = info.matchId;
        const homeTeam  = info.team1?.teamSName ?? info.team1?.teamName ?? 'TBD';
        const awayTeam  = info.team2?.teamSName ?? info.team2?.teamName ?? 'TBD';
        const series    = info.seriesName ?? null;
        const format    = normalizeFormat(info.matchFormat);
        const venue     = info.venue ? `${info.venue.name}, ${info.venue.city}` : null;
        const startTime = info.startDate ? new Date(parseInt(info.startDate, 10)) : new Date();

        // Extract scores from matchScore
        const inn1 = score?.team1Score?.inngs1;
        const inn2 = score?.team2Score?.inngs1;
        const homeScore   = inn1?.runs    ?? 0;
        const homeWickets = inn1?.wickets ?? 0;
        const homeOvers   = inn1?.overs   != null ? String(inn1.overs) : '0.0';
        const awayScore   = inn2?.runs    ?? 0;
        const awayWickets = inn2?.wickets ?? 0;
        const awayOvers   = inn2?.overs   != null ? String(inn2.overs) : '0.0';

        // Upsert into DB (insert if new, update scores if already exists)
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          INSERT INTO matches
            (sport, home_team, away_team, series_name, match_format, venue,
             status, cricbuzz_match_id, start_time,
             home_score, home_wickets, home_overs,
             away_score, away_wickets, away_overs)
          VALUES
            ('cricket', ${homeTeam}, ${awayTeam}, ${series}, ${format}, ${venue},
             'live', ${cricbuzzMatchId}, ${startTime},
             ${homeScore}, ${homeWickets}, ${homeOvers},
             ${awayScore}, ${awayWickets}, ${awayOvers})
          ON CONFLICT (cricbuzz_match_id) DO UPDATE
            SET status        = 'live',
                home_score    = EXCLUDED.home_score,
                home_wickets  = EXCLUDED.home_wickets,
                home_overs    = EXCLUDED.home_overs,
                away_score    = EXCLUDED.away_score,
                away_wickets  = EXCLUDED.away_wickets,
                away_overs    = EXCLUDED.away_overs
          RETURNING id, cricbuzz_match_id, home_team, away_team
        `);

        const row = result.rows?.[0];
        if (!row) continue;

        const internalId = row.id;
        console.log(JSON.stringify({
          level: 'info',
          message: 'syncLiveMatches: upserted match',
          internalId,
          cricbuzzMatchId,
          match: `${homeTeam} vs ${awayTeam}`,
          timestamp: new Date().toISOString(),
        }));

        // Start polling if not already active
        startPolling(internalId, cricbuzzMatchId);
      } catch (matchErr) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'syncLiveMatches: failed to upsert match',
          error: matchErr.message,
          timestamp: new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'syncLiveMatches: failed to fetch live matches',
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
  }
}

function normalizeFormat(raw) {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.includes('TEST')) return 'TEST';
  if (upper.includes('ODI')) return 'ODI';
  if (upper.includes('T20') || upper.includes('TWENTY')) return 'T20';
  return raw;
}

// Periodic sync — call this after server starts
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? '300000', 10); // default 5 min
let syncIntervalId = null;

export function startSyncInterval() {
  if (syncIntervalId) return;
  syncIntervalId = setInterval(syncLiveMatches, SYNC_INTERVAL_MS);
  console.log(JSON.stringify({
    level: 'info',
    message: `Live match sync scheduled every ${SYNC_INTERVAL_MS / 1000}s`,
    timestamp: new Date().toISOString(),
  }));
}
