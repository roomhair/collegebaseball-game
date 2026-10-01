const G = require('./load').load();
const { makeAuto } = require('./auto');
let apps = 0, wins = 0, best = {};
for (let r = 0; r < 8; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, {});
  let k = 0; while (s.year < 2041 && k++ < 300000 && s.mode === 'college') A.step(s);
  s.records.seasons.forEach((x) => { if (x.national) { apps++; if (x.national.champion) wins++; best[x.national.result] = (best[x.national.result] || 0) + 1; } });
}
console.log('全国大会 出場', apps, '優勝', wins, JSON.stringify(best));
