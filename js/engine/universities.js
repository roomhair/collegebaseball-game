/* ==================================================
   大学野球  universities.js

   リーグに所属する18大学。
   ・内部では u00〜u17 の固定IDで扱い、表示名（name）だけを変えられる。
     成績や履歴はすべてIDで持っているので、名前を変えても壊れない。
   ・自分以外の大学は、部員全員を保存しておくと重いので、
     「強さ（level）」だけを持ち、対戦するときにその強さの部員を作る
     （強奪高校野球の相手校と同じ作り方）。
   ・強さは年ごとに少しずつ動く。1部にいる大学ほど良い新入生が来やすい。
   ================================================== */
'use strict';

const Universities = (() => {

  const ID = (i) => 'u' + String(i).padStart(2, '0');
  const USER_ID = 'u00';

  /** 18大学を作り、1部・2部・3部に6校ずつ振り分ける。自分の大学は2部 */
  function init(state, userName) {
    const names = NAMES.UNIVERSITIES.slice();
    state.unis = {};
    for (let i = 0; i < 18; i++) {
      state.unis[ID(i)] = {
        id: ID(i),
        name: i === 0 && userName ? userName : names[i],
        level: 0,
        /* 伝統（その大学の地力）。-1〜+1。強さの目標値をずらす */
        tradition: Math.round(RNG.norm(0, 0.45) * 100) / 100,
        titles: 0, natTitles: 0,
      };
    }
    /* 自分以外の17校を、伝統の強い順に1部6・2部5・3部6へ */
    const others = Object.keys(state.unis).filter((id) => id !== USER_ID)
      .sort((a, b) => state.unis[b].tradition - state.unis[a].tradition + RNG.norm(0, 0.3));
    state.divisions = { 1: others.slice(0, 6), 2: [USER_ID].concat(others.slice(6, 11)), 3: others.slice(11, 17) };
    [1, 2, 3].forEach((d) => {
      state.divisions[d].forEach((id) => {
        if (id === USER_ID) return;
        state.unis[id].level = targetLevel(state.unis[id], d) + RNG.norm(0, 1.5);
        state.unis[id].level = Math.round(state.unis[id].level * 10) / 10;
      });
    });
    [1, 2, 3].forEach((d) => state.divisions[d].forEach((id) => { state.unis[id].startDiv = d; }));
    state.userUni = USER_ID;
  }

  /** その部にいるときの強さの目安 */
  function targetLevel(u, div) {
    const L = CONFIG.LEVEL;
    return L.DIV_BASE[div] + u.tradition * L.DIV_SPREAD;
  }

  function divOf(state, id) {
    for (const d of [1, 2, 3]) if (state.divisions[d].indexOf(id) >= 0) return d;
    return null;
  }

  function name(state, id) {
    if (!id) return '';
    const u = state.unis && state.unis[id];
    if (u) return u.name;
    return id;
  }

  /**
   * 年が変わるとき、各大学の強さを動かす。
   * 4年生が抜けて新入生が入るので、年ごとにぶれる。
   * いまいる部の目安へゆっくり寄っていく（1部に上がった大学はだんだん強くなる）。
   */
  function evolve(state) {
    Object.keys(state.unis).forEach((id) => {
      if (id === state.userUni) return;
      const u = state.unis[id];
      /* 部員を保存している大学は、部員から強さを決める（rivals.js） */
      if (state.rosters && state.rosters[id]) { u.recent = Math.max(0, (u.recent || 0) * 0.5); return; }
      const d = divOf(state, id) || 3;
      const tgt = targetLevel(u, d) + Math.min(3, (u.recent || 0) * 0.8);
      u.level = u.level + (tgt - u.level) * 0.38 + RNG.norm(0, 1.9);
      u.level = Math.round(RNG.clamp(u.level, 30, 70) * 10) / 10;
      u.recent = Math.max(0, (u.recent || 0) * 0.5);
    });
  }

  /* ---------- 相手の部員を作る ----------
     強奪高校野球の Tournament.makeTeam と同じ作り方。人数と学年だけ大学向け。
     LEVEL_BIAS は「level を渡したときの Team.strength」がほぼ level に
     なるように合わせた補正（test/balance.js で測った値） */
  /* level（強さの目盛り）→ 部員を作るときの値。strength ≒ 0.8625 × 値 + 13.4 で測れたので逆算する */
  const LEVEL_BIAS = 0;
  function paramOf(level) { return (level - 13.4) / 0.8625; }

  function rollGrade() {
    const r = RNG.rand();
    return r < 0.32 ? 4 : r < 0.60 ? 3 : r < 0.84 ? 2 : 1;
  }

  /**
   * level の強さのチームを作る。
   * opt.persona を付けると人となりも付ける（詳細画面で見るため。重いので相手には付けない）
   */
  function makeRoster(teamName, level, opt) {
    opt = opt || {};
    const t = Team.create(teamName);
    const lv = paramOf(level);
    const posList = FIELD_POSITIONS.slice();
    for (let i = 0; i < 7; i++) posList.push(RNG.pick(FIELD_POSITIONS));
    posList.forEach((pos) => {
      t.batters.push(Player.newBatter({ grade: rollGrade(), pos, level: lv, practice: false }));
    });
    for (let i = 0; i < 9; i++) {
      t.pitchers.push(Player.newPitcher({ grade: rollGrade(), level: lv, practice: false }));
    }
    Team.all(t).forEach((p) => {
      p.career = p.kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
      p.tour = p.kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
      if (opt.persona) Persona.assign(p, { noOdd: true });
    });
    Team.autoLineup(t);
    t.level = level;
    return t;
  }

  /* ---------- 相手どうしの試合 ----------
     自分が出ない試合は、全員を作って1打席ずつ回すと時間がかかるので、
     強さの差から得点を引く。勝率は sim.js で測った「強さの差 → 勝率」に合わせてある。 */
  const QUICK_K = 0.043;

  function poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= RNG.rand(); } while (p > L && k < 30);
    return k - 1;
  }

  /** a・b の強さから1試合。allowDraw でなければ必ず決着をつける */
  function quickGame(levelA, levelB, allowDraw) {
    const d = levelA - levelB;
    const formA = RNG.norm(0, 3.5), formB = RNG.norm(0, 3.5);
    let ra = poisson(Math.max(0.4, 3.9 * Math.exp(QUICK_K * (d + formA - formB))));
    let rb = poisson(Math.max(0.4, 3.9 * Math.exp(-QUICK_K * (d + formA - formB))));
    let inn = 9;
    if (ra === rb) {
      /* 延長（タイブレーク）。決まらなければ引き分け */
      const pA = 1 / (1 + Math.exp(-0.06 * d));
      if (!allowDraw || RNG.chance(0.72)) {
        inn = RNG.range(10, allowDraw ? 12 : 13);
        if (RNG.chance(pA)) ra += RNG.range(1, 2); else rb += RNG.range(1, 2);
      } else {
        inn = 12;
      }
    }
    return { a: ra, b: rb, inn };
  }

  return { init, divOf, name, evolve, makeRoster, quickGame, targetLevel, USER_ID, LEVEL_BIAS, paramOf };
})();
