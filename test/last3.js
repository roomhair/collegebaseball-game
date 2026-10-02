/* 3部で1シーズン戦ったときの順位の分布（node test/last3.js）。
   normal：ふつうに戦う／shift：毎試合、守備位置を1つずつずらして戦う */
const G = require('./load').load();
const { makeAuto } = require('./auto');
const E = G.Engine, U = G.Universities, L = G.League;
function moveUserTo(s, div) {
  const cur = U.divOf(s, s.userUni); if (cur === div) return;
  const other = s.divisions[div][0]; const a = s.divisions[cur], b = s.divisions[div];
  a[a.indexOf(s.userUni)] = other; b[0] = s.userUni; G.Rivals.sync(s);
}
const mode = process.argv[2] || 'normal';
const runs = +(process.argv[3] || 30);
const ranks = [0, 0, 0, 0, 0, 0, 0];
let str = 0, opp = 0;
for (let r = 0; r < runs; r++) {
  const s = E.newGame(); const A = makeAuto(G, {}); let k = 0;
  while (s.phase !== 'SPRING_TRAINING' && k++ < 100000) A.step(s);
  moveUserTo(s, 3);
  /* 3部の大学の強さを、移った先の部の目安に合わせ直す（ゲーム開始時と同じ条件にする） */
  str += G.Team.strength(s.team);
  opp += s.divisions[3].filter((id) => id !== s.userUni).reduce((a, id) => a + s.unis[id].level, 0) / 5;
  while (s.phase !== 'SPRING_PLAYOFF' && s.phase !== 'SUMMER_TRAINING' && s.phase !== 'SPRING_NATIONAL' && s.mode === 'college' && k++ < 100000) {
    if (mode === 'shift' && s.step === 'pregame' && s.match && s.match.kind === 'league') {
      const v = G.College.matchTeam(s);
      const pos = v.lineup.map((sl) => sl.pos);
      s.team.lineup = v.lineup.map((sl, i) => ({ pid: sl.pid, pos: pos[(i + 1) % 9] }));
      E.autoGame(s);
      continue;
    }
    A.step(s);
  }
  const me = s.seasonInfo || {};
  ranks[me.rank || 0]++;
}
console.log(mode, '自校チーム力', (str / runs).toFixed(1), '3部の相手の平均', (opp / runs).toFixed(1), '順位の分布(1〜6位)', ranks.slice(1).join(' / '), ' 最下位率', (ranks[6] / runs).toFixed(2));
