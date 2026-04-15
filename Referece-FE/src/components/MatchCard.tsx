import React from 'react';
import { Match } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface MatchCardProps {
  match: Match;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match }) => {
  const navigate = useNavigate();

  return (
    <Card 
      className="cursor-pointer hover:border-primary/50 transition-colors bg-card/50 backdrop-blur"
      onClick={() => navigate(`/match/${match.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            {match.status === 'live' && (
              <div className="flex items-center space-x-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <Badge variant="live" className="text-[10px] uppercase tracking-wider">LIVE</Badge>
              </div>
            )}
            {match.status === 'scheduled' && <Badge variant="secondary">SCHEDULED</Badge>}
            {match.status === 'finished' && <Badge variant="outline">FINISHED</Badge>}
            {match.matchFormat && <Badge variant="outline">{match.matchFormat}</Badge>}
          </div>
          <div className="text-xs text-muted-foreground text-right">
            {format(new Date(match.startTime), 'MMM d, h:mm a')}
          </div>
        </div>
        <CardTitle className="text-lg mt-2 font-medium">
          {match.seriesName || 'International Series'}
        </CardTitle>
        <div className="text-xs text-muted-foreground">{match.venue || 'TBA'}</div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 mt-2">
          <div className="flex justify-between items-center">
            <div className="font-bold text-xl">{match.homeTeam}</div>
            <div className="text-right">
              {match.status !== 'scheduled' ? (
                <div className="font-mono">
                  <span className="text-lg font-bold">{match.homeScore}/{match.homeWickets}</span>
                  <span className="text-sm text-muted-foreground ml-2">({match.homeOvers} ov)</span>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div className="font-bold text-xl">{match.awayTeam}</div>
            <div className="text-right">
              {match.status !== 'scheduled' ? (
                <div className="font-mono">
                  <span className="text-lg font-bold">{match.awayScore}/{match.awayWickets}</span>
                  <span className="text-sm text-muted-foreground ml-2">({match.awayOvers} ov)</span>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
