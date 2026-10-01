/* ==================================================
   大学野球  engine.js

   ゲームの進行（フェーズ）を決めるところ。画面には触らない。
   画面側（js/ui/main.js）はここの関数を呼び、state.phase と state.step を
   見て次に出す画面を決める。テスト（test/run.js）もここを直接呼んで
   何年ぶんも自動で回す。

   1年の流れ
     NEW_MEMBER（新入生入部）→ SPRING_TRAINING（特訓）→ SPRING_LEAGUE（春リーグ）
     → SPRING_PLAYOFF（入れ替え戦）→ SPRING_NATIONAL（春の全国大会：1部優勝のみ）
     → SUMMER_TRAINING（特訓）→ SCOUTING（新入生スカウト）→ FALL_LEAGUE（秋リーグ）
     → FALL_PLAYOFF → FALL_NATIONAL → RETIREMENT（引退）→ 翌年度の NEW_MEMBER
   ゲーム開始時だけ TEAM_CREATION（チーム作り）→ SPRING_TRAINING から始まる。

   特別な分かれ道
     3部で最下位 → DISBAND（野球部解散）→ サッカー部（soccer.js）
     1部で6季連続優勝 → PRO_CHOICE（プロ野球に参戦するか）→ プロ野球（pro.js）
   ================================================== */
'use strict';

const Engine = (() => {

  const PHASE_LABEL = {
    TEAM_CREATION: 'チーム作り',
    NEW_MEMBER: '新入生入部',
    SPRING_TRAINING: '春の特訓',
    SPRING_LEAGUE: '春リーグ',
    SPRING_PLAYOFF: '春の入れ替え戦',
    SPRING_NATIONAL: '春の全国大会',
    SUMMER_TRAINING: '夏の特訓',
    SCOUTING: '新入生スカウト',
    FALL_LEAGUE: '秋リーグ',
    FALL_PLAYOFF: '秋の入れ替え戦',
    FALL_NATIONAL: '秋の全国大会',
    RETIREMENT: '引退',
    PRO_CHOICE: 'プロ野球参戦の選択',
    DISBAND: '野球部解散',
    SOCCER_NEW_MEMBER: 'サッカー部 新入部員',
    SOCCER_TRAINING: 'サッカー部 特訓',
    SOCCER_SEASON: 'サッカー 冬季リーグ',
    SOCCER_NATIONAL: 'サッカー 全国大会',
    SOCCER_RETIREMENT: 'サッカー部 引退',
    SOCCER_CHOICE: 'サッカー部 シーズン終了',
    PRO_TRAINING: 'プロ 春季キャンプ',
    PRO_SEASON: 'プロ ペナントレース',
    PRO_POSTSEASON: 'プロ ポストシーズン',
    PRO_END: 'プロ シーズン終了',
    PRO_DRAFT: 'プロ ドラフト会議',
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));

  /* ---------- 新しいゲーム ---------- */

  function newGame(opt) {
    opt = opt || {};
    const state = {
      v: 1,
      mode: 'college',
      startYear: CONFIG.START_YEAR,
      year: CONFIG.START_YEAR,
      term: 'spring',
      phase: 'TEAM_CREATION',
      step: 'pick-bat',
      names: Object.assign({}, CONFIG.DEFAULT_NAMES, opt.names || {}),
      proTeamNames: NAMES.PRO_TEAMS.slice(),
      seasonSeq: 0,
      streak: 0,
      bestStreak: 0,
      scandal: 0,
      pending: [],
      team: null,
      sets: null,
      achievements: { proEntries: 0, proSeasons: 0, soccer: 0, revived: 0 },
    };
    Universities.init(state, opt.uniName || null);
    Rivals.sync(state);
    Records.init(state);
    state.sets = { kind: 'bat', list: College.teamSets('batter', CONFIG.PICK_SETS, state.year) };
    return state;
  }

  function uniName(state) { return Universities.name(state, state.userUni); }

  /* ---------- チーム作り ---------- */

  function pickCreation(state, i) {
    if (state.phase !== 'TEAM_CREATION') return;
    if (state.step === 'pick-bat') {
      state.team = Team.create(uniName(state));
      state.team.batters = state.sets.list[i];
      state.team.morale = 55;
      state.sets = { kind: 'pit', list: College.teamSets('pitcher', CONFIG.PICK_SETS, state.year) };
      state.step = 'pick-pit';
    } else if (state.step === 'pick-pit') {
      state.team.pitchers = state.sets.list[i];
      state.sets = null;
      Team.autoLineup(state.team);
      state.step = 'ready';
    }
  }

  /** チームが出来たら、春の特訓へ（キャプテンが決まっていなければ進まない） */
  function finishCreation(state) {
    if (!Team.captain(state.team)) return false;
    const cap = Team.captain(state.team);
    cap.wasCaptain = true;
    Records.chronicle(state, uniName(state) + '野球部、新監督のもとで始動（' + state.names.league + ' 2部）', 'start');
    toTraining(state, 'SPRING_TRAINING');
    return true;
  }

  function setCaptain(state, pid) {
    const p = Team.find(state.team, pid);
    if (!p) return;
    if (state.team.captainId !== pid) College.addHist(p, state, College.termLabel(state) + ' キャプテンに就任');
    state.team.captainId = pid;
    p.wasCaptain = true;
  }

  /* ---------- 特訓（強奪高校野球と同じ） ---------- */

  function toTraining(state, phase) {
    state.phase = phase;
    state.step = 'intro';
    state.training = null;
    College.rest(state, 50);
  }

  function startTraining(state) {
    if (!Team.captain(state.team)) return false;
    state.training = Training.start(College.trainView(state));
    state.step = 'training';
    return true;
  }

  function trainTake(state) {
    Training.choose(state.training, College.trainView(state));
    if (state.training.done) state.step = 'result';
  }

  function trainPass(state) { Training.pass(state.training, College.trainView(state)); }

  function endTraining(state) {
    queue(state, Incidents.roll(state, 'training'));
    queue(state, Incidents.rollEvent(state, 'training'));
    if (state.phase === 'SPRING_TRAINING') startLeague(state, 'spring');
    else if (state.phase === 'SUMMER_TRAINING') startScouting(state);
    else if (state.phase === 'PRO_TRAINING') Pro.startSeason(state);
  }

  /* ---------- 不祥事・出来事の順番待ち ---------- */

  function queue(state, item) { if (item) state.pending.push(item); }

  function pendingTop(state) { return (state.pending || [])[0] || null; }

  /** いちばん前の出来事に答える。戻り値は結果（画面に出す） */
  function answerPending(state, key) {
    const top = pendingTop(state);
    if (!top) return null;
    let res;
    if (top.type === 'incident') res = Incidents.resolve(state, top, key);
    else if (top.options) res = Incidents.resolveEvent(state, top, key);
    else res = Object.assign({}, top, { lines: [] });
    state.pending.shift();
    state.lastPending = res;
    return res;
  }

  /* ---------- リーグ戦 ---------- */

  function levelOf(state) {
    const userStr = College.strength(state);
    return (id) => (id === state.userUni ? userStr : state.unis[id].level);
  }

  function startLeague(state, term) {
    state.term = term;
    state.seasonSeq++;
    state.phase = term === 'spring' ? 'SPRING_LEAGUE' : 'FALL_LEAGUE';
    state.step = 'round';
    state.season = League.create(state);
    state.playoffs = null;
    state.national = null;
    state.seasonInfo = { div: Universities.divOf(state, state.userUni), playoff: null, national: null };
    Rivals.seasonStart(state);
    College.seasonStart(state);
    College.rest(state, 100);
    state.opponent = null;
    state.match = null;
    prepareMatch(state);
  }

  function leagueName(state) {
    return (state.term === 'spring' ? '春' : '秋') + 'リーグ';
  }

  /** いまの節で自分が戦うカード */
  function currentCard(state) {
    if (/_LEAGUE$/.test(state.phase)) return League.userCard(state.season, state.userUni);
    if (/_PLAYOFF$/.test(state.phase)) return (state.playoffs || []).find((c) => c.a === state.userUni || c.b === state.userUni) || null;
    return null;
  }

  /* ---------- 試合（リーグ・入れ替え戦・全国大会で共通） ---------- */

  /** 次の試合の用意。相手の部員を作り、試合前の画面へ */
  function prepareMatch(state) {
    let oppId, oppName, label, kind, big = false, noCold = false, maxInnings = CONFIG.GAME.LEAGUE_MAX_INNINGS, level, key;
    if (/_LEAGUE$/.test(state.phase) || /_PLAYOFF$/.test(state.phase)) {
      const card = currentCard(state);
      if (!card || card.done) return false;
      kind = /_LEAGUE$/.test(state.phase) ? 'league' : 'playoff';
      oppId = card.a === state.userUni ? card.b : card.a;
      oppName = Universities.name(state, oppId);
      level = state.unis[oppId].level;
      key = card.key;
      const n = card.games.length + 1;
      label = kind === 'league'
        ? leagueName(state) + '　第' + (state.season.round + 1) + '節　第' + n + '戦'
        : '入れ替え戦（' + card.upperDiv + '部・' + (card.upperDiv + 1) + '部）　第' + n + '戦';
      big = kind === 'playoff';
    } else if (/_NATIONAL$/.test(state.phase)) {
      const nat = state.national;
      oppId = National.opponentOf(nat, state.userUni);
      const t = nat.teams[oppId];
      oppName = t.name;
      level = t.level;
      kind = 'national';
      key = 'nat-' + nat.round;
      label = nat.name + '　' + National.roundName(nat.round);
      big = true; noCold = true; maxInnings = CONFIG.GAME.MAX_INNINGS;
    } else {
      return false;
    }
    if (kind === 'league' && Rivals.has(state, oppId)) {
      /* 同じ部の大学は、保存してある部員がそのまま出てくる */
      if (!state.opponent || state.opponent.__key !== key || state.opponent.uniId !== oppId) {
        state.opponent = Rivals.get(state, oppId);
        state.opponent.__key = key;
        state.opponent.__oppId = oppId;
      }
    } else if (!state.opponent || state.opponent.__key !== key) {
      state.opponent = Universities.makeRoster(oppName, level);
      state.opponent.__key = key;
      state.opponent.__oppId = oppId;
    }
    state.opponent.name = oppName;
    /* 1試合＝1日。投手のスタミナを回復させる（カードの1戦目・大会の初戦は全快） */
    let dayKey, full;
    if (kind === 'national') {
      const nat = state.national;
      dayKey = 'nat-' + nat.year + nat.term + '-' + nat.round + '-' + (state.lastResult && state.lastResult.replay ? 'r' : '');
      full = nat.round === 0 && !(state.lastResult && state.lastResult.replay);
    } else {
      const card = currentCard(state);
      dayKey = card.key + '#' + card.games.length + '@' + state.seasonSeq;
      full = card.games.length === 0;
    }
    restDay(state, dayKey, full);
    state.match = { kind, oppId, oppName, label, big, noCold, maxInnings,
                    mySide: RNG.chance(0.5) ? 'home' : 'away' };
    const view = College.matchTeam(state);
    /* 先発予定は、疲れの抜けたいちばん良い投手にしておく（監督は試合前に変えられる） */
    College.pickRestedStarter(view);
    College.syncBack(state, view);
    state.step = 'pregame';
    return true;
  }

  /**
   * 試合の日の朝。両チームの投手を1日ぶん回復させ、相手は疲れの抜けた投手を先発させる。
   * 同じ日に2回呼ばれても二重に回復しないよう、日の目印（key）で見分ける
   */
  function restDay(state, key, full) {
    if (state.lastRestKey === key) return;
    state.lastRestKey = key;
    College.recoverPitchers(state.team, full);
    College.recoverPitchers(state.opponent, full);
    College.pickRestedStarter(state.opponent);
  }

  /** 試合をする前の最後の準備。試合に出るチーム（view）を返す */
  function matchView(state) {
    return College.matchTeam(state);
  }

  /**
   * 試合を始める（画面で1打席ずつ見る場合）。乱数の種と開始時点のチームを控える。
   * 強奪高校野球と同じく、途中で閉じても同じ試合を同じところから続けられる。
   */
  function beginGame(state) {
    const view = College.matchTeam(state);
    College.syncBack(state, view);
    College.preGame(state, view, state.match.big);
    state.liveGame = {
      seed: RNG.newSeed(), mySide: state.match.mySide,
      team: clone(state.team), opponent: clone(state.opponent),
      subs: [], step: 0,
    };
    state.step = 'game';
    return view;
  }

  /** 結果だけ出す（おまかせ）。テストもこれで回す */
  function autoGame(state) {
    /* 先発は監督が試合前に決めたまま（試合前の画面で選んだ投手が投げる） */
    const view = beginGame(state);
    const g = state.liveGame;
    const away = g.mySide === 'away' ? view : state.opponent;
    const home = g.mySide === 'away' ? state.opponent : view;
    RNG.seed(g.seed);
    /* おまかせは継投もおまかせ（疲れたら相手と同じように投手を代える） */
    const res = Sim.play(away, home, Object.assign(simOpts(state), { manual: null }));
    RNG.unseed();
    return Object.assign(afterGame(state, res, view), { view });
  }

  function simOpts(state) {
    return { noCold: state.match.noCold, maxInnings: state.match.maxInnings, manual: state.match.mySide };
  }

  /** 試合の結果を反映する。res は Sim の戻り値、view は試合に出たチーム */
  function afterGame(state, res, view) {
    RNG.unseed();
    state.liveGame = null;
    const m = state.match;
    const my = m.mySide === 'away' ? res.away : res.home;
    const op = m.mySide === 'away' ? res.home : res.away;
    const win = my.runs > op.runs, draw = my.runs === op.runs;

    /* 全国大会はトーナメントなので、引き分けなら再試合（成績はそのまま残す） */
    const ctx = {
      year: state.year, tourLabel: m.kind === 'national' ? 'national' : 'local',
      tourName: m.kind === 'national' ? state.national.name : (m.kind === 'pro' ? '' : leagueName(state)),
      roundName: m.kind === 'national' ? National.roundName(state.national.round) : (m.kind === 'playoff' ? '入れ替え戦' : (m.kind === 'pro' ? m.label : '第' + ((state.season ? state.season.round : 0) + 1) + '節')),
      oppName: m.oppName, win, draw,
      walkoff: res.walkoff && m.mySide === 'home', log: res.log, mySide: m.mySide,
    };
    const post = College.postGame(state, view, ctx);
    const rival = m.kind === 'league' && Rivals.has(state, m.oppId);
    if (rival) {
      /* 保存してある相手は、自校との試合でも成長する（強奪高校野球の成長の式そのまま） */
      Growth.afterGame(state.opponent, Object.assign({}, ctx, {
        win: !win && !draw, draw, oppName: state.team.name,
        walkoff: res.walkoff && m.mySide === 'away',
        mySide: m.mySide === 'away' ? 'home' : 'away',
      }));
    }
    Growth.commitStats(state.opponent);
    College.tirePitchers(state.opponent);
    if (rival) {
      Team.all(state.opponent).forEach((p) => { p.formBias = 0; });
      /* 保存・読み込みで別の物になっていても、ここで部員の側へ書き戻す */
      state.rosters[m.oppId] = state.opponent;
      Rivals.refresh(state, m.oppId);
    }
    College.syncBack(state, view);

    report(post.report, state);

    const homers = [];
    [view, state.opponent].forEach((team) => {
      (team.batters || []).forEach((p) => {
        if (p.game && p.game.hr) homers.push({ name: p.name, hr: p.game.hr, mine: team === view });
      });
    });
    const findPit = (key) => {
      let found = null;
      [view, state.opponent].forEach((team) => {
        Team.all(team).forEach((p) => { if (p.kind === 'pitcher' && p.game[key]) found = { name: p.name, mine: team === view }; });
      });
      return found;
    };

    state.lastResult = {
      win, draw, myRuns: my.runs, opRuns: op.runs, round: m.label, oppName: m.oppName,
      tourName: m.label, cold: res.cold, walkoff: ctx.walkoff, innings: res.innings,
      winPitcher: findPit('w'), losePitcher: findPit('l'), savePitcher: findPit('sv'), homers,
      injuries: post.injuries, kind: m.kind,
    };
    state.lastReport = post.report;

    if (m.kind === 'league' || m.kind === 'playoff') {
      Records.game(state, m.oppId, my.runs, op.runs);
      const card = currentCard(state);
      const mineA = card.a === state.userUni;
      League.recordGame(card, mineA ? my.runs : op.runs, mineA ? op.runs : my.runs, res.innings);
      state.lastResult.card = { w: mineA ? card.winsA : card.winsB, l: mineA ? card.winsB : card.winsA, d: card.draws, done: card.done, won: card.done && card.winner === state.userUni };
      if (card.done && m.kind === 'league') League.simRound(state.season, state.userUni, levelOf(state));
    } else if (m.kind === 'national') {
      Records.game(state, null, my.runs, op.runs);
      if (!draw) {
        National.playRound(state.national, { my: my.runs, op: op.runs, inn: res.innings }, College.strength(state));
      }
      state.lastResult.replay = draw;
      state.lastResult.last = state.national.done || !state.national.alive;
    } else if (m.kind === 'pro') {
      Pro.afterUserGame(state, my.runs, op.runs, res.innings);
    }
    state.lastSimLog = null;
    state.step = 'verdict';
    return { res, report: post.report };
  }

  /* 成長画面で「誰が」を分かりやすくするため、いまの役割も添えておく */
  function report(list, state) {
    list.forEach((r) => {
      const p = Team.find(state.team, r.pid);
      if (!p) return;
      if (p.kind === 'pitcher') {
        const i = (state.team.rotation || []).indexOf(p.id);
        r.role = i === 0 ? '先発' : (i > 0 ? (i + 1) + '番手' : '投手');
      } else {
        const i = (state.team.lineup || []).findIndex((s) => s.pid === p.id);
        r.role = i < 0 ? '控え' : (i + 1) + '番 ' + posShort(state.team.lineup[i].pos);
      }
    });
  }

  /**
   * このカードの残りをおまかせで進める。戻り値は試合ごとの結果。
   * 最後の試合の結果は state.lastResult に残る（結果画面で見せる）
   */
  function autoCard(state) {
    const games = [];
    let last = null;
    for (let guard = 0; guard < 30; guard++) {
      if (state.step !== 'pregame') break;
      const kind = state.match && state.match.kind;
      if (kind !== 'league' && kind !== 'playoff') break;
      last = autoGame(state);
      const r = state.lastResult;
      games.push({ my: r.myRuns, op: r.opRuns, win: r.win, draw: r.draw });
      if (r.card && r.card.done) break;
      nextAfterGame(state);
    }
    return { games, last };
  }

  /**
   * リーグ戦の残りをおまかせで進める。不祥事などの出来事が起きたら、そこで止める
   * （監督の判断が要るため）。戻り値は進めた試合の数と勝敗
   */
  function autoLeague(state) {
    const sum = { games: 0, w: 0, l: 0, d: 0, stopped: false };
    for (let guard = 0; guard < 200; guard++) {
      if (!/_LEAGUE$/.test(state.phase) || state.step !== 'pregame' || !state.match || state.match.kind !== 'league') break;
      if ((state.pending || []).length) { sum.stopped = true; break; }
      const r = autoCard(state);
      r.games.forEach((g) => { sum.games++; if (g.draw) sum.d++; else if (g.win) sum.w++; else sum.l++; });
      nextAfterGame(state);
    }
    if ((state.pending || []).length) sum.stopped = true;
    return sum;
  }

  /** 試合結果を見終わったあと。次の試合か、カードの終わりか */
  function nextAfterGame(state) {
    const m = state.match;
    if (!m) return;
    if (m.kind === 'league' || m.kind === 'playoff') {
      const card = currentCard(state);
      if (card && !card.done) { prepareMatch(state); return; }
      if (m.kind === 'league') {
        League.simRound(state.season, state.userUni, levelOf(state));
        /* 不祥事・出来事はカードとカードのあいだに起きる（次のカードの試合前に出る） */
        queue(state, Incidents.roll(state, 'league'));
        queue(state, Incidents.rollEvent(state, 'league'));
        Team.all(state.team).forEach((p) => { if (p.suspend && p.suspend.practiceBan > 0) { p.suspend.practiceBan--; } });
      }
      nextCard(state);
      return;
    }
    if (m.kind === 'national') {
      const nat = state.national;
      if (state.lastResult.replay) { prepareMatch(state); state.match.label += '（再試合）'; return; }
      if (!nat.alive || nat.done) {
        National.finish(nat, College.strength(state));
        state.step = 'end';
        return;
      }
      state.opponent = null;
      prepareMatch(state);
      return;
    }
    if (m.kind === 'pro') Pro.nextAfterGame(state);
  }

  /** カードの結果画面を見たあと。次の節か、リーグ戦の終わりか */
  function nextCard(state) {
    /* 入れ替え戦が終わったら、まず結果（昇格・残留・降格）を見せる */
    if (/_PLAYOFF$/.test(state.phase)) { state.step = 'playoffResult'; return; }
    League.nextRound(state.season);
    state.opponent = null;
    state.match = null;
    if (state.season.done) { finishLeague(state); return; }
    /* 節の画面は挟まず、そのまま次のカードの試合前へ */
    prepareMatch(state);
  }

  /* ---------- リーグ戦の終わり ---------- */

  function finishLeague(state) {
    const season = state.season;
    Rivals.seasonEnd(state);
    const me = League.rankOfTeam(season, state.userUni);
    const info = state.seasonInfo;
    info.div = me.div; info.rank = me.rank; info.row = me.row;
    info.champion = me.div === 1 && me.rank === 1;

    /* 各部の優勝校 */
    [1, 2, 3].forEach((d) => {
      const top = League.standings(season, d)[0];
      if (d === 1 && state.unis[top.id]) {
        state.unis[top.id].titles = (state.unis[top.id].titles || 0) + 1;
        state.unis[top.id].recent = (state.unis[top.id].recent || 0) + 1;
      }
    });

    /* 6季連続優勝の数え方。1部で優勝したシーズンだけ数え、逃したら0に戻す */
    if (info.champion) {
      state.streak = (state.streak || 0) + 1;
      state.bestStreak = Math.max(state.bestStreak || 0, state.streak);
      Records.chronicle(state, College.termLabel(state) + ' ' + state.names.league + ' 1部優勝' +
        (state.streak >= 2 ? '（' + state.streak + '季連続）' : ''), 'title');
      Team.all(state.team).forEach((p) => {
        p.titles = (p.titles || 0) + 1;
        College.addHist(p, state, College.termLabel(state) + ' リーグ優勝');
      });
    } else {
      state.streak = 0;
      if (me.rank === 1) Records.chronicle(state, College.termLabel(state) + ' ' + me.div + '部優勝', 'info');
    }

    /* 入れ替え戦の組み合わせ。自分が出ないものはここで回す */
    state.playoffs = League.makePlayoffs(season);
    const lv = levelOf(state);
    state.playoffs.forEach((pc) => {
      if (pc.a !== state.userUni && pc.b !== state.userUni) League.simCard(pc, lv);
    });

    /* 3部の最下位：野球部解散 */
    info.disband = me.div === 3 && me.rank === 6;

    const mine = state.playoffs.find((c) => c.a === state.userUni || c.b === state.userUni);
    if (mine && !info.disband) {
      state.phase = state.term === 'spring' ? 'SPRING_PLAYOFF' : 'FALL_PLAYOFF';
      state.step = 'final';         // まず最終順位を見せてから入れ替え戦へ
      state.opponent = null;
      return;
    }
    state.step = 'final';
  }

  /** 最終順位の画面を見たあと */
  function afterFinal(state) {
    if (/_PLAYOFF$/.test(state.phase)) {
      const card = currentCard(state);
      if (card && !card.done) { prepareMatch(state); return; }
    }
    afterPlayoff(state);
  }

  /** 入れ替え戦の結果の画面を見たあと */
  function finishPlayoff(state) { afterPlayoff(state); }

  /** 入れ替え戦の自分の結果（画面用）。{ won, upper, from, to, result } */
  function playoffOutcome(state) {
    const c = (state.playoffs || []).find((x) => x.a === state.userUni || x.b === state.userUni);
    if (!c || !c.done) return null;
    const won = c.winner === state.userUni, upper = c.upper === state.userUni;
    const result = upper ? (won ? '残留' : '降格') : (won ? '昇格' : '昇格ならず');
    const from = upper ? c.upperDiv : c.upperDiv + 1;
    const to = (upper && !won) ? c.upperDiv + 1 : (!upper && won) ? c.upperDiv : from;
    return { card: c, won, upper, from, to, result,
             w: c.a === state.userUni ? c.winsA : c.winsB, l: c.a === state.userUni ? c.winsB : c.winsA, d: c.draws,
             opp: upper ? c.lower : c.upper };
  }

  /** 入れ替え戦が終わったら、来季の所属を決めてシーズンの記録を残す */
  function afterPlayoff(state) {
    const info = state.seasonInfo;
    const moves = League.applyPlayoffs(state, state.playoffs || []);
    info.moves = moves;
    const mine = (state.playoffs || []).find((c) => c.a === state.userUni || c.b === state.userUni);
    if (mine) {
      const won = mine.winner === state.userUni;
      const upper = mine.upper === state.userUni;
      info.playoff = {
        vs: mine.upper === state.userUni ? mine.lower : mine.upper,
        w: mine.a === state.userUni ? mine.winsA : mine.winsB,
        l: mine.a === state.userUni ? mine.winsB : mine.winsA,
        d: mine.draws,
        result: upper ? (won ? '残留' : '降格') : (won ? '昇格' : '昇格ならず'),
      };
      state.records.team.playoffs++;
      const tl = College.termLabel(state) + ' 入れ替え戦';
      if (won) Records.chronicle(state, tl + 'に勝ち、' + mine.upperDiv + '部' + (upper ? '残留' : 'へ昇格'), upper ? 'info' : 'up');
      else Records.chronicle(state, tl + 'に敗れ、' + (mine.upperDiv + 1) + '部' + (upper ? 'へ降格' : '残留'), upper ? 'down' : 'info');
    }
    info.nextDiv = Universities.divOf(state, state.userUni);

    const row = {
      year: state.year, term: state.term, div: info.div, rank: info.rank,
      points: info.row.points, w: info.row.w, l: info.row.l, d: info.row.d,
      rf: info.row.rf, ra: info.row.ra,
      champion: info.champion, playoff: info.playoff, national: null, nextDiv: info.nextDiv,
      streak: state.streak, disband: !!info.disband, captain: (Team.captain(state.team) || {}).name || '',
    };
    Records.season(state, row);
    state.phase = state.term === 'spring' ? 'SPRING_LEAGUE' : 'FALL_LEAGUE';

    if (info.disband) {
      state.phase = 'DISBAND';
      state.step = 'story';
      Records.chronicle(state, College.termLabel(state) + ' 3部最下位。野球部は解散し、部員たちはサッカー部へ', 'disband');
      return;
    }
    if (info.champion) {
      startNational(state);
      return;
    }
    closeSeason(state);
  }

  /* ---------- 全国大会 ---------- */

  function startNational(state) {
    /* 出場できるのは1部優勝校だけ */
    const me = League.rankOfTeam(state.season, state.userUni);
    if (!(me.div === 1 && me.rank === 1)) { closeSeason(state); return; }
    state.phase = state.term === 'spring' ? 'SPRING_NATIONAL' : 'FALL_NATIONAL';
    state.national = National.create(state, state.term, state.userUni);
    state.records.team.natApps++;
    College.rest(state, 60);
    queue(state, Incidents.rollEvent(state, 'national'));
    state.opponent = null;
    prepareMatch(state);
    state.step = 'opening';
  }

  /* ---------- シーズンの締め ---------- */

  function closeSeason(state) {
    const info = state.seasonInfo;
    const row = Records.lastSeason(state);
    if (state.national && row && row.year === state.year && row.term === state.term) {
      const nat = state.national;
      const champ = nat.champion === state.userUni;
      row.national = { name: nat.name, result: National.resultText(nat), champion: champ,
                       winner: nat.teams[nat.champion] ? nat.teams[nat.champion].name : '' };
      if (champ) {
        state.records.team.natTitles++;
        state.records.team.japanTitles++;
        Records.chronicle(state, College.termLabel(state) + ' ' + nat.name + ' 優勝！ 日本一', 'japan');
        Team.all(state.team).forEach((p) => { College.addHist(p, state, College.termLabel(state) + ' ' + nat.name + ' 優勝（日本一）'); p.japan = (p.japan || 0) + 1; });
      } else {
        Records.chronicle(state, College.termLabel(state) + ' ' + nat.name + ' ' + National.resultText(nat), 'info');
      }
    }
    College.seasonEnd(state, leagueName(state));
    const label = state.term === 'spring' ? '春' : '秋';
    void label; void info;
    state.national = null;
    state.opponent = null;
    state.match = null;
    const next = state.term === 'spring' ? 'SUMMER_TRAINING' : 'RETIREMENT';
    /* 6季連続優勝なら、プロ野球参戦を選べる */
    if (state.seasonInfo && state.seasonInfo.champion && state.streak >= 6) {
      state.phase = 'PRO_CHOICE';
      state.step = 'offer';
      state.proChoiceNext = next;
      return;
    }
    goNext(state, next);
  }

  function goNext(state, next) {
    if (next === 'SUMMER_TRAINING') toTraining(state, 'SUMMER_TRAINING');
    else if (next === 'RETIREMENT') startRetirement(state);
  }

  /* ---------- スカウト ---------- */

  function startScouting(state) {
    state.phase = 'SCOUTING';
    state.step = 'list';
    state.scouting = Scouting.start(state);
  }

  function endScouting(state) {
    startLeague(state, 'fall');
  }

  /* ---------- 引退 ---------- */

  function startRetirement(state) {
    state.phase = 'RETIREMENT';
    state.step = 'farewell';
    College.decidePaths(state);
  }

  function endRetirement(state) {
    const leaving = College.retiring(state);
    College.graduate(state);
    leaving.forEach((p) => {
      if (p.path && p.path.kind === 'pro') College.addHist(p, state, state.year + '年 ' + p.path.text + 'でプロへ');
    });
    /* スカウトの結果（推薦で来る新入生と、他へ行った有望選手） */
    if (state.scouting) Scouting.resolve(state, state.scouting);
    const joiners = Rivals.joinersFrom(state, state.scouting);
    state.year++;
    state.term = 'spring';
    state.scandal = Math.max(0, (state.scandal || 0) * 0.6 - 0.5);
    Universities.evolve(state);
    Rivals.yearTurn(state, joiners);
    startNewMember(state);
  }

  /* ---------- 新入生 ---------- */

  function startNewMember(state) {
    state.phase = 'NEW_MEMBER';
    state.step = 'arrivals';
    const joined = state.scouting ? Scouting.joinedPlayers(state.scouting) : [];
    /* 推薦組。1学年の上限を超えないように */
    const n = College.need(state);
    const take = joined.slice(0, Math.max(0, n.room));
    state.arrivals = { joined: College.enroll(state, take).map((p) => p.id),
                       lost: (state.scouting && state.scouting.results && state.scouting.results.lost) || [],
                       over: joined.length - take.length };
    state.scouting = null;
    /* 一般入試で入ってくる部員は選べない。足りない人数ぶんが自動で入部する */
    const n2 = College.need(state);
    state.newNeed = null;
    state.sets = null;
    const general = (n2.bat + n2.pit > 0) ? College.generalSets(state, n2, 1)[0] : [];
    state.arrivals.general = College.enroll(state, general).map((p) => p.id);
  }

  function pickGeneral(state, i) {
    if (state.sets && state.sets.list[i]) {
      College.enroll(state, state.sets.list[i]);
    }
    finishNewMember(state);
  }

  function finishNewMember(state) {
    state.sets = null;
    state.newNeed = null;
    Team.autoLineup(state.team);
    College.check(state);
    toTraining(state, 'SPRING_TRAINING');
  }

  /* ---------- プロ野球参戦の選択 ---------- */

  function chooseProEntry(state, go) {
    const next = state.proChoiceNext;
    state.proChoiceNext = null;
    if (!go) { goNext(state, next); return; }
    /* 参戦直前の大学野球の状態を丸ごと控えておく。戻るときはここへ戻す */
    goNext(state, next);
    const snap = clone(state);
    snap.collegeSnapshot = null;
    state.collegeSnapshot = snap;
    state.achievements.proEntries++;
    Pro.enter(state);
  }

  /* ---------- 進行の点検（テスト用・保存前の安全確認） ---------- */

  function check(state) {
    if (state.mode === 'college' && state.team) {
      League.check(state);
      College.check(state);
      Rivals.check(state);
    }
    return true;
  }

  /* ---------- 画面の見出し ---------- */

  function header(state) {
    if (!state) return null;
    const mode = state.mode;
    const termLabel = /^(SUMMER_TRAINING|SCOUTING)$/.test(state.phase) ? '夏'
      : (state.phase === 'NEW_MEMBER' || state.phase === 'TEAM_CREATION') ? '春'
      : (state.term === 'spring' ? '春' : '秋');
    let place = '';
    if (mode === 'college' && state.divisions) {
      const d = Universities.divOf(state, state.userUni);
      let rank = '';
      if (state.season && !state.season.done && state.season.round > 0) {
        rank = ' ' + League.rankOfTeam(state.season, state.userUni).rank + '位';
      } else if (state.season && state.season.done) {
        const r = League.rankOfTeam(state.season, state.userUni);
        if (r) rank = '（' + (state.season.term === 'spring' ? '春' : '秋') + 'は' + r.div + '部' + r.rank + '位）';
      }
      place = d + '部' + rank;
    } else if (mode === 'soccer' && state.soccer) {
      place = 'サッカー ' + Soccer.divOf(state) + '部';
    } else if (mode === 'pro' && state.pro) {
      place = Pro.placeText(state);
    }
    return {
      year: state.year + '年度',
      term: mode === 'soccer' ? '冬' : (mode === 'pro' ? 'プロ' : termLabel),
      phase: PHASE_LABEL[state.phase] || state.phase,
      place,
      managerYears: state.year - state.startYear + 1,
    };
  }

  return {
    PHASE_LABEL, restDay, newGame, pickCreation, finishCreation, setCaptain,
    toTraining, startTraining, trainTake, trainPass, endTraining,
    queue, pendingTop, answerPending,
    startLeague, currentCard, prepareMatch, matchView, beginGame, autoGame, afterGame, simOpts,
    nextAfterGame, nextCard, autoCard, autoLeague, finishPlayoff, playoffOutcome, finishLeague, afterFinal, afterPlayoff, startNational, closeSeason, goNext,
    startScouting, endScouting, startRetirement, endRetirement, startNewMember, pickGeneral, finishNewMember,
    chooseProEntry, check, header, uniName, leagueName, levelOf, clone,
  };
})();
