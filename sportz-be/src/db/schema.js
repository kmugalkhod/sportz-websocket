import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// Enums
export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'live',
  'finished',
]);

// Matches table
export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  sport: text('sport').notNull(),
  homeTeam: text('home_team').notNull(),
  awayTeam: text('away_team').notNull(),
  status: matchStatusEnum('status').default('scheduled').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  homeScore: integer('home_score').default(0).notNull(),
  awayScore: integer('away_score').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  cricbuzzMatchId: integer('cricbuzz_match_id').unique(),
  seriesName:      text('series_name'),
  matchFormat:     text('match_format'),
  venue:           text('venue'),
  homeWickets:     integer('home_wickets').default(0).notNull(),
  awayWickets:     integer('away_wickets').default(0).notNull(),
  homeOvers:       text('home_overs').default('0.0').notNull(),
  awayOvers:       text('away_overs').default('0.0').notNull(),
}, (table) => ({
  statusIdx:   index('matches_status_idx').on(table.status),
  cricbuzzIdx: index('matches_cricbuzz_idx').on(table.cricbuzzMatchId),
}));

// Commentary table
export const commentary = pgTable('commentary', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id')
    .references(() => matches.id)
    .notNull(),
  minute: integer('minute').notNull(),
  sequence: integer('sequence').notNull(),
  period: text('period').notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor'),
  team: text('team'),
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  matchSeqIdx: index('commentary_match_seq_idx').on(table.matchId, table.sequence),
}));
