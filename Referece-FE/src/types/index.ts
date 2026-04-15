export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type MatchFormat = 'T20' | 'ODI' | 'TEST';
export type EventType = 'boundary_four' | 'boundary_six' | 'wicket' | 'wide' | 'no_ball' | 'dot_ball' | 'over_complete' | 'innings_start' | 'innings_end' | 'match_start' | 'match_end' | 'review' | 'rain_delay' | 'ball';
export type Period = '1ST_INN' | '2ND_INN' | 'SUPER_OVER';

export interface Match {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  startTime: string;
  endTime: string | null;
  homeScore: number;
  awayScore: number;
  createdAt: string;
  cricbuzzMatchId: number | null;
  seriesName: string | null;
  matchFormat: MatchFormat | null;
  venue: string | null;
  homeWickets: number;
  awayWickets: number;
  homeOvers: string;
  awayOvers: string;
}

export interface CommentaryEvent {
  id: number;
  matchId: number;
  minute: number;
  sequence: number;
  period: Period;
  eventType: EventType;
  actor: string | null;
  team: string | null;
  message: string;
  metadata: {
    over: string;
    runs: number;
    bowler: string | null;
    bowlerWickets: number;
    bowlerRuns: number;
  };
  tags: string[] | null;
  createdAt: string;
}

export interface ScoreUpdate {
  runs: number;
  wickets: number;
  overs: string;
  runRate: number;
  inningsNum: 1 | 2;
  battingTeam: string;
}

export interface WsMessage {
  type: string;
  [key: string]: any;
}
