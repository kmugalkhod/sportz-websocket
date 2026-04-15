const FLAGS: Record<string, string> = {
  IND: '🇮🇳',
  AUS: '🇦🇺',
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  SA:  '🇿🇦',
  NZ:  '🇳🇿',
  PAK: '🇵🇰',
  SL:  '🇱🇰',
  BAN: '🇧🇩',
  WI:  '🏝️',
  ZIM: '🇿🇼',
  AFG: '🇦🇫',
  IRE: '🇮🇪',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  UAE: '🇦🇪',
  NAM: '🇳🇦',
};

export function getTeamFlag(team: string): string {
  return FLAGS[team.toUpperCase()] ?? '🏏';
}

export function getTeamColor(team: string): string {
  const colors: Record<string, string> = {
    IND: '#1a73e8',
    AUS: '#f9a825',
    ENG: '#1565c0',
    SA:  '#2e7d32',
    NZ:  '#000000',
    PAK: '#1b5e20',
    SL:  '#1565c0',
    BAN: '#2e7d32',
  };
  return colors[team.toUpperCase()] ?? '#475569';
}
