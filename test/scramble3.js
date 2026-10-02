/* 3部にいるとき、守備位置をデタラメにするとどれだけ勝てるか（node test/scramble3.js） */
const G = require('./load').load();
const { makeAuto } = require('./auto');
const E = G.Engine, T = G.Team, P = G.Player, U = G.Universities;
function moveUserTo(s, div) {
  const cur = U.divOf(s, s.userUni); if (cur === div) return;
  const other = s.divisions[div][0]; const a = s.divisions[cur], b = s.divisions[div];
  a[a.indexOf(s.userUni)] = other; b[0] = s.userUni; G.Rivals.sync(s);
}
function scramble(s, mode) {
  if (mode === 'auto') return;
  const t = s.team; const v = G.College.matchTeam(s);
  const nine = v.lineup.map((sl) => sl.pid);
  const left = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']; const lu = [];
  /* worst：全員いちばん守れない位置。shift：守備位置を1つずつずらす（ユーザーがやりがちな崩し方） */
  if (mode === 'shift') {
    const pos = v.lineup.map((sl) => sl.pos);
    t.lineup = v.lineup.map((sl, i) => ({ pid: sl.pid, pos: pos[(i + 1) % 9] }));
    return;
  }
  nine.forEach((pid) => {
    const p = T.find(t, pid);
    left.sort((a, b) => T.defScore(p, a) - T.defScore(p, b));
    const pos = left.find((k) => k !== 'DH') || left[0];
    left.splice(left.indexOf(pos), 1); lu.push({ pid, pos });
  });
  t.lineup = lu;
}
const modes = ['auto', 'shift', 'worst'];
const st = {}; modes.forEach((m) => { st[m] = [0, 0, 0, 0, 0]; });
for (let r = 0; r < 5; r++) {
  const s0 = E.newGame(); const A = makeAuto(G, {});
  let k = 0;
  while (!(s0.phase === 'SPRING_TRAINING') && k++ < 100000) A.step(s0);
  moveUserTo(s0, 3);
  while (s0.phase !== 'SPRING_PLAYOFF' && s0.phase !== 'SPRING_NATIONAL' && s0.phase !== 'SUMMER_TRAINING' && k++ < 100000) {
    if (s0.step === 'pregame' && s0.match.kind === 'league') {
      modes.forEach((m) => {
        for (let i = 0; i < 4; i++) {
          const s = JSON.parse(JSON.stringify(s0)); scramble(s, m); s.liveGame = null;
          E.autoGame(s); const x = st[m]; if (!s.lastResult.draw) { x[0]++; x[1] += s.lastResult.win ? 1 : 0; }
          x[2]++; x[3] += s.lastResult.opRuns; x[4] += s.lastResult.myRuns;
        }
      });
    }
    A.step(s0);
  }
}
modes.forEach((m) => { const x = st[m]; console.log('3部', m, 'n', x[0], '勝率', (x[1] / x[0]).toFixed(3), '平均失点', (x[3] / x[2]).toFixed(1), '平均得点', (x[4] / x[2]).toFixed(1)); });
