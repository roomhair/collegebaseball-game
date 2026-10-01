/* エースが1戦目に投げたあと、2戦目・3戦目にどれだけ回復しているか、
   消耗したまま投げるとどれだけ打たれるかを測る */
const G = require('./load').load();
const { Universities, Team, Sim, College } = G;
const runs = 400;
let after1 = 0, before2 = 0, before3 = 0;
const ra = { rested: [0, 0], tired: [0, 0] };
for (let i = 0; i < runs; i++) {
  const me = Universities.makeRoster('me', 52), op = Universities.makeRoster('op', 52);
  const ace = Team.find(me, me.rotation[0]);
  College.recoverPitchers(me, true); College.recoverPitchers(op, true);
  Sim.play(me, op, { maxInnings: 12 });
  College.tirePitchers(me);
  after1 += ace.pstam;
  College.recoverPitchers(me, false); before2 += ace.pstam;
  /* 2戦目にエースをそのまま投げさせた場合 */
  const c2 = JSON.parse(JSON.stringify(me));
  const r2 = Sim.play(c2, Universities.makeRoster('op', 52), { maxInnings: 12, manual: 'away' });
  ra.tired[0] += r2.home.runs; ra.tired[1]++;
  /* 休ませて3戦目 */
  College.recoverPitchers(me, false); before3 += ace.pstam;
  const r3 = Sim.play(me, Universities.makeRoster('op', 52), { maxInnings: 12, manual: 'away' });
  ra.rested[0] += r3.home.runs; ra.rested[1]++;
}
console.log('エース残りスタミナ：1戦目後', (after1 / runs).toFixed(0) + '%', '2戦目の朝', (before2 / runs).toFixed(0) + '%', '3戦目の朝', (before3 / runs).toFixed(0) + '%');
console.log('1試合の失点：消耗したまま2戦目', (ra.tired[0] / runs).toFixed(2), '／休ませて3戦目', (ra.rested[0] / runs).toFixed(2));
