/* ==================================================
   大学野球  pro-screens.js

   プロ野球モードの画面。試合そのものは大学と同じ試合画面（強奪高校野球の
   試合画面）を使う。ここは順位表・シリーズ・ドラフト・シーズン終了の選択。
   ================================================== */
'use strict';

const PS = (() => {

  const esc = UI.esc;
  function on(root, sel, fn) { root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => fn(b, e))); }

  function table(state, li) {
    const rows = Pro.standings(state, li);
    return '<div class="tablewrap"><table class="standings"><thead><tr><th>順位</th><th class="nm">球団</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th></tr></thead><tbody>' +
      rows.map((r) => '<tr class="' + (r.id === Pro.USER ? 'is-me' : '') + '"><td class="c">' + r.rank + '</td><td class="nm">' + esc(Pro.teamName(state, r.id)) + '</td>' +
        '<td class="c">' + (r.w + r.l + r.d) + '</td><td class="c">' + r.w + '</td><td class="c">' + r.l + '</td><td class="c">' + r.d + '</td>' +
        '<td class="c">' + (r.w + r.l ? r.pct.toFixed(3).replace(/^0/, '') : '.---') + '</td></tr>').join('') + '</tbody></table></div>';
  }

  function round(state, h) {
    const S = state.pro.season;
    const li = Pro.myLeague(state);
    const opp = S.sched[S.day];
    CS.show('<h2 class="section-title">' + esc(Pro.leagueName(state, li)) + '　ペナントレース</h2>' +
      '<div class="vsbox"><p class="vsbox__vs">第' + (S.day + 1) + '戦 / ' + S.sched.length + '　' + esc(state.team.name) + '　<i>対</i>　<b>' + esc(Pro.teamName(state, opp)) + '</b></p>' +
      '<p class="note">相手の強さは大学とは別次元。上位3球団が' + esc(state.names.proLeagueFinal) + 'へ進み、勝ち抜くと' + esc(state.names.proSeries) + '。チーム力 ' + College.strength(state) + '</p>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="pr-go">試合前へ</button>' +
        '<button type="button" class="btn" id="pr-lineup">オーダー変更</button>' +
        '<button type="button" class="btn" id="pr-rest">残りの試合をおまかせ（結果だけ）</button></div></div>' +
      '<h3 class="sub">' + esc(Pro.leagueName(state, li)) + '</h3>' + table(state, li) +
      '<h3 class="sub">' + esc(Pro.leagueName(state, 1 - li)) + '</h3>' + table(state, 1 - li),
      (root) => { on(root, '#pr-go', h.go); on(root, '#pr-lineup', h.lineup); on(root, '#pr-rest', h.rest); });
  }

  function seriesHtml(state, s) {
    return '<li class="cardline' + (s.a === Pro.USER || s.b === Pro.USER ? ' is-me' : '') + '"><span class="cardline__t">' + esc(s.name) + '：' +
      esc(Pro.teamName(state, s.a)) + ' <b>' + s.winsA + '</b> - <b>' + s.winsB + '</b> ' + esc(Pro.teamName(state, s.b)) +
      (s.adv ? '<small>（' + esc(Pro.teamName(state, s.a)) + 'に1勝のアドバンテージ）</small>' : '') + '</span>' +
      (s.done ? '<span class="cardline__w">→ ' + esc(Pro.teamName(state, s.winner)) + '</span>' : '') + '</li>';
  }

  function series(state, h) {
    const S = state.pro.season;
    const s = S.post;
    CS.show('<h2 class="section-title">ポストシーズン</h2>' +
      '<div class="vsbox"><p class="vsbox__vs">' + esc(s.name) + '</p>' +
      '<p class="vsbox__card">' + esc(Pro.teamName(state, s.a)) + ' <b>' + s.winsA + '</b> - <b>' + s.winsB + '</b> ' + esc(Pro.teamName(state, s.b)) + '　（' + s.need + '勝先取）</p>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="ps-go">試合前へ</button><button type="button" class="btn" id="ps-lineup">オーダー変更</button></div></div>' +
      '<h3 class="sub">ここまでのシリーズ</h3><ul class="cardlist">' + S.rounds.map((x) => seriesHtml(state, x)).join('') + '</ul>' +
      '<h3 class="sub">レギュラーシーズン最終順位</h3>' + table(state, 0) + table(state, 1),
      (root) => { on(root, '#ps-go', h.go); on(root, '#ps-lineup', h.lineup); });
  }

  function end(state, h) {
    const S = state.pro.season;
    const champ = S.champion === Pro.USER;
    CS.show((champ ? Screens.champHtml('プロ' + state.pro.no + '年目', state.names.proSeries + ' 優勝', state.team.name, '', '大学から来たチームが、プロの頂点に立った。', state.team, '日本一')
      : '<div class="cardend"><p class="cardend__eyebrow">プロ' + state.pro.no + '年目</p><h2 class="cardend__title">シーズン終了</h2><p class="incident__text">' + esc(S.result) + '</p></div>') +
      '<h3 class="sub">ポストシーズン</h3><ul class="cardlist">' + S.rounds.map((x) => seriesHtml(state, x)).join('') + '</ul>' +
      table(state, 0) + table(state, 1) +
      '<div class="incident"><p class="incident__text">来季はどうしますか？</p>' +
      '<div class="choices"><button type="button" class="btn btn--primary btn--wide" id="pe-cont">このままプロ野球を続ける</button>' +
      '<button type="button" class="btn btn--wide" id="pe-back">大学野球へ戻る</button></div>' +
      '<p class="note">大学野球へ戻ると、プロ野球に参戦する直前の大学野球の状態に戻ります（部員・順位・記録・連続優勝の数）。プロに参戦した記録は残ります。</p></div>',
      (root) => { on(root, '#pe-cont', h.cont); on(root, '#pe-back', h.back); });
  }

  function draft(state, h) {
    const D = state.pro.draft;
    CS.show('<h2 class="section-title">ドラフト会議</h2><p class="section-lead">候補から' + D.max + '人を指名できます（' + D.picked.length + '/' + D.max + '）。</p>' +
      '<h3 class="sub">野手</h3>' + UI.rosterTable(D.cands.filter((p) => p.kind !== 'pitcher'), { college: true, state }) +
      '<h3 class="sub">投手</h3>' + UI.rosterTable(D.cands.filter((p) => p.kind === 'pitcher'), { college: true, state }) +
      '<p class="note">行を押すと指名／詳細。指名済み：' + D.picked.map((id) => esc(D.cands.find((p) => p.id === id).name)).join('、') + '</p>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="pd-done">指名を終えてキャンプへ</button></div>',
      (root) => {
        root.querySelectorAll('tr.prow').forEach((tr) => {
          if (D.picked.indexOf(tr.dataset.pid) >= 0) tr.classList.add('is-picked');
          tr.addEventListener('click', () => h.pick(tr.dataset.pid));
        });
        on(root, '#pd-done', h.done);
      });
  }

  return { round, series, end, draft, table };
})();
