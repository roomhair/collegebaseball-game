/* 「最速154・制球88・スタミナ63」のような好投手が、1部・2部の相手にどれくらいの防御率になるか */
const G = require('./load').load();
const { Universities, Team, Sim, Player, College } = G;
function run(level, mk, n) {
  let er = 0, outs = 0;
  for (let i = 0; i < n; i++) {
    const me = Universities.makeRoster('me', 52), op = Universities.makeRoster('op', level);
    const ace = Team.find(me, me.rotation[0]);
    mk(ace);
    G.Growth.resetTour(me); Team.all(me).forEach((p) => { p.career = Player.emptyPit(); });
    const r = Sim.play(me, op, { maxInnings: 12, manual: 'away' });
    er += ace.game.er; outs += ace.game.outs;
  }
  return (er * 27 / outs).toFixed(2) + '（1試合平均 ' + (outs / 3 / n).toFixed(1) + '回）';
}
const good = (p) => { p.velo = 154; p.control = 88; p.stamina = 63; p.pitches = [{ name: 'スライダー', level: 5 }, { name: 'フォーク', level: 4 }, { name: 'カーブ', level: 3 }]; };
const avgP = (p) => { p.velo = 140; p.control = 55; p.stamina = 55; p.pitches = [{ name: 'スライダー', level: 3 }, { name: 'カーブ', level: 2 }]; };
[41, 49, 57, 62].forEach((lv) => console.log('相手の強さ', lv, '好投手', run(lv, good, 300), '／平均的な投手', run(lv, avgP, 300)));
const p = Universities.makeRoster('x', 52).pitchers[0]; good(p); console.log('好投手の総合力', Player.rating(p));
