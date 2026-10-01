/* 先発した投手の、2戦目・3戦目の朝の残りスタミナ（早く降板した場合も含めて） */
const G = require('./load').load();
const { Universities, Team, Sim, College } = G;
const rows = [];
for (let i = 0; i < 400; i++) {
  const me = Universities.makeRoster('me', 52), op = Universities.makeRoster('op', 52 + G.RNG.range(-8, 10));
  College.recoverPitchers(me, true);
  const ace = Team.find(me, me.rotation[0]);
  Sim.play(me, op, { maxInnings: 12 });   // 自動で継投（早く降りることもある）
  const ip = ace.game.outs / 3;
  College.tirePitchers(me);
  College.recoverPitchers(me, false); const d2 = ace.pstam;
  College.recoverPitchers(me, false); const d3 = ace.pstam;
  rows.push({ ip, d2, d3 });
}
const pct = (f) => (rows.filter(f).length / rows.length * 100).toFixed(0) + '%';
const avg = (k) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(0);
console.log('投球回の平均', (rows.reduce((a, r) => a + r.ip, 0) / rows.length).toFixed(1));
console.log('2戦目の朝 平均', avg('d2') + '%', '／ 先発できる(85%以上)', pct((r) => r.d2 >= 85), '／ 最大', Math.max(...rows.map((r) => r.d2)) + '%');
console.log('3戦目の朝 平均', avg('d3') + '%', '／ 先発できる(85%以上)', pct((r) => r.d3 >= 85));
