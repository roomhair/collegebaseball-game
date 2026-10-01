const G = require('./load').load();
const { makeAuto } = require('./auto');
const mode = process.argv[2];
if (mode === 'off') { const orig = G.College.recoverPitchers; G.College.recoverPitchers = (t) => orig(t, true); }
let titles = 0, div1 = 0, n = 0; const runs = 10;
for (let r = 0; r < runs; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, {});
  let k = 0; while (s.year < 2036 && k++ < 200000 && s.mode === 'college') A.step(s);
  titles += s.records.team.titles; div1 += s.records.team.div[1];
}
console.log(mode, 'titles/10y', (titles / runs).toFixed(1), '1部年数', (div1 / runs).toFixed(1));
