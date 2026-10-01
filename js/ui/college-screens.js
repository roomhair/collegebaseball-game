/* ==================================================
   大学野球  college-screens.js

   大学野球だけにある画面。どれも #main-body に描いて screen-main を出す。
   進行の判断はしない（ボタンが押されたら main.js から渡された関数を呼ぶだけ）。
   ================================================== */
'use strict';

const CS = (() => {

  const esc = UI.esc;

  function show(html, after) {
    UI.html('main-body', html);
    UI.show('screen-main');
    if (after) after(UI.el('main-body'));
  }

  function on(root, sel, fn) {
    root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => fn(b, e)));
  }

  function uni(state, id) { return Universities.name(state, id); }

  function dateText(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '/' + z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /* ---------- データ選択 ---------- */

  function slots(list, h) {
    const html = list.map((it, i) => {
      const n = i + 1;
      if (!it) {
        return '<article class="slot is-empty">' +
          '<header class="slot__head"><h3>データ' + n + '</h3><span class="slot__new">NEW GAME</span></header>' +
          '<p class="slot__empty">まだ使われていません。</p>' +
          '<div class="slot__actions"><button type="button" class="btn btn--primary" data-new="' + n + '">新しく始める</button></div>' +
        '</article>';
      }
      const m = it.meta || {};
      return '<article class="slot">' +
        '<header class="slot__head"><h3>データ' + n + '</h3>' +
          (m.mode === 'soccer' ? '<span class="slot__mode">サッカー部</span>' : m.mode === 'pro' ? '<span class="slot__mode">プロ野球</span>' : '') + '</header>' +
        (it.broken ? '<p class="slot__empty">このデータは読み込めません。削除してください。</p>' :
          '<p class="slot__uni">' + esc(m.uni || '') + '</p>' +
          '<p class="slot__line">' + esc([m.league, m.rank].filter(Boolean).join(' ')) + '　' + (m.yearNo || 1) + '年目（' + (m.year || '') + '年度）</p>' +
          '<p class="slot__phase">「' + esc(m.phase || '') + '」</p>') +
        '<p class="slot__date">最終プレイ：' + dateText(it.at) + '</p>' +
        '<div class="slot__actions">' +
          (it.broken ? '' : '<button type="button" class="btn btn--primary" data-load="' + n + '">続きから（ロード）</button>') +
          '<button type="button" class="btn" data-new="' + n + '">上書きして新しく始める</button>' +
          '<button type="button" class="btn btn--danger btn--small" data-del="' + n + '">削除</button>' +
        '</div></article>';
    }).join('');
    UI.html('slot-list', (Storage.persistent() ? '' :
      '<p class="bootnote">この開き方ではブラウザに保存できません。遊ぶことはできますが、画面を閉じると記録は消えます。' +
      '記録を残したい場合は、SafariやChromeで開くか、テストプレイ用のリンクから遊んでください。</p>') + html);
    const root = UI.el('slot-list');
    on(root, '[data-load]', (b) => h.load(+b.dataset.load));
    on(root, '[data-new]', (b) => h.fresh(+b.dataset.new, !!list[+b.dataset.new - 1]));
    on(root, '[data-del]', (b) => h.remove(+b.dataset.del));
    UI.show('screen-top');
  }

  /** 新しく始めるときの名前の設定 */
  function newGameForm(slot, onStart, onBack) {
    const N = CONFIG.DEFAULT_NAMES;
    const field = (id, label, value, help, max) =>
      '<label class="field"><span class="field__label">' + label + '</span>' +
      '<input type="text" id="' + id + '" class="field__input" maxlength="' + (max || 16) + '" value="' + esc(value) + '">' +
      (help ? '<span class="field__help">' + help + '</span>' : '') + '</label>';
    show(
      '<h2 class="section-title">データ' + slot + '：新しく始める</h2>' +
      '<p class="section-lead">あなたは架空の大学の野球部監督です。名前はあとから設定でいつでも変えられます。</p>' +
      '<div class="form">' +
        field('ng-uni', '自分の大学の名前', NAMES.UNIVERSITIES[0], '2部リーグの、弱小〜中堅の大学から始まります。', 14) +
        field('ng-league', 'リーグの名前', N.league, '18大学・3部制のリーグです。') +
        field('ng-spring', '春の全国大会の名前', N.springNational) +
        field('ng-fall', '秋の全国大会の名前', N.fallNational) +
      '</div>' +
      '<div class="actions">' +
        '<button type="button" class="btn" id="ng-back">戻る</button>' +
        '<button type="button" class="btn btn--primary" id="ng-start">チーム作りへ</button>' +
      '</div>',
      (root) => {
        on(root, '#ng-back', onBack);
        on(root, '#ng-start', () => {
          const v = (id, d) => (UI.el(id).value.trim() || d);
          onStart({
            uniName: v('ng-uni', NAMES.UNIVERSITIES[0]).slice(0, 14),
            names: { league: v('ng-league', N.league), springNational: v('ng-spring', N.springNational), fallNational: v('ng-fall', N.fallNational) },
          });
        });
      });
  }

  /* ---------- 状態のバー ---------- */

  function status(state) {
    const bar = UI.el('statusbar');
    if (!state || !state.userUni) { bar.hidden = true; return; }
    bar.hidden = false;
    const H = Engine.header(state);
    const chips = [H.year + '　' + H.term, H.phase, H.place].filter(Boolean)
      .map((t) => '<span class="chip">【' + esc(t) + '】</span>').join('');
    const extra = '<span class="statusbar__sub">' + esc(Universities.name(state, state.userUni)) +
      '　監督' + H.managerYears + '年目' +
      (state.mode === 'college' ? '　連続リーグ優勝 <b>' + (state.streak || 0) + '</b>' : '') +
      (state.mode === 'college' && state.team ? '　チーム力 <b>' + College.strength(state) + '</b>' : '') + '</span>';
    UI.html('status-where', chips + extra);
    /* サッカー部では「リーグ」はサッカーの順位表になる */
    UI.el('status-nav').hidden = !state.team && state.mode !== 'soccer';
  }

  function setNav(key) {
    document.querySelectorAll('#status-nav .navbtn').forEach((b) => b.classList.toggle('is-on', b.dataset.nav === key));
  }

  /* ---------- 順位表 ---------- */

  function pctText(v, w, l) { return (w + l) ? v.toFixed(3).replace(/^0/, '') : '.---'; }

  function standingsTable(state, season, div, opts) {
    opts = opts || {};
    const rows = League.standings(season, div);
    return '<div class="tablewrap"><table class="standings">' +
      '<thead><tr><th>順位</th><th class="nm">大学名</th><th>勝ち点</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th></tr></thead><tbody>' +
      rows.map((r) => {
        const me = r.id === state.userUni;
        const mark = opts.final ? (div === 1 && r.rank === 1 ? '<i class="tag tag--gold">優勝</i>' :
          (r.rank === 1 ? '<i class="tag tag--up">入替戦へ</i>' : r.rank === 6 ? (div === 3 ? '<i class="tag tag--down">最下位</i>' : '<i class="tag tag--down">入替戦へ</i>') : '')) : '';
        return '<tr class="' + (me ? 'is-me' : '') + '"><td class="c">' + r.rank + '</td>' +
          '<td class="nm">' + esc(uni(state, r.id)) + (me ? ' <b class="me">自校</b>' : '') + ' ' + mark + '</td>' +
          '<td class="c pts">' + r.points + '</td><td class="c">' + r.w + '</td><td class="c">' + r.l + '</td><td class="c">' + r.d + '</td>' +
          '<td class="c">' + pctText(r.pct, r.w, r.l) + '</td><td class="c">' + (r.rf - r.ra > 0 ? '+' : '') + (r.rf - r.ra) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function cardLine(state, c) {
    const g = c.games.map((x) => x.a + '-' + x.b + (x.inn > 9 ? '<small>(' + x.inn + ')</small>' : '')).join('　');
    const res = c.done ? '決着' : '';
    return '<li class="cardline' + (c.a === state.userUni || c.b === state.userUni ? ' is-me' : '') + '">' +
      '<span class="cardline__t">' + esc(uni(state, c.a)) + ' <b>' + c.winsA + '</b> - <b>' + c.winsB + '</b> ' + esc(uni(state, c.b)) +
      (c.draws ? '<small>（' + c.draws + '分）</small>' : '') + '</span>' +
      '<span class="cardline__g">' + g + '</span>' +
      (c.done ? '<span class="cardline__w">' + res + ' 勝ち点 → ' + esc(uni(state, c.winner)) + '</span>' : '') + '</li>';
  }

  /* ---------- リーグ戦の節 ---------- */

  function round(state, h) {
    const card = Engine.currentCard(state);
    const isPO = /_PLAYOFF$/.test(state.phase);
    const se = state.season;
    const div = Universities.divOf(state, state.userUni);
    const opp = card ? (card.a === state.userUni ? card.b : card.a) : null;
    const mineA = card && card.a === state.userUni;
    const h2h = opp && state.records.h2h[opp];
    const title = isPO
      ? '入れ替え戦　' + card.upperDiv + '部・' + (card.upperDiv + 1) + '部'
      : Engine.leagueName(state) + '　第' + (se.round + 1) + '節';
    const lead = isPO
      ? (card.upper === state.userUni ? card.upperDiv + '部残留をかけて、' + (card.upperDiv + 1) + '部優勝校と戦う。2勝した側が来季' + card.upperDiv + '部。' : card.upperDiv + '部昇格をかけて、' + card.upperDiv + '部最下位校と戦う。2勝した側が来季' + card.upperDiv + '部。')
      : '対戦は2勝先取。引き分けは数えず、どちらかが2勝するまで続く。カードを取ると勝ち点1。';
    show(
      '<h2 class="section-title">' + esc(title) + '</h2>' +
      '<div class="vsbox">' +
        '<p class="vsbox__vs">' + esc(state.team.name) + '　<i>対</i>　<b>' + esc(uni(state, opp)) + '</b></p>' +
        '<p class="vsbox__card">このカード　<b>' + (mineA ? card.winsA : card.winsB) + '勝' + (mineA ? card.winsB : card.winsA) + '敗' + (card.draws ? card.draws + '分' : '') + '</b>' +
          (h2h ? '　<span class="muted">通算対戦 ' + h2h.w + '勝' + h2h.l + '敗' + h2h.d + '分</span>' : '') + '</p>' +
        '<p class="note">' + esc(lead) + '</p>' +
        '<div class="actions">' +
          '<button type="button" class="btn btn--primary btn--wide" id="r-go">第' + (card.games.length + 1) + '戦の試合前へ</button>' +
          '<button type="button" class="btn" id="r-lineup">オーダー変更</button>' +
        '</div>' +
      '</div>' +
      (isPO ? '' :
        '<h3 class="sub">' + div + '部　順位表（第' + se.round + '節終了時点）</h3>' + standingsTable(state, se, div)) +
      (isPO ? '' : '<h3 class="sub">この節の対戦</h3><ul class="cardlist">' +
        (se.schedule[div][se.round] || []).map((k) => cardLine(state, se.cards[k])).join('') + '</ul>'),
      (root) => { on(root, '#r-go', h.go); on(root, '#r-lineup', h.lineup); });
  }

  /** カードが終わった。自分のカードの結果と、他の大学の結果 */
  function cardEnd(state, h) {
    const isPO = /_PLAYOFF$/.test(state.phase);
    const card = Engine.currentCard(state);
    const won = card.winner === state.userUni;
    const se = state.season;
    const div = Universities.divOf(state, state.userUni);
    const others = isPO ? '' : [1, 2, 3].map((d) =>
      '<h4 class="sub">' + d + '部</h4><ul class="cardlist">' + (se.schedule[d][se.round] || []).map((k) => cardLine(state, se.cards[k])).join('') + '</ul>').join('');
    show(
      '<div class="cardend ' + (won ? 'is-win' : 'is-lose') + '">' +
        '<p class="cardend__eyebrow">' + esc(isPO ? '入れ替え戦' : Engine.leagueName(state) + '　第' + (se.round + 1) + '節') + '</p>' +
        '<h2 class="cardend__title">' + (won ? 'カードを取った' : 'カードを落とした') + '</h2>' +
        '<ul class="cardlist">' + cardLine(state, card) + '</ul>' +
        (isPO ? '' : '<p class="note">' + (won ? '勝ち点1を獲得。' : '勝ち点は相手に。') + '</p>') +
      '</div>' +
      (isPO ? '' : '<h3 class="sub">' + div + '部　順位表</h3>' + standingsTable(state, se, div) +
        '<details class="rosterbox"><summary>この節の全カードの結果</summary>' + others + '</details>') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="c-next">' +
        (isPO ? '入れ替え戦の結果へ' : (se.round >= 4 ? 'リーグ戦の最終結果へ' : '第' + (se.round + 2) + '節へ')) + '</button></div>',
      (root) => on(root, '#c-next', h.next));
  }

  /** リーグ戦の最終順位と入れ替え戦 */
  function final(state, h) {
    const se = state.season;
    const info = state.seasonInfo;
    const me = League.rankOfTeam(se, state.userUni);
    const po = state.playoffs || [];
    const mine = po.find((c) => c.a === state.userUni || c.b === state.userUni);
    const msg = info.disband ? '3部最下位。' :
      me.div === 1 && me.rank === 1 ? '1部優勝！ ' + (state.term === 'spring' ? state.names.springNational : state.names.fallNational) + 'への出場が決まった。' :
      mine && !mine.done ? '入れ替え戦に回る。' : me.div + '部' + me.rank + '位。';
    const poHtml = po.map((c) => '<li class="cardline' + (c === mine ? ' is-me' : '') + '"><span class="cardline__t">' +
      c.upperDiv + '部6位 ' + esc(uni(state, c.upper)) + ' 対 ' + (c.upperDiv + 1) + '部1位 ' + esc(uni(state, c.lower)) + '</span>' +
      (c.done ? '<span class="cardline__w">' + c.winsA + '-' + c.winsB + (c.draws ? '（' + c.draws + '分）' : '') + '　→ ' + esc(uni(state, c.winner)) + 'が' + c.upperDiv + '部へ</span>' : '<span class="cardline__w">これから</span>') +
      '</li>').join('');
    show(
      '<h2 class="section-title">' + esc(Engine.leagueName(state)) + '　最終順位</h2>' +
      '<p class="section-lead finalmsg">' + esc(msg) + '</p>' +
      [me.div].concat([1, 2, 3].filter((d) => d !== me.div)).map((d) =>
        '<h3 class="sub">' + d + '部' + (d === me.div ? '（自校）' : '') + '</h3>' + standingsTable(state, se, d, { final: true })).join('') +
      '<h3 class="sub">入れ替え戦</h3><ul class="cardlist">' + poHtml + '</ul>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="f-next">' +
        (info.disband ? '次へ' : mine && !mine.done ? '入れ替え戦へ' : '次へ') + '</button></div>',
      (root) => on(root, '#f-next', h.next));
    if (me.div === 1 && me.rank === 1) {
      UI.curtain('<b>' + esc(state.names.league) + '</b><span>1部優勝</span>', () => {});
    }
  }

  /* ---------- 全国大会 ---------- */

  function bracket(state, nat) {
    return nat.rounds.map((list, r) => {
      const res = nat.results[r] || [];
      const pairs = [];
      for (let i = 0; i < list.length; i += 2) {
        const a = nat.teams[list[i]], b = nat.teams[list[i + 1]];
        const g = res[i / 2];
        const me = list[i] === state.userUni || list[i + 1] === state.userUni;
        pairs.push('<li class="bk__m' + (me ? ' is-me' : '') + '">' +
          '<span class="' + (g && g.winner === a.id ? 'w' : '') + '">' + esc(a.name) + '</span>' +
          '<b>' + (g ? g.ra + '-' + g.rb : 'vs') + '</b>' +
          '<span class="' + (g && g.winner === b.id ? 'w' : '') + '">' + esc(b.name) + '</span></li>');
      }
      return '<div class="bk__r"><h4>' + National.roundName(r) + '</h4><ul>' + pairs.join('') + '</ul></div>';
    }).join('') + (nat.done ? '<div class="bk__r"><h4>優勝</h4><ul><li class="bk__m is-champ"><span class="w">' + esc(nat.teams[nat.champion].name) + '</span></li></ul></div>' : '');
  }

  function nationalOpen(state, h) {
    const nat = state.national;
    const opp = nat.teams[National.opponentOf(nat, state.userUni)];
    const first = nat.round === 0 && !(nat.results[0] || []).length;
    show(
      '<div class="opening">' +
        '<p class="opening__eyebrow">' + esc(state.year + '年度 ' + (state.term === 'spring' ? '春' : '秋')) + '</p>' +
        '<h2 class="opening__title">' + esc(nat.name) + '</h2>' +
        '<p class="opening__lead">' + (first ? '全国の各リーグを勝ち抜いた16校が集う。' : '') +
          esc(National.roundName(nat.round)) + 'の相手は <b>' + esc(opp.name) + '</b>（' + esc(opp.league) + '）。</p>' +
      '</div>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="n-go">試合前へ</button>' +
        '<button type="button" class="btn" id="n-lineup">オーダー変更</button></div>' +
      '<h3 class="sub">組み合わせ</h3><div class="bracket">' + bracket(state, nat) + '</div>',
      (root) => { on(root, '#n-go', h.go); on(root, '#n-lineup', h.lineup); });
    if (first) UI.curtain('<b>' + esc(nat.name) + '</b><span>開幕</span>', () => {});
  }

  function nationalEnd(state, h) {
    const nat = state.national;
    const champ = nat.champion === state.userUni;
    const head = champ
      ? Screens.champHtml(state.year + '年度 ' + (state.term === 'spring' ? '春' : '秋'), nat.name + ' 優勝', state.team.name,
          '', '大学日本一。' + state.team.name + 'の名が全国に響いた。', state.team, '日本一')
      : '<div class="cardend is-lose"><p class="cardend__eyebrow">' + esc(nat.name) + '</p>' +
        '<h2 class="cardend__title">' + esc(National.resultText(nat)) + '</h2>' +
        '<p class="note">優勝は ' + esc(nat.teams[nat.champion].name) + '。</p></div>';
    show(head +
      '<h3 class="sub">組み合わせ</h3><div class="bracket">' + bracket(state, nat) + '</div>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="n-next">シーズンを終える</button></div>',
      (root) => on(root, '#n-next', h.next));
    if (champ) UI.curtain('<b>' + esc(nat.name) + '</b><span>優勝 日本一</span>', () => {});
  }

  /* ---------- 不祥事・出来事 ---------- */

  function pending(state, item, h) {
    const isInc = item.type === 'incident';
    const sevText = isInc ? ['', '軽微', 'やや重い', '重大', 'かなり重大', '極めて重大'][item.sev] : '';
    show(
      '<div class="incident' + (isInc ? ' is-incident' : '') + '">' +
        '<p class="incident__eyebrow">' + (isInc ? '部内で問題が起きた' : '出来事') + '</p>' +
        '<p class="incident__text">' + esc(item.text) + '</p>' +
        (isInc ? '<p class="incident__meta">関わった部員：' + item.names.map(esc).join('・') + '　／　事の重さ：' + sevText + '</p>' +
          '<p class="note">監督としての対応を選んでください。対応によって、処分の重さ・本人の変わり方・チームの空気・大学の評判が変わります。結果は選ぶまで分かりません。</p>' : '') +
        (item.options
          ? '<div class="choices">' + item.options.map((o) => '<button type="button" class="btn btn--wide choice" data-k="' + o.key + '">' + esc(o.label) + '</button>').join('') + '</div>'
          : '<div class="actions"><button type="button" class="btn btn--primary btn--wide" data-k="">続ける</button></div>') +
      '</div>',
      (root) => on(root, '[data-k]', (b) => h.answer(b.dataset.k || null)));
  }

  function pendingResult(state, res, h) {
    show(
      '<div class="incident">' +
        '<p class="incident__eyebrow">' + (res.type === 'incident' ? '対応の結果' : '結果') + '</p>' +
        '<p class="incident__text">' + esc(res.text) + '</p>' +
        (res.choice ? '<p class="incident__meta">監督の判断：' + esc((res.options.find((o) => o.key === res.choice) || {}).label || '') + '</p>' : '') +
        '<ul class="incident__lines">' + (res.lines || []).map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
        '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="pr-next">続ける</button></div>' +
      '</div>',
      (root) => on(root, '#pr-next', h.next));
  }

  /* ---------- スカウト ---------- */

  function scouting(state, h) {
    const sc = state.scouting;
    const pres = Records.prestige(state);
    const card = (c) => {
      const p = c.player;
      const isPit = p.kind === 'pitcher';
      const ab = isPit
        ? '球速 ' + Scouting.veloText(c) + '　制球 ' + Scouting.abilityText(c, 'control') + '　スタミナ ' + Scouting.abilityText(c, 'stamina')
        : ['meet', 'power', 'speed', 'arm', 'field', 'catch'].map((k) => ({ meet: 'ミート', power: 'パワー', speed: '走力', arm: '肩', field: '守備', catch: '捕球' })[k] + ' ' + Scouting.abilityText(c, k)).join('　');
      const flags = [
        p.koshien ? esc(state.names.hsNational) + '出場' : esc(state.names.hsNational) + '出場なし',
        p.hsCaptain ? '主将経験あり' : '',
        c.proWish ? '<b class="flag flag--pro">プロ志望</b>' : '',
        c.shakaiWish ? '<b class="flag">社会人志望</b>' : '',
      ].filter(Boolean).join('　');
      return '<article class="scout' + (c.offered ? ' is-offered' : '') + (sc.special === c.id ? ' is-special' : '') + '">' +
        '<header class="scout__head">' +
          '<span class="scout__tier tier-' + c.tier + '">' + (c.tier === 'S' ? '超高校級' : c.tier === 'A' ? '注目株' : c.tier === 'B' ? '有望' : '素材') + '</span>' +
          '<b class="scout__name">' + esc(p.name) + '</b>' +
          '<span>' + (isPit ? '投手' : posName(p.pos)) + '　' + UI.handMark(p) + '　' + p.height + 'cm・' + p.weight + 'kg</span>' +
          '<span class="muted">' + esc(p.hs) + '</span>' +
        '</header>' +
        '<p class="scout__ab">' + ab + '</p>' +
        '<p class="scout__flags">' + flags + '</p>' +
        '<dl class="scout__grid">' +
          '<div><dt>性格</dt><dd>' + esc(Scouting.personalityText(c)) + '</dd></div>' +
          '<div><dt>素行</dt><dd>' + esc(Scouting.conductText(c)) + '</dd></div>' +
          '<div><dt>成長力</dt><dd>' + esc(Scouting.growthText(c)) + '</dd></div>' +
          '<div><dt>将来性</dt><dd>' + esc(Scouting.futureText(c)) + '</dd></div>' +
        '</dl>' +
        '<ul class="eplist">' + c.seen.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' +
        '<footer class="scout__foot">' +
          '<span class="scout__look">視察 ' + c.look + '/' + Scouting.MAX_LOOK + '</span>' +
          (c.offered ? '<span class="scout__feel">手応え：' + Scouting.feel(state, sc, c) + '</span>' : '') +
          '<button type="button" class="btn btn--small" data-look="' + c.id + '"' + (sc.points <= 0 || c.look >= Scouting.MAX_LOOK ? ' disabled' : '') + '>視察する</button>' +
          '<button type="button" class="btn btn--small' + (c.offered ? ' btn--on' : '') + '" data-offer="' + c.id + '">' + (c.offered ? '推薦枠を取り下げる' : '推薦枠を提示') + '</button>' +
          (c.offered ? '<button type="button" class="btn btn--small' + (sc.special === c.id ? ' btn--on' : '') + '" data-special="' + c.id + '">' + (sc.special === c.id ? '特待生をやめる' : '特待生にする') + '</button>' : '') +
        '</footer>' +
      '</article>';
    };
    show(
      '<h2 class="section-title">新入生スカウト</h2>' +
      '<p class="section-lead">高校3年生の有望選手を視察し、推薦枠を提示します。来るかどうかは秋の終わりに決まります。</p>' +
      '<div class="scoutbar">' +
        '<span>視察できる回数 <b>' + sc.points + '</b> / ' + Scouting.POINTS + '</span>' +
        '<span>推薦枠 <b>' + sc.offers + '</b> / ' + CONFIG.ROSTER.REC_SLOTS + '</span>' +
        '<span>特待生 <b>' + (sc.special ? 1 : 0) + '</b> / 1</span>' +
        '<span>大学の評価 <b>' + Records.prestigeRank(pres) + '</b>（' + pres + '）</span>' +
      '</div>' +
      '<p class="note">情報は視察するほど確かになります（「？」は見立てに自信がないもの）。強い選手ほど他大学・プロ・社会人と取り合いになり、' +
        'プロ志望の選手はドラフトで指名されればプロへ進みます。大学の評価（プロ輩出・全国大会・リーグ優勝・最近の成績）が高いほど選ばれやすくなります。</p>' +
      '<div class="scoutlist">' + sc.cands.map(card).join('') + '</div>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="s-done">スカウトを終えて秋リーグへ</button></div>',
      (root) => {
        on(root, '[data-look]', (b) => h.look(b.dataset.look));
        on(root, '[data-offer]', (b) => h.offer(b.dataset.offer));
        on(root, '[data-special]', (b) => h.special(b.dataset.special));
        on(root, '#s-done', h.done);
      });
  }

  /* ---------- 引退（4年間の振り返り） ---------- */

  function retirement(state, h) {
    const list = College.retiring(state).map((p) => College.farewell(state, p));
    const cards = list.length ? list.map((f) => {
      const p = f.player;
      const isPit = p.kind === 'pitcher';
      const path = f.path || {};
      const pathText = path.kind === 'pro'
        ? Pro.teamName(state, path.team) + '　' + path.text
        : path.kind === 'shakai' ? path.company + '（社会人野球）' : (path.text || '');
      const seasonsLine = f.seasons.map((s) => s.y + (s.t === 'spring' ? '春' : '秋') + ' ' + (isPit ? s.s.w + '勝' + s.s.l + '敗' : '打率' + UI.avg(s.s.h, s.s.ab))).join(' / ');
      return '<article class="retire' + (path.kind === 'pro' ? ' is-draft' : '') + '">' +
        '<header class="retire__head">' +
          '<h3><button type="button" class="linkbtn retire__name" data-pid="' + p.id + '">' + esc(p.name) + '</button></h3>' +
          '<span>' + (isPit ? '投手' : posName(p.pos)) + '　' + UI.handMark(p) + '　' + (p.enrolled || '') + '年入学' +
          (p.wasCaptain ? '　<b class="capmark">主将</b>' : '') + (p.awakened ? '　<b class="awake">覚醒</b>' : '') + '</span>' +
          '<em class="retire__draft">' + esc(pathText) + '</em></header>' +
        '<p class="retire__abil">' + (isPit
          ? '最速 ' + p.velo + 'km/h　制球 ' + rankOf(p.control) + ' ' + p.control + '　スタミナ ' + rankOf(p.stamina) + ' ' + p.stamina
          : 'ミート ' + rankOf(p.meet) + ' ' + p.meet + '　パワー ' + rankOf(p.power) + ' ' + p.power + '　走力 ' + rankOf(p.speed) + ' ' + p.speed + '　守備 ' + rankOf(p.field) + ' ' + p.field) + '</p>' +
        (isPit ? UI.careerPitLine(p.career) : UI.careerBatLine(p.career)) +
        (seasonsLine ? '<p class="retire__seasons">' + esc(seasonsLine) + '</p>' : '<p class="note">公式戦の出場はなかった。</p>') +
        ((p.titles || p.japan) ? '<p class="retire__titles">リーグ優勝 ' + (p.titles || 0) + '回' + (p.japan ? '　日本一 ' + p.japan + '回' : '') + '</p>' : '') +
        (f.hist.length ? '<h4 class="sub">4年間の歩み</h4><ol class="histlist">' + f.hist.slice(-8).map((x) => '<li>' + esc(x.text) + '</li>').join('') + '</ol>' : '') +
        (f.top.length ? '<h4 class="sub">活躍シーン</h4><ol class="hllist">' + f.top.map((x) => '<li><span class="hl__where">' + esc(x.where) + '</span><span class="hl__line">' + esc(x.line) + '</span></li>').join('') + '</ol>' : '') +
      '</article>';
    }).join('') : '<p class="note">今年引退する4年生はいません。</p>';
    const pros = list.filter((f) => f.path && f.path.kind === 'pro').length;
    show(
      '<h2 class="section-title">' + state.year + '年度　引退</h2>' +
      '<p class="section-lead">' + list.length + '人の4年生が引退します。' + (pros ? 'うち' + pros + '人がプロへ。' : '') + '名前を押すと詳しく見られます。</p>' +
      cards +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="rt-next">4年生を送り出し、翌年度へ</button></div>',
      (root) => {
        on(root, '.retire__name', (b) => { const p = Team.find(state.team, b.dataset.pid); if (p) UI.openPlayer(p, { team: state.team, state, rename: false }); });
        on(root, '#rt-next', h.next);
      });
  }

  /* ---------- 新入生 ---------- */

  function arrivals(state, h) {
    const a = state.arrivals || { joined: [], lost: [] };
    const joined = a.joined.map((id) => Team.find(state.team, id)).filter(Boolean);
    const need = state.newNeed || { bat: 0, pit: 0 };
    show(
      '<h2 class="section-title">' + state.year + '年度　新入生入部</h2>' +
      '<h3 class="sub">推薦で入部した新入生（' + joined.length + '人）</h3>' +
      (joined.length ? UI.rosterTable(joined, { college: true, state }) : '<p class="note">推薦で来てくれた選手はいませんでした。</p>') +
      (a.over > 0 ? '<p class="note">1学年の上限のため、' + a.over + '人は受け入れられませんでした。</p>' : '') +
      (a.lost.length ? '<h3 class="sub">他の進路を選んだ有望選手</h3><ul class="lostlist">' + a.lost.map((x) =>
        '<li><b>' + esc(x.name) + '</b>（' + (x.kind === 'pitcher' ? '投手' : posName(x.pos)) + '・' + x.tier + '）' + (x.offered ? '<i class="tag">推薦枠を提示</i>' : '') + ' → ' + esc(x.text) + '</li>').join('') + '</ul>' : '') +
      '<h3 class="sub">一般入部</h3>' +
      (need.bat + need.pit > 0
        ? '<p class="note">あと野手' + need.bat + '人・投手' + need.pit + '人ぶんの空きがあります。次の画面で一般入部の組を選びます。</p>'
        : '<p class="note">部員は足りています。一般入部の募集は行いません。</p>') +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="ar-next">' + (need.bat + need.pit > 0 ? '一般入部の新入生を選ぶ' : '春の特訓へ') + '</button></div>',
      (root) => {
        on(root, 'tr.prow', (b) => { const p = Team.find(state.team, b.dataset.pid); if (p) UI.openPlayer(p, { team: state.team, state }); });
        on(root, '#ar-next', h.next);
      });
  }

  /* ---------- チーム ---------- */

  function team(state, h) {
    const t = state.team;
    const risk = Incidents.teamRisk(state);
    const cap = Team.captain(t);
    const byGrade = [1, 2, 3, 4].map((g) => Team.all(t).filter((p) => p.grade === g).length);
    show(
      '<h2 class="section-title">チーム　' + esc(t.name) + '</h2>' +
      '<div class="teamsum">' +
        '<div><dt>チーム力</dt><dd>' + College.strength(state) + '</dd></div>' +
        '<div><dt>部員</dt><dd>' + Team.all(t).length + '人（' + byGrade.map((n, i) => (i + 1) + '年' + n).join('・') + '）</dd></div>' +
        '<div><dt>キャプテン</dt><dd>' + (cap ? esc(cap.name) + '（' + cap.grade + '年）' : '未定') + '</dd></div>' +
        '<div><dt>チームの雰囲気</dt><dd>' + Persona.grade5(t.morale || 55) + '（' + Math.round(t.morale || 55) + '）</dd></div>' +
        '<div><dt>素行に注意が要る部員</dt><dd>' + risk.problems + '人</dd></div>' +
        '<div><dt>大学の評価</dt><dd>' + Records.prestigeRank(Records.prestige(state)) + '</dd></div>' +
      '</div>' +
      (h.lineup ? '<div class="actions"><button type="button" class="btn" id="t-lineup">オーダー変更</button>' +
        (h.captain ? '<button type="button" class="btn" id="t-captain">キャプテンを変える</button>' : '') + '</div>' : '') +
      '<p class="note">選手を押すと能力・性格・エピソード・シーズン別成績・歩みを見られます。名前もそこで変えられます。' +
        '「性格」は1年いっしょに過ごすと分かります。</p>' +
      '<h3 class="sub">野手</h3><div id="tm-bat"></div><h3 class="sub">投手</h3><div id="tm-pit"></div>' +
      '<div class="actions"><button type="button" class="btn btn--wide" id="t-back">戻る</button></div>',
      (root) => {
        const open = (pid) => { const p = Team.find(t, pid); if (p) UI.openPlayer(p, { team: t, state, hsNational: state.names.hsNational, onRename: h.renamed }); };
        UI.rosterPanel(UI.el('tm-bat'), t.batters, { team: t, onRow: open, college: true, state });
        UI.rosterPanel(UI.el('tm-pit'), t.pitchers, { team: t, onRow: open, college: true, state });
        on(root, '#t-lineup', h.lineup || (() => {}));
        on(root, '#t-captain', h.captain || (() => {}));
        on(root, '#t-back', h.back);
      });
  }

  /* ---------- リーグ ---------- */

  function league(state, h) {
    const se = state.season && !state.season.done ? state.season : null;
    const last = state.season;
    const tables = [1, 2, 3].map((d) => {
      const ids = state.divisions[d];
      const tbl = (last && last.divs[d]) ? standingsTable(state, last, d, { final: last.done }) :
        '<ul class="unilist">' + ids.map((id) => '<li' + (id === state.userUni ? ' class="is-me"' : '') + '>' + esc(uni(state, id)) + '</li>').join('') + '</ul>';
      return '<h3 class="sub">' + d + '部' + (last && last.divs[d] ? '（' + (last.year) + '年' + (last.term === 'spring' ? '春' : '秋') + (last.done ? '・最終' : '・第' + last.round + '節終了') + '）' : '') + '</h3>' + tbl;
    }).join('');
    const nextDivs = '<details class="rosterbox"><summary>来季（現在）の所属</summary>' + [1, 2, 3].map((d) =>
      '<p><b>' + d + '部</b>：' + state.divisions[d].map((id) => (id === state.userUni ? '<b>' + esc(uni(state, id)) + '</b>' : esc(uni(state, id)))).join('、') + '</p>').join('') + '</details>';
    const rivals = Records.rivals(state);
    const myDiv = Universities.divOf(state, state.userUni);
    const rostered = Object.keys(state.rosters || {});
    const rosterBtns = rostered.length
      ? '<h3 class="sub">' + myDiv + '部の大学の部員</h3><p class="note">同じ部の5校は部員を記録しています。選手は年をまたいで残り、成長し、卒業していきます。</p>' +
        '<div class="unibtns">' + rostered.map((id) => {
          const h = state.records.h2h[id];
          return '<button type="button" class="btn btn--small" data-roster="' + id + '">' + esc(uni(state, id)) +
            (h ? '<small>　通算' + h.w + '勝' + h.l + '敗' + h.d + '分</small>' : '') + '</button>';
        }).join('') + '</div>'
      : '';
    show(
      '<h2 class="section-title">' + esc(state.names.league) + '</h2>' +
      '<p class="section-lead">18大学・3部制。各部6校の総当たりで、カードは2勝先取。順位は 勝ち点 → 勝率 → 直接対決 → 得失点差 → 抽選。</p>' +
      (se ? '<p class="note">いまは第' + (se.round + 1) + '節。</p>' : '') +
      tables + rosterBtns + nextDivs +
      (rivals.length ? '<h3 class="sub">ライバル</h3><ul class="rivals">' + rivals.map((r) => '<li><b>' + esc(uni(state, r.id)) + '</b>　通算 ' + r.w + '勝' + r.l + '敗' + r.d + '分</li>').join('') + '</ul>' : '') +
      '<div class="actions"><button type="button" class="btn btn--wide" id="l-back">戻る</button></div>',
      (root) => {
        on(root, '#l-back', h.back);
        on(root, '[data-roster]', (b) => rivalRoster(state, b.dataset.roster));
      });
  }

  /** 同じ部の大学の部員一覧（ふきだし） */
  function rivalRoster(state, id) {
    const t = Rivals.get(state, id);
    if (!t) return;
    const cap = Team.captain(t);
    const byGrade = [1, 2, 3, 4].map((g) => Team.all(t).filter((p) => p.grade === g).length);
    const draw = () => {
      UI.closeModal.back = null;
      UI.modal('<h3 class="modal__title">' + esc(uni(state, id)) + '</h3>' +
        '<p class="time__where">チーム力 ' + Team.strength(t) + '　部員' + Team.all(t).length + '人（' + byGrade.map((n, i) => (i + 1) + '年' + n).join('・') + '）' +
          (cap ? '　主将 ' + esc(cap.name) : '') + '</p>' +
        '<h4 class="sub">野手</h4>' + UI.rosterTable(t.batters, { team: t }) +
        '<h4 class="sub">投手</h4>' + UI.rosterTable(t.pitchers, { team: t }),
        { kind: 'roster', onOpen(body) {
          body.querySelectorAll('tr.prow').forEach((tr) => tr.addEventListener('click', () => {
            const p = Team.find(t, tr.dataset.pid);
            if (!p) return;
            UI.modal(UI.playerDetail(p, { rename: false, team: t, state }) +
              '<div class="actions actions--modal"><button type="button" class="btn" id="rv-back">部員一覧に戻る</button></div>',
              { kind: 'player', onOpen(b2) { b2.querySelector('#rv-back').addEventListener('click', draw); } });
            UI.closeModal.back = draw;
          }));
        } });
    };
    draw();
  }

  /* ---------- 成績 ---------- */

  function records(state, h) {
    const R = state.records;
    const T = R.team;
    const tot = T.w + T.l;
    const seasons = R.seasons.slice().reverse().map((s) =>
      '<tr class="' + (s.champion ? 'is-gold' : '') + '"><td>' + s.year + (s.term === 'spring' ? '春' : '秋') + '</td><td class="c">' + s.div + '部</td>' +
      '<td class="c">' + s.rank + '位</td><td class="c">' + s.points + '</td><td class="c">' + s.w + '-' + s.l + '-' + s.d + '</td>' +
      '<td>' + (s.playoff ? s.playoff.result + '（' + s.playoff.w + '勝' + s.playoff.l + '敗）' : (s.disband ? '解散' : '')) + '</td>' +
      '<td>' + (s.national ? esc(s.national.name) + ' ' + esc(s.national.result) : '') + '</td>' +
      '<td class="c">' + (s.national && s.national.champion ? '日本一' : '') + '</td>' +
      '<td class="c">' + (s.nextDiv || '') + '部</td></tr>').join('');
    const pros = R.pros.slice().reverse().map((p) => '<tr><td>' + p.year + '</td><td class="nm">' + esc(p.name) + '</td><td>' + (p.kind === 'pitcher' ? '投手' : posName(p.pos)) + '</td><td>' + esc(Pro.teamName(state, p.team)) + '</td><td>' + esc(p.text) + '</td></tr>').join('');
    const alumni = R.alumni.slice(-60).reverse().map((a) => {
      const c = a.career || {};
      const line = a.kind === 'pitcher' ? (c.w || 0) + '勝' + (c.l || 0) + '敗 防' + UI.era(c.er || 0, c.outs || 0) : '打率' + UI.avg(c.h || 0, c.ab || 0) + ' ' + (c.hr || 0) + '本';
      return '<tr><td>' + (a.enrolled || '') + '〜' + a.left + '</td><td class="nm">' + esc(a.name) + '</td><td>' + (a.kind === 'pitcher' ? '投手' : posName(a.pos)) + '</td>' +
        '<td>' + line + '</td><td>' + esc(a.why) + (a.path && a.path.kind === 'pro' ? '（' + esc(a.path.text) + '）' : '') + (a.captain ? '・主将' : '') + (a.incidents ? '・不祥事' + a.incidents : '') + '</td></tr>';
    }).join('');
    const soccer = (R.soccerSeasons || []).map((s) => '<tr><td>' + s.year + '冬</td><td class="c">' + s.div + '部</td><td class="c">' + s.rank + '位</td><td class="c">' + s.w + '-' + s.d + '-' + s.l + '</td><td>' + (s.national || '') + '</td></tr>').join('');
    const pro = (R.proSeasons || []).map((s) => '<tr><td>' + s.no + '年目（' + s.year + '）</td><td class="c">' + s.w + '-' + s.l + '-' + s.d + '</td><td>' + esc(s.result) + '</td></tr>').join('');
    const yrs = T.div;
    show(
      '<h2 class="section-title">成績</h2>' +
      '<div class="teamsum">' +
        '<div><dt>通算</dt><dd>' + T.w + '勝' + T.l + '敗' + T.d + '分（勝率' + (tot ? (T.w / tot).toFixed(3).replace(/^0/, '') : '.---') + '）</dd></div>' +
        '<div><dt>リーグ優勝（1部）</dt><dd>' + T.titles + '回</dd></div>' +
        '<div><dt>全国大会</dt><dd>出場' + T.natApps + '回・優勝' + T.natTitles + '回</dd></div>' +
        '<div><dt>在籍年数</dt><dd>1部 ' + yrs[1] + '年・2部 ' + yrs[2] + '年・3部 ' + yrs[3] + '年</dd></div>' +
        '<div><dt>プロ輩出</dt><dd>' + T.pros + '人</dd></div>' +
        '<div><dt>連続リーグ優勝</dt><dd>現在 ' + (state.streak || 0) + '季・最長 ' + (state.bestStreak || 0) + '季</dd></div>' +
      '</div>' +
      '<h3 class="sub">シーズンごとの成績</h3>' +
      (seasons ? '<div class="tablewrap"><table class="box seasons"><thead><tr><th>シーズン</th><th>所属</th><th>順位</th><th>勝ち点</th><th>勝-敗-分</th><th>入れ替え戦</th><th>全国大会</th><th>日本一</th><th>翌季</th></tr></thead><tbody>' + seasons + '</tbody></table></div>' : '<p class="note">まだシーズンを終えていません。</p>') +
      '<h3 class="sub">プロ入りした選手</h3>' +
      (pros ? '<div class="tablewrap"><table class="box"><thead><tr><th>年度</th><th class="nm">選手</th><th>位置</th><th>指名球団</th><th>順位</th></tr></thead><tbody>' + pros + '</tbody></table></div>' : '<p class="note">まだいません。</p>') +
      '<h3 class="sub">OB（引退・退部した選手）</h3>' +
      (alumni ? '<div class="tablewrap"><table class="box"><thead><tr><th>在籍</th><th class="nm">選手</th><th>位置</th><th>通算</th><th>進路など</th></tr></thead><tbody>' + alumni + '</tbody></table></div>' : '<p class="note">まだいません。</p>') +
      (soccer ? '<h3 class="sub">サッカー部の成績</h3><div class="tablewrap"><table class="box"><thead><tr><th>シーズン</th><th>所属</th><th>順位</th><th>勝-分-敗</th><th>全国</th></tr></thead><tbody>' + soccer + '</tbody></table></div>' : '') +
      (pro ? '<h3 class="sub">プロ野球の成績</h3><div class="tablewrap"><table class="box"><thead><tr><th>シーズン</th><th>勝-敗-分</th><th>結果</th></tr></thead><tbody>' + pro + '</tbody></table></div>' : '') +
      '<div class="actions"><button type="button" class="btn btn--wide" id="rc-back">戻る</button></div>',
      (root) => on(root, '#rc-back', h.back));
  }

  /* ---------- 年表 ---------- */

  function history(state, h) {
    const list = state.records.chronicle.slice().reverse();
    show(
      '<h2 class="section-title">年表</h2>' +
      '<p class="section-lead">' + esc(Universities.name(state, state.userUni)) + 'の歩み。</p>' +
      '<ol class="chron">' + list.map((c) => '<li class="chron__i k-' + c.kind + '"><span class="chron__y">' + c.y + '年' + '</span><span class="chron__t">' + esc(c.text) + '</span></li>').join('') + '</ol>' +
      ((state.incidentLog || []).length ? '<details class="rosterbox"><summary>不祥事の記録（' + state.incidentLog.length + '件）</summary><ul class="lostlist">' +
        state.incidentLog.slice().reverse().map((i) => '<li>' + i.year + '年' + (i.term === 'spring' ? '春' : '秋') + '　' + esc(i.text) + '　→ ' + esc(i.punish.map((x) => x.name + ' ' + x.label).join('、')) + '</li>').join('') + '</ul></details>' : '') +
      '<div class="actions"><button type="button" class="btn btn--wide" id="h-back">戻る</button></div>',
      (root) => on(root, '#h-back', h.back));
  }

  /* ---------- 設定（名前の変更） ---------- */

  function settings(state, h) {
    const N = state.names;
    const f = (id, label, v, max) => '<label class="field"><span class="field__label">' + esc(label) + '</span>' +
      '<input type="text" id="' + id + '" class="field__input" maxlength="' + (max || 16) + '" value="' + esc(v) + '"></label>';
    const unis = Object.keys(state.unis).map((id) => f('su-' + id, id === state.userUni ? '自分の大学' : '大学（' + (Universities.divOf(state, id) || '') + '部）', state.unis[id].name, 14)).join('');
    const pros = state.proTeamNames.map((n, i) => f('sp-' + i, (i < 6 ? N.proLeagueA : N.proLeagueB) + ' ' + (i % 6 + 1), n, 16)).join('');
    show(
      '<h2 class="section-title">設定</h2>' +
      '<p class="note">名前はいつでも変えられます。内部では大学・選手を番号で管理しているので、名前を変えても成績や履歴は壊れません。選手名は、選手の詳細画面の「名前を変える」から変えられます。</p>' +
      '<h3 class="set-heading">リーグ・大会</h3><div class="form">' +
        f('sn-league', 'リーグの名前', N.league) + f('sn-spring', '春の全国大会', N.springNational) + f('sn-fall', '秋の全国大会', N.fallNational) +
        f('sn-hs', '高校の全国大会（スカウトの経歴に出る）', N.hsNational) +
        f('sn-soccer', 'サッカーのリーグ', N.soccerLeague) + f('sn-soccernat', 'サッカーの全国大会', N.soccerNational) +
      '</div>' +
      '<h3 class="set-heading">大学の名前（18校）</h3><div class="form form--grid">' + unis + '</div>' +
      '<h3 class="set-heading">プロ野球</h3><div class="form">' +
        f('sn-pa', 'リーグ1の名前', N.proLeagueA) + f('sn-pb', 'リーグ2の名前', N.proLeagueB) +
        f('sn-pf', 'リーグ決勝シリーズの名前', N.proLeagueFinal) + f('sn-ps', '頂上シリーズの名前', N.proSeries) +
      '</div><div class="form form--grid">' + pros + '</div>' +
      '<div class="actions">' +
        '<button type="button" class="btn" id="st-back">変えずに戻る</button>' +
        '<button type="button" class="btn btn--primary" id="st-save">保存して戻る</button>' +
      '</div>',
      (root) => {
        on(root, '#st-back', h.back);
        on(root, '#st-save', () => {
          const v = (id, d) => { const n = UI.el(id); return (n && n.value.trim()) || d; };
          N.league = v('sn-league', N.league); N.springNational = v('sn-spring', N.springNational);
          N.fallNational = v('sn-fall', N.fallNational); N.hsNational = v('sn-hs', N.hsNational);
          N.soccerLeague = v('sn-soccer', N.soccerLeague); N.soccerNational = v('sn-soccernat', N.soccerNational);
          N.proLeagueA = v('sn-pa', N.proLeagueA); N.proLeagueB = v('sn-pb', N.proLeagueB);
          N.proLeagueFinal = v('sn-pf', N.proLeagueFinal); N.proSeries = v('sn-ps', N.proSeries);
          Object.keys(state.unis).forEach((id) => { state.unis[id].name = v('su-' + id, state.unis[id].name).slice(0, 14); });
          Object.keys(state.rosters || {}).forEach((id) => { state.rosters[id].name = state.unis[id].name; });
          state.proTeamNames = state.proTeamNames.map((n, i) => v('sp-' + i, n));
          if (state.team) state.team.name = state.unis[state.userUni].name;
          if (state.national) {
            state.national.name = state.term === 'spring' ? N.springNational : N.fallNational;
            if (state.national.teams[state.userUni]) state.national.teams[state.userUni].name = state.unis[state.userUni].name;
          }
          h.saved();
        });
      });
  }

  /* ---------- 解散・プロ参戦 ---------- */

  function disband(state, h) {
    const n = Team.all(state.team).length;
    show(
      '<div class="cardend is-lose">' +
        '<p class="cardend__eyebrow">' + esc(College.termLabel(state)) + '　' + esc(state.names.league) + ' 3部</p>' +
        '<h2 class="cardend__title">野球部、解散</h2>' +
        '<p class="incident__text">3部リーグで最下位に終わった。大学は野球部の解散を決めた。</p>' +
        '<p class="incident__text">だが、部員' + n + '人は誰ひとり大学を去らなかった。キャプテンを中心に話し合い、全員でサッカー部に移ることを決めた。</p>' +
        '<p class="note">ここから「サッカー部」としての物語が始まります。部員はそのまま引き継ぎ、サッカー選手として能力を見直します。' +
          'サッカーのリーグ（3部）から、毎年冬のリーグ戦に挑みます。1部で優勝するか、3シーズンを戦い抜くと、野球部を復活させることもできます。</p>' +
      '</div>' +
      '<div class="actions"><button type="button" class="btn btn--primary btn--wide" id="d-next">サッカー部として歩き出す</button></div>',
      (root) => on(root, '#d-next', h.next));
  }

  function proChoice(state, h) {
    show(
      Screens.champHtml(College.termLabel(state), state.streak + '季連続 リーグ優勝', state.team.name, '',
        '前人未到の' + state.streak + '季連続優勝。' + state.team.name + 'のもとに、プロ野球から参戦の打診が届いた。', null, '') +
      '<div class="incident"><p class="incident__text">プロ野球に参戦しますか？</p>' +
      '<p class="note">参戦すると、いまの部員で架空のプロ野球（' + esc(state.names.proLeagueA) + '・' + esc(state.names.proLeagueB) + '、各6球団）を戦います。相手は大学とは比べものにならないほど強い。' +
        'シーズンが終わるたびに「大学野球へ戻る」を選べます。戻ると、参戦する直前の大学野球の状態に戻ります（プロでの出来事は大学には持ち込みません）。連続優勝の記録もそのまま続きます。</p>' +
      '<div class="choices">' +
        '<button type="button" class="btn btn--primary btn--wide" id="pc-go">プロ野球に参戦する</button>' +
        '<button type="button" class="btn btn--wide" id="pc-stay">大学野球を続ける</button>' +
      '</div></div>',
      (root) => { on(root, '#pc-go', () => h.choose(true)); on(root, '#pc-stay', () => h.choose(false)); });
    UI.curtain('<b>' + state.streak + '季連続</b><span>リーグ優勝</span>', () => {});
  }

  /* ---------- セーブ ---------- */

  function saveBox(cur, list, h) {
    UI.modal(
      '<h3 class="modal__title">セーブ</h3>' +
      '<p class="time__where">いま遊んでいるのは<b>データ' + cur + '</b>です。進行は節目ごとに自動でも保存されます。</p>' +
      '<div class="spick__list">' + list.map((it, i) => {
        const n = i + 1;
        const m = it ? it.meta || {} : null;
        return '<button type="button" class="spick__item' + (n === cur ? ' is-on' : '') + '" data-slot="' + n + '">' +
          '<span class="spick__nm">データ' + n + (n === cur ? '（いまのデータ）' : '') + '</span>' +
          '<span class="spick__meta">' + (m ? esc(m.uni + '　' + [m.league, m.rank].join(' ') + '　' + m.yearNo + '年目「' + m.phase + '」　' + dateText(it.at)) : '空き') + '</span>' +
          '</button>';
      }).join('') + '</div>' +
      '<p class="note">いまのデータ以外を選ぶと、そのデータに上書きして保存し、以後はそちらで遊びます。</p>',
      { kind: 'save', onOpen(body) { body.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => h.pick(+b.dataset.slot, !!list[+b.dataset.slot - 1]))); } });
  }

  return {
    show, slots, newGameForm, status, setNav, standingsTable, round, cardEnd, final, nationalOpen, nationalEnd,
    pending, pendingResult, scouting, retirement, arrivals, team, league, records, history, settings,
    disband, proChoice, saveBox, dateText, bracket,
  };
})();
