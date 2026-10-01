/* ==================================================
   大学野球  national.js

   全国大会（春・秋）。リーグ戦の1部で優勝した大学だけが出られる。
   ・16校のトーナメント（1回戦・準々決勝・準決勝・決勝）。
   ・相手は全国の各リーグを勝ち抜いてきた大学なので、リーグ戦の相手より
     はっきり強い。勝ち上がるほど強い相手が残りやすい（シード校を分けて置く）。
   ・引き分けは無い（延長タイブレークで決まらなければ再試合）。
   ================================================== */
'use strict';

const National = (() => {

  const ROUNDS = ['1回戦', '準々決勝', '準決勝', '決勝'];

  /**
   * 大会を作る。entrantId は自分のリーグの代表（＝1部優勝校）。
   * 出場条件を満たしていない大学を入れないよう、呼ぶ側で確かめてから渡すこと。
   */
  function create(state, kind, entrantId) {
    const L = CONFIG.LEVEL;
    const pool = RNG.shuffle(NAMES.OTHER_UNIVERSITIES.slice()).slice(0, 15);
    const teams = {};
    teams[entrantId] = {
      id: entrantId, name: Universities.name(state, entrantId),
      league: state.names.league, level: entrantId === state.userUni ? null : state.unis[entrantId].level,
    };
    pool.forEach(([nm, lg], i) => {
      const id = 'n' + i;
      /* 上位4校はシード格。全国の常連 */
      const seed = i < 4;
      teams[id] = {
        id, name: nm, league: lg + 'リーグ',
        level: Math.round((L.NATIONAL_FROM + (seed ? 5.5 : 0) + RNG.norm(0, 2.6)) * 10) / 10,
        seed,
      };
    });
    /* シード4校を4つの山に分け、残りはばらばらに置く */
    const seeds = Object.keys(teams).filter((id) => teams[id].seed);
    const rest = RNG.shuffle(Object.keys(teams).filter((id) => !teams[id].seed));
    const slots = new Array(16).fill(null);
    [0, 8, 4, 12].forEach((pos, i) => { slots[pos] = seeds[i]; });
    let k = 0;
    for (let i = 0; i < 16; i++) if (!slots[i]) slots[i] = rest[k++];
    return {
      kind, year: state.year, term: state.term,
      name: kind === 'spring' ? state.names.springNational : state.names.fallNational,
      teams, rounds: [slots], results: [[]], round: 0,
      userId: entrantId, alive: true, done: false, champion: null, best: null,
    };
  }

  function roundName(i) { return ROUNDS[i] || ''; }

  /** いまの回で、id が当たる相手 */
  function opponentOf(nat, id) {
    const list = nat.rounds[nat.round] || [];
    const i = list.indexOf(id);
    if (i < 0) return null;
    return list[i % 2 ? i - 1 : i + 1];
  }

  function levelOf(nat, id, userStrength) {
    const t = nat.teams[id];
    if (t.level == null) return userStrength;
    return t.level;
  }

  /**
   * いまの回の試合を記録する。userResult = { ra, rb, inn }（自分の得点・相手の得点）。
   * 自分の試合が無い（すでに負けている）ときは null を渡す。
   * 他の試合はここで回して、次の回の組み合わせを作る。
   */
  function playRound(nat, userResult, userStrength) {
    const list = nat.rounds[nat.round];
    const res = [];
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1];
      let ra, rb, inn = 9;
      if (userResult && (a === nat.userId || b === nat.userId)) {
        const mine = a === nat.userId;
        ra = mine ? userResult.my : userResult.op;
        rb = mine ? userResult.op : userResult.my;
        inn = userResult.inn || 9;
      } else {
        const g = Universities.quickGame(levelOf(nat, a, userStrength), levelOf(nat, b, userStrength), false);
        ra = g.a; rb = g.b; inn = g.inn;
      }
      res.push({ a, b, ra, rb, inn, winner: ra > rb ? a : b });
    }
    nat.results[nat.round] = res;
    const next = res.map((r) => r.winner);
    if (nat.alive) {
      const mine = res.find((r) => r.a === nat.userId || r.b === nat.userId);
      if (mine && mine.winner !== nat.userId) { nat.alive = false; nat.best = roundName(nat.round); }
    }
    if (next.length === 1) {
      nat.done = true;
      nat.champion = next[0];
      if (nat.champion === nat.userId) nat.best = '優勝';
      return nat;
    }
    nat.round++;
    nat.rounds[nat.round] = next;
    nat.results[nat.round] = [];
    return nat;
  }

  /** 自分が負けたあと、残りをまとめて回す */
  function finish(nat, userStrength) {
    let guard = 0;
    while (!nat.done && guard++ < 6) playRound(nat, null, userStrength);
    return nat;
  }

  /** 成績の書き方（「ベスト4」など） */
  function resultText(nat) {
    if (nat.champion === nat.userId) return '優勝（日本一）';
    const b = nat.best;
    if (b === '決勝') return '準優勝';
    if (b === '準決勝') return 'ベスト4';
    if (b === '準々決勝') return 'ベスト8';
    if (b === '1回戦') return '1回戦敗退';
    return b || '';
  }

  return { create, opponentOf, playRound, finish, roundName, resultText, levelOf, ROUNDS };
})();
