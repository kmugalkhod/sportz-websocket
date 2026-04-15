#!/usr/bin/env node
/**
 * Seed script — inserts one live IPL match + 10 commentary events for local dev.
 * Usage: node scripts/seed.js
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert a live match (upsert by cricbuzz_match_id so re-running is safe)
    const { rows: [match] } = await client.query(`
      INSERT INTO matches
        (sport, home_team, away_team, series_name, match_format, venue, status, cricbuzz_match_id, start_time)
      VALUES
        ('cricket', 'Mumbai Indians', 'Chennai Super Kings', 'IPL 2026', 'T20', 'Wankhede Stadium', 'live', 99999, NOW())
      ON CONFLICT (cricbuzz_match_id) DO UPDATE
        SET status = 'live'
      RETURNING id, home_team, away_team, status
    `);

    console.log(`Match seeded → id=${match.id}  ${match.home_team} vs ${match.away_team}  [${match.status}]`);

    // Delete any previous commentary for this match so sequence is clean
    await client.query('DELETE FROM commentary WHERE match_id = $1', [match.id]);

    // Insert 10 ball events
    const balls = [
      { seq: 1,  over: '0.1', event: 'ball',           actor: 'R Sharma',   runs: 1, message: 'Pushed to mid-off for a single.' },
      { seq: 2,  over: '0.2', event: 'dot_ball',       actor: 'R Sharma',   runs: 0, message: 'Defended solidly back down the pitch.' },
      { seq: 3,  over: '0.3', event: 'boundary_four',  actor: 'R Sharma',   runs: 4, message: 'FOUR! Pulled hard through mid-wicket.' },
      { seq: 4,  over: '0.4', event: 'wide',           actor: null,         runs: 1, message: 'Wide down the leg side.' },
      { seq: 5,  over: '0.5', event: 'boundary_six',   actor: 'R Sharma',   runs: 6, message: 'SIX! Launched over long-on into the stands!' },
      { seq: 6,  over: '0.6', event: 'ball',           actor: 'R Sharma',   runs: 2, message: 'Tucked off the pads, they run two.' },
      { seq: 7,  over: '1.1', event: 'wicket',         actor: 'R Sharma',   runs: 0, message: 'WICKET! Caught behind — edged to the keeper.' },
      { seq: 8,  over: '1.2', event: 'ball',           actor: 'V Kohli',    runs: 1, message: 'Kohli pushes to cover for one.' },
      { seq: 9,  over: '1.3', event: 'boundary_four',  actor: 'V Kohli',    runs: 4, message: 'FOUR! Kohli drives elegantly through covers.' },
      { seq: 10, over: '1.4', event: 'no_ball',        actor: null,         runs: 1, message: 'No-ball! Overstepped.' },
    ];

    for (const b of balls) {
      await client.query(`
        INSERT INTO commentary
          (match_id, minute, sequence, period, event_type, actor, team, message, metadata, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        match.id,
        parseInt(b.over.split('.')[0], 10),
        b.seq,
        '1ST_INN',
        b.event,
        b.actor,
        'Mumbai Indians',
        b.message,
        JSON.stringify({ over: b.over, runs: b.runs, bowler: 'J Bumrah' }),
        b.event === 'boundary_four' ? ['boundary', 'four']
          : b.event === 'boundary_six' ? ['boundary', 'six']
          : b.event === 'wicket' ? ['wicket']
          : null,
      ]);
      console.log(`  seq=${b.seq}  ${b.over}  ${b.event}  ${b.message}`);
    }

    await client.query('COMMIT');
    console.log(`\nDone. Subscribe with: {"type":"subscribe","matchId":${match.id},"lastSequence":0}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
