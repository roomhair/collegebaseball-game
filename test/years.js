const G = require('./load').load();
const { makeAuto } = require('./auto');
const runs = +(process.argv[2] || 6), years = +(process.argv[3] || 10);
const pol = JSON.parse(process.argv[4] || '{}');
const agg = {};
let incidents = 0, pros = 0, titles = 0, nat = 0, disb = 0;
for (let r = 0; r < runs; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, pol);
  let n = 0, lastKey = '';
  while (s.year < G.CONFIG.START_YEAR + years && n < 100000 && s.mode === 'college') {
    if (s.phase === 'SPRING_LEAGUE' && s.step === 'round' && s.season.round === 0) {
      const k = s.year; if (k !== lastKey) { lastKey = k;
        const a = agg[s.year - 2026] = agg[s.year - 2026] || { str: 0, n: 0, div: 0, avgOpp: 0 };
        a.str += G.College.strength(s); a.n++; a.div += G.Universities.divOf(s, s.userUni);
      }
    }
    A.step(s); n++;
  }
  incidents += (s.incidentLog || []).length; pros += s.records.team.pros; titles += s.records.team.titles; nat += s.records.team.natTitles;
  if (s.mode !== 'college') disb++;
}
Object.keys(agg).forEach((y) => { const a = agg[y]; console.log('year', +y + 1, 'str', (a.str / a.n).toFixed(1), 'div', (a.div / a.n).toFixed(2), 'n', a.n); });
console.log('per run per year: incidents', (incidents / runs / years).toFixed(2), 'pros', (pros / runs / years).toFixed(2), 'titles', (titles / runs).toFixed(1), 'nat', (nat / runs).toFixed(1), 'left college', disb);
