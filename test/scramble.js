/* デタラメなオーダー（守備位置・スタメン・先発）でどれだけ勝てるかを測る */
const G = require('./load').load();
const { makeAuto } = require('./auto');
const E = G.Engine, T = G.Team, P = G.Player;
function scramble(s, mode) {
  const t = s.team;
  if (mode === 'auto') return;
  const v = G.College.matchTeam(s);
  let bats = v.batters.slice();
  let nine;
  if (mode === 'pos' || mode === 'posp') nine = v.lineup.map((sl) => sl.pid);
  else nine = bats.sort((a, b) => P.rating(a) - P.rating(b)).slice(0, 9).map((p) => p.id);
  /* 守備位置：各選手を適性の一番悪い場所へ（できるだけ重ならないように） */
  const posAll = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const left = posAll.slice(); const lu = [];
  nine.forEach((pid) => {
    const p = T.find(t, pid);
    left.sort((a, b) => T.defScore(p, a) - T.defScore(p, b));
    const pos = left.find((k) => k !== 'DH') || left[0];
    left.splice(left.indexOf(pos), 1); lu.push({ pid, pos });
  });
  t.lineup = lu;
  if (mode === 'all' || mode === 'posp') {
    const worst = v.pitchers.slice().sort((a, b) => P.rating(a) - P.rating(b))[0];
    t.rotation = [worst.id].concat(t.rotation.filter((x) => x !== worst.id));
  }
}
const modes = ['auto', 'pos', 'posp', 'nine', 'all'];
const st = {}; modes.forEach((m) => { st[m] = [0, 0, 0, 0]; });
for (let r = 0; r < 4; r++) {
  const s0 = E.newGame(); const A = makeAuto(G, {});
  let k = 0;
  while (s0.year < 2029 && k++ < 200000 && s0.mode === 'college') {
    if (s0.step === 'pregame' && s0.match.kind === 'league') {
      modes.forEach((m) => {
        for (let i = 0; i < 3; i++) {
          const s = JSON.parse(JSON.stringify(s0));
          scramble(s, m);
          s.liveGame = null;
          const out = E.autoGame(s);
          const v = out.view; const x = st[m];
          x[0]++; x[1] += s.lastResult.win ? 1 : 0; x[2] += s.lastResult.draw ? 0 : 1;
          x[3] += v.rebuilt ? 1 : 0;
        }
      });
    }
    A.step(s0);
  }
}
modes.forEach((m) => { const x = st[m]; console.log(m, 'n', x[0], 'win%', (x[1] / x[2]).toFixed(3), 'rebuilt', x[3]); });
