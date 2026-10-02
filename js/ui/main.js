/* ==================================================
   大学野球  main.js

   画面の進行役。どの画面を出すかは state.phase（フェーズ）と state.step で決まる。
   状態を変えるのは engine.js（と soccer.js / pro.js）だけで、ここはボタンと画面をつなぐ。
   強奪高校野球の main.js と同じく、試合の途中で閉じても同じ試合の同じところから続く。
   ================================================== */
'use strict';

const App = (() => {

  let state = null;     // いま遊んでいるデータ
  let slot = null;      // データ1〜3のどれか
  let lastSim = null;   // 直前の試合の中身（保存しない。結果画面を見るあいだだけ）
  let view = null;      // 試合に出るチーム（出場停止・ケガを除いた顔ぶれ）
  let soccerShown = null;

  const clone = (v) => JSON.parse(JSON.stringify(v));

  function save() {
    if (!state || !slot || !state.userUni) return;
    Storage.save(slot, state);
  }
  Screens.setOnChange(save);

  function toast(text) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('is-on'), 1800);
  }

  function setChrome(inGame) {
    UI.el('btn-save').hidden = !inGame;
    UI.el('btn-settings').hidden = !inGame;
    CS.status(inGame ? state : null);
  }

  /* ---------- データ選択 ---------- */

  function showSlots() {
    state = null; slot = null; lastSim = null;
    setChrome(false);
    CS.slots(Storage.list(), {
      load(n) {
        const s = Storage.load(n);
        if (!s) { toast('データ' + n + 'を読み込めませんでした'); return; }
        RNG.unseed();
        state = s; slot = n;
        Persona.adopt(state);
        render();
      },
      fresh(n, used) {
        const go = () => CS.newGameForm(n, (opt) => {
          state = Engine.newGame(opt);
          slot = n;
          save();
          render();
        }, showSlots);
        if (!used) { go(); return; }
        UI.confirmBox({ title: 'データ' + n + 'に上書き', body: 'データ' + n + 'の記録は消えて、新しいゲームになります。よろしいですか？', yes: '上書きして始める' }, go);
      },
      remove(n) {
        UI.confirmBox({ title: 'データ' + n + 'を削除', body: 'データ' + n + 'の記録をすべて消します。元に戻せません。', yes: '削除する' }, () => {
          Storage.remove(n); toast('データ' + n + 'を削除しました'); showSlots();
        });
      },
    });
  }

  /* ---------- 進行の振り分け ---------- */

  const GAME_STEPS = ['pregame', 'game', 'verdict', 'growth', 'result'];

  function render() {
    if (!state) { showSlots(); return; }
    setChrome(true);
    CS.setNav('main');
    if (state.mode === 'college' && state.team) {
      try { Engine.check(state); } catch (e) { console.error(e); }
    }
    /* 不祥事・出来事はカードとカードのあいだ（次の節の画面に入る前）に出す */
    if ((state.pending || []).length && ['game', 'verdict', 'growth', 'result', 'cardEnd'].indexOf(state.step) < 0) { showPending(); return; }
    if (state.mode === 'soccer') { renderSoccer(); return; }
    if (state.mode === 'pro') { renderPro(); return; }
    renderCollege();
  }

  function after(fn) { return (...a) => { fn(...a); save(); render(); }; }

  function showPending() {
    const top = Engine.pendingTop(state);
    if (!top.options) {
      CS.pending(state, top, { answer: after(() => Engine.answerPending(state, null)) });
      return;
    }
    CS.pending(state, top, {
      answer(key) {
        const res = Engine.answerPending(state, key);
        save();
        CS.pendingResult(state, res, { next: render });
      },
    });
  }

  function trainLead() {
    return { SPRING_TRAINING: '春のリーグ戦に向けた練習が始まる。', SUMMER_TRAINING: '秋のリーグ戦に向けた、夏の練習。',
             PRO_TRAINING: 'プロの春季キャンプ。' }[state.phase] || '';
  }

  function trainNext() {
    return { SPRING_TRAINING: '春リーグへ', SUMMER_TRAINING: '新入生スカウトへ', PRO_TRAINING: 'ペナントレースへ' }[state.phase] || '次へ';
  }

  function renderTraining() {
    if (state.step === 'intro') {
      Screens.trainingIntro(state, trainLead());
      const b = UI.el('btn-train-start');
      if (b) b.addEventListener('click', after(() => Engine.startTraining(state)));
      return;
    }
    if (state.step === 'training') { Screens.training(state); return; }
    Screens.trainingResult(state, trainNext());
  }

  function renderCollege() {
    const ph = state.phase, st = state.step;
    if (ph === 'TEAM_CREATION') {
      if (st === 'pick-bat' || st === 'pick-pit') {
        const bat = st === 'pick-bat';
        Screens.pick({
          title: (state.revival ? '野球部再建：' : 'チーム作り：') + (bat ? '野手を選ぶ' : '投手を選ぶ'),
          lead: (bat ? '18人' : '10人') + 'ひと組の部員が' + state.sets.list.length + 'つ。どれか1つを選んでください。' +
            '1〜4年生がそろっています。「主力」「有望株」「素行に不安」も見て選んでください。選手を押すと詳しく見られます。',
          setLabel: 'チーム', pickLabel: 'この' + (bat ? '野手' : '投手') + 'たちにする',
          sets: state.sets.list,
          onSelect: after((i) => Engine.pickCreation(state, i)),
        });
        return;
      }
      Screens.ready(state);
      return;
    }
    if (/_TRAINING$/.test(ph)) { renderTraining(); return; }
    if (/_LEAGUE$|_PLAYOFF$|_NATIONAL$/.test(ph)) { renderMatchPhase(); return; }
    if (ph === 'SCOUTING') {
      const sc = state.scouting;
      /* 押したボタンが画面の同じ位置に残るよう、描き直したあとに位置を合わせる
         （一番上まで戻されないように） */
      const keep = (fn) => (id, btn) => {
        const sel = btn && btn.closest('.scoutpick__i') ? '.scoutpick__i' : '.scout';
        const anchor = btn ? btn.getBoundingClientRect().top : null;
        const y = window.scrollY;
        fn(id);
        save();
        render();
        window.scrollTo(0, y);
        if (anchor != null) {
          /* 同じ選手の同じ場所（上のまとめ／候補の一覧）のボタンを探して、ずれたぶんだけ戻す */
          const card = document.querySelector('.scoutlist [data-cid="' + id + '"]');
          const target = sel === '.scoutpick__i'
            ? (document.querySelector('.scoutpick [data-offer="' + id + '"]') || (card && card.querySelector('[data-offer]')))
            : (card && card.querySelector('[data-offer]'));
          if (target) window.scrollBy(0, target.getBoundingClientRect().top - anchor);
        }
      };
      CS.scouting(state, {
        look: keep((id) => { if (!Scouting.look(sc, id)) toast('これ以上視察できません'); }),
        offer: keep((id) => { if (!Scouting.toggleOffer(sc, id)) toast('推薦枠は' + CONFIG.ROSTER.REC_SLOTS + 'つまでです'); }),
        special: keep((id) => Scouting.toggleSpecial(sc, id)),
        done: () => {
          const go = after(() => Engine.endScouting(state));
          if (sc.offers === 0) UI.confirmBox({ title: '推薦枠を出していません', body: '誰にも推薦枠を出さずに終えると、来年の新入生は一般入部だけになります。よろしいですか？', yes: 'このまま終える' }, go);
          else go();
        },
      });
      return;
    }
    if (ph === 'RETIREMENT') { CS.retirement(state, { next: after(() => Engine.endRetirement(state)) }); return; }
    if (ph === 'NEW_MEMBER') {
      /* 前の版のデータで、一般入部を選ぶ途中だった場合は最初の組で入部させる */
      if (state.sets && state.sets.kind === 'general') { Engine.pickGeneral(state, 0); save(); render(); return; }
      CS.arrivals(state, { next: after(() => Engine.finishNewMember(state)) });
      return;
    }
    if (ph === 'PRO_CHOICE') { CS.proChoice(state, { choose: after((go) => Engine.chooseProEntry(state, go)) }); return; }
    if (ph === 'DISBAND') { CS.disband(state, { next: after(() => Soccer.start(state)) }); return; }
    CS.show('<p class="note">不明な状態です（' + UI.esc(ph + '/' + st) + '）。</p>');
  }

  /* ---------- 試合の流れ（リーグ・入れ替え戦・全国大会・プロで共通） ---------- */

  function lineupEdit(done) {
    const v = College.matchTeam(state);
    UI.lineupEditor(v, () => { College.syncBack(state, v); save(); if (done) done(); });
  }

  function renderMatchPhase() {
    const ph = state.phase, st = state.step;
    if (st === 'round') { CS.round(state, { go: after(() => Engine.prepareMatch(state)), lineup: () => lineupEdit() }); return; }
    if (st === 'opening' || st === 'nextup') {
      CS.nationalOpen(state, { go: after(() => { if (!state.match) Engine.prepareMatch(state); state.step = 'pregame'; }), lineup: () => lineupEdit() });
      return;
    }
    if (st === 'cardEnd') { CS.cardEnd(state, { next: after(() => Engine.nextCard(state)) }); return; }
    if (st === 'final') { CS.final(state, { next: after(() => Engine.afterFinal(state)) }); return; }
    if (st === 'playoffResult') { CS.playoffResult(state, { next: after(() => Engine.finishPlayoff(state)) }); return; }
    if (st === 'end') { CS.nationalEnd(state, { next: after(() => Engine.closeSeason(state)) }); return; }
    renderGameStep();
    void ph;
  }

  function renderGameStep() {
    const st = state.step;
    if (st === 'pregame') { showPregame(); return; }
    if (st === 'game') { resumeGame(); return; }
    /* 試合の中身は保存していないので、開き直したときは次へ進める */
    if (!lastSim) { Engine.nextAfterGame(state); save(); render(); return; }
    if (st === 'verdict') { Screens.verdict(state); return; }
    if (st === 'growth') { Screens.growth(state); return; }
    if (st === 'result') { showResult(); return; }
  }

  function showPregame() {
    view = College.matchTeam(state);
    const m = state.match;
    let extra = '';
    if (m.kind === 'league' || m.kind === 'playoff') {
      const c = Engine.currentCard(state);
      const mineA = c.a === state.userUni;
      extra = '<p class="cardstat">第' + (c.games.length + 1) + '戦　このカード <b>' + (mineA ? c.winsA : c.winsB) + '勝' + (mineA ? c.winsB : c.winsA) + '敗' + (c.draws ? c.draws + '分' : '') + '</b></p>';
    }
    Screens.pregame(state, { view, extra });
    /* まとめて進めるボタンは、リーグ戦と入れ替え戦だけ */
    UI.el('btn-auto-card').hidden = !(m.kind === 'league' || m.kind === 'playoff');
    UI.el('btn-auto-league').hidden = m.kind !== 'league';
  }

  function playLive() {
    if (!state || state.step !== 'pregame') return;
    view = Engine.beginGame(state);
    save();
    runGame(0);
  }

  function runGame(skipTo) {
    const g = state.liveGame;
    const away = g.mySide === 'away' ? view : state.opponent;
    const home = g.mySide === 'away' ? state.opponent : view;
    RNG.seed(g.seed);
    const live = Sim.live(away, home, Engine.simOpts(state));
    const subs = (g.subs || []).slice();
    const target = Math.max(skipTo, subs.length ? subs[subs.length - 1].at : 0);
    let guard = 0;
    const catchUp = () => {
      while (subs.length && subs[0].at <= live.log.length) GameScreen.replaySub(live, view, g.mySide, subs.shift());
    };
    catchUp();
    while (live.log.length < target && guard++ < 20000) { if (!live.next()) break; catchUp(); }
    const out = [];
    (g.subs || []).forEach((r) => (r.out || []).forEach((id) => out.push(id)));
    GameScreen.start({
      away, home, mySide: g.mySide, skipTo, retired: out,
      onSub(rec) { g.subs.push(rec); g.step = rec.at; save(); },
      onProgress(i) { g.step = i; save(); },
    }, live, () => finishGame(live.result));
  }

  function resumeGame() {
    const g = state.liveGame;
    if (!g) { state.step = 'pregame'; render(); return; }
    state.team = clone(g.team);
    state.opponent = clone(g.opponent);
    view = College.matchTeam(state);
    runGame(g.step || 0);
  }

  /* 試合のあとは結果の画面1枚にまとめる（勝敗・成長・成績・カードの状況・順位表） */
  function finishGame(res) {
    const out = Engine.afterGame(state, res, view);
    lastSim = { res, meta: { mySide: state.match.mySide, label: state.match.label, report: out.report, team: view } };
    afterGameCurtain();
    showResult();
  }

  function autoPlay() {
    if (!state || state.step !== 'pregame') return;
    const out = Engine.autoGame(state);
    lastSim = { res: out.res, meta: { mySide: state.match.mySide, label: state.match.label, report: out.report, team: out.view } };
    afterGameCurtain();
    showResult();
  }

  /** このカードの残りをまとめておまかせ。最後の試合の結果画面に、カードの全試合を添える */
  function autoCardPlay() {
    if (!state || state.step !== 'pregame') return;
    const r = Engine.autoCard(state);
    if (!r.last) return;
    lastSim = { res: r.last.res, meta: { mySide: state.match.mySide, label: state.match.label, report: r.last.report, team: r.last.view,
      cardGames: r.games } };
    afterGameCurtain();
    showResult();
  }

  /** リーグ戦の残りをまとめておまかせ。出来事が起きたらそこで止まる */
  function autoLeaguePlay() {
    if (!state || state.step !== 'pregame') return;
    UI.confirmBox({ title: 'リーグ戦の残りをおまかせ', body: 'このカードからリーグ戦の最後まで、結果だけで進めます。不祥事などの出来事が起きたら、そこで一旦止まります。', yes: 'おまかせで進める' }, () => {
      const sum = Engine.autoLeague(state);
      lastSim = null;
      save();
      toast(sum.games + '試合をおまかせで進めました（' + sum.w + '勝' + sum.l + '敗' + (sum.d ? sum.d + '分' : '') + '）' + (sum.stopped ? '。出来事が起きたので止めました' : ''));
      render();
    });
  }

  function afterGameCurtain() {
    const r = state.lastResult;
    if (r && r.kind === 'national' && r.win && state.national && state.national.champion === state.userUni) {
      UI.curtain('<b>' + UI.esc(state.national.name) + '</b><span>優勝</span>', () => {});
    }
  }

  function showResult() {
    state.step = 'result';
    save();
    const m = state.match, r = state.lastResult || {};
    let top = '', extra = '';
    /* 勝敗の画面に出していたこと（カードの状況・ケガ）を、結果画面の頭に */
    if (r.card) {
      const games = (lastSim.meta.cardGames || []);
      top += '<p class="cardstat">このカード <b>' + r.card.w + '勝' + r.card.l + '敗' + (r.card.d ? r.card.d + '分' : '') + '</b>' +
        (r.card.done ? (m.kind === 'playoff' ? '　入れ替え戦の決着' : (r.card.won ? '　<b class="good">勝ち点を獲得</b>' : '　<b class="bad">勝ち点を落とした</b>')) : '') +
        (games.length > 1 ? '<span class="muted">（おまかせ：' + games.map((g) => g.my + '-' + g.op).join('、') + '）</span>' : '') + '</p>';
    }
    if (m.kind === 'national') {
      top += '<p class="cardstat">' + (r.replay ? '引き分け。再試合になる' : (r.win ? (state.national.done ? '優勝！' : '次の回へ進む') : 'ここで敗退')) + '</p>';
    }
    if ((r.injuries || []).length) top += '<p class="note note--warn">負傷：' + r.injuries.map((x) => UI.esc(x.name) + '（' + UI.esc(x.text) + '・' + x.games + '試合）').join('、') + '</p>';
    if (m.kind === 'league') {
      const div = Universities.divOf(state, state.userUni);
      const se = state.season;
      if (r.card && r.card.done) {
        extra += '<h4 class="sub">この節の結果</h4><ul class="cardlist">' + (se.schedule[div][se.round] || []).map((k) => CS.cardLineHtml(state, se.cards[k])).join('') + '</ul>';
      }
      extra += '<h4 class="sub">' + div + '部　順位表</h4>' + CS.standingsTable(state, se, div);
    }
    if (m.kind === 'national') extra += '<h4 class="sub">組み合わせ</h4><div class="bracket">' + CS.bracket(state, state.national) + '</div>';
    GameScreen.result(state, lastSim.res, Object.assign({}, lastSim.meta, { top, extra }));
    const label = nextLabel();
    UI.el('btn-result-next').textContent = label;
    UI.el('btn-result-next-top').textContent = label;
  }

  /** 結果画面のボタンに「次に何が起きるか」を書く */
  function nextLabel() {
    const m = state.match, r = state.lastResult || {};
    if (m.kind === 'league' || m.kind === 'playoff') {
      const c = Engine.currentCard(state);
      if (c && !c.done) return '第' + (c.games.length + 1) + '戦の試合前へ';
      if (m.kind === 'playoff') return '入れ替え戦の結果へ';
      return state.season.round >= 4 ? 'リーグ戦の最終順位へ' : '第' + (state.season.round + 2) + '節の試合前へ';
    }
    if (m.kind === 'national') {
      if (r.replay) return '再試合へ';
      return (state.national.done || !state.national.alive) ? '大会の結果へ' : National.roundName(state.national.round) + 'の試合前へ';
    }
    if (m.kind === 'pro') return state.pro.season.stage === 'regular' ? '順位表へ' : 'シリーズの状況へ';
    return '次へ';
  }

  function resultNext() {
    lastSim = null;
    Engine.nextAfterGame(state);
    save();
    render();
  }

  /* ---------- サッカー部 ---------- */

  function renderSoccer() {
    const S = state.soccer, ph = state.phase, st = state.step;
    if (ph === 'SOCCER_TRAINING') {
      if (st === 'intro') { SS.trainingIntro(state, { start: after(() => Soccer.startTraining(state)) }); return; }
      if (st === 'training') { SS.training(state, { take: after(() => Soccer.trainTake(state)), pass: after(() => Soccer.trainPass(state)) }); return; }
      SS.trainingResult(state, { end: after(() => Soccer.endTraining(state)) });
      return;
    }
    if (ph === 'SOCCER_SEASON') {
      if (st === 'round') {
        if (S.league.done) { Soccer.finishSeason(state); save(); render(); return; }
        SS.round(state, {
          go() {
            const res = Soccer.playUser(state);
            Soccer.recordRound(state, res);
            state.step = 'result';
            save();
            soccerShown = res;
            SS.match(state, res, () => SS.matchResult(state, res, { next: soccerNext }));
          },
          xi: () => SS.xiEditor(state, () => { save(); render(); }),
        });
        return;
      }
      if (st === 'result') { SS.matchResult(state, S.lastMatch, { next: soccerNext }); return; }
      if (st === 'final') {
        SS.final(state, { next: after(() => { if (S.national) { state.phase = 'SOCCER_NATIONAL'; state.step = 'round'; } else Soccer.toRetirement(state); }) });
        return;
      }
    }
    if (ph === 'SOCCER_NATIONAL') {
      if (st === 'result' && S.lastMatch) { SS.matchResult(state, S.lastMatch, { next: after(() => { state.step = 'round'; }) }); return; }
      SS.national(state, {
        go() {
          const o = Soccer.natOpponent(state);
          const res = Soccer.playUser(state, o);
          Soccer.natAfterUser(state, res);
          state.step = 'result';
          save();
          SS.match(state, res, () => SS.matchResult(state, res, { next: after(() => { state.step = 'round'; }) }));
        },
        end: after(() => Soccer.closeNational(state)),
        xi: () => SS.xiEditor(state, () => { save(); render(); }),
      });
      return;
    }
    if (ph === 'SOCCER_RETIREMENT') { SS.retirement(state, { next: after(() => Soccer.endRetirement(state)) }); return; }
    if (ph === 'SOCCER_CHOICE') {
      SS.choice(state, {
        cont: after(() => Soccer.continueSoccer(state)),
        revive: () => UI.confirmBox({ title: '野球部を復活させる', body: 'サッカー部の活動を終え、野球部をチーム作りから再建します。よろしいですか？', yes: '野球部を復活させる' },
          after(() => Soccer.reviveBaseball(state))),
      });
      return;
    }
    if (ph === 'SOCCER_NEW_MEMBER') { SS.newMembers(state, { pick: after((i) => Soccer.pickNewMembers(state, i)) }); return; }
    void soccerShown;
  }

  function soccerNext() {
    const S = state.soccer;
    if (S.league.done) Soccer.finishSeason(state); else state.step = 'round';
    save(); render();
  }

  /* ---------- プロ野球 ---------- */

  function renderPro() {
    const ph = state.phase, st = state.step;
    if (ph === 'PRO_TRAINING') { renderTraining(); return; }
    if (ph === 'PRO_SEASON' && st === 'round') {
      PS.round(state, {
        go: after(() => Pro.prepare(state)),
        lineup: () => lineupEdit(),
        rest: () => UI.confirmBox({ title: '残りをおまかせ', body: 'ペナントレースの残り試合を結果だけで進めます。', yes: 'おまかせで進める' }, after(() => Pro.simRest(state))),
      });
      return;
    }
    if (ph === 'PRO_POSTSEASON' && st === 'series') { PS.series(state, { go: after(() => Pro.prepare(state)), lineup: () => lineupEdit() }); return; }
    if (ph === 'PRO_END') {
      PS.end(state, {
        cont: after(() => Pro.continuePro(state)),
        back: () => UI.confirmBox({ title: '大学野球へ戻る', body: 'プロ野球に参戦する直前の大学野球の状態に戻ります。プロでの選手の成長などは持ち込みません。', yes: '大学野球へ戻る' }, () => {
          state = Pro.returnToCollege(state);
          Persona.bind(state);
          save(); render();
          toast('大学野球に戻りました');
        }),
      });
      return;
    }
    if (ph === 'PRO_DRAFT') {
      PS.draft(state, {
        pick: after((pid) => {
          const D = state.pro.draft;
          if (D.picked.indexOf(pid) >= 0) { D.picked = D.picked.filter((x) => x !== pid); return; }
          if (!Pro.draftPick(state, pid)) toast('指名できるのは' + D.max + '人までです');
        }),
        done: after(() => Pro.finishDraft(state)),
      });
      return;
    }
    renderGameStep();
  }

  /* ---------- ゲーム内メニュー ---------- */

  function openNav(key) {
    if (!state) return;
    if (key === 'main') { render(); return; }
    if (state.step === 'game') { toast('試合中は開けません'); return; }
    CS.setNav(key);
    const back = () => render();
    if (key === 'team') {
      if (state.mode === 'soccer') { SS.team(state, { back }); return; }
      if (!state.team) { toast('まだチームがありません'); CS.setNav('main'); return; }
      CS.team(state, {
        back,
        renamed: save,
        lineup: () => lineupEdit(() => openNav('team')),
        captain: () => UI.captainPicker(state.team, () => {
          const c = Team.captain(state.team);
          if (c) { c.wasCaptain = true; College.addHist(c, state, College.termLabel(state) + ' キャプテンに就任'); }
          save(); openNav('team');
        }, { exclude: state.phase === 'RETIREMENT' ? College.retiring(state).map((p) => p.id) : [] }),
      });
      return;
    }
    if (key === 'league') {
      if (state.mode === 'soccer') { SS.league(state, { back }); return; }
      if (state.mode === 'pro' && state.pro && state.pro.season) {
        CS.show('<h2 class="section-title">プロ野球 順位表</h2>' + PS.table(state, 0) + PS.table(state, 1) +
          '<div class="actions"><button type="button" class="btn btn--wide" id="pl-back">戻る</button></div>',
          (root) => root.querySelector('#pl-back').addEventListener('click', back));
        return;
      }
      CS.league(state, { back });
      return;
    }
    if (key === 'records') { CS.records(state, { back }); return; }
    if (key === 'history') { CS.history(state, { back }); return; }
  }

  function openSettings() {
    if (!state) return;
    if (state.step === 'game') { toast('試合中は開けません'); return; }
    CS.setNav('');
    CS.settings(state, { back: render, saved: () => { save(); toast('名前を変更しました'); render(); } });
  }

  function openSave() {
    if (!state) return;
    CS.saveBox(slot, Storage.list(), {
      pick(n, used) {
        const doIt = () => {
          if (Storage.save(n, state)) {
            slot = n;
            UI.closeModal();
            toast('データ' + n + 'に保存しました');
          } else toast('保存できませんでした（ブラウザの保存領域を確認してください）');
        };
        if (n !== slot && used) {
          UI.confirmBox({ title: 'データ' + n + 'に上書き', body: 'データ' + n + 'の記録は消えて、いまの進行で上書きされます。', yes: '上書きして保存' }, doIt);
        } else doIt();
      },
    });
  }

  /* ---------- 起動 ---------- */

  function boot() {
    UI.init();
    GameScreen.init();
    const on = (id, fn) => { const n = UI.el(id); if (n) n.addEventListener('click', fn); };

    on('btn-home', () => { if (state && state.step === 'game') { toast('試合中はトップに戻れません'); return; } save(); showSlots(); });
    on('btn-save', openSave);
    on('btn-settings', openSettings);
    document.querySelectorAll('#status-nav .navbtn').forEach((b) => b.addEventListener('click', () => openNav(b.dataset.nav)));

    on('btn-ready-lineup', () => UI.lineupEditor(state.team, () => { save(); Screens.ready(state); }));
    on('btn-ready-next', after(() => { if (!Engine.finishCreation(state)) toast('キャプテンを決めてください'); }));

    on('btn-train-take', after(() => Engine.trainTake(state)));
    on('btn-train-pass', after(() => Engine.trainPass(state)));
    on('btn-train-done', after(() => Engine.endTraining(state)));

    on('btn-play', playLive);
    on('btn-auto', autoPlay);
    on('btn-auto-card', autoCardPlay);
    on('btn-auto-league', autoLeaguePlay);
    on('btn-result-next-top', resultNext);
    on('btn-pregame-lineup', () => UI.lineupEditor(view, () => { College.syncBack(state, view); save(); showPregame(); }));
    on('btn-skip', () => GameScreen.skip());
    on('btn-verdict-next', () => { state.step = 'growth'; save(); Screens.growth(state); });
    on('btn-growth-next', showResult);
    on('btn-result-next', resultNext);

    showSlots();
    if (typeof Cloud !== 'undefined') {
      Cloud.restore().then((n) => { if (n && !state) { showSlots(); toast('別の場所に残っていた記録を戻しました'); } }).catch(() => {});
    }
  }

  return { boot, get state() { return state; }, render };
})();

document.addEventListener('DOMContentLoaded', App.boot);
