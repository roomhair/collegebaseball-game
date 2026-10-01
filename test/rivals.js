/* 部員を保存した大学の強さが、年をまたいでも目安から外れていかないかを測る */
const G = require('./load').load();
const { makeAuto } = require('./auto');
const runs = +(process.argv[2] || 6), years = +(process.argv[3] || 10);
const diffByYear = {};
for (let r = 0; r < runs; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, {});
  let lastY = 0, n = 0;
  while (s.year < 2026 + years && n++ < 200000 && s.mode === 'college') {
    if (s.phase === 'SPRING_LEAGUE' && s.step === 'round' && s.season.round === 0 && s.year !== lastY) {
      lastY = s.year;
      const d = diffByYear[s.year - 2026] = diffByYear[s.year - 2026] || { gap: 0, n: 0, user: 0, div: 0 };
      Object.keys(s.rosters).forEach((id) => {
        const u = s.unis[id];
        d.gap += u.level - G.Universities.targetLevel(u, G.Universities.divOf(s, id)); d.n++;
      });
      d.user += G.College.strength(s); d.div += G.Universities.divOf(s, s.userUni);
    }
    A.step(s);
  }
}
Object.keys(diffByYear).forEach((y) => { const d = diffByYear[y]; console.log('year', +y + 1, 'rival-target', (d.gap / d.n).toFixed(1), 'user', (d.user / runs).toFixed(1), 'div', (d.div / runs).toFixed(2)); });
