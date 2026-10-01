const G = require('./load').load();
const { Universities, Team, Sim, College, Player } = G;
const arg = process.argv[2] || 'all';
if (arg === 'all' || arg === 'level') {
  [40, 45, 50, 55, 60, 65, 72].forEach((L) => {
    let s = 0; const n = 30;
    for (let i = 0; i < n; i++) s += Team.strength(Universities.makeRoster('x', L));
    console.log('level', L, '→ strength', (s / n).toFixed(1));
  });
}
if (arg === 'all' || arg === 'own') {
  const st = []; 
  for (let i = 0; i < 40; i++) {
    const s = G.Engine.newGame();
    const best = (list) => list.slice().sort((a,b)=>avg(b)-avg(a))[0];
    function avg(set){return set.reduce((x,p)=>x+Player.rating(p),0)/set.length;}
    const t = Team.create('me'); t.batters = best(s.sets.list); t.pitchers = best(College.teamSets('pitcher',3,2026)); Team.autoLineup(t);
    st.push(Team.strength(t));
  }
  console.log('own initial strength avg', (st.reduce((a,b)=>a+b,0)/st.length).toFixed(1), 'min', Math.min(...st), 'max', Math.max(...st));
}
if (arg === 'all' || arg === 'win') {
  [-15, -10, -5, 0, 5, 10, 15].forEach((d) => {
    let w = 0, l = 0, qw = 0, ql = 0; const n = 150;
    for (let i = 0; i < n; i++) {
      const a = Universities.makeRoster('a', 50 + d), b = Universities.makeRoster('b', 50);
      const sa = Team.strength(a), sb = Team.strength(b);
      const r = Sim.play(a, b, { maxInnings: 12 });
      if (r.away.runs > r.home.runs) w++; else if (r.home.runs > r.away.runs) l++;
      const q = Universities.quickGame(sa, sb, true);
      if (q.a > q.b) qw++; else if (q.b > q.a) ql++;
    }
    console.log('diff', d, 'sim', (w / (w + l)).toFixed(2), 'quick', (qw / (qw + ql)).toFixed(2));
  });
}
