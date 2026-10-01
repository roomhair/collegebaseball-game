/* ==================================================
   大学野球  soccer-screens.js

   サッカー部モードの画面。試合は野球と同じ考え方で、先に結果（出来事の列）を
   決めておき、それを速さを選びながら順に見せる。
   ================================================== */
'use strict';

const SS = (() => {

  const esc = UI.esc;
  let timer = null;

  function on(root, sel, fn) { root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => fn(b, e))); }

  function statCell(v) { const r = rankOf(v); return '<span class="rank rank-' + r + '">' + r + '</span><b class="rankval">' + v + '</b>'; }

  function rosterTable(state, players, lineup) {
    const inXI = {};
    (lineup || []).forEach((x) => { inXI[x.pid] = x.pos; });
    return '<div class="tablewrap"><table class="roster"><thead><tr><th>年</th><th class="nm">選手</th><th>先発</th><th>適所</th>' +
      Soccer.STATS.map((s) => '<th>' + s.label + '</th>').join('') + '<th>総合</th><th>得点</th><th>アシスト</th></tr></thead><tbody>' +
      players.map((p) => '<tr class="prow" data-pid="' + p.id + '"><td class="c g' + p.grade + '">' + p.grade + '</td><td class="nm">' + esc(p.name) + '</td>' +
        '<td class="c">' + (inXI[p.id] || '控') + '</td><td class="c">' + p.soc.pos + '</td>' +
        Soccer.STATS.map((s) => '<td class="c">' + statCell(p.soc[s.key]) + '</td>').join('') +
        '<td class="c"><b>' + Math.round(Soccer.rateFor(p.soc, inXI[p.id] || p.soc.pos)) + '</b></td>' +
        '<td class="c">' + p.socCareer.goals + '</td><td class="c">' + p.socCareer.assists + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  function table(state, d) {
    const rows = Soccer.standings(state, d);
    return '<div class="tablewrap"><table class="standings"><thead><tr><th>順位</th><th class="nm">大学</th><th>勝点</th><th>勝</th><th>分</th><th>敗</th><th>得点</th><th>失点</th><th>差</th></tr></thead><tbody>' +
      rows.map((r) => '<tr class="' + (r.id === state.userUni ? 'is-me' : '') + '"><td class="c">' + r.rank + '</td><td class="nm">' + esc(Soccer.teamName(state, r.id)) + '</td>' +
        '<td class="c pts">' + r.pts + '</td><td class="c">' + r.w + '</td><td class="c">' + r.d + '</td><td class="c">' + r.l + '</td>' +
        '<td class="c">' + r.gf + '</td><td class="c">' + r.ga + '</td><td class="c">' + (r.gf - r.ga) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  function openPlayer(state, pid) {
    const p = Soccer.findP(state, pid);
    if (!p) return;
    UI.modal('<div class="pdetail"><div class="pdetail__head"><div class="pdetail__name">' + esc(p.name) + '</div>' +
      '<div class="pdetail__meta">' + p.grade + '年　' + Soccer.POS_NAME[p.soc.pos] + '向き</div></div>' +
      '<div class="stats">' + Soccer.STATS.map((s) => UI.stat(s.label, p.soc[s.key])).join('') + '</div>' +
      UI.personaBlock(p, { state }) +
      '<h4 class="sub">サッカー通算</h4><p>' + p.socCareer.g + '試合　' + p.socCareer.goals + '得点　' + p.socCareer.assists + 'アシスト　無失点' + p.socCareer.cs + '</p>' +
      (p.career && (p.career.pa || p.career.outs) ? '<h4 class="sub">野球部時代の通算</h4>' + (p.kind === 'pitcher' ? UI.careerPitLine(p.career) : UI.careerBatLine(p.career)) : '') +
      UI.histList(p) + '</div>', { kind: 'player' });
  }

  /* ---------- 特訓 ---------- */

  function trainingIntro(state, h) {
    CS.show('<div class="nextup"><p class="nextup__eyebrow">' + state.year + '年度</p><h2 class="nextup__title">サッカー部　特訓</h2>' +
      '<p class="nextup__vs">冬のリーグ戦に向けた練習。強奪高校野球と同じく、カードを' + CONFIG.TRAINING.PICKS + '回選び、' + CONFIG.TRAINING.PASSES + '回まで見送れる。</p>' +
      '<button type="button" class="btn btn--primary btn--wide" id="st-go">特訓を始める</button></div>',
      (root) => on(root, '#st-go', h.start));
  }

  function training(state, h) {
    const T = state.soccer.training;
    const c = T.card;
    CS.show('<h2 class="section-title">サッカー部　特訓</h2>' +
      '<div class="train-meta"><span>選択 <b>' + Math.min(T.picks + 1, CONFIG.TRAINING.PICKS) + '</b> / ' + CONFIG.TRAINING.PICKS + '</span><span>見送り <b>' + T.passes + '</b> / ' + CONFIG.TRAINING.PASSES + '</span></div>' +
      '<div class="traincard traincard--' + c.tier + '"><p class="traincard__kind">' + esc(c.title) + '<span class="traincard__n">' + c.targets.length + '人</span>' +
        (c.tierLabel ? '<span class="traincard__tier">' + esc(c.tierLabel) + '</span>' : '') + '</p>' +
      '<ul class="traincard__list">' + c.targets.map((t) => {
        const p = Soccer.findP(state, t.pid);
        return '<li class="tcard"><div class="tcard__head"><b>' + esc(p.name) + '</b><span>' + p.grade + '年・' + p.soc.pos + '</span><em class="tcard__up">' + esc(t.label) + ' +' + t.amount + '</em></div>' +
          '<div class="tcard__stats">' + Soccer.STATS.map((s) => '<span class="ts' + (s.key === t.key ? ' is-up' : '') + '"><i>' + s.label + '</i>' + statCell(p.soc[s.key]) + '</span>').join('') + '</div></li>';
      }).join('') + '</ul></div>' +
      '<div class="actions"><button type="button" class="btn btn--primary" id="st-take">選択</button>' +
      '<button type="button" class="btn" id="st-pass"' + (T.passes >= CONFIG.TRAINING.PASSES ? ' disabled' : '') + '>' + (T.passes >= CONFIG.TRAINING.PASSES ? '見送れません' : '見送る（あと' + (CONFIG.TRAINING.PASSES - T.passes) + '回）') + '</button></div>',
      (root) => { on(root, '#st-take', h.take); on(root, '#st-pass', h.pass); });
  }

  function trainingResult(state, h) {
    const rows = [];
    state.soccer.training.log.forEach((e) => e.applied.forEach((a) => { if (a.after > a.before) rows.push(a); }));
    CS.show('<h2 class="section-title">特訓の成果</h2>' +
      (rows.length ? '<div class="tablewrap"><table class="growth"><thead><tr><th class="nm">選手</th><th>項目</th><th>変化</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td class="nm">' + esc(r.name) + '</td><td>' + esc(r.label) + '</td><td class="c">' + r.before + ' → <b>' + r.after + '</b></td></tr>').join('') + '</tbody></table></div>' : '<p class="note">伸びた選手はいませんでした。</p>') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="st-end">冬のリーグ戦へ</button></div>',
      (root) => on(root, '#st-end', h.end));
  }

  /* ---------- リーグ戦 ---------- */

  function round(state, h) {
    const S = state.soccer;
    const d = Soccer.divOf(state);
    const f = Soccer.userFixture(state);
    const xi = Soccer.mySide(state);
    CS.show('<h2 class="section-title">' + esc(state.names.soccerLeague) + '　' + d + '部　第' + (S.league.round + 1) + '節</h2>' +
      '<div class="vsbox"><p class="vsbox__vs">' + (f.home ? esc(Soccer.teamName(state, state.userUni)) + '　<i>対</i>　<b>' + esc(Soccer.teamName(state, f.oppId)) + '</b>' : '<b>' + esc(Soccer.teamName(state, f.oppId)) + '</b>　<i>対</i>　' + esc(Soccer.teamName(state, state.userUni))) + '</p>' +
      '<p class="note">' + (f.home ? 'ホーム' : 'アウェー') + '。勝ち3・分け1・負け0。全10節。チーム力 ' + Soccer.strength(state) + '</p>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="sr-go">キックオフ</button><button type="button" class="btn" id="sr-xi">先発を変える</button></div></div>' +
      '<h3 class="sub">先発11人（4-4-2）</h3><ul class="xi">' + xi.map((x) => '<li><i>' + x.pos + '</i>' + esc(x.name) + '<b>' + Math.round(Soccer.rateFor(x.s, x.pos)) + '</b></li>').join('') + '</ul>' +
      '<h3 class="sub">' + d + '部　順位表</h3>' + table(state, d),
      (root) => { on(root, '#sr-go', h.go); on(root, '#sr-xi', h.xi); });
  }

  /** 先発の入れ替え。まず外す選手、次に入れる選手 */
  function xiEditor(state, onDone) {
    const S = state.soccer;
    const draw = (picked) => {
      const xi = Soccer.mySide(state);
      const bench = S.players.filter((p) => !S.lineup.some((x) => x.pid === p.id));
      UI.modal('<h3 class="modal__title">先発を変える</h3>' +
        '<p class="time__where">' + (picked ? Soccer.findP(state, picked).name + ' と入れ替える選手（先発どうしなら位置を交換）' : '外す（または位置を替える）選手を選んでください') + '</p>' +
        '<div class="spick__list">' + (picked ? xi.filter((x) => x.pid !== picked).map((x) => item(x.p, x.pos)).concat(bench.map((p) => item(p, '控'))) : xi.map((x) => item(x.p, x.pos))).join('') + '</div>' +
        '<div class="actions actions--modal"><button type="button" class="btn" id="xi-auto">おまかせ</button><button type="button" class="btn btn--primary" id="xi-done">決定</button></div>',
        { kind: 'xi', onOpen(body) {
          body.querySelectorAll('[data-pid]').forEach((b) => b.addEventListener('click', () => {
            if (!picked) { draw(b.dataset.pid); return; }
            const other = b.dataset.pid;
            if (S.lineup.some((x) => x.pid === other)) Soccer.swap(state, other, picked);
            else Soccer.swap(state, other, picked);
            draw(null);
          }));
          body.querySelector('#xi-auto').addEventListener('click', () => { Soccer.autoLineup(state); draw(null); });
          body.querySelector('#xi-done').addEventListener('click', () => { UI.closeModal(); onDone(); });
        } });
    };
    const item = (p, pos) => '<button type="button" class="spick__item" data-pid="' + p.id + '"><span class="spick__nm">' + esc(p.name) + '</span><span class="spick__fat">' + pos + '</span>' +
      '<span class="spick__meta">' + p.grade + '年　適所 ' + p.soc.pos + '　' + Soccer.STATS.map((s) => s.label + ' ' + p.soc[s.key]).join('　') + '</span></button>';
    draw(null);
  }

  /** 試合を出来事ごとに見せる */
  function match(state, res, onDone) {
    clearTimeout(timer);
    let i = 0, speed = 1;
    const mineSide = res.home ? 'home' : 'away';
    const feed = [];
    const draw = (min, score) => {
      CS.show('<div class="smatch">' +
        '<div class="smatch__board"><span class="smatch__t">' + esc(res.homeName) + '</span><b class="smatch__s">' + score[0] + ' - ' + score[1] + '</b><span class="smatch__t">' + esc(res.awayName) + '</span></div>' +
        '<p class="smatch__min">' + (min >= 90 ? '試合終了' + (res.pk ? '　PK ' + res.pk[0] + '-' + res.pk[1] : '') : (min <= 45 ? '前半' : '後半') + ' ' + min + '分') + '</p>' +
        (min < 90 ? '<div class="speedbar"><button type="button" class="speedbtn' + (speed === 1 ? ' is-on' : '') + '" data-sp="1">ふつう</button><button type="button" class="speedbtn' + (speed === 3 ? ' is-on' : '') + '" data-sp="3">×3</button><button type="button" class="skip" id="sm-skip">スキップ ▶</button></div>' : '') +
        '<ol class="sfeed">' + feed.slice().reverse().join('') + '</ol>' +
        (min >= 90 ? '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="sm-next">試合結果へ</button></div>' : '') + '</div>',
        (root) => {
          on(root, '[data-sp]', (b) => { speed = +b.dataset.sp; });
          on(root, '#sm-skip', () => { clearTimeout(timer); while (i < res.events.length) push(res.events[i++]); draw(90, final()); });
          on(root, '#sm-next', onDone);
        });
    };
    const final = () => res.home ? [res.my, res.op] : [res.op, res.my];
    const push = (e) => {
      const mine = e.side === mineSide;
      const cls = e.kind === 'goal' ? (mine ? 'is-goal is-mine' : 'is-goal') : (e.kind === 'card' ? 'is-card' : '');
      const txt = e.kind === 'goal' ? 'ゴール！ ' + esc(e.name) + (e.astName ? '（アシスト ' + esc(e.astName) + '）' : '')
        : e.kind === 'card' ? 'イエローカード ' + esc(e.name) : esc(e.name) + 'の' + esc(e.text);
      feed.push('<li class="' + cls + '"><span>' + e.min + '\'</span>' + (mine ? '' : '<i>相手</i>') + txt + '</li>');
    };
    const tick = () => {
      if (i >= res.events.length) { draw(90, final()); return; }
      const e = res.events[i++];
      push(e);
      draw(e.min, e.score);
      timer = setTimeout(tick, (e.kind === 'goal' ? 1500 : 800) / speed);
    };
    draw(0, [0, 0]);
    timer = setTimeout(tick, 600);
  }

  function matchResult(state, res, h) {
    const word = res.win ? '勝利' : res.draw ? '引き分け' : '敗戦';
    CS.show('<div class="verdict__box ' + (res.win ? 'is-win' : res.draw ? 'is-draw' : 'is-lose') + '"><h2 class="verdict__word">' + word + '</h2>' +
      '<p class="verdict__score">' + esc(Soccer.teamName(state, state.userUni)) + ' <b>' + res.my + '</b> - <b>' + res.op + '</b> ' + esc(res.oppName) + (res.pk ? '（PK ' + (res.home ? res.pk[0] + '-' + res.pk[1] : res.pk[1] + '-' + res.pk[0]) + '）' : '') + '</p></div>' +
      '<h3 class="sub">成長した選手</h3>' + (res.ups.length ? '<ul class="growthlist">' + res.ups.map((u) => '<li><b>' + esc(u.name) + '</b><span>' + u.ups.map((x) => esc(x.label) + ' +' + x.amount).join('　') + '</span></li>').join('') + '</ul>' : '<p class="note">なし</p>') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="mr-next">次へ</button></div>',
      (root) => on(root, '#mr-next', h.next));
  }

  function final(state, h) {
    const S = state.soccer;
    const T = S.lastTable;
    const me = T.rows.find((r) => r.id === state.userUni);
    CS.show('<h2 class="section-title">' + esc(state.names.soccerLeague) + '　最終順位</h2>' +
      '<p class="section-lead finalmsg">' + T.div + '部 ' + me.rank + '位' + (S.national ? '　優勝！ ' + esc(state.names.soccerNational) + 'へ' : '') + '</p>' +
      table(state, T.div) +
      '<p class="note">各部の1位と上の部の6位は、自動で入れ替わります。来季は' + Soccer.divOf(state) + '部。</p>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="sf-next">' + (S.national ? '全国大会へ' : 'シーズンを終える') + '</button></div>',
      (root) => on(root, '#sf-next', h.next));
  }

  function national(state, h) {
    const N = state.soccer.national;
    const o = N.done ? null : Soccer.natOpponent(state);
    CS.show('<div class="opening"><p class="opening__eyebrow">' + state.year + '年度 冬</p><h2 class="opening__title">' + esc(state.names.soccerNational) + '</h2>' +
      (o ? '<p class="opening__lead">' + Soccer.NAT_ROUNDS[N.round] + 'の相手は <b>' + esc(o.name) + '</b>。引き分けはPK戦。</p>' : '<p class="opening__lead">' + esc(Soccer.natResultText(N)) + '</p>') + '</div>' +
      N.results.map((rr, i) => '<h4 class="sub">' + Soccer.NAT_ROUNDS[i] + '</h4><ul class="cardlist">' + rr.map((r) => '<li class="cardline"><span class="cardline__t">' + esc(r.a) + ' ' + r.text + ' ' + esc(r.b) + '</span></li>').join('') + '</ul>').join('') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="sn-go">' + (o ? 'キックオフ' : 'シーズンを終える') + '</button>' + (o ? '<button type="button" class="btn" id="sn-xi">先発を変える</button>' : '') + '</div>',
      (root) => { on(root, '#sn-go', o ? h.go : h.end); on(root, '#sn-xi', h.xi || (() => {})); });
    if (N.done && N.champion === state.userUni) UI.curtain('<b>' + esc(state.names.soccerNational) + '</b><span>優勝</span>', () => {});
  }

  function retirement(state, h) {
    const list = Soccer.retiring(state);
    CS.show('<h2 class="section-title">サッカー部　引退</h2>' +
      (list.length ? '<ul class="growthlist">' + list.map((p) => '<li><b>' + esc(p.name) + '</b><span>サッカー通算 ' + p.socCareer.g + '試合 ' + p.socCareer.goals + '得点 ' + p.socCareer.assists + 'アシスト' +
        ((p.career && p.career.g) ? '　／ 野球部時代 ' + p.career.g + '試合' : '') + '</span></li>').join('') + '</ul>' : '<p class="note">引退する4年生はいません。</p>') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="sr-next">送り出す</button></div>',
      (root) => on(root, '#sr-next', h.next));
  }

  function choice(state, h) {
    const can = Soccer.canRevive(state);
    const S = state.soccer;
    CS.show('<h2 class="section-title">サッカー部　シーズン終了</h2>' +
      '<p class="section-lead">サッカー部 ' + S.seasons + 'シーズン目を終えた。リーグ優勝 ' + S.titles + '回・日本一 ' + S.japan + '回。</p>' +
      '<div class="choices">' +
        '<button type="button" class="btn btn--primary btn--wide" id="sc-cont">サッカー部を続ける（翌年度へ）</button>' +
        '<button type="button" class="btn btn--wide" id="sc-revive"' + (can ? '' : ' disabled') + '>野球部を復活させる（' + esc(state.names.league) + ' 3部から）</button>' +
      '</div>' +
      '<p class="note">' + (can ? '大学が野球部の再建を認めた。復活させると、チーム作りから3部で出直します。サッカー部の記録は年表と成績に残ります。'
        : '野球部の復活は、サッカーで1部優勝するか、サッカー部で' + Soccer.REVIVE_SEASONS + 'シーズンを戦い抜くと認められます（あと' + Math.max(0, Soccer.REVIVE_SEASONS - S.seasons) + 'シーズン）。') + '</p>',
      (root) => { on(root, '#sc-cont', h.cont); on(root, '#sc-revive', h.revive); });
  }

  function newMembers(state, h) {
    const sets = state.soccer.newSets;
    CS.show('<h2 class="section-title">' + state.year + '年度　サッカー部 新入部員</h2>' +
      '<p class="section-lead">' + sets[0].length + '人ひと組の候補が' + sets.length + 'つ。入部させる組を選んでください。</p>' +
      sets.map((set, i) => '<article class="dataset"><header class="dataset__head"><h3 class="dataset__no">候補 ' + (i + 1) + '</h3>' +
        '<button type="button" class="btn btn--primary dataset__pick" data-i="' + i + '">この新入部員たちを迎える</button></header>' + rosterTable(state, set, []) + '</article>').join(''),
      (root) => on(root, '[data-i]', (b) => h.pick(+b.dataset.i)));
  }

  function team(state, h) {
    CS.show('<h2 class="section-title">サッカー部</h2><p class="section-lead">チーム力 ' + Soccer.strength(state) + '　部員 ' + state.soccer.players.length + '人</p>' +
      rosterTable(state, state.soccer.players, state.soccer.lineup) +
      '<div class="actions"><button type="button" class="btn btn--wide" id="stm-back">戻る</button></div>',
      (root) => { on(root, 'tr.prow', (b) => openPlayer(state, b.dataset.pid)); on(root, '#stm-back', h.back); });
  }

  function league(state, h) {
    CS.show('<h2 class="section-title">' + esc(state.names.soccerLeague) + '</h2>' +
      [1, 2, 3].map((d) => '<h3 class="sub">' + d + '部</h3>' + table(state, d)).join('') +
      '<div class="actions"><button type="button" class="btn btn--wide" id="slg-back">戻る</button></div>',
      (root) => on(root, '#slg-back', h.back));
  }

  return { trainingIntro, training, trainingResult, round, xiEditor, match, matchResult, final, national, retirement, choice, newMembers, team, league, openPlayer };
})();
