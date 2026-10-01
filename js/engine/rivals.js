/* ==================================================
   大学野球  rivals.js

   自校と同じ部にいる5校だけは、部員全員を保存しておく。
   ・毎シーズン何度も当たる相手なので、同じ選手が年をまたいで出てくる
     （「あの大学のエースとまた当たる」が起きるように）。
   ・その5校の選手は、自校との試合で成長し、シーズンの終わりにもまとめて伸びる。
     4年生は卒業し、新入生が入る。スカウトで取り合いに負けた選手は、
     行き先がこの5校のどれかなら、実際にそこへ入部して相手として現れる。
   ・大学の強さ（unis[id].level）は部員から計算し直すので、
     自校が出ない試合（強さの差で決める簡易計算）にもそのまま効く。
   ・自校が昇格・降格したら、新しい部の5校に入れ替える
     （保存しておくのは同じ部の5校だけ。データを大きくしすぎないため）。
   ================================================== */
'use strict';

const Rivals = (() => {

  const BAT = 15, PIT = 9;          // 1校の人数（試合に必要なぶん＋控え）
  const GRADE_GAIN = { 1: 1.3, 2: 1.15, 3: 1.0, 4: 0.85 };
  /* 1シーズンでまとめて伸びるぶん（自校の選手が1シーズンで伸びる幅に合わせてある。
     test/rivals.js で、何年たっても強さが目安のあたりに留まることを確かめた値） */
  const SEASON_GAIN = 2.6;

  function get(state, id) { return (state.rosters && state.rosters[id]) || null; }

  function has(state, id) { return !!get(state, id); }

  /** 部員から強さを計算し直す */
  function refresh(state, id) {
    const t = get(state, id);
    if (!t) return;
    Team.checkCaptain(t);
    if (t.batters.length >= 9) Team.repair(t);
    state.unis[id].level = Math.round(Team.strength(t) * 10) / 10;
  }

  function create(state, id) {
    const u = state.unis[id];
    const t = Universities.makeRoster(u.name, u.level, { persona: true });
    t.uniId = id;
    Team.all(t).forEach((p) => { mark(p, state.year - (p.grade - 1)); });
    t.captainId = Team.all(t).slice().sort((a, b) => (b.grade - a.grade) || (b.persona.lead - a.persona.lead))[0].id;
    state.rosters[id] = t;
    refresh(state, id);
  }

  function mark(p, enrolled) {
    p.rival = true;          // 他大学の選手（成績は自校との対戦ぶんだけ）
    p.known = true;
    p.enrolled = p.enrolled || enrolled;
    p.hl = p.hl || [];
  }

  /**
   * 部員を保存する大学を、いまの自校の部にそろえる。
   * シーズンの始まり（所属が決まったあと）とゲーム開始時に呼ぶ。
   */
  function sync(state) {
    state.rosters = state.rosters || {};
    const d = Universities.divOf(state, state.userUni);
    const want = d ? state.divisions[d].filter((id) => id !== state.userUni) : [];
    Object.keys(state.rosters).forEach((id) => { if (want.indexOf(id) < 0) delete state.rosters[id]; });
    want.forEach((id) => { if (!state.rosters[id]) create(state, id); });
    Object.keys(state.rosters).forEach((id) => { state.rosters[id].name = state.unis[id].name; });
  }

  /** シーズンの始まり。成績をまっさらにし、疲れを抜く */
  function seasonStart(state) {
    sync(state);
    Object.keys(state.rosters).forEach((id) => {
      const t = state.rosters[id];
      Growth.resetTour(t);
      Team.healPitchers(t);
    });
  }

  /** 1人ぶんの、シーズンをまたいだ伸び */
  function develop(p) {
    const k = (GRADE_GAIN[p.grade] || 1) * Player.growthMul(p);
    const keys = p.kind === 'pitcher' ? ['control', 'stamina'] : ['meet', 'power', 'speed', 'arm', 'field', 'catch'];
    keys.forEach((key) => {
      const v = p[key];
      const room = RNG.clamp(Math.pow(Math.max(0, 100 - v) / 22, 1.9), 0.04, 1);
      const add = Math.round(Math.max(0, RNG.norm(SEASON_GAIN * k, 1.4)) * room);
      p[key] = RNG.stat(v + add);
    });
    if (p.kind === 'pitcher') {
      if (RNG.chance(0.45 * k)) p.velo = Math.min(160, p.velo + 1);
      if (p.pitches.length && RNG.chance(0.25 * k)) {
        const q = RNG.pick(p.pitches.filter((x) => x.level < 7).concat(p.pitches[0]));
        q.level = Math.min(7, q.level + 1);
      }
    }
  }

  /** リーグ戦が終わったとき。まとめて伸ばし、強さを計算し直す */
  function seasonEnd(state) {
    Object.keys(state.rosters || {}).forEach((id) => {
      Team.all(state.rosters[id]).forEach(develop);
      refresh(state, id);
    });
  }

  /**
   * 年度が変わるとき。4年生が卒業し、残りが進級し、新入生が入る。
   * joiners は { uniId: [選手] }（スカウトで自校が取り合いに負けた選手）。
   * 新入生の強さは、その大学の「目安の強さ」へ寄っていくように決める。
   */
  function yearTurn(state, joiners) {
    Object.keys(state.rosters || {}).forEach((id) => {
      const t = state.rosters[id];
      const u = state.unis[id];
      const before = Team.strength(t);          // 卒業前の強さ（新入生の強さを決める目安）
      const grads = Team.all(t).filter((p) => p.grade >= 4);
      grads.forEach((p) => {
        /* 他大学からもプロ入りは出る（大学の実績になる） */
        if (Player.rating(p) >= 72 && RNG.chance(0.45)) u.pros = (u.pros || 0) + 1;
      });
      const out = new Set(grads.map((p) => p.id));
      t.batters = t.batters.filter((p) => !out.has(p.id));
      t.pitchers = t.pitchers.filter((p) => !out.has(p.id));
      Team.all(t).forEach((p) => { p.grade++; });

      const div = Universities.divOf(state, id) || 3;
      const target = Universities.targetLevel(u, div) + Math.min(3, (u.recent || 0) * 0.8);
      /* いまの強さが目安より低ければ、良い新入生が来やすい（逆も同じ）。急には動かさない */
      const gap = RNG.clamp(target - before, -6, 6);
      const param = Universities.paramOf(target + gap * 0.6) + RNG.norm(0, 1.5);

      (joiners && joiners[id] || []).forEach((p) => {
        p.grade = 1; mark(p, state.year);
        if (p.kind === 'pitcher') t.pitchers.push(p); else t.batters.push(p);
      });
      while (t.batters.length < BAT) {
        const pos = FIELD_POSITIONS.find((k) => !t.batters.some((p) => p.pos === k)) || RNG.pick(FIELD_POSITIONS);
        t.batters.push(fresh('batter', param, pos, state.year));
      }
      while (t.pitchers.length < PIT) t.pitchers.push(fresh('pitcher', param, null, state.year));
      Team.checkCaptain(t);
      if (!t.captainId) {
        const cap = Team.all(t).filter((p) => p.grade >= 3).sort((a, b) => (b.persona ? b.persona.lead : 0) - (a.persona ? a.persona.lead : 0))[0];
        if (cap) t.captainId = cap.id;
      }
      Team.autoLineup(t);
      refresh(state, id);
    });
  }

  function fresh(kind, param, pos, year) {
    const p = kind === 'pitcher'
      ? Player.newPitcher({ grade: 1, level: param, practice: false })
      : Player.newBatter({ grade: 1, level: param, pos, practice: false });
    p.career = kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
    p.tour = kind === 'pitcher' ? Player.emptyPit() : Player.emptyBat();
    Persona.assign(p);
    p.hs = NAMES.highSchool(RNG.chance(0.15));
    mark(p, year);
    return p;
  }

  /** スカウトで他大学に行った選手のうち、部員を保存している大学へ行った選手 */
  function joinersFrom(state, sc) {
    const out = {};
    if (!sc || !sc.cands) return out;
    sc.cands.forEach((c) => {
      if (c.dest && c.dest.kind === 'uni' && has(state, c.dest.uni)) {
        (out[c.dest.uni] = out[c.dest.uni] || []).push(c.player);
      }
    });
    return out;
  }

  /** 点検（重複・人数） */
  function check(state) {
    const seen = new Set(state.team ? Team.all(state.team).map((p) => p.id) : []);
    Object.keys(state.rosters || {}).forEach((id) => {
      const t = state.rosters[id];
      if (t.batters.length < 9 || t.pitchers.length < 3) throw new Error(id + 'の部員が足りません');
      Team.all(t).forEach((p) => {
        if (seen.has(p.id)) throw new Error('選手が二重に登録されています: ' + p.name);
        seen.add(p.id);
        if (p.grade < 1 || p.grade > 4) throw new Error('学年が不正です: ' + p.name);
      });
    });
  }

  return { get, has, sync, seasonStart, seasonEnd, yearTurn, joinersFrom, refresh, check, develop, SEASON_GAIN };
})();
