const gf = (team) => team?.goalsFor || 0;
const ga = (team) => team?.goalsAgainst || 0;
const gp = (team) => team?.played || 0;
const gd = (team) => gf(team) - ga(team);

function pick(list, seed) {
  if (!list.length) return '';
  const index = Math.abs(hashString(String(seed))) % list.length;
  return list[index];
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function teamLabel(code, teams) {
  const t = teams?.[code];
  if (!t) return code;
  return `${t.flag || ''} ${code}`.trim();
}

function playerTotals(player, teams) {
  const codes = [player.t1, player.t2, player.t3];
  return {
    ...player,
    codes,
    goals: codes.reduce((sum, code) => sum + gf(teams[code]), 0),
    games: codes.reduce((sum, code) => sum + gp(teams[code]), 0),
    gd: codes.reduce((sum, code) => sum + gd(teams[code]), 0),
  };
}

function bestTeamForPlayer(row, teams) {
  return row.codes
    .map(code => ({ code, goals: gf(teams[code]), played: gp(teams[code]) }))
    .sort((a, b) => b.goals - a.goals || b.played - a.played || a.code.localeCompare(b.code))[0];
}

const templates = {
  leader: [
    '{name} has moved into “checking the prize money” territory.',
    '{name} is currently pretending this was always part of the plan.',
    '{name} leads the Golden Boot race with {goals} goals from {games} games.',
    '{name} has started acting like a tactical genius. We are monitoring the situation.',
    '{name} is top of the table and absolutely not being humble about it.'
  ],
  carry: [
    '{team} is carrying {name} harder than airport luggage.',
    '{team} is doing the heavy lifting while {name}\'s other teams enjoy the view.',
    '{name} owes {team} a thank-you card at this point.',
    '{team} has put {name}\'s sweepstake campaign on its back.',
    '{team} is responsible for {share}% of {name}\'s goals. That is not teamwork, that is outsourcing.'
  ],
  spoon: [
    '{name} remains committed to the long-term rebuild strategy.',
    '{name}\'s teams are saving their goals for a more dramatic moment. Allegedly.',
    '{name} is technically still in it. Mathematically. Probably.',
    '{name}\'s teams have chosen patience, humility, and very little attacking output.',
    '{name} is providing valuable emotional support from the bottom end of the table.'
  ],
  drought: [
    '{count} players are still waiting for their teams to remember where the goal is.',
    '{count} players are currently surviving on vibes and fixture congestion.',
    '{count} players have requested that goals be backdated for fairness.',
    '{count} players are one 7-1 result away from becoming unbearable.'
  ],
  chaos: [
    'All complaints about the draw remain formally ignored.',
    'VAR has reviewed the sweepstake and confirmed everyone should calm down.',
    'The organiser accepts no responsibility for football, maths, or hurt feelings.',
    'If your team has not played yet, congratulations: hope remains undefeated.',
    'This leaderboard is temporary, but the group chat abuse is forever.'
  ],
  average: [
    '{team} is making the Average Team prize look very spicy for {name}.',
    '{name}\'s average team, {team}, is doing suspiciously well.',
    '{team} has quietly entered the “not so average” conversation for {name}.',
    '{name} may need to apologise to {team} for calling them average.'
  ],
  oneGameWonder: [
    '{name} is flying with {goals} goals from only {games} games. Unsustainable? Absolutely. Fun? Also yes.',
    '{name} has a dangerous goals-per-game situation developing.',
    '{name} is making every game count and making everyone else nervous.'
  ]
};

export function generateBanter(players, teams, now = new Date()) {
  const rows = players
    .map(p => playerTotals(p, teams))
    .sort((a, b) => b.goals - a.goals || b.gd - a.gd || a.games - b.games || a.name.localeCompare(b.name));

  if (!rows.length) return [];

  const leader = rows[0];
  const spoon = rows[rows.length - 1];
  const leaderBest = bestTeamForPlayer(leader, teams);

  const carries = rows
    .map(row => {
      const best = bestTeamForPlayer(row, teams);
      const share = row.goals ? Math.round((best.goals / row.goals) * 100) : 0;
      return { row, best, share };
    })
    .filter(x => x.row.goals > 0 && x.best.goals > 0)
    .sort((a, b) => b.share - a.share || b.best.goals - a.best.goals || b.row.goals - a.row.goals);

  const bestCarry = carries[0] || { row: leader, best: leaderBest, share: leader.goals ? Math.round((leaderBest.goals / leader.goals) * 100) : 0 };

  const zeroGoalCount = rows.filter(r => r.goals === 0).length;
  const bestAverage = [...rows]
    .map(row => ({ row, code: row.t2, goals: gf(teams[row.t2]), points: teams[row.t2]?.points || 0 }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.row.name.localeCompare(b.row.name))[0];

  const oneGameWonder = rows
    .filter(r => r.games > 0)
    .sort((a, b) => (b.goals / b.games) - (a.goals / a.games) || b.goals - a.goals)[0];

  const seedBase = `${now.toISOString().slice(0, 13)}-${leader.name}-${leader.goals}-${spoon.name}`;
  const lines = [];

  lines.push(fill(pick(templates.leader, seedBase + 'leader'), {
    name: leader.name,
    goals: leader.goals,
    games: leader.games
  }));

  lines.push(fill(pick(templates.carry, seedBase + 'carry'), {
    name: bestCarry.row.name,
    team: teamLabel(bestCarry.best.code, teams),
    share: bestCarry.share
  }));

  if (zeroGoalCount > 0) {
    lines.push(fill(pick(templates.drought, seedBase + 'drought'), { count: zeroGoalCount }));
  } else if (oneGameWonder && oneGameWonder.games <= 2 && oneGameWonder.goals >= 4) {
    lines.push(fill(pick(templates.oneGameWonder, seedBase + 'onegame'), {
      name: oneGameWonder.name,
      goals: oneGameWonder.goals,
      games: oneGameWonder.games
    }));
  } else if (bestAverage) {
    lines.push(fill(pick(templates.average, seedBase + 'average'), {
      name: bestAverage.row.name,
      team: teamLabel(bestAverage.code, teams)
    }));
  } else {
    lines.push(fill(pick(templates.spoon, seedBase + 'spoon'), { name: spoon.name }));
  }

  lines.push(fill(pick(templates.chaos, seedBase + 'chaos'), {}));

  return [...new Set(lines)].slice(0, 4);
}
