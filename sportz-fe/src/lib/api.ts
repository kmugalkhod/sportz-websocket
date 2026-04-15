import { Match, CommentaryEvent } from '../types';

const API_BASE = 'http://localhost:8000/api';

// ─── Mock Data ────────────────────────────────────────────────
const MOCK_MATCHES: Match[] = [
  {
    id: 1,
    sport: 'cricket',
    homeTeam: 'IND',
    awayTeam: 'AUS',
    status: 'live',
    startTime: new Date().toISOString(),
    endTime: null,
    homeScore: 185,
    awayScore: 160,
    createdAt: new Date().toISOString(),
    cricbuzzMatchId: null,
    seriesName: 'Border-Gavaskar Trophy',
    matchFormat: 'T20',
    venue: 'MCG, Melbourne',
    homeWickets: 4,
    awayWickets: 8,
    homeOvers: '18.2',
    awayOvers: '20.0',
  },
  {
    id: 2,
    sport: 'cricket',
    homeTeam: 'ENG',
    awayTeam: 'SA',
    status: 'scheduled',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: null,
    homeScore: 0,
    awayScore: 0,
    createdAt: new Date().toISOString(),
    cricbuzzMatchId: null,
    seriesName: 'Bilateral Series',
    matchFormat: 'ODI',
    venue: "Lord's, London",
    homeWickets: 0,
    awayWickets: 0,
    homeOvers: '0.0',
    awayOvers: '0.0',
  },
  {
    id: 3,
    sport: 'cricket',
    homeTeam: 'PAK',
    awayTeam: 'NZ',
    status: 'finished',
    startTime: new Date(Date.now() - 86400000).toISOString(),
    endTime: new Date(Date.now() - 43200000).toISOString(),
    homeScore: 210,
    awayScore: 187,
    createdAt: new Date().toISOString(),
    cricbuzzMatchId: null,
    seriesName: 'ICC World Cup 2025',
    matchFormat: 'T20',
    venue: 'National Stadium, Karachi',
    homeWickets: 6,
    awayWickets: 10,
    homeOvers: '20.0',
    awayOvers: '19.3',
  },
];

const MOCK_EVENTS: CommentaryEvent[] = [
  {
    id: 101,
    matchId: 1,
    minute: 18,
    sequence: 4,
    period: '2ND_INN',
    eventType: 'boundary_six',
    actor: 'Virat Kohli',
    team: 'IND',
    message: 'What a shot! Down the track and over long-on for a massive six!',
    metadata: { over: '18.2', runs: 6, bowler: 'Pat Cummins', bowlerWickets: 2, bowlerRuns: 34 },
    tags: ['boundary', 'six'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 100,
    matchId: 1,
    minute: 18,
    sequence: 3,
    period: '2ND_INN',
    eventType: 'dot_ball',
    actor: 'Virat Kohli',
    team: 'IND',
    message: 'Good length delivery, defended solidly back to the bowler.',
    metadata: { over: '18.1', runs: 0, bowler: 'Pat Cummins', bowlerWickets: 2, bowlerRuns: 28 },
    tags: null,
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 99,
    matchId: 1,
    minute: 17,
    sequence: 2,
    period: '2ND_INN',
    eventType: 'over_complete',
    actor: null,
    team: null,
    message: 'End of over 18. India 179/4. Need 7 runs from 12 balls.',
    metadata: { over: '18.0', runs: 0, bowler: null, bowlerWickets: 0, bowlerRuns: 0 },
    tags: null,
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 98,
    matchId: 1,
    minute: 17,
    sequence: 1,
    period: '2ND_INN',
    eventType: 'wicket',
    actor: 'Suryakumar Yadav',
    team: 'IND',
    message: "OUT! Caught at deep mid-wicket. He tried to clear the boundary but didn't get enough distance.",
    metadata: { over: '17.6', runs: 0, bowler: 'Mitchell Starc', bowlerWickets: 1, bowlerRuns: 25 },
    tags: ['wicket'],
    createdAt: new Date(Date.now() - 150000).toISOString(),
  },
  {
    id: 97,
    matchId: 1,
    minute: 17,
    sequence: 0,
    period: '2ND_INN',
    eventType: 'boundary_four',
    actor: 'Hardik Pandya',
    team: 'IND',
    message: 'Driven through the covers! Stunning stroke play, races away to the boundary.',
    metadata: { over: '17.4', runs: 4, bowler: 'Mitchell Starc', bowlerWickets: 0, bowlerRuns: 21 },
    tags: ['boundary', 'four'],
    createdAt: new Date(Date.now() - 200000).toISOString(),
  },
];

// ─── API Functions ─────────────────────────────────────────────
export const fetchMatches = async (params?: { status?: string; format?: string }): Promise<Match[]> => {
  try {
    const url = new URL(`${API_BASE}/matches`);
    if (params?.status) url.searchParams.append('status', params.status);
    if (params?.format) url.searchParams.append('format', params.format);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch matches');
    const data = await res.json();
    return data.matches;
  } catch {
    console.warn('Backend unavailable — using mock match data');
    return MOCK_MATCHES.filter(m => {
      if (params?.status && m.status !== params.status) return false;
      if (params?.format && m.matchFormat !== params.format) return false;
      return true;
    });
  }
};

export const fetchMatch = async (id: number): Promise<Match> => {
  try {
    const res = await fetch(`${API_BASE}/matches/${id}`);
    if (!res.ok) throw new Error('Failed to fetch match');
    return res.json();
  } catch {
    console.warn('Backend unavailable — using mock match data');
    const match = MOCK_MATCHES.find(m => m.id === id);
    if (!match) throw new Error('Match not found');
    return match;
  }
};

export const fetchMatchEvents = async (
  id: number,
  after: number = 0,
  limit: number = 100
): Promise<{ events: CommentaryEvent[]; total: number; lastSequence: number }> => {
  try {
    const res = await fetch(`${API_BASE}/matches/${id}/events?after=${after}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  } catch {
    console.warn('Backend unavailable — using mock event data');
    const events = MOCK_EVENTS.filter(e => e.matchId === id);
    return { events, total: events.length, lastSequence: events[0]?.sequence ?? 0 };
  }
};
