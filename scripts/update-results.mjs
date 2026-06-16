import fs from 'node:fs/promises';

const API_URL = process.env.WORLDCUP_API_URL || 'https://worldcup26.ir/get/games';
const OUT = new URL('../data/results.json', import.meta.url);

const codeToName = {
  ARG:'Argentina', ESP:'Spain', FRA:'France', ENG:'England', POR:'Portugal', BRA:'Brazil', MAR:'Morocco', NED:'Netherlands', BEL:'Belgium', GER:'Germany', CRO:'Croatia', COL:'Colombia',
  MEX:'Mexico', SEN:'Senegal', URU:'Uruguay', USA:'United States', JPN:'Japan', SUI:'Switzerland', IRI:'Iran', IRN:'Iran', TUR:'Türkiye', ECU:'Ecuador', AUT:'Austria', KOR:'South Korea', AUS:'Australia', DZA:'Algeria', EGY:'Egypt', CAN:'Canada', NOR:'Norway', CIV:'Côte d’Ivoire', PAR:'Paraguay', SWE:'Sweden', CZE:'Czechia', SCO:'Scotland', COD:'DR Congo', TUN:'Tunisia',
  UZB:'Uzbekistan', IRQ:'Iraq', QAT:'Qatar', RSA:'South Africa', KSA:'Saudi Arabia', JOR:'Jordan', BIH:'Bosnia & Herzegovina', CPV:'Cape Verde', GHA:'Ghana', CUW:'Curaçao', HTI:'Haiti', NZL:'New Zealand'
};

const nameToCode = Object.fromEntries(Object.entries(codeToName).map(([code, name]) => [name, code === 'IRI' ? 'IRN' : code]));

const teamAliases = {
  'Czech Republic': 'Czechia',
  'CZ Czech Republic': 'Czechia',
  'Turkey': 'Türkiye',
  'Turkiye': 'Türkiye',
  'Ivory Coast': 'Côte d’Ivoire',
  'Cote dIvoire': 'Côte d’Ivoire',
  'Cote d’Ivoire': 'Côte d’Ivoire',
  'Côte dIvoire': 'Côte d’Ivoire',
  'Congo DR': 'DR Congo',
  'Congo, DR': 'DR Congo',
  'CD Congo DR': 'DR Congo',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia & Herzegovina',
  'United States': 'United States',
  'USA': 'United States',
  'South Korea': 'South Korea',
  'Korea Republic': 'South Korea',
  'Curacao': 'Curaçao',
  'Curaçao': 'Curaçao',
  'Saudi Arabia': 'Saudi Arabia',
  'Cape Verde': 'Cape Verde',
  'New Zealand': 'New Zealand',
  'South Africa': 'South Africa',
  'Iran': 'Iran',
  'IR Iran': 'Iran'
};

const groupLookup = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia & Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['United States', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', 'Côte d’Ivoire', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama']
};

function normaliseName(value) {
  if (!value) return null;
  let s = String(value).trim().replace(/\s+/g, ' ');
  const upper = s.toUpperCase();
  if (codeToName[upper]) return codeToName[upper];
  return teamAliases[s] || s;
}

function codeForName(name) {
  const n = normaliseName(name);
  return nameToCode[n] || null;
}

function groupForCode(code) {
  const name = codeToName[code];
  return Object.entries(groupLookup).find(([, teams]) => teams.includes(name))?.[0] || null;
}

function getFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function getTeamName(side) {
  if (!side) return null;
  if (typeof side === 'string') return normaliseName(side);
  return normaliseName(getFirst(side, ['name_en','name','team','country','code','shortName','tla']));
}

function parseMatch(m) {
  const homeTeam = getTeamName(getFirst(m, ['homeTeam','home','team1','home_team','homeTeamName'])) || normaliseName(getFirst(m, ['home_team_en','home_name','homeTeamName','homeTeamCode','homeCode']));
  const awayTeam = getTeamName(getFirst(m, ['awayTeam','away','team2','away_team','awayTeamName'])) || normaliseName(getFirst(m, ['away_team_en','away_name','awayTeamName','awayTeamCode','awayCode']));
  const home = codeForName(homeTeam);
  const away = codeForName(awayTeam);

  const scoreObj = getFirst(m, ['score','scores','result']) || {};
  const full = scoreObj.fullTime || scoreObj.fulltime || scoreObj.ft || scoreObj.regularTime || scoreObj;
  const homeGoals = Number(getFirst(full, ['home','homeTeam','home_score','homeScore','team1','score1','homeGoals']) ?? getFirst(m, ['homeScore','home_score','score_home','home_goals','team1_score']));
  const awayGoals = Number(getFirst(full, ['away','awayTeam','away_score','awayScore','team2','score2','awayGoals']) ?? getFirst(m, ['awayScore','away_score','score_away','away_goals','team2_score']));

  const rawStatus = String(getFirst(m, ['status','matchStatus','state']) || '').toLowerCase();
  const finished = ['finished','complete','completed','ft','full_time','full-time'].some(x => rawStatus.includes(x)) || (Number.isFinite(homeGoals) && Number.isFinite(awayGoals) && rawStatus !== 'scheduled');

  if (!home || !away || !finished || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;
  return {
    id: String(getFirst(m, ['id','game_id','match_id','fixture_id']) || `${home}-${away}`),
    date: String(getFirst(m, ['date','utcDate','datetime','start_time','kickoff']) || '').slice(0, 10) || null,
    group: groupForCode(home) || groupForCode(away),
    home,
    away,
    homeGoals,
    awayGoals,
    status: 'FT'
  };
}

const fallbackMatches = [
  ['MEX','RSA',2,0], ['KOR','CZE',2,1], ['CAN','BIH',1,1],
  ['USA','PAR',4,1], ['QAT','SUI',1,1], ['BRA','MAR',1,1],
  ['HTI','SCO',0,1], ['AUS','TUR',2,0], ['GER','CUW',7,1],
  ['NED','JPN',2,2], ['CIV','ECU',1,0], ['SWE','TUN',5,1],
  ['ESP','CPV',0,0], ['BEL','EGY',1,1]
].map(([home, away, homeGoals, awayGoals], i) => ({
  id: `fallback-${i + 1}`,
  date: null,
  group: groupForCode(home) || groupForCode(away),
  home,
  away,
  homeGoals,
  awayGoals,
  status: 'FT'
}));

function blankTeam(existing, code) {
  return {
    ...existing,
    name: existing?.name || codeToName[code] || code,
    flag: existing?.flag || '',
    group: existing?.group || groupForCode(code),
    goalsFor: 0,
    goalsAgainst: 0,
    played: 0,
    points: 0
  };
}

function applyMatch(teams, match) {
  teams[match.home] ||= blankTeam(null, match.home);
  teams[match.away] ||= blankTeam(null, match.away);
  const home = teams[match.home];
  const away = teams[match.away];

  home.goalsFor += match.homeGoals;
  home.goalsAgainst += match.awayGoals;
  home.played += 1;

  away.goalsFor += match.awayGoals;
  away.goalsAgainst += match.homeGoals;
  away.played += 1;

  if (match.homeGoals > match.awayGoals) home.points += 3;
  else if (match.homeGoals < match.awayGoals) away.points += 3;
  else { home.points += 1; away.points += 1; }
}

async function fetchMatches() {
  try {
    const res = await fetch(API_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw = Array.isArray(json) ? json : (json.data || json.games || json.matches || json.results || []);
    const matches = raw.map(parseMatch).filter(Boolean);
    if (matches.length) return { matches, source: API_URL, sourceOk: true };
    throw new Error('No completed matches parsed');
  } catch (err) {
    console.error(`Could not fetch or parse ${API_URL}: ${err.message}`);
    return { matches: fallbackMatches, source: 'fallback-in-repo', sourceOk: false };
  }
}

async function main() {
  const existing = JSON.parse(await fs.readFile(OUT, 'utf8'));
  const { matches, source, sourceOk } = await fetchMatches();

  const teams = {};
  for (const [code, team] of Object.entries(existing.teams || {})) teams[code] = blankTeam(team, code);
  for (const code of Object.keys(codeToName)) {
    if (code === 'IRI') continue;
    teams[code] ||= blankTeam(null, code);
  }
  for (const match of matches) applyMatch(teams, match);

  const output = {
    ...existing,
    generatedAt: new Date().toISOString(),
    source,
    sourceOk,
    teams,
    matches
  };

  await fs.writeFile(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${matches.length} completed matches and preserved ${existing.players?.length || 0} players.`);
}

main().catch(err => { console.error(err); process.exit(1); });
