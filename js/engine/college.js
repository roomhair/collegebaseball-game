/* ==================================================
   大学野球  college.js

   自分の部の「人」のまわり。
   ・チーム作り（強奪高校野球と同じく、いくつかの組から野手・投手を選ぶ）
   ・試合に出られるか（ケガ・出場停止）と、その日の調子・疲労
   ・試合後の処理（成長は強奪高校野球の growth.js のまま）
   ・シーズンごとの成績の記録、4年生の引退とプロ入り、新入生の入部
   ================================================== */
'use strict';

const College = (() => {

  /* 自分の部の強さの目安。2部の平均（49）より少し下から始める */
  const OWN_LEVEL = 34;
  /* 新入生の強さ（スカウトの格ごと）。一般枠はいちばん下 */
  const FRESH_LEVEL = { S: 50, A: 43, B: 37, C: 33, G: 29 };

  /* ---------- 選手を作る ---------- */

  function newPlayer(kind, grade, level, opt) {
    opt = opt || {};
    const base = { grade, level, practice: false };
    if (opt.talent != null) base.talent = opt.talent;
    const p = kind === 'pitcher'
      ? Player.newPitcher(base)
      : Player.newBatter(Object.assign(base, { pos: opt.pos }));
    p.career = kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
    p.tour = kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
    p.initial = kind === 'pitcher'
      ? { velo: p.velo, control: p.control, stamina: p.stamina, pitches: p.pitches.map((q) => ({ name: q.name, level: q.level })) }
      : { meet: p.meet, power: p.power, speed: p.speed, arm: p.arm, field: p.field, catch: p.catch, traj: p.traj };
    Persona.assign(p, opt.persona || {});
    p.hs = opt.hs || NAMES.highSchool(RNG.chance(0.2));
    p.koshien = opt.koshien != null ? opt.koshien : RNG.chance(0.18);
    p.hsCaptain = opt.hsCaptain != null ? opt.hsCaptain : RNG.chance(0.1);
    p.enrolled = opt.enrolled || null;
    p.route = opt.route || null;    // 入部の経路（推薦・一般・初期メンバー）
    return p;
  }

  /* ---------- チーム作り ----------
     強奪高校野球と同じく、いくつかの組から野手の組・投手の組を1つずつ選ぶ。
     どの組にも「主力」「有望な若手」が入るようにし、問題児は0〜2人。 */

  function gradeList(perGrade) {
    const list = [];
    perGrade.forEach((n, i) => { for (let k = 0; k < n; k++) list.push(i + 1); });
    return list;
  }

  function teamSet(kind, startYear) {
    const isPit = kind === 'pitcher';
    const grades = gradeList(isPit ? CONFIG.ROSTER.PIT_PER_GRADE : CONFIG.ROSTER.BAT_PER_GRADE);
    const pos = FIELD_POSITIONS.slice();
    while (pos.length < grades.length) pos.push(RNG.pick(FIELD_POSITIONS));
    RNG.shuffle(pos);
    const problems = RNG.chance(0.35) ? 0 : (RNG.chance(0.6) ? 1 : 2);
    const players = grades.map((g, i) => newPlayer(kind, g, OWN_LEVEL, {
      pos: pos[i],
      enrolled: startYear - (g - 1),
      route: '創部メンバー',
      persona: { problem: i < problems ? true : undefined },
    }));
    /* 主力：上級生から1人を一段強く。有望株：下級生から1人を伸びしろ大きく */
    const upper = players.filter((p) => p.grade >= 3);
    const lower = players.filter((p) => p.grade <= 2);
    if (upper.length) boost(RNG.pick(upper), isPit ? 9 : 10);
    if (lower.length) {
      const q = RNG.pick(lower);
      q.growthRate = Math.max(q.growthRate, RNG.range(75, 92));
      q.potential = Math.max(q.potential, Player.rating(q) + RNG.range(28, 40));
      q.potential = Math.min(98, q.potential);
    }
    players.forEach((p) => { p.known = true; });   // 最初からいる部員は性格が分かっている
    players.sort((a, b) => (b.grade - a.grade) || (Player.rating(b) - Player.rating(a)));
    return players;
  }

  function boost(p, n) {
    const keys = p.kind === 'pitcher' ? ['control', 'stamina'] : ['meet', 'power', 'speed', 'field', 'catch', 'arm'];
    keys.forEach((k) => { p[k] = RNG.stat(p[k] + n + RNG.range(-2, 3)); });
    if (p.kind === 'pitcher') p.velo = Math.min(158, p.velo + RNG.range(3, 6));
    p.potential = Math.max(p.potential, Player.rating(p) + 6);
    p.initial = p.kind === 'pitcher'
      ? { velo: p.velo, control: p.control, stamina: p.stamina, pitches: p.pitches.map((q) => ({ name: q.name, level: q.level })) }
      : { meet: p.meet, power: p.power, speed: p.speed, arm: p.arm, field: p.field, catch: p.catch, traj: p.traj };
  }

  function teamSets(kind, n, startYear) {
    const out = [];
    for (let i = 0; i < (n || CONFIG.PICK_SETS); i++) out.push(teamSet(kind, startYear));
    return out;
  }

  function setSummary(players) {
    const byGrade = { 1: 0, 2: 0, 3: 0, 4: 0 };
    players.forEach((p) => { byGrade[p.grade]++; });
    const best = players.slice().sort((a, b) => Player.rating(b) - Player.rating(a))[0];
    const prospect = players.slice().sort((a, b) => (b.potential - Player.rating(b)) - (a.potential - Player.rating(a)))[0];
    const avg = Math.round(players.reduce((s, p) => s + Player.rating(p), 0) / players.length);
    return { count: players.length, byGrade, best, prospect, rating: avg,
             problems: players.filter(Persona.isProblem).length };
  }

  /* ---------- 出場できるか ---------- */

  function suspended(state, p) {
    const s = p.suspend;
    if (!s) return false;
    if (s.games > 0) return true;
    if (s.untilSeq != null && state.seasonSeq <= s.untilSeq) return true;
    return false;
  }

  function injured(p) { return !!(p.injury && p.injury.games > 0); }

  function eligible(state, p) { return !suspended(state, p) && !injured(p); }

  /** 出られない理由（画面用） */
  function statusText(state, p) {
    if (injured(p)) return 'ケガ（あと' + p.injury.games + '試合）';
    const s = p.suspend;
    if (s && suspended(state, p)) {
      if (s.untilSeq != null && state.seasonSeq <= s.untilSeq) return '出場停止（' + (s.label || '今季') + '）';
      return '出場停止（あと' + s.games + '試合）';
    }
    if (s && s.practiceBan > 0) return '練習禁止';
    return '';
  }

  /**
   * 試合に出すチーム。ケガ・出場停止の選手を外した「その試合の顔ぶれ」。
   * 選手そのものは state.team と同じもの（成績はそのまま本人に入る）。
   * 外した選手がスタメンにいたら、空いた所だけでなく打順ごと組み直す。
   */
  function matchTeam(state) {
    const t = state.team;
    const okB = t.batters.filter((p) => eligible(state, p));
    let okP = t.pitchers.filter((p) => eligible(state, p));
    /* 野手が9人に満たないときは、投手を野手として使う（めったに起きない） */
    while (okB.length < 9 && okP.length > 2) {
      const q = okP.slice().sort((a, b) => Player.rating(a) - Player.rating(b))[0];
      okP = okP.filter((x) => x !== q);
      okB.push(q);
    }
    const view = {
      name: t.name, batters: okB, pitchers: okP,
      lineup: (t.lineup || []).filter((sl) => okB.some((p) => p.id === sl.pid)).map((sl) => ({ pid: sl.pid, pos: sl.pos })),
      rotation: (t.rotation || []).filter((id) => okP.some((p) => p.id === id)),
      captainId: t.captainId,
      morale: t.morale,
    };
    let rebuilt = false;
    /* 出られない選手が抜けたところだけ、控えから埋める（監督の組んだ残りの並びはそのまま）。
       半分以上崩れているときだけ、まるごとおまかせで組み直す */
    if (view.lineup.length < 9 && view.lineup.length >= 5 && okB.length >= 9) {
      const have = new Set(view.lineup.map((sl) => sl.pos));
      LINEUP_POSITIONS.filter((k) => !have.has(k)).forEach((k) => {
        const used = new Set(view.lineup.map((sl) => sl.pid));
        const bench = okB.filter((p) => !used.has(p.id));
        const best = bench.sort((a, b) => (Team.defScore(b, k) + Player.rating(b) * 0.25) - (Team.defScore(a, k) + Player.rating(a) * 0.25))[0];
        if (best) view.lineup.push({ pid: best.id, pos: k });
      });
    }
    if (view.lineup.length < 9) { Team.autoLineup(view); rebuilt = true; }
    okP.forEach((p) => { if (view.rotation.indexOf(p.id) < 0) view.rotation.push(p.id); });
    view.rebuilt = rebuilt;
    return view;
  }

  /** 試合用チームで決めた打順・起用順を、部のほうにも覚えさせる */
  function syncBack(state, view) {
    const t = state.team;
    t.lineup = view.lineup.map((sl) => ({ pid: sl.pid, pos: sl.pos }));
    const rest = (t.rotation || []).filter((id) => view.rotation.indexOf(id) < 0);
    t.rotation = view.rotation.slice().concat(rest);
  }

  /* ---------- 投手のスタミナ（カードをまたいだ持ち越し） ----------
     大学野球はカードが土・日・月と続くので、1戦目に完投したエースは
     2戦目には消耗が残り、3戦目ならほぼ戻っている、という塩梅にしてある。
     ・pstam：残りスタミナ（0〜100%）。投げた打者の数だけ減る。スタミナの能力が高いほど減りにくい
     ・1日ごとに回復し、カードが変わる（翌週になる）と全快する
     ・試合の中では、強奪高校野球の「スタミナの持ち越し（staminaCarry）」として効く。
       消耗が残ったまま登板すると、早い回から球威と制球が落ちる */
  /* RECOVER：1日で戻るぶん（＋スタミナ÷20）。START_MIN：先発したら、早く降りても最低これだけ減る
     （先発の準備と緊張で消耗する。翌日の連投を避けたくなるように） */
  const STAM = { RECOVER: 33, RESTED: 85, START_MIN: 68 };

  /** 打者1人あたりに減る残りスタミナ（%）。スタミナ50で完投（35人）すると約75%減る */
  function pitchCost(p) { return 2.7 - (p.stamina || 50) / 100 * 1.1; }

  function pstamOf(p) { return p.pstam == null ? 100 : p.pstam; }

  /** 残りスタミナを、試合の計算で使う「持ち越し」に写す */
  function syncCarry(p) {
    p.staminaCarry = (1 - pstamOf(p) / 100) * (Sim.capacityOf(p) + 58);
  }

  /** 試合中の残りスタミナ（%）。bf はこの試合で受けた打者の数 */
  function liveStamina(p, bf) {
    return Math.max(0, pstamOf(p) - (bf || 0) * pitchCost(p));
  }

  /** 投げたぶん減らす（試合のあと） */
  function tirePitchers(team) {
    (team.pitchers || []).forEach((p) => {
      const bf = (p.game && p.game.bf) || 0;
      if (bf > 0) {
        let drop = bf * pitchCost(p);
        if (p.game.gs) drop = Math.max(drop, STAM.START_MIN);
        p.pstam = Math.max(0, Math.round(pstamOf(p) - drop));
      }
      syncCarry(p);
    });
  }

  /** 1日ぶん回復する。full なら全快（カードが変わったとき） */
  function recoverPitchers(team, full) {
    (team.pitchers || []).forEach((p) => {
      p.pstam = full ? 100 : Math.min(100, Math.round(pstamOf(p) + STAM.RECOVER + (p.stamina || 50) / 20));
      syncCarry(p);
    });
  }

  /**
   * 相手（自分では選ばないチーム）の先発を決める。
   * 疲れの抜けた投手の中でいちばん良い投手。エースが休んでいれば2番手が投げる
   */
  function pickRestedStarter(team) {
    const list = (team.rotation || []).map((id) => Team.find(team, id)).filter(Boolean);
    if (!list.length) return;
    const ok = list.filter((p) => pstamOf(p) >= STAM.RESTED);
    const pool = ok.length ? ok : list.slice().sort((a, b) => pstamOf(b) - pstamOf(a)).slice(0, 1);
    const best = pool.slice().sort((a, b) => Player.rating(b) - Player.rating(a))[0];
    team.rotation = [best.id].concat(team.rotation.filter((id) => id !== best.id));
  }

  /* ---------- 調子と疲労 ---------- */

  /** チームの雰囲気（0〜100）。キャプテンの統率で少し底上げされる */
  function moraleBonus(state) {
    const m = state.team.morale == null ? 55 : state.team.morale;
    const cap = Team.captain(state.team);
    const lead = cap && cap.persona ? cap.persona.lead : 40;
    return (m - 55) / 22 + (lead - 50) / 40;
  }

  /**
   * 試合前。調子・疲労・雰囲気から「その日の下駄」を入れる（sim.js が使う）。
   * big は全国大会や入れ替え戦のような大舞台。メンタルの弱い選手は硬くなる。
   */
  function preGame(state, view, big) {
    const mb = moraleBonus(state);
    Team.all(view).forEach((p) => {
      let f = (p.condition || 0) * 2.3 - (p.fatigue || 0) / 22 + mb;
      if (big && p.persona) f += (p.persona.mental - 50) / 18;
      p.formBias = Math.round(f * 10) / 10;
    });
  }

  /**
   * 試合後。成長は強奪高校野球の Growth.afterGame をそのまま使い、
   * そのあと大学版の疲労・調子・ケガ・出場停止の消化を行う。
   * 戻り値 { report, injuries }
   */
  function postGame(state, view, ctx) {
    const report = Growth.afterGame(view, ctx);
    Growth.commitStats(view);
    tirePitchers(view);
    const injuries = [];
    const playedIds = new Set();
    Team.all(view).forEach((p) => {
      const played = p.kind === 'pitcher' ? p.game.outs > 0 : p.game.pa > 0;
      if (played) playedIds.add(p.id);
      if (p.kind === 'pitcher') {
        p.fatigue = RNG.clamp((p.fatigue || 0) * 0.6 + (p.game.outs || 0) * 1.9, 0, 100);
      } else {
        p.fatigue = RNG.clamp((p.fatigue || 0) + (played ? RNG.range(5, 10) : -14), 0, 100);
      }
      Persona.rollCondition(p, ctx.win ? 0.08 : -0.06);
      /* ケガ。出た選手だけ、疲れているほど起きやすい */
      if (played && RNG.chance(0.004 + (p.fatigue || 0) / 9000)) {
        const g = RNG.range(2, 9);
        p.injury = { games: g, text: RNG.pick(['太ももの肉離れ', '手首の捻挫', '足首の捻挫', '腰痛', '肩の張り', '打撲']) };
        injuries.push({ pid: p.id, name: p.name, games: g, text: p.injury.text });
        addHist(p, state, p.injury.text + 'で離脱（' + g + '試合）');
      }
      p.formBias = 0;
    });
    /* 試合に出なかった（出られなかった）部員の疲労を抜き、ケガと出場停止を1試合ぶん進める */
    Team.all(state.team).forEach((p) => {
      if (!view.batters.includes(p) && !view.pitchers.includes(p)) {
        p.fatigue = Math.max(0, (p.fatigue || 0) - 14);
      }
      if (p.injury && p.injury.games > 0 && !injuries.some((x) => x.pid === p.id)) {
        p.injury.games--;
        if (p.injury.games <= 0) p.injury = null;
      }
      if (p.suspend && p.suspend.games > 0 && !playedIds.has(p.id)) {
        p.suspend.games--;
      }
      cleanSuspend(state, p);
    });
    /* 雰囲気は勝てば少し上がり、負ければ少し下がる */
    const t = state.team;
    t.morale = RNG.clamp((t.morale == null ? 55 : t.morale) + (ctx.win ? 1.2 : (ctx.draw ? 0 : -1.0)), 5, 95);
    return { report, injuries };
  }

  function cleanSuspend(state, p) {
    const s = p.suspend;
    if (!s) return;
    const over = !(s.games > 0) && !(s.untilSeq != null && state.seasonSeq <= s.untilSeq) && !(s.practiceBan > 0);
    if (over) p.suspend = null;
  }

  /** 試合の無い期間（特訓・オフ）に体を休める */
  function rest(state, amount) {
    Team.all(state.team).forEach((p) => {
      p.fatigue = Math.max(0, (p.fatigue || 0) - (amount || 40));
      p.staminaCarry = 0;
      p.pstam = 100;
      if (p.suspend && p.suspend.practiceBan > 0) p.suspend.practiceBan--;
      cleanSuspend(state, p);
    });
  }

  /** 特訓に出られる部員（練習禁止・ケガの選手を除く）。Training に渡すための見え方 */
  function trainView(state) {
    const ok = (p) => !(p.suspend && p.suspend.practiceBan > 0) && !injured(p) && !(p.suspend && p.suspend.untilSeq != null && state.seasonSeq <= p.suspend.untilSeq && p.suspend.severe);
    return {
      name: state.team.name,
      batters: state.team.batters.filter(ok),
      pitchers: state.team.pitchers.filter(ok),
      lineup: state.team.lineup, rotation: state.team.rotation,
    };
  }

  /* ---------- 歩み（その選手の履歴） ---------- */

  function termLabel(state) {
    return state.year + '年' + (state.term === 'spring' ? '春' : '秋');
  }

  function addHist(p, state, text) {
    p.hist = p.hist || [];
    p.hist.push({ y: state.year, t: state.term, text });
    if (p.hist.length > 40) p.hist.splice(0, p.hist.length - 40);
  }

  /** シーズン（リーグ戦＋全国大会）が始まるときに成績をまっさらにする */
  function seasonStart(state) {
    Growth.resetTour(state.team);
  }

  /**
   * シーズンの終わりに、選手ごとの成績を残す。
   * 「1年生では控えだったが、3年春からレギュラー」のような歩みを作る材料。
   */
  function seasonEnd(state, label) {
    const div = Universities.divOf(state, state.userUni);
    Team.all(state.team).forEach((p) => {
      const s = p.tour;
      const isPit = p.kind === 'pitcher';
      const played = isPit ? (s.outs > 0) : (s.pa > 0);
      p.seasons = p.seasons || [];
      if (played) {
        p.seasons.push({ y: state.year, t: state.term, div, g: p.grade, s: Object.assign({}, s), label: label || '' });
      }
      /* レギュラー定着などの節目を歩みに残す */
      const prev = (p.seasons[p.seasons.length - 2] || null);
      if (!isPit && s.pa >= 30) {
        if (!p._regular) addHist(p, state, (p.grade) + '年' + (state.term === 'spring' ? '春' : '秋') + 'からレギュラーに定着（打率' + UI_avg(s.h, s.ab) + '）');
        p._regular = true;
        if (s.ab >= 25 && s.h / s.ab >= 0.36) addHist(p, state, termLabel(state) + ' 打率' + UI_avg(s.h, s.ab) + 'の大活躍');
        if (s.hr >= 4) addHist(p, state, termLabel(state) + ' ' + s.hr + '本塁打');
      }
      if (isPit && s.outs >= 45) {
        if (!p._regular) addHist(p, state, (p.grade) + '年' + (state.term === 'spring' ? '春' : '秋') + 'から主力投手に');
        p._regular = true;
        if (s.w >= 5) addHist(p, state, termLabel(state) + ' ' + s.w + '勝を挙げる');
      }
      void prev;
    });
  }

  function UI_avg(h, ab) {
    if (!ab) return '.---';
    const v = h / ab;
    return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '');
  }

  /* ---------- 引退とプロ入り ---------- */

  /**
   * 4年生の進路。能力と活躍（名場面）で、プロ・社会人・一般就職に分かれる。
   * ここで決まった「プロ入り」は大学の実績として残る。
   */
  function careerPath(state, p) {
    const hl = (p.hl || []).slice(0, 3).reduce((s, h) => s + h.score, 0);
    const score = Player.rating(p) + hl * 0.3 + (p.titles ? Math.min(3, p.titles) : 0);
    if (score >= 71 && RNG.chance(RNG.clamp(0.22 + (score - 71) / 12, 0, 0.97))) {
      const round = score >= 84 ? 1 : score >= 80 ? 2 : score >= 76 ? 3 : score >= 73 ? 4 : score >= 71 ? 5 : 0;
      const teamIdx = RNG.range(0, 11);
      return { kind: 'pro', round, team: 'pt' + teamIdx,
               text: round ? 'ドラフト' + round + '位' : '育成ドラフト' };
    }
    if (score >= 50 && RNG.chance(0.75)) {
      return { kind: 'shakai', company: RNG.pick(NAMES.COMPANIES), text: '社会人野球へ' };
    }
    return { kind: 'job', text: RNG.pick(['一般企業に就職', '教員を目指す', '家業を継ぐ', '大学院へ進学', '地元の企業に就職']) };
  }

  function retiring(state) {
    return Team.all(state.team).filter((p) => p.grade >= 4);
  }

  /** 引退する4年生の「4年間の振り返り」 */
  function farewell(state, p) {
    return {
      player: p,
      career: p.career,
      seasons: p.seasons || [],
      top: (p.hl || []).slice().sort((a, b) => b.score - a.score).slice(0, 3),
      hist: (p.hist || []).slice(),
      path: p.path || null,
    };
  }

  /** 進路を決める（引退の画面を出す前に一度だけ） */
  function decidePaths(state) {
    retiring(state).forEach((p) => {
      if (!p.path) p.path = careerPath(state, p);
    });
  }

  /** 4年生を外し、残りを1つ進級させる。外した選手は記録（OB）に移す */
  function graduate(state) {
    const out = retiring(state);
    out.forEach((p) => {
      if (!p.path) p.path = careerPath(state, p);
      Records.alumni(state, p, p.path.kind === 'pro' ? 'プロ入り' : '卒業');
      if (p.path.kind === 'pro') Records.pro(state, p, p.path);
    });
    const ids = new Set(out.map((p) => p.id));
    state.team.batters = state.team.batters.filter((p) => !ids.has(p.id));
    state.team.pitchers = state.team.pitchers.filter((p) => !ids.has(p.id));
    Team.all(state.team).forEach((p) => {
      p.grade++;
      p.known = true;                     // 1年いっしょに過ごせば人柄は分かる
      p._regular = p._regular || false;
    });
    Team.checkCaptain(state.team);
    if (state.team.batters.length >= 9) Team.repair(state.team);
    return out;
  }

  /** 新入生の必要人数。学年が偏らず、部員が増えすぎないように */
  function need(state) {
    const R = CONFIG.ROSTER;
    const t = state.team;
    const all = Team.all(t);
    const grade1 = all.filter((p) => p.grade === 1).length;
    const room = Math.max(0, Math.min(R.GRADE_MAX - grade1, R.TOTAL_MAX - all.length));
    let bat = Math.max(0, 18 - t.batters.length);
    let pit = Math.max(0, 10 - t.pitchers.length);
    /* 足りなくても1学年の上限は超えない。最低人数だけは必ず満たす */
    while (bat + pit > room) {
      if (bat > pit && t.batters.length + bat - 1 >= R.MIN_BAT) bat--;
      else if (pit > 0 && t.pitchers.length + pit - 1 >= R.MIN_PIT) pit--;
      else if (bat > 0 && t.batters.length + bat - 1 >= R.MIN_BAT) bat--;
      else break;
    }
    return { bat, pit, room };
  }

  /** 新入生を入部させる。二重登録はしない */
  function enroll(state, players) {
    const have = new Set(Team.all(state.team).map((p) => p.id));
    const added = [];
    players.forEach((p) => {
      if (have.has(p.id)) return;
      if (Records.isGone(state, p.id)) return;   // 卒業・退部した選手は戻らない
      p.grade = 1;
      p.enrolled = state.year;
      if (p.kind === 'pitcher') state.team.pitchers.push(p); else state.team.batters.push(p);
      have.add(p.id);
      added.push(p);
      addHist(p, state, state.year + '年 ' + (p.route || '一般') + 'で入部（' + (p.hs || '') + '）');
    });
    Team.autoLineup(state.team);
    return added;
  }

  /** 一般枠の新入生の組（強奪高校野球の「新入生を選ぶ」と同じ形） */
  function generalSets(state, n, count) {
    const sets = [];
    for (let i = 0; i < (count || CONFIG.NEWCOMER_SETS); i++) {
      const set = [];
      for (let k = 0; k < n.bat; k++) set.push(newPlayer('batter', 1, FRESH_LEVEL.G + RNG.norm(0, 2), { route: '一般', pos: RNG.pick(FIELD_POSITIONS) }));
      for (let k = 0; k < n.pit; k++) set.push(newPlayer('pitcher', 1, FRESH_LEVEL.G + RNG.norm(0, 2), { route: '一般' }));
      /* たまに隠れた逸材 */
      if (set.length && RNG.chance(0.3)) {
        const q = RNG.pick(set);
        q.growthRate = RNG.range(78, 95);
        q.potential = Math.min(98, Player.rating(q) + RNG.range(30, 42));
      }
      sets.push(set);
    }
    return sets;
  }

  /** 部員の数の点検（壊れていたら例外） */
  function check(state) {
    const all = Team.all(state.team);
    const ids = all.map((p) => p.id);
    if (new Set(ids).size !== ids.length) throw new Error('選手が二重に登録されています');
    all.forEach((p) => {
      if (p.grade < 1 || p.grade > 4) throw new Error('学年が不正です: ' + p.name + ' ' + p.grade);
      if (Records.isGone(state, p.id)) throw new Error('引退した選手が残っています: ' + p.name);
    });
    if (all.length > CONFIG.ROSTER.TOTAL_MAX) throw new Error('部員が多すぎます: ' + all.length);
  }

  function strength(state) {
    const v = matchTeam(state);
    return Team.strength(v);
  }

  return {
    OWN_LEVEL, FRESH_LEVEL, newPlayer, teamSets, setSummary,
    eligible, suspended, injured, statusText, matchTeam, syncBack, preGame, postGame, rest, trainView,
    addHist, termLabel, seasonStart, seasonEnd, retiring, farewell, decidePaths, graduate, need, enroll,
    generalSets, check, strength, careerPath, moraleBonus,
    tirePitchers, recoverPitchers, pickRestedStarter, pstamOf, liveStamina, STAM,
  };
})();
