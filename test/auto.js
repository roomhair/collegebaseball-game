/* 自動でゲームを進める（テストとバランス計測用）。
   人がボタンを押す代わりに、いまのフェーズ・ステップで「ふつうの選択」をする。 */
'use strict';

function makeAuto(G, policy) {
  policy = policy || {};
  const E = G.Engine;

  function bestSet(list) {
    let bi = 0, bv = -1;
    list.forEach((set, i) => {
      const v = set.reduce((s, p) => s + G.Player.rating(p), 0) / set.length;
      if (v > bv) { bv = v; bi = i; }
    });
    return policy.worstSets ? list.map((s, i) => i).sort((a, b) => avg(list[a]) - avg(list[b]))[0] : bi;
    function avg(set) { return set.reduce((s, p) => s + G.Player.rating(p), 0) / set.length; }
  }

  function ensureCaptain(state) {
    if (!G.Team.captain(state.team)) {
      const all = G.Team.all(state.team).slice().sort((a, b) => (b.persona ? b.persona.lead : 0) - (a.persona ? a.persona.lead : 0));
      const pick = all.find((p) => p.grade < 4) || all[0];
      E.setCaptain(state, pick.id);
    }
  }

  /** 1歩進める。進めなかったら false */
  function step(state) {
    if (state.pending && state.pending.length) {
      const top = state.pending[0];
      const key = top.options ? (policy.incidentChoice || top.options[0].key) : null;
      E.answerPending(state, key);
      return true;
    }
    if (state.mode === 'soccer') return G.Soccer.autoStep(state, policy);
    if (state.mode === 'pro') return G.Pro.autoStep(state, policy);
    const ph = state.phase, st = state.step;
    switch (ph) {
      case 'TEAM_CREATION':
        if (st === 'pick-bat' || st === 'pick-pit') { E.pickCreation(state, bestSet(state.sets.list)); return true; }
        ensureCaptain(state); E.finishCreation(state); return true;
      case 'SPRING_TRAINING': case 'SUMMER_TRAINING':
        if (st === 'intro') { ensureCaptain(state); E.startTraining(state); return true; }
        if (st === 'training') {
          if (policy.passWeak && G.Training.canPass(state.training) && state.training.card.targets.length <= 1) E.trainPass(state);
          else E.trainTake(state);
          return true;
        }
        if (st === 'result') { E.endTraining(state); return true; }
        break;
      case 'SPRING_LEAGUE': case 'FALL_LEAGUE': case 'SPRING_PLAYOFF': case 'FALL_PLAYOFF':
      case 'SPRING_NATIONAL': case 'FALL_NATIONAL':
        if (st === 'round' || st === 'opening' || st === 'nextup') {
          if (/_NATIONAL$/.test(ph)) { if (st !== 'pregame') state.step = 'pregame'; return true; }
          E.prepareMatch(state); return true;
        }
        if (st === 'pregame') { E.autoGame(state); return true; }
        if (st === 'verdict' || st === 'growth' || st === 'result') { E.nextAfterGame(state); return true; }
        if (st === 'cardEnd') { E.nextCard(state); return true; }
        if (st === 'final') { E.afterFinal(state); return true; }
        if (st === 'end') { E.closeSeason(state); return true; }
        break;
      case 'SCOUTING': {
        const sc = state.scouting;
        const cands = sc.cands.slice();
        if (!policy.noScout) {
          cands.forEach((c) => { while (sc.points > 0 && c.look < 1) G.Scouting.look(sc, c.id); });
          cands.slice().sort((a, b) => G.Player.rating(b.player) - G.Player.rating(a.player))
            .forEach((c) => { if (!c.offered) G.Scouting.toggleOffer(sc, c.id); });
          const top = cands.find((c) => c.offered);
          if (top) G.Scouting.toggleSpecial(sc, top.id);
        }
        E.endScouting(state); return true;
      }
      case 'RETIREMENT': E.endRetirement(state); return true;
      case 'NEW_MEMBER':
        if (state.sets) { E.pickGeneral(state, bestSet(state.sets.list)); return true; }
        E.finishNewMember(state); return true;
      case 'PRO_CHOICE': E.chooseProEntry(state, !!policy.goPro); return true;
      case 'DISBAND': G.Soccer.start(state); return true;
    }
    throw new Error('進めない状態: ' + ph + ' / ' + st);
  }

  return { step };
}

module.exports = { makeAuto };
