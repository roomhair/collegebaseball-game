const G = require('./load').load();
const { makeAuto } = require('./auto');
const s = G.Engine.newGame();
const A = makeAuto(G, {});
let n = 0, lastY = 0;
while (s.year < G.CONFIG.START_YEAR + 3 && n < 20000 && s.mode === 'college') { A.step(s); n++; G.Engine.check(s); }
console.log('steps', n, 'year', s.year, s.phase, s.mode);
s.records.seasons.forEach((r) => console.log(r.year, r.term, r.div + '部', r.rank + '位', r.points, r.w + '-' + r.l + '-' + r.d, r.playoff ? r.playoff.result : '', r.national ? r.national.result : ''));
console.log(s.records.chronicle.map(c=>c.text).join('\n'));
