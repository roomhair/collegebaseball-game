/* ==================================================
   大学野球  soccer.js

   3部で最下位になり、野球部が解散したあとの「第二の物語」。
   ・部員はそのままサッカー部へ移る。野球の能力をそのまま使うのではなく、
     体格・走力・性格などから、サッカー選手として見直した能力を作る。
     （攻撃・守備・パス・スピード・フィジカル・スタミナ・GK・成長力）
   ・サッカーも1部〜3部（各6校）。毎年冬に1回、ホーム＆アウェーのリーグ戦（10節）。
   ・1部で優勝すると全国大会（8校のトーナメント）。優勝すれば日本一。
   ・選手は成長し、4年生は引退し、新入部員が入る。独立したゲームとして続けられる。
   ・1部で優勝するか、サッカー部で3シーズンを過ごすと、野球部を復活させられる
     （野球へ戻れなくなることはない）。
   ================================================== */
'use strict';

const Soccer = (() => {

  const STATS = [
    { key: 'atk', label: '攻撃' }, { key: 'def', label: '守備' }, { key: 'pas', label: 'パス' },
    { key: 'spd', label: 'スピード' }, { key: 'phy', label: 'フィジカル' }, { key: 'sta', label: 'スタミナ' },
    { key: 'gk', label: 'GK' },
  ];
  const POS = ['GK', 'DF', 'MF', 'FW'];
  const POS_NAME = { GK: 'ゴールキーパー', DF: 'ディフェンダー', MF: 'ミッドフィルダー', FW: 'フォワード' };
  const FORMATION = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const DIV_LEVEL = { 1: 60, 2: 51, 3: 43 };
  const REVIVE_SEASONS = 3;

  /* ---------- 能力 ---------- */

  function rateFor(s, pos) {
    if (pos === 'GK') return s.gk * 0.75 + s.phy * 0.1 + s.def * 0.15;
    if (pos === 'DF') return s.def * 0.5 + s.phy * 0.2 + s.spd * 0.15 + s.pas * 0.15;
    if (pos === 'MF') return s.pas * 0.45 + s.sta * 0.2 + s.atk * 0.2 + s.def * 0.15;
    return s.atk * 0.55 + s.spd * 0.25 + s.phy * 0.2;
  }

  function bestPos(s) {
    let best = 'MF', bv = -1;
    POS.forEach((k) => { const v = rateFor(s, k) - (k === 'GK' ? 6 : 0); if (v > bv) { bv = v; best = k; } });
    return best;
  }

  function rating(p) { return Math.round(rateFor(p.soc, p.soc.pos)); }

  /**
   * 野球選手をサッカー選手として見直す。野球の数字を写すのではなく、
   * 体の強さ・足・持久力・性格を手がかりに、ばらつきを大きく取って作り直す。
   */
  function convert(p) {
    const n = (m, sd) => RNG.stat(RNG.norm(m, sd || 10));
    const isPit = p.kind === 'pitcher';
    const drive = p.persona ? p.persona.drive : 50;
    const s = {
      spd: n((p.speed || 45) * 0.55 + 18, 10),
      phy: n(((p.weight || 72) - 55) * 0.8 + (p.power || 45) * 0.3 + 15, 10),
      sta: n((isPit ? p.stamina : 45) * 0.4 + drive * 0.2 + 18, 10),
      atk: n(32 + (p.talent || 0) * 4, 12),
      def: n((p.field || 45) * 0.35 + 22, 11),
      pas: n(30 + ((p.persona && p.persona.team) || 50) * 0.15, 11),
      gk: n((p.catch || 45) * 0.45 + (p.pos === 'C' ? 12 : 0) + 8, 11),
    };
    s.pos = bestPos(s);
    p.soc = s;
    p.socCareer = { g: 0, goals: 0, assists: 0, cs: 0 };
    p.socSeason = { g: 0, goals: 0, assists: 0, cs: 0 };
    return p;
  }

  function newRecruit(level, grade) {
    const p = Player.newBatter({ grade: grade || 1, level: 30, practice: false });
    Persona.assign(p);
    p.career = Player.emptyBat(); p.tour = Player.emptyBat();
    const n = (sd) => RNG.stat(RNG.norm(level, sd || 9));
    p.soc = { spd: n(), phy: n(), sta: n(), atk: n(11), def: n(11), pas: n(), gk: n(12) };
    const want = RNG.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']);
    const boostKey = { GK: 'gk', DF: 'def', MF: 'pas', FW: 'atk' }[want];
    p.soc[boostKey] = RNG.stat(p.soc[boostKey] + 12);
    p.soc.pos = bestPos(p.soc);
    p.socCareer = { g: 0, goals: 0, assists: 0, cs: 0 };
    p.socSeason = { g: 0, goals: 0, assists: 0, cs: 0 };
    p.hs = NAMES.highSchool(false);
    return p;
  }

  /* ---------- 部の発足 ---------- */

  /** 野球部解散からサッカー部へ。部員を引き継ぎ、サッカーのリーグ（3部）から始める */
  function start(state) {
    const players = Team.all(state.team).map(convert);
    const ids = Object.keys(state.unis);
    const others = RNG.shuffle(ids.filter((id) => id !== state.userUni));
    const levels = {};
    const divisions = { 1: others.slice(0, 6), 2: others.slice(6, 12), 3: [state.userUni].concat(others.slice(12, 17)) };
    [1, 2, 3].forEach((d) => divisions[d].forEach((id) => {
      if (id !== state.userUni) levels[id] = Math.round((DIV_LEVEL[d] + RNG.norm(0, 3.5)) * 10) / 10;
    }));
    state.soccer = {
      players, lineup: [], divisions, levels, seasons: 0, titles: 0, japan: 0,
      everChampion: false, league: null, national: null, training: null, match: null, lastMatch: null,
      startedYear: state.year,
    };
    state.team = null;
    state.mode = 'soccer';
    state.achievements.soccer = (state.achievements.soccer || 0) + 1;
    autoLineup(state);
    Records.chronicle(state, uniName(state) + 'サッカー部、始動（' + state.names.soccerLeague + ' 3部）', 'soccer');
    toTraining(state);
  }

  function uniName(state) { return Universities.name(state, state.userUni); }

  function divOf(state) {
    const S = state.soccer;
    for (const d of [1, 2, 3]) if (S.divisions[d].indexOf(state.userUni) >= 0) return d;
    return 3;
  }

  /* ---------- 先発11人 ---------- */

  function autoLineup(state) {
    const S = state.soccer;
    const pool = S.players.filter((p) => !(p.injury && p.injury.games > 0));
    const used = new Set();
    const out = [];
    ['GK', 'FW', 'DF', 'MF'].forEach((pos) => {
      const list = pool.filter((p) => !used.has(p.id))
        .sort((a, b) => rateFor(b.soc, pos) - rateFor(a.soc, pos));
      list.slice(0, FORMATION[pos]).forEach((p) => { used.add(p.id); out.push({ pid: p.id, pos }); });
    });
    const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
    S.lineup = out.sort((a, b) => order[a.pos] - order[b.pos]);
  }

  function findP(state, pid) { return state.soccer.players.find((p) => p.id === pid) || null; }

  /** 先発の守備位置を入れ替える／控えと入れ替える */
  function swap(state, pidIn, pidOut) {
    const S = state.soccer;
    const iOut = S.lineup.findIndex((x) => x.pid === pidOut);
    if (iOut < 0) return false;
    const iIn = S.lineup.findIndex((x) => x.pid === pidIn);
    if (iIn >= 0) {
      const t = S.lineup[iIn].pos; S.lineup[iIn].pos = S.lineup[iOut].pos; S.lineup[iOut].pos = t;
      return true;
    }
    S.lineup[iOut] = { pid: pidIn, pos: S.lineup[iOut].pos };
    return true;
  }

  function lineRatings(state, side) {
    const g = (pos) => side.filter((x) => x.pos === pos);
    const avg = (arr, f) => arr.length ? arr.reduce((s, x) => s + f(x.s), 0) / arr.length : 30;
    return {
      atk: avg(g('FW'), (s) => s.atk * 0.6 + s.spd * 0.2 + s.phy * 0.2) * 0.65 + avg(g('MF'), (s) => s.atk * 0.5 + s.pas * 0.5) * 0.35,
      mid: avg(g('MF'), (s) => s.pas * 0.6 + s.sta * 0.2 + s.phy * 0.2),
      def: avg(g('DF'), (s) => s.def * 0.6 + s.phy * 0.2 + s.spd * 0.2) * 0.75 + avg(g('MF'), (s) => s.def) * 0.25,
      gk: avg(g('GK'), (s) => s.gk),
      sta: avg(side, (s) => s.sta),
    };
  }

  /** 自分の先発11人（{pid,name,pos,s}） */
  function mySide(state) {
    return state.soccer.lineup.filter((x) => findP(state, x.pid)).map((x) => {
      const p = findP(state, x.pid);
      return { pid: p.id, name: p.name, pos: x.pos, s: p.soc, p };
    });
  }

  function strength(state) {
    const side = mySide(state);
    return Math.round(side.reduce((s, x) => s + rateFor(x.s, x.pos), 0) / Math.max(1, side.length));
  }

  /** 相手の11人をその強さで作る */
  function makeOpp(name, level) {
    const side = [];
    Object.keys(FORMATION).forEach((pos) => {
      for (let i = 0; i < FORMATION[pos]; i++) {
        const nm = NAMES.personName();
        const n = (sd) => RNG.stat(RNG.norm(level, sd || 7));
        const s = { spd: n(), phy: n(), sta: n(), atk: n(), def: n(), pas: n(), gk: n() };
        const k = { GK: 'gk', DF: 'def', MF: 'pas', FW: 'atk' }[pos];
        s[k] = RNG.stat(s[k] + 10);
        side.push({ pid: 'o' + pos + i, name: nm.last + nm.first, pos, s });
      }
    });
    return { name, side };
  }

  /* ---------- 試合 ----------
     90分を「攻め」の場面の積み重ねで決める。中盤で上回ったほうが攻める回数が多く、
     攻撃力と相手の守備・GKの差でゴールになるかが決まる。後半はスタミナが効く。 */
  function playMatch(homeName, home, awayName, away, opt) {
    opt = opt || {};
    const H = lineRatings(null, home), A = lineRatings(null, away);
    const events = [];
    let hg = 0, ag = 0;
    const scorers = (side) => {
      const w = side.map((x) => ({ x, weight: x.pos === 'FW' ? 5 + x.s.atk / 10 : x.pos === 'MF' ? 2 + x.s.atk / 20 : x.pos === 'DF' ? 0.6 : 0.02 }));
      return RNG.weighted(w).x;
    };
    const assister = (side, not) => {
      const w = side.filter((x) => x !== not).map((x) => ({ x, weight: x.pos === 'MF' ? 4 + x.s.pas / 12 : x.pos === 'FW' ? 2 : x.pos === 'DF' ? 1 : 0.1 }));
      return RNG.weighted(w).x;
    };
    const chancesH = Math.max(3, Math.round(RNG.norm(9 + (H.mid - A.mid) * 0.18 + 0.6, 2.2)));
    const chancesA = Math.max(3, Math.round(RNG.norm(9 + (A.mid - H.mid) * 0.18, 2.2)));
    const list = [];
    for (let i = 0; i < chancesH; i++) list.push({ side: 'home', min: RNG.range(1, 90) });
    for (let i = 0; i < chancesA; i++) list.push({ side: 'away', min: RNG.range(1, 90) });
    list.sort((a, b) => a.min - b.min);
    list.forEach((c) => {
      const atkSide = c.side === 'home' ? home : away;
      const R = c.side === 'home' ? H : A, D = c.side === 'home' ? A : H;
      /* 後半はスタミナの差が出る */
      const tired = c.min > 60 ? (R.sta - D.sta) * 0.004 : 0;
      const pGoal = RNG.clamp(0.13 + (R.atk - (D.def * 0.6 + D.gk * 0.4)) * 0.006 + tired, 0.03, 0.42);
      const shooter = scorers(atkSide);
      if (RNG.chance(pGoal)) {
        const ast = RNG.chance(0.7) ? assister(atkSide, shooter) : null;
        if (c.side === 'home') hg++; else ag++;
        events.push({ min: c.min, side: c.side, kind: 'goal', pid: shooter.pid, name: shooter.name, ast: ast ? ast.pid : null, astName: ast ? ast.name : '', score: [hg, ag] });
      } else {
        const what = RNG.pick(['シュートはGKがセーブ', 'シュートは枠の外', 'シュートはバーを叩いた', 'クロスに合わせたがわずかに外れた', 'ミドルシュートはDFがブロック']);
        events.push({ min: c.min, side: c.side, kind: 'chance', pid: shooter.pid, name: shooter.name, text: what, score: [hg, ag] });
      }
    });
    /* 警告。素行の悪い選手ほどもらいやすい */
    [['home', home], ['away', away]].forEach(([sd, side]) => {
      side.forEach((x) => {
        const c = x.p && x.p.persona ? x.p.persona.conduct : 60;
        if (RNG.chance(0.03 + Math.max(0, 50 - c) / 600)) events.push({ min: RNG.range(5, 90), side: sd, kind: 'card', pid: x.pid, name: x.name, score: null });
      });
    });
    events.sort((a, b) => a.min - b.min);
    let s = [0, 0];
    events.forEach((e) => { if (e.score) s = e.score; else e.score = s.slice(); });
    let pk = null;
    if (opt.knockout && hg === ag) {
      /* PK戦 */
      let ph = 0, pa = 0;
      for (let i = 0; i < 5; i++) { if (RNG.chance(0.76 + (A.gk - H.gk) * 0.002)) ph++; if (RNG.chance(0.76 + (H.gk - A.gk) * 0.002)) pa++; }
      while (ph === pa) { if (RNG.chance(0.75)) ph++; if (RNG.chance(0.75)) pa++; }
      pk = [ph, pa];
    }
    return { home: homeName, away: awayName, hg, ag, events, pk };
  }

  function quick(levelA, levelB, knockout) {
    const d = levelA - levelB;
    const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= RNG.rand(); } while (p > L && k < 20); return k - 1; };
    const a = pois(Math.max(0.2, 1.35 * Math.exp(0.035 * d))), b = pois(Math.max(0.2, 1.35 * Math.exp(-0.035 * d)));
    let pk = null;
    if (knockout && a === b) pk = RNG.chance(0.5 + d * 0.01) ? [5, 4] : [4, 5];
    return { a, b, pk };
  }

  /* ---------- リーグ戦（ホーム＆アウェー10節。勝ち3・分け1） ---------- */

  function startSeason(state) {
    const S = state.soccer;
    const schedule = {};
    [1, 2, 3].forEach((d) => {
      const first = League_rr(S.divisions[d]);
      const second = first.map((r) => r.map(([a, b]) => [b, a]));
      schedule[d] = first.concat(second);
    });
    S.league = { schedule, results: {}, round: 0, done: false, year: state.year };
    S.players.forEach((p) => { p.socSeason = { g: 0, goals: 0, assists: 0, cs: 0 }; });
    state.phase = 'SOCCER_SEASON';
    state.step = 'round';
  }

  function League_rr(ids) {
    const list = RNG.shuffle(ids.slice());
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push(r % 2 ? [list[n - 1 - i], list[i]] : [list[i], list[n - 1 - i]]);
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  function levelOf(state, id) {
    return id === state.userUni ? strength(state) : state.soccer.levels[id];
  }

  function userFixture(state) {
    const S = state.soccer;
    const d = divOf(state);
    const r = S.league.schedule[d][S.league.round] || [];
    const f = r.find(([a, b]) => a === state.userUni || b === state.userUni);
    if (!f) return null;
    const home = f[0] === state.userUni;
    return { home, oppId: home ? f[1] : f[0] };
  }

  function teamName(state, id) { return Universities.name(state, id); }

  /** 自分の試合をする（結果を返す）。画面はこの結果の events を順に見せる */
  function playUser(state, knockoutOpp) {
    const S = state.soccer;
    let oppId, home, oppLevel, oppName, knockout = false;
    if (knockoutOpp) {
      oppId = knockoutOpp.id; oppName = knockoutOpp.name; oppLevel = knockoutOpp.level; home = RNG.chance(0.5); knockout = true;
    } else {
      const f = userFixture(state);
      oppId = f.oppId; home = f.home; oppLevel = S.levels[oppId]; oppName = teamName(state, oppId);
    }
    const mine = mySide(state).map((x) => {
      const p = x.p;
      const cond = (p.condition || 0) * 2;
      const s = {};
      Object.keys(x.s).forEach((k) => { s[k] = typeof x.s[k] === 'number' ? x.s[k] + cond : x.s[k]; });
      return { pid: x.pid, name: x.name, pos: x.pos, s, p };
    });
    const opp = makeOpp(oppName, oppLevel).side;
    const r = home
      ? playMatch(uniName(state), mine, oppName, opp, { knockout })
      : playMatch(oppName, opp, uniName(state), mine, { knockout });
    const my = home ? r.hg : r.ag, op = home ? r.ag : r.hg;
    let win = my > op, draw = my === op;
    if (r.pk) { const mpk = home ? r.pk[0] : r.pk[1], opk = home ? r.pk[1] : r.pk[0]; win = mpk > opk; draw = false; }
    const mySideKey = home ? 'home' : 'away';
    /* 個人成績と成長 */
    const ups = [];
    mine.forEach((x) => {
      const p = x.p;
      p.socSeason.g++; p.socCareer.g++;
      const goals = r.events.filter((e) => e.kind === 'goal' && e.side === mySideKey && e.pid === p.id).length;
      const ast = r.events.filter((e) => e.kind === 'goal' && e.side === mySideKey && e.ast === p.id).length;
      p.socSeason.goals += goals; p.socCareer.goals += goals;
      p.socSeason.assists += ast; p.socCareer.assists += ast;
      if (op === 0 && (x.pos === 'GK' || x.pos === 'DF')) { p.socSeason.cs++; p.socCareer.cs++; }
      const perf = goals * 1.5 + ast + (op === 0 && x.pos !== 'FW' ? 1 : 0) + (win ? 0.5 : 0);
      const u = grow(p, 1.1 + perf * 0.5);
      if (u.length) ups.push({ pid: p.id, name: p.name, ups: u });
      Persona.rollCondition(p, win ? 0.08 : -0.06);
    });
    S.players.forEach((p) => {
      if (!mine.some((x) => x.p === p)) {
        const u = grow(p, 0.35);
        if (u.length) ups.push({ pid: p.id, name: p.name, ups: u });
      }
    });
    const res = { home, oppId, oppName, my, op, win, draw, pk: r.pk, events: r.events, homeName: r.home, awayName: r.away, ups, knockout };
    S.lastMatch = res;
    return res;
  }

  function grow(p, points) {
    const ups = [];
    const k = Player.growthMul ? Player.growthMul({ growthRate: p.growthRate, potential: null }) : 1;
    const keys = RNG.shuffle(STATS.map((s) => s.key)).slice(0, 3);
    keys.forEach((key) => {
      const before = p.soc[key];
      const room = Math.max(0, 100 - before) / 22;
      const add = Math.round(points * k * RNG.clamp(RNG.norm(0.9, 0.4), 0, 2) * Math.min(1, Math.pow(room, 1.9)));
      if (add > 0) { p.soc[key] = RNG.stat(before + add); ups.push({ key, label: STATS.find((s) => s.key === key).label, amount: p.soc[key] - before }); }
    });
    return ups;
  }

  /** 自分の試合が終わったら、その節の他の試合も回して記録する */
  function recordRound(state, res) {
    const S = state.soccer;
    const r = S.league.round;
    S.league.results[r] = S.league.results[r] || {};
    [1, 2, 3].forEach((d) => {
      (S.league.schedule[d][r] || []).forEach(([a, b]) => {
        if (a === state.userUni || b === state.userUni) {
          const hg = res.home ? res.my : res.op, ag = res.home ? res.op : res.my;
          S.league.results[r][a + '-' + b] = { a, b, ga: hg, gb: ag };
          return;
        }
        const q = quick(S.levels[a], S.levels[b]);
        S.league.results[r][a + '-' + b] = { a, b, ga: q.a, gb: q.b };
      });
    });
    S.league.round++;
    if (S.league.round >= 10) S.league.done = true;
  }

  function standings(state, d) {
    const S = state.soccer;
    const rows = {};
    S.divisions[d].forEach((id) => { rows[id] = { id, pts: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0 }; });
    Object.keys(S.league ? S.league.results : {}).forEach((r) => {
      Object.keys(S.league.results[r]).forEach((k) => {
        const g = S.league.results[r][k];
        const A = rows[g.a], B = rows[g.b];
        if (!A || !B) return;
        A.gf += g.ga; A.ga += g.gb; B.gf += g.gb; B.ga += g.ga;
        if (g.ga > g.gb) { A.w++; B.l++; A.pts += 3; } else if (g.gb > g.ga) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
      });
    });
    const list = Object.keys(rows).map((id) => rows[id]);
    list.sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (a.id < b.id ? -1 : 1));
    list.forEach((r, i) => { r.rank = i + 1; });
    return list;
  }

  /** リーグ戦の終わり。昇降格（上の部の6位と下の部の1位が自動で入れ替わる） */
  function finishSeason(state) {
    const S = state.soccer;
    const d = divOf(state);
    const table = standings(state, d);
    const me = table.find((r) => r.id === state.userUni);
    const s1 = standings(state, 1), s2 = standings(state, 2), s3 = standings(state, 3);
    const moves = [];
    const swapIds = (up, lo, a, b) => {
      const U = S.divisions[up], L = S.divisions[lo];
      U[U.indexOf(a)] = b; L[L.indexOf(b)] = a;
      moves.push({ up: b, down: a });
    };
    swapIds(1, 2, s1[5].id, s2[0].id);
    swapIds(2, 3, s2[5].id, s3[0].id);
    const champion = d === 1 && me.rank === 1;
    S.seasons++;
    if (champion) { S.titles++; S.everChampion = true; }
    const row = { year: state.year, div: d, rank: me.rank, pts: me.pts, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga,
                  champion, nextDiv: divOf(state), national: null };
    state.records.soccerSeasons.push(row);
    Records.chronicle(state, state.year + '年冬 ' + state.names.soccerLeague + ' ' + d + '部' + me.rank + '位' +
      (row.nextDiv < d ? '（昇格）' : row.nextDiv > d ? '（降格）' : ''), champion ? 'title' : 'soccer');
    /* AIの強さは年ごとに少し動く */
    Object.keys(S.levels).forEach((id) => {
      const dv = S.divisions[1].indexOf(id) >= 0 ? 1 : S.divisions[2].indexOf(id) >= 0 ? 2 : 3;
      S.levels[id] = Math.round((S.levels[id] + (DIV_LEVEL[dv] - S.levels[id]) * 0.3 + RNG.norm(0, 1.6)) * 10) / 10;
    });
    S.lastTable = { div: d, rows: table, moves };
    state.step = 'final';
    if (champion) {
      S.national = createNational(state);
    } else {
      S.national = null;
    }
  }

  /* ---------- 全国大会（8校） ---------- */

  const NAT_ROUNDS = ['準々決勝', '準決勝', '決勝'];

  function createNational(state) {
    const others = RNG.shuffle(NAMES.OTHER_UNIVERSITIES.slice()).slice(0, 7)
      .map(([nm], i) => ({ id: 's' + i, name: nm, level: Math.round((63 + RNG.norm(0, 3) + (i < 2 ? 3 : 0)) * 10) / 10 }));
    const teams = [{ id: state.userUni, name: uniName(state), level: null }].concat(others);
    return { teams: RNG.shuffle(teams), round: 0, alive: true, done: false, champion: null, best: null, results: [] };
  }

  function natOpponent(state) {
    const N = state.soccer.national;
    const i = N.teams.findIndex((t) => t.id === state.userUni);
    return N.teams[i % 2 ? i - 1 : i + 1];
  }

  function natAfterUser(state, res) {
    const N = state.soccer.national;
    const next = [];
    const rr = [];
    for (let i = 0; i < N.teams.length; i += 2) {
      const a = N.teams[i], b = N.teams[i + 1];
      let w;
      if (a.id === state.userUni || b.id === state.userUni) {
        w = res.win ? (a.id === state.userUni ? a : b) : (a.id === state.userUni ? b : a);
        rr.push({ a: a.name, b: b.name, text: (a.id === state.userUni ? res.my + '-' + res.op : res.op + '-' + res.my) + (res.pk ? '（PK）' : '') });
      } else {
        const q = quick(a.level, b.level, true);
        w = (q.a > q.b || (q.a === q.b && q.pk[0] > q.pk[1])) ? a : b;
        rr.push({ a: a.name, b: b.name, text: q.a + '-' + q.b + (q.pk ? '（PK）' : '') });
      }
      next.push(w);
    }
    N.results.push(rr);
    if (N.alive && !next.some((t) => t.id === state.userUni)) { N.alive = false; N.best = NAT_ROUNDS[N.round]; }
    N.teams = next;
    N.round++;
    if (next.length === 1) {
      N.done = true; N.champion = next[0].id;
      if (N.champion === state.userUni) N.best = '優勝';
    }
    if (!N.alive && !N.done) {
      while (N.teams.length > 1) {
        const nx = [];
        for (let i = 0; i < N.teams.length; i += 2) {
          const q = quick(N.teams[i].level, N.teams[i + 1].level, true);
          nx.push((q.a > q.b || (q.a === q.b && q.pk[0] > q.pk[1])) ? N.teams[i] : N.teams[i + 1]);
        }
        N.teams = nx;
      }
      N.done = true; N.champion = N.teams[0].id;
    }
  }

  function natResultText(N) {
    if (N.best === '優勝') return '優勝（日本一）';
    if (N.best === '決勝') return '準優勝';
    if (N.best === '準決勝') return 'ベスト4';
    return 'ベスト8';
  }

  function closeNational(state) {
    const S = state.soccer;
    const N = S.national;
    const row = state.records.soccerSeasons[state.records.soccerSeasons.length - 1];
    if (row) row.national = natResultText(N);
    if (N.champion === state.userUni) {
      S.japan++;
      Records.chronicle(state, state.year + '年冬 ' + state.names.soccerNational + ' 優勝！ サッカーで日本一', 'japan');
    } else {
      Records.chronicle(state, state.year + '年冬 ' + state.names.soccerNational + ' ' + natResultText(N), 'soccer');
    }
    toRetirement(state);
  }

  /* ---------- 特訓（強奪高校野球の特訓と同じ「選択5回・見送り3回」） ---------- */

  function toTraining(state) {
    state.phase = 'SOCCER_TRAINING';
    state.step = 'intro';
    state.soccer.training = null;
  }

  function drawCard(state) {
    const S = state.soccer;
    const pool = S.players.filter((p) => !(p.suspend && p.suspend.practiceBan > 0));
    const power = RNG.weighted(Training.POWER_TIERS);
    const count = RNG.weighted(Training.COUNT_TIERS);
    const n = Math.max(1, Math.min(pool.length, count.pick(pool.length)));
    const chosen = RNG.shuffle(pool.slice()).slice(0, n);
    const st = RNG.pick(STATS);
    const amount = Math.max(1, Math.round(RNG.range(power.stat[0], power.stat[1]) * 0.55));
    const titles = { atk: 'シュート練習', def: '守備練習', pas: 'パス回し', spd: 'ダッシュ', phy: '筋力トレーニング', sta: '走り込み', gk: 'キーパー練習' };
    return {
      tier: power.key, tierLabel: power.label, title: titles[st.key] + '（' + count.label + '）',
      targets: chosen.map((p) => ({ pid: p.id, name: p.name, label: st.label, key: st.key, amount })),
    };
  }

  function startTraining(state) {
    state.soccer.training = { picks: 0, passes: 0, done: false, card: drawCard(state), log: [] };
    state.step = 'training';
  }

  function trainTake(state) {
    const T = state.soccer.training;
    if (T.done) return;
    const applied = [];
    T.card.targets.forEach((t) => {
      const p = findP(state, t.pid);
      if (!p) return;
      const before = p.soc[t.key];
      const room = RNG.clamp(Math.pow(Math.max(0, 100 - before) / 22, 1.9), 0.05, 1);
      p.soc[t.key] = RNG.stat(before + Math.round(t.amount * room));
      applied.push({ name: p.name, label: t.label, before, after: p.soc[t.key] });
    });
    T.log.push({ title: T.card.title, applied });
    T.picks++;
    if (T.picks >= CONFIG.TRAINING.PICKS) { T.done = true; T.card = null; state.step = 'result'; } else T.card = drawCard(state);
  }

  function trainPass(state) {
    const T = state.soccer.training;
    if (T.done || T.passes >= CONFIG.TRAINING.PASSES) return;
    T.passes++;
    T.card = drawCard(state);
  }

  function endTraining(state) {
    state.soccer.players.forEach((p) => { p.soc.pos = p.soc.pos || bestPos(p.soc); });
    autoLineup(state);
    startSeason(state);
  }

  /* ---------- 引退・新入部員・シーズン終了 ---------- */

  function toRetirement(state) {
    state.phase = 'SOCCER_RETIREMENT';
    state.step = 'farewell';
  }

  function retiring(state) { return state.soccer.players.filter((p) => p.grade >= 4); }

  function endRetirement(state) {
    const S = state.soccer;
    retiring(state).forEach((p) => {
      p.path = { kind: 'job', text: RNG.chance(0.15) ? '社会人サッカーへ' : '卒業' };
      Records.alumni(state, p, 'サッカー部を卒業');
    });
    const gone = new Set(retiring(state).map((p) => p.id));
    S.players = S.players.filter((p) => !gone.has(p.id));
    S.players.forEach((p) => { p.grade++; });
    autoLineup(state);
    state.phase = 'SOCCER_CHOICE';
    state.step = 'choice';
  }

  /** 野球部を復活させられるか（1部優勝か、サッカー部で3シーズン） */
  function canRevive(state) {
    const S = state.soccer;
    return !!(S && (S.everChampion || S.seasons >= REVIVE_SEASONS));
  }

  /** サッカー部を続ける：年度を進めて新入部員へ */
  function continueSoccer(state) {
    state.year++;
    state.term = 'spring';
    state.phase = 'SOCCER_NEW_MEMBER';
    state.step = 'pick';
    const need = Math.max(4, Math.min(9, 24 - state.soccer.players.length));
    state.soccer.newSets = [0, 1, 2].map(() => {
      const set = [];
      for (let i = 0; i < need; i++) set.push(newRecruit(36 + RNG.norm(0, 2)));
      return set;
    });
  }

  function pickNewMembers(state, i) {
    const S = state.soccer;
    const set = (S.newSets || [])[i] || [];
    const have = new Set(S.players.map((p) => p.id));
    set.forEach((p) => { if (!have.has(p.id)) { p.grade = 1; p.enrolled = state.year; S.players.push(p); } });
    S.newSets = null;
    autoLineup(state);
    toTraining(state);
  }

  /**
   * 野球部を復活させる。サッカー部の記録は残し、野球は3部から出直す。
   * リーグの18大学・各部6校の並びはそのまま（自分の大学は3部の枠に戻る）。
   */
  function reviveBaseball(state) {
    if (!canRevive(state)) return false;
    state.soccerArchive = { seasons: state.soccer.seasons, titles: state.soccer.titles, japan: state.soccer.japan };
    state.soccer = null;
    state.mode = 'college';
    state.year++;
    state.term = 'spring';
    state.streak = 0;
    state.achievements.revived = (state.achievements.revived || 0) + 1;
    /* 3部の枠にいることを確かめる（解散したときの3部のまま） */
    if (Universities.divOf(state, state.userUni) == null) state.divisions[3][5] = state.userUni;
    Records.chronicle(state, uniName(state) + '野球部、復活。3部から再出発', 'start');
    state.team = null;
    state.phase = 'TEAM_CREATION';
    state.step = 'pick-bat';
    state.revival = true;
    state.sets = { kind: 'bat', list: College.teamSets('batter', CONFIG.PICK_SETS, state.year) };
    return true;
  }

  /* ---------- 自動で進める（テスト用） ---------- */

  function autoStep(state, policy) {
    const S = state.soccer;
    switch (state.phase) {
      case 'SOCCER_TRAINING':
        if (state.step === 'intro') startTraining(state);
        else if (state.step === 'training') trainTake(state);
        else endTraining(state);
        return true;
      case 'SOCCER_SEASON':
        if (state.step === 'round' || state.step === 'result') {
          if (S.league.done) { finishSeason(state); return true; }
          const r = playUser(state); recordRound(state, r); state.step = 'result';
          if (S.league.done) finishSeason(state);
          return true;
        }
        if (state.step === 'final') {
          if (S.national) { state.phase = 'SOCCER_NATIONAL'; state.step = 'round'; } else toRetirement(state);
          return true;
        }
        break;
      case 'SOCCER_NATIONAL': {
        const N = S.national;
        if (N.done) { closeNational(state); return true; }
        const o = natOpponent(state);
        const r = playUser(state, o); natAfterUser(state, r);
        return true;
      }
      case 'SOCCER_RETIREMENT': endRetirement(state); return true;
      case 'SOCCER_CHOICE':
        if (policy && policy.revive && canRevive(state)) reviveBaseball(state); else continueSoccer(state);
        return true;
      case 'SOCCER_NEW_MEMBER': pickNewMembers(state, 0); return true;
    }
    throw new Error('サッカー：進めない状態 ' + state.phase + '/' + state.step);
  }

  return {
    STATS, POS, POS_NAME, FORMATION, convert, start, divOf, autoLineup, findP, swap, mySide, strength, rating, rateFor,
    playUser, recordRound, standings, finishSeason, userFixture, teamName, natOpponent, natAfterUser, natResultText,
    closeNational, toTraining, startTraining, trainTake, trainPass, endTraining, toRetirement, retiring,
    endRetirement, canRevive, continueSoccer, pickNewMembers, reviveBaseball, autoStep, REVIVE_SEASONS, NAT_ROUNDS,
  };
})();
