/* ==================================================
   大学野球  trophies.js

   実績（トロフィー）。監督として積み上げた節目を集めていく。
   ・試合の中で起きること（ノーヒットノーラン、サイクル安打など）は、
     試合が終わったときに game() で調べる。
   ・チームの歩み（昇格・優勝・プロ輩出など）は、画面を出すたびに check() で調べる。
   ・サッカー部やプロ参戦のようなネタバレになるものは hidden にしておき、
     達成するまで名前も条件も「？？？」で出す。
   ・達成したものは state.trophies に { y, t } で残し、
     画面でお知らせするぶんを state.trophyQueue に積む。
   ================================================== */
'use strict';

const Trophies = (() => {

  /* game：その試合の結果から判定する（r は lastResult、mine は自校の選手） */
  const LIST = [
    { id: 'win1',     name: '初勝利',               desc: '公式戦で初めて勝つ',                         game: (r) => r.win, check: (s) => s.records.team.w >= 1 },
    { id: 'shutout',  name: '完封勝利',             desc: '相手を0点に抑えて勝つ',                      game: (r) => r.win && r.opRuns === 0 },
    { id: 'nohit',    name: 'ノーヒットノーラン',   desc: '相手を無安打無得点に抑えて勝つ',             game: (r) => r.win && r.opRuns === 0 && r.opHits === 0 },
    { id: 'big10',    name: '打線爆発',             desc: '1試合で10点以上取る',                        game: (r) => r.myRuns >= 10 },
    { id: 'walkoff',  name: 'サヨナラ勝ち',         desc: 'サヨナラで勝つ',                             game: (r) => r.win && r.walkoff },
    { id: 'cycle',    name: 'サイクル安打',         desc: '自校の打者が1試合で単打・二塁打・三塁打・本塁打',
      game: (r, mine) => mine.some((p) => p.kind !== 'pitcher' && p.game && p.game.d2 && p.game.d3 && p.game.hr && p.game.h - p.game.d2 - p.game.d3 - p.game.hr > 0) },
    { id: 'k15',      name: '奪三振ショー',         desc: '自校の投手が1試合で15三振を奪う',
      game: (r, mine) => mine.some((p) => p.kind === 'pitcher' && p.game && p.game.so >= 15) },
    { id: 'hr3',      name: '1試合3本塁打',         desc: '自校の打者が1試合で3本の本塁打',
      game: (r, mine) => mine.some((p) => p.kind !== 'pitcher' && p.game && p.game.hr >= 3) },

    { id: 'promote1', name: '1部昇格',              desc: '1部リーグに上がる',                          check: (s) => divNow(s) === 1 || s.records.team.div[1] > 0 },
    { id: 'title1',   name: 'リーグ制覇',           desc: '1部リーグで優勝する',                        check: (s) => s.records.team.titles >= 1 },
    { id: 'title3',   name: '常勝軍団',             desc: '1部リーグで3回優勝する',                     check: (s) => s.records.team.titles >= 3 },
    { id: 'streak3',  name: '3季連続優勝',          desc: '1部リーグで3季続けて優勝する',               check: (s) => (s.bestStreak || 0) >= 3 },
    { id: 'natapp',   name: '全国の舞台へ',         desc: '全国大会に出場する',                         check: (s) => s.records.team.natApps >= 1 },
    { id: 'japan',    name: '日本一',               desc: '全国大会で優勝する',                         check: (s) => s.records.team.natTitles >= 1 },
    { id: 'wins100',  name: '通算100勝',            desc: '公式戦で通算100勝する',                      check: (s) => s.records.team.w >= 100 },
    { id: 'year10',   name: '監督10年',             desc: '監督として10年目を迎える',                   check: (s) => s.year - s.startYear >= 9 },
    { id: 'year20',   name: '名将',                 desc: '監督として20年目を迎える',                   check: (s) => s.year - s.startYear >= 19 },
    { id: 'pro1',     name: 'プロ輩出',             desc: '教え子がプロ野球に入る',                     check: (s) => s.records.team.pros >= 1 },
    { id: 'pro10',    name: 'プロ養成所',           desc: '教え子が10人プロ野球に入る',                 check: (s) => s.records.team.pros >= 10 },
    { id: 'tokutai',  name: '特待生の入部',         desc: '特待生が入部してくれる',                     check: (s) => roster(s).some((p) => p.route === '特待生') },
    { id: 'awaken',   name: '覚醒',                 desc: '部員が覚醒する',                             check: (s) => roster(s).some((p) => p.awakened) },
    { id: 'velo155',  name: '剛腕',                 desc: '最速155km/h以上の投手が部にいる',            check: (s) => roster(s).some((p) => p.kind === 'pitcher' && p.velo >= 155) },

    /* ネタバレになるので、達成するまで伏せる */
    { id: 'soccer',   name: 'まさかの転身',         desc: '野球部がサッカー部になる',   hidden: true,   check: (s) => (s.achievements && s.achievements.soccer) > 0 },
    { id: 'revived',  name: '野球部復活',           desc: 'サッカー部から野球部に戻る', hidden: true,   check: (s) => (s.achievements && s.achievements.revived) > 0 },
    { id: 'pro',      name: 'プロへの挑戦',         desc: 'チームごとプロ野球に参戦する', hidden: true, check: (s) => (s.achievements && s.achievements.proEntries) > 0 },
  ];

  function divNow(s) { return s.divisions && s.userUni ? Universities.divOf(s, s.userUni) : null; }
  function roster(s) { return s.team ? Team.all(s.team) : []; }

  function unlock(state, t) {
    state.trophies = state.trophies || {};
    if (state.trophies[t.id]) return false;
    state.trophies[t.id] = { y: state.year, t: state.term };
    (state.trophyQueue = state.trophyQueue || []).push(t.id);
    return true;
  }

  /** 試合が終わったとき。mineTeam は試合に出た自校のチーム */
  function game(state, r, mineTeam) {
    if (!state || !r || state.mode !== 'college') return;
    const mine = mineTeam ? Team.all(mineTeam) : [];
    LIST.forEach((t) => {
      if (!t.game) return;
      try { if (t.game(r, mine)) unlock(state, t); } catch (e) { /* 判定できなくても止めない */ }
    });
  }

  /** チームの歩みからの判定。画面を出すたびに呼んでよい（軽い） */
  function check(state) {
    if (!state || !state.records) return;
    /* 実績ができる前のデータを初めて読み込んだときは、これまでのぶんを黙って記録する
       （いきなり十数個のお知らせが並ばないように） */
    const silent = !state.trophies;
    state.trophies = state.trophies || {};
    LIST.forEach((t) => {
      if (!t.check) return;
      try { if (t.check(state)) unlock(state, t); } catch (e) { /* 同上 */ }
    });
    if (silent) state.trophyQueue = [];
  }

  /** お知らせするぶんを取り出す（取り出したら消える） */
  function takeQueue(state) {
    const q = (state && state.trophyQueue) || [];
    if (state) state.trophyQueue = [];
    return q.map(get).filter(Boolean);
  }

  function get(id) { return LIST.find((t) => t.id === id) || null; }

  /** 一覧（画面用）。伏せるものは、達成するまで名前と条件を隠す */
  function list(state) {
    const got = (state && state.trophies) || {};
    return LIST.map((t) => {
      const g = got[t.id];
      const secret = t.hidden && !g;
      return { id: t.id, name: secret ? '？？？' : t.name, desc: secret ? '条件はまだ秘密' : t.desc, got: g || null, hidden: !!t.hidden };
    });
  }

  return { game, check, takeQueue, list, get, LIST };
})();
