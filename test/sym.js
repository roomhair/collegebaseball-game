/* 自校の「全18校の中の順位」（1部1位＝1 … 3部6位＝18）の分布を測る（node test/sym.js 回数 年数）。
   ふつうに采配したとき、1部優勝と3部最下位が同じくらい起き、真ん中を中心に対称になるのが目標 */
const G = require('./load').load();
const { makeAuto } = require('./auto');
const runs = +(process.argv[2] || 16), years = +(process.argv[3] || 12);
const hist = new Array(19).fill(0);
let n = 0, soccer = 0;
for (let r = 0; r < runs; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, {}); let k = 0;
  let seen = 0;
  while (s.year < G.CONFIG.START_YEAR + years && k++ < 400000) {
    A.step(s);
    const rows = s.records.seasons;
    while (seen < rows.length) {
      const x = rows[seen++];
      if (x.div && x.rank) { hist[(x.div - 1) * 6 + x.rank]++; n++; }
    }
    if (s.mode !== 'college') { soccer++; break; }
  }
}
const pct = (v) => (100 * v / n).toFixed(1) + '%';
let mean = 0; for (let i = 1; i <= 18; i++) mean += i * hist[i]; mean /= n;
console.log('シーズン数', n, ' 平均順位', mean.toFixed(2), '（真ん中は9.5）');
console.log('1部優勝', pct(hist[1]), ' 3部最下位', pct(hist[18]), ' サッカー部へ', soccer + '/' + runs + '回');
console.log('1部', [1, 2, 3, 4, 5, 6].map((i) => pct(hist[i])).join(' '));
console.log('2部', [7, 8, 9, 10, 11, 12].map((i) => pct(hist[i])).join(' '));
console.log('3部', [13, 14, 15, 16, 17, 18].map((i) => pct(hist[i])).join(' '));
