/* ==================================================
   大学野球  pro.js

   隠し要素：1部で6季連続優勝すると参戦できる、架空のプロ野球。
   ・2リーグ×6球団。仕組みは NPB を参考にしているが、名前はすべて架空
     （リーグ名・球団名・シリーズ名は設定から変えられる）。
   ・自分のチームは片方のリーグに入る（その年は1球団が休止）。
   ・ペナントレース（26試合）→ クライマックスにあたるリーグ決勝シリーズ
     （2位×3位の2勝先取 → 1位（1勝のアドバンテージ）×勝者の4勝先取）
     → 日本シリーズにあたる頂上シリーズ（4勝先取）。
   ・相手は大学より明らかに強い。大学で育てた選手だけで無双はできない。
   ・シーズンが終わるたびに「プロを続ける／大学野球へ戻る」を選べる。
     戻ると、参戦直前の大学野球の状態がそのまま戻る（engine.js が控えている）。
   ================================================== */
'use strict';

const Pro = (() => {

  const GAMES_VS_LEAGUE = 4;      // 同じリーグの相手と4試合
  const GAMES_VS_OTHER = 1;       // 別リーグの相手と1試合（交流戦）
  const USER = 'USER';

  function teamName(state, id) {
    if (id === USER) return Universities.name(state, state.userUni);
    const i = +String(id).replace('pt', '');
    return (state.proTeamNames && state.proTeamNames[i]) || NAMES.PRO_TEAMS[i] || id;
  }

  function leagueName(state, li) { return li === 0 ? state.names.proLeagueA : state.names.proLeagueB; }

  /** 参戦する。大学のチームがそのままプロのチームになる */
  function enter(state) {
    const L = CONFIG.LEVEL;
    const levels = {};
    for (let i = 0; i < 12; i++) levels['pt' + i] = Math.round((L.PRO_BASE + RNG.norm(0, L.PRO_SPREAD * 0.6)) * 10) / 10;
    /* 太平洋リーグのいちばん弱い球団が、その年は休止して枠を譲る */
    const leagueA = ['pt0', 'pt1', 'pt2', 'pt3', 'pt4', 'pt5'];
    const sleeper = leagueA.slice().sort((a, b) => levels[a] - levels[b])[0];
    state.pro = {
      no: 0, levels, sleeper,
      leagues: [leagueA.map((id) => (id === sleeper ? USER : id)), ['pt6', 'pt7', 'pt8', 'pt9', 'pt10', 'pt11']],
      history: [],
    };
    state.mode = 'pro';
    state.term = 'spring';
    Records.chronicle(state, uniName(state) + '、プロ野球（' + state.names.proLeagueA + '）に参戦', 'pro');
    Engine.toTraining(state, 'PRO_TRAINING');
  }

  function uniName(state) { return Universities.name(state, state.userUni); }

  function myLeague(state) { return state.pro.leagues[0].indexOf(USER) >= 0 ? 0 : 1; }

  function levelOf(state, id) {
    if (id === USER) return College.strength(state);
    return state.pro.levels[id];
  }

  /* ---------- ペナントレース ---------- */

  function startSeason(state) {
    const P = state.pro;
    P.no++;
    const li = myLeague(state);
    const mine = P.leagues[li].filter((id) => id !== USER);
    const other = P.leagues[1 - li];
    let sched = [];
    mine.forEach((id) => { for (let k = 0; k < GAMES_VS_LEAGUE; k++) sched.push(id); });
    other.forEach((id) => { for (let k = 0; k < GAMES_VS_OTHER; k++) sched.push(id); });
    sched = RNG.shuffle(sched);
    const table = {};
    P.leagues[0].concat(P.leagues[1]).forEach((id) => { table[id] = { id, w: 0, l: 0, d: 0, rf: 0, ra: 0 }; });
    P.season = { sched, day: 0, table, stage: 'regular', post: null, champion: null, result: null };
    state.phase = 'PRO_SEASON';
    state.step = 'round';
    state.seasonSeq++;
    College.seasonStart(state);
    College.rest(state, 100);
    state.opponent = null;
    state.match = null;
  }

  function addResult(T, a, b, ra, rb) {
    T[a].rf += ra; T[a].ra += rb; T[b].rf += rb; T[b].ra += ra;
    if (ra > rb) { T[a].w++; T[b].l++; } else if (rb > ra) { T[b].w++; T[a].l++; } else { T[a].d++; T[b].d++; }
  }

  /** その日の他の試合（自分以外の10球団を5試合に組む） */
  function simDay(state, oppId) {
    const P = state.pro;
    const rest = RNG.shuffle(P.leagues[0].concat(P.leagues[1]).filter((id) => id !== USER && id !== oppId));
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const g = Universities.quickGame(P.levels[rest[i]], P.levels[rest[i + 1]], true);
      addResult(P.season.table, rest[i], rest[i + 1], g.a, g.b);
    }
  }

  function pct(r) { return r.w + r.l ? r.w / (r.w + r.l) : 0; }

  function standings(state, li) {
    const P = state.pro;
    return P.leagues[li].map((id) => P.season.table[id])
      .sort((a, b) => (pct(b) - pct(a)) || (b.w - a.w) || ((b.rf - b.ra) - (a.rf - a.ra)))
      .map((r, i) => Object.assign(r, { rank: i + 1, pct: pct(r) }));
  }

  /** 次の自分の試合の用意（engine の試合の流れに乗せる） */
  function prepare(state) {
    const P = state.pro;
    const S = P.season;
    let oppId, label;
    if (S.stage === 'regular') {
      oppId = S.sched[S.day];
      label = 'ペナントレース　第' + (S.day + 1) + '戦';
    } else {
      const s = S.post;
      oppId = s.a === USER ? s.b : s.a;
      label = s.name + '　第' + (s.games.length + 1) + '戦';
    }
    const key = 'pro-' + oppId + '-' + P.no + '-' + S.stage;
    if (!state.opponent || state.opponent.__key !== key) {
      state.opponent = Universities.makeRoster(teamName(state, oppId), P.levels[oppId]);
      state.opponent.__key = key;
    }
    state.opponent.name = teamName(state, oppId);
    /* プロは毎日試合。1日ぶん回復し、相手は疲れの抜けた投手を先発させる */
    Engine.restDay(state, 'pro-' + P.no + '-' + S.stage + '-' + S.day + '-' + (S.post ? S.post.games.length : 0), false);
    state.match = { kind: 'pro', oppId, oppName: teamName(state, oppId), label, big: S.stage !== 'regular',
                    noCold: true, maxInnings: 12, mySide: RNG.chance(0.5) ? 'home' : 'away' };
    const view = College.matchTeam(state);
    College.pickRestedStarter(view);
    College.syncBack(state, view);
    state.step = 'pregame';
    return true;
  }

  /** 自分の試合の結果を反映（engine.afterGame から呼ばれる） */
  function afterUserGame(state, my, op) {
    const P = state.pro, S = P.season;
    if (S.stage === 'regular') {
      const oppId = S.sched[S.day];
      addResult(S.table, USER, oppId, my, op);
      simDay(state, oppId);
      S.day++;
    } else {
      const s = S.post;
      recordPost(s, s.a === USER ? my : op, s.a === USER ? op : my);
    }
  }

  function nextAfterGame(state) {
    const S = state.pro.season;
    if (S.stage === 'regular') {
      if (S.day >= S.sched.length) { endRegular(state); return; }
      state.step = 'round';
      return;
    }
    const s = S.post;
    if (!s.done) { state.step = 'series'; return; }
    advancePost(state);
  }

  /** ペナントレースの残りをまとめて回す（おまかせ） */
  function simRest(state) {
    const S = state.pro.season;
    while (S.stage === 'regular' && S.day < S.sched.length) {
      const oppId = S.sched[S.day];
      const g = Universities.quickGame(levelOf(state, USER), state.pro.levels[oppId], true);
      addResult(S.table, USER, oppId, g.a, g.b);
      simDay(state, oppId);
      S.day++;
    }
    endRegular(state);
  }

  /* ---------- ポストシーズン ---------- */

  function series(name, a, b, need, adv, maxGames, tieTo) {
    return { name, a, b, need, winsA: adv || 0, winsB: 0, draws: 0, games: [], maxGames, tieTo, done: false, winner: null, adv: adv || 0 };
  }

  function recordPost(s, ra, rb) {
    s.games.push({ a: ra, b: rb });
    if (ra > rb) s.winsA++; else if (rb > ra) s.winsB++; else s.draws++;
    if (s.winsA >= s.need) { s.done = true; s.winner = s.a; }
    else if (s.winsB >= s.need) { s.done = true; s.winner = s.b; }
    else if (s.games.length >= s.maxGames) {
      s.done = true;
      s.winner = s.tieTo || (s.winsA >= s.winsB ? s.a : s.b);
    }
  }

  function simSeries(state, s) {
    let guard = 0;
    while (!s.done && guard++ < 20) {
      const g = Universities.quickGame(levelOf(state, s.a), levelOf(state, s.b), true);
      recordPost(s, g.a, g.b);
    }
  }

  function endRegular(state) {
    const P = state.pro, S = P.season;
    S.final = [standings(state, 0), standings(state, 1)];
    S.stage = 'cs1';
    S.queue = [];
    S.bracket = { 0: {}, 1: {} };
    S.rounds = [];
    state.phase = 'PRO_POSTSEASON';
    startNextPost(state);
  }

  /** 次のシリーズへ。自分の出ないものはその場で回す */
  function startNextPost(state) {
    const S = state.pro.season;
    const NM = state.names;
    while (true) {
      let s = null;
      if (S.stage === 'cs1') {
        S.bracket.pending = S.bracket.pending || [0, 1];
        const li = S.bracket.pending.shift();
        if (li == null) { S.stage = 'cs2'; S.bracket.pending = null; continue; }
        const st = S.final[li];
        s = series(leagueName(state, li) + ' ' + NM.proLeagueFinal + ' 1st', st[1].id, st[2].id, 2, 0, 3, st[1].id);
        s.li = li; s.kind = 'cs1';
      } else if (S.stage === 'cs2') {
        S.bracket.pending = S.bracket.pending || [0, 1];
        const li = S.bracket.pending.shift();
        if (li == null) { S.stage = 'series'; S.bracket.pending = null; continue; }
        const st = S.final[li];
        s = series(leagueName(state, li) + ' ' + NM.proLeagueFinal, st[0].id, S.bracket[li].cs1, 4, 1, 6, st[0].id);
        s.li = li; s.kind = 'cs2';
      } else if (S.stage === 'series') {
        if (S.bracket.seriesDone) { S.stage = 'done'; continue; }
        s = series(NM.proSeries, S.bracket[0].cs2, S.bracket[1].cs2, 4, 0, 9, null);
        s.kind = 'series';
      } else {
        finishSeason(state);
        return;
      }
      S.rounds.push(s);
      S.post = s;
      if (s.a === USER || s.b === USER) {
        state.step = 'series';
        state.opponent = null;
        return;
      }
      simSeries(state, s);
      closeSeries(state, s);
    }
  }

  function closeSeries(state, s) {
    const S = state.pro.season;
    if (s.kind === 'cs1') S.bracket[s.li].cs1 = s.winner;
    if (s.kind === 'cs2') S.bracket[s.li].cs2 = s.winner;
    if (s.kind === 'series') { S.bracket.seriesDone = true; S.champion = s.winner; }
  }

  function advancePost(state) {
    const S = state.pro.season;
    closeSeries(state, S.post);
    startNextPost(state);
  }

  /* ---------- シーズンの終わり ---------- */

  function finishSeason(state) {
    const P = state.pro, S = P.season;
    const li = myLeague(state);
    const rank = S.final[li].find((r) => r.id === USER).rank;
    let result = leagueName(state, li) + ' ' + rank + '位';
    const inPost = S.rounds.filter((s) => s.a === USER || s.b === USER);
    const lastS = inPost[inPost.length - 1];
    if (S.champion === USER) result += '・' + state.names.proSeries + '優勝（日本一）';
    else if (lastS) result += '・' + lastS.name + 'で敗退';
    S.result = result;
    const me = S.table[USER];
    const row = { no: P.no, year: state.year, rank, w: me.w, l: me.l, d: me.d, result, champion: S.champion === USER };
    P.history.push(row);
    state.records.proSeasons.push(row);
    state.achievements.proSeasons = (state.achievements.proSeasons || 0) + 1;
    if (row.champion) state.achievements.proJapan = (state.achievements.proJapan || 0) + 1;
    Records.chronicle(state, 'プロ' + P.no + '年目：' + result, row.champion ? 'japan' : 'pro');
    College.seasonEnd(state, 'プロ');
    state.phase = 'PRO_END';
    state.step = 'choice';
    state.opponent = null;
    state.match = null;
  }

  /** プロを続ける：ドラフトで新人を取ってから、次のキャンプへ */
  function continuePro(state) {
    state.year++;
    state.phase = 'PRO_DRAFT';
    state.step = 'pick';
    const cands = [];
    for (let i = 0; i < 8; i++) {
      const kind = RNG.chance(0.45) ? 'pitcher' : 'batter';
      const p = College.newPlayer(kind, 4, Universities.paramOf(64 + RNG.norm(0, 4)), { route: 'ドラフト', pos: RNG.pick(FIELD_POSITIONS) });
      p.known = true;
      cands.push(p);
    }
    state.pro.draft = { cands, picked: [], max: 2 };
  }

  function draftPick(state, pid) {
    const D = state.pro.draft;
    if (!D || D.picked.length >= D.max || D.picked.indexOf(pid) >= 0) return false;
    D.picked.push(pid);
    return true;
  }

  function finishDraft(state) {
    const D = state.pro.draft;
    const add = D.cands.filter((p) => D.picked.indexOf(p.id) >= 0);
    const have = new Set(Team.all(state.team).map((p) => p.id));
    add.forEach((p) => {
      if (have.has(p.id)) return;
      if (p.kind === 'pitcher') state.team.pitchers.push(p); else state.team.batters.push(p);
      College.addHist(p, state, state.year + '年 ドラフトで入団');
    });
    /* 人数の上限を超えたら、いちばん力の落ちる選手から退団 */
    while (Team.all(state.team).length > CONFIG.ROSTER.TOTAL_MAX) {
      const worst = Team.all(state.team).slice().sort((a, b) => Player.rating(a) - Player.rating(b))[0];
      Records.alumni(state, worst, 'プロで退団');
      state.team.batters = state.team.batters.filter((p) => p !== worst);
      state.team.pitchers = state.team.pitchers.filter((p) => p !== worst);
    }
    Team.checkCaptain(state.team);
    Team.autoLineup(state.team);
    state.pro.draft = null;
    Engine.toTraining(state, 'PRO_TRAINING');
  }

  /**
   * 大学野球へ戻る。参戦直前の大学野球の状態を丸ごと戻す。
   * プロで起きた変化は戻さないが、「プロに参戦した」記録だけは持ち帰る。
   * 戻り値は新しい state（呼ぶ側で差し替えること）。
   */
  function returnToCollege(state) {
    const snap = state.collegeSnapshot;
    if (!snap) return state;
    const back = JSON.parse(JSON.stringify(snap));
    back.collegeSnapshot = null;
    back.achievements = Object.assign({}, back.achievements, state.achievements);
    back.records.proSeasons = (state.records.proSeasons || []).slice();
    back.records.chronicle.push({ y: state.year, t: 'spring', text: 'プロ野球から大学野球へ戻った（参戦前の状態に戻る）', kind: 'pro' });
    back.names = Object.assign({}, back.names, state.names);
    back.proTeamNames = (state.proTeamNames || back.proTeamNames).slice();
    back.slotMeta = state.slotMeta;
    back.mode = 'college';
    /* プロにいるあいだに使った変わったエピソードも使用済みのまま */
    back.oddUsed = Array.from(new Set((back.oddUsed || []).concat(state.oddUsed || [])));
    return back;
  }

  function placeText(state) {
    const P = state.pro;
    if (!P || !P.season) return 'プロ';
    const li = myLeague(state);
    const r = standings(state, li).find((x) => x.id === USER);
    return leagueName(state, li) + ' ' + r.rank + '位';
  }

  /* ---------- 自動で進める（テスト用） ---------- */

  function autoStep(state, policy) {
    switch (state.phase) {
      case 'PRO_TRAINING':
        if (state.step === 'intro') { if (!Team.captain(state.team)) Engine.setCaptain(state, Team.all(state.team)[0].id); Engine.startTraining(state); }
        else if (state.step === 'training') Engine.trainTake(state);
        else Engine.endTraining(state);
        return true;
      case 'PRO_SEASON':
        if (state.step === 'round') {
          if (policy && policy.proSimRest) { simRest(state); return true; }
          prepare(state); return true;
        }
        if (state.step === 'pregame') { Engine.autoGame(state); return true; }
        if (state.step === 'verdict' || state.step === 'growth' || state.step === 'result') { Engine.nextAfterGame(state); return true; }
        break;
      case 'PRO_POSTSEASON':
        if (state.step === 'series') { prepare(state); return true; }
        if (state.step === 'pregame') { Engine.autoGame(state); return true; }
        if (state.step === 'verdict' || state.step === 'growth' || state.step === 'result') { Engine.nextAfterGame(state); return true; }
        break;
      case 'PRO_END':
        if (policy && policy.proContinue) continuePro(state);
        else { const back = returnToCollege(state); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, back); }
        return true;
      case 'PRO_DRAFT':
        state.pro.draft.cands.slice(0, 2).forEach((p) => draftPick(state, p.id));
        finishDraft(state);
        return true;
    }
    throw new Error('プロ：進めない状態 ' + state.phase + '/' + state.step);
  }

  return {
    USER, enter, startSeason, standings, prepare, afterUserGame, nextAfterGame, simRest, finishSeason,
    continuePro, draftPick, finishDraft, returnToCollege, placeText, teamName, leagueName, myLeague, autoStep, levelOf,
  };
})();
