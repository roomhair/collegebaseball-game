/* ==================================================
   大学野球  screens.js

   強奪高校野球の screens.js から、チーム作り・特訓・試合前・勝敗・成長の画面を
   そのまま使い、大学向けに見出しや項目だけ直したもの。
   大学独自の画面（リーグ・スカウト・不祥事など）は college-screens.js。
   ================================================== */
'use strict';

const Screens = (() => {

  const esc = UI.esc;

  /* 進行を保存する合図。main.js が入れる。
     キャプテンのように画面の中で決まるものは、ここを通して保存する */
  let onChange = () => {};
  function setOnChange(fn) { onChange = fn || (() => {}); }

  /* ---------- データセット選択 ---------- */

  function gradeText(byGrade) {
    return [1, 2, 3, 4].filter((g) => byGrade[g]).map((g) => g + '年' + byGrade[g] + '人').join('・');
  }

  function pick(opt) {
    UI.el('pick-title').textContent = opt.title;
    UI.el('pick-lead').textContent = opt.lead || '';
    /* 呼び方は画面ごとに変わる（チーム作りなら「チーム1」、新入生なら「候補1」） */
    const setLabel = opt.setLabel || 'チーム';
    const pickLabel = opt.pickLabel || 'このチームにする';

    const html = opt.sets.map((players, i) => {
      const s = College.setSummary(players);
      return '<article class="dataset">' +
        '<header class="dataset__head">' +
          '<h3 class="dataset__no">' + esc(setLabel) + ' ' + (i + 1) + '</h3>' +
          '<p class="dataset__meta">' + s.count + '人　' + gradeText(s.byGrade) +
            '　<span class="dataset__best">主力： ' + esc(s.best.name) + '（' + s.best.grade + '年）</span>' +
            '　<span class="dataset__best">有望株： ' + esc(s.prospect.name) + '（' + s.prospect.grade + '年・成長力' + Persona.grade5(s.prospect.growthRate) + '）</span>' +
            (s.problems ? '　<span class="dataset__warn">素行に不安：' + s.problems + '人</span>' : '') + '</p>' +
          '<button type="button" class="btn btn--primary dataset__pick" data-i="' + i + '">' + esc(pickLabel) + '</button>' +
        '</header>' +
        UI.rosterTable(players, { college: true }) +
      '</article>';
    }).join('');
    UI.html('pick-list', html);

    const list = UI.el('pick-list');
    list.querySelectorAll('.dataset__pick').forEach((b) =>
      b.addEventListener('click', () => opt.onSelect(+b.dataset.i)));
    bindRows(list, (pid) => {
      for (const set of opt.sets) {
        const p = set.find((x) => x.id === pid);
        if (p) { UI.openPlayer(p, { rename: false }); return; }
      }
    });
    UI.show('screen-pick');
  }

  /** 表の行を押したら選手の詳細を開く */
  function bindRows(root, resolve) {
    root.querySelectorAll('tr.prow').forEach((tr) =>
      tr.addEventListener('click', () => resolve(tr.dataset.pid)));
  }

  /* ---------- チーム完成 ---------- */

  function ready(state) {
    const t = state.team;
    const html =
      '<p class="section-lead">' + esc(t.name) + '　部員' + Team.all(t).length + '人　' +
        'チーム力 <b>' + Team.strength(t) + '</b>　' + esc(state.names.league) + ' 2部からのスタート</p>' +
      '<p class="note">キャプテンを決めると特訓に進めます。キャプテンシーの高い選手ほどチームをまとめ、不祥事を起こしにくくします。' +
        '選手を押すと、性格・素行・成長力などが見られます。名前もそこで変えられます。</p>' +
      captainBox(t) +
      lineupCard(t) +
      '<h3 class="sub">野手</h3><div id="ready-bat"></div>' +
      '<h3 class="sub">投手</h3><div id="ready-pit"></div>';
    UI.html('ready-body', html);
    const body = UI.el('ready-body');
    const open = (pid) => {
      const p = Team.find(t, pid);
      if (p) UI.openPlayer(p, { team: t, state, onRename: () => { onChange(); ready(state); } });
    };
    UI.rosterPanel(UI.el('ready-bat'), t.batters, { team: t, onRow: open, college: true, state });
    UI.rosterPanel(UI.el('ready-pit'), t.pitchers, { team: t, onRow: open, college: true, state });
    bindRows(body, open);
    wireCaptain(body, t, () => ready(state));
    gateTraining(t);
    UI.show('screen-ready');
  }

  /** キャプテンの欄。決まっていなければ赤くする。
      leaving を渡すと、そこに入っている選手は「これから引退する」扱いにする */
  function captainBox(t, leaving) {
    const cap = Team.captain(t);
    const out = cap && leaving && leaving.indexOf(cap.id) >= 0;
    const ok = cap && !out;
    return '<div class="capbox' + (ok ? '' : ' is-empty') + '">' +
      '<div class="capbox__label">キャプテン</div>' +
      (ok
        ? '<div class="capbox__name"><b>' + esc(cap.name) + '</b>' +
          '<span>' + cap.grade + '年・' + UI.roleText(t, cap) + '</span></div>'
        : (out
            ? '<div class="capbox__none"><b>' + esc(cap.name) + '</b> は引退します</div>'
            : '<div class="capbox__none">まだ決まっていません</div>')) +
      '<button type="button" class="btn btn--small" id="btn-captain">' +
        (ok ? '変える' : 'キャプテンを決める') + '</button>' +
    '</div>';
  }

  /** キャプテンの欄のボタンをつなぐ */
  function wireCaptain(root, team, onDone, exclude) {
    const b = root.querySelector('#btn-captain');
    if (b) b.addEventListener('click', () => UI.captainPicker(team, () => {
      onChange();          // 決めた時点で保存する
      if (onDone) onDone();
    }, { exclude: exclude }));
  }

  /** キャプテンが決まるまで「特訓へ」を押せなくする */
  function gateTraining(team) {
    const btn = UI.el('btn-ready-next');
    if (!btn) return;
    const ok = !!Team.captain(team);
    btn.disabled = !ok;
    btn.textContent = ok ? '特訓へ' : 'キャプテンを決めてください';
  }

  /** スタメン9人と先発投手。opts.pickable なら先発を選べるようにする */
  function lineupCard(t, opts) {
    opts = opts || {};
    const rows = t.lineup.map((s, i) => {
      const p = Team.find(t, s.pid);
      if (!p) return '';
      return '<tr class="prow" data-pid="' + p.id + '"><td class="c ord">' + (i + 1) + '</td>' +
        '<td class="c">' + posShort(s.pos) + '</td>' +
        '<td class="nm">' + esc(p.name) + '</td>' +
        '<td class="c tiny">' + p.grade + '年</td>' +
        '<td class="c tiny">' + UI.handMark(p) + '</td>' +
        '<td class="c tiny">' + UI.rankNum(p.meet) + ' ' + UI.rankNum(p.power) + ' ' + UI.rankNum(p.speed) + '</td></tr>';
    }).join('');
    /* 数字の列が何なのかは、見出しを付けないと分からない */
    const head =
      '<thead><tr>' +
        '<th class="c">打順</th><th class="c">守備</th><th class="nm">選手</th>' +
        '<th class="c tiny">学年</th><th class="c tiny">投打</th>' +
        '<th class="c tiny">ミート　パワー　走力</th>' +
      '</tr></thead>';
    const sp = Team.find(t, t.rotation[0]);
    return '<div class="lineupcard' + (opts.compact ? ' is-compact' : '') + '">' +
      '<h3 class="lineupcard__title">' + esc(t.name) + '</h3>' +
      '<div class="tablewrap"><table class="lineup">' + head + '<tbody>' + rows + '</tbody></table></div>' +
      (sp ? '<p class="lineupcard__p">先発　' +
        '<button type="button" class="linkbtn pitname" data-pid="' + sp.id + '">' + esc(sp.name) + '</button>' +
        '<span class="spmeta">' +
          sp.grade + '年・' + (sp.throws === 'L' ? '左' : '右') +
          '　球速 <b class="rankval">' + sp.velo + '</b>km/h' +
          '　制球 ' + UI.rankNum(sp.control) +
          '　スタミナ ' + UI.rankNum(sp.stamina) +
          '　' + UI.staminaBar(sp) +
        '</span>' +
        '<span class="spballs">' + pitchText(sp) + '</span>' +
        (opts.pickable ? '<button type="button" class="btn btn--small spchange" id="btn-starter">先発を変える</button>' : '') +
        '</p>' : '') +
      '</div>';
  }

  /** 変化球を「名前＋切れ味」で並べる */
  function pitchText(p) {
    if (!p.pitches || !p.pitches.length) return '―';
    return p.pitches.map((q) =>
      '<span class="pball">' + esc(q.name) + '<b>' + q.level + '</b></span>').join('');
  }

  /** 先発を選ぶポップアップの中身 */
  function starterPicker(t) {
    const rot = (t.rotation || []).map((id) => Team.find(t, id)).filter(Boolean);
    return '<h3 class="modal__title">先発を選ぶ</h3>' +
      '<p class="time__where">スタミナのバーが短い投手は、前の試合の疲れが残っています。</p>' +
      '<div class="spick__list">' + rot.map((p, i) =>
        '<button type="button" class="spick__item' + (i === 0 ? ' is-on' : '') + '" data-pid="' + p.id + '">' +
          '<span class="spick__nm">' + esc(p.name) + '</span>' +
          '<span class="spick__fat">' + UI.staminaBar(p) + '</span>' +
          '<span class="spick__meta">' + p.grade + '年・' + (p.throws === 'L' ? '左' : '右') +
            '　球速 <b class="rankval">' + p.velo + '</b>km/h' +
            '　制球 ' + UI.rankNum(p.control) + '　スタミナ ' + UI.rankNum(p.stamina) + '</span>' +
          '<span class="spick__balls">' + pitchText(p) + '</span>' +
        '</button>').join('') +
      '</div>';
  }

  /* ---------- 特訓期間 ---------- */

  function trainingIntro(state, lead) {
    const t = state.team;
    const cap = Team.captain(t);
    const H = Engine.header(state);
    UI.html('trainintro-body',
      '<p class="nextup__eyebrow">' + esc(H.year + ' ' + H.term) + '</p>' +
      '<h2 class="nextup__title">' + esc(H.phase) + '</h2>' +
      '<p class="nextup__vs">' + esc(lead || '') + '</p>' +
      '<p class="note">練習カードが1枚ずつ出ます。「選択」は' + CONFIG.TRAINING.PICKS + '回、「見送る」は' + CONFIG.TRAINING.PASSES +
        '回まで。練習禁止・ケガの選手には練習が回りません。</p>' +
      captainBox(t) +
      (cap
        ? '<button type="button" class="btn btn--primary btn--wide" id="btn-train-start">特訓を始める</button>'
        : '<p class="capwarn">キャプテンを決めると特訓に進めます</p>'));
    wireCaptain(UI.el('trainintro-body'), t, () => trainingIntro(state, lead));
    UI.show('screen-trainintro');
  }

  /* ---------- 特訓 ---------- */

  function training(state) {
    const st = state.training;
    /* 「いま何回目か」を1始まりで見せる。最初のカードで1/5、
       最後のカードでも（使い切った6/5にならないよう）5/5のまま */
    UI.el('train-picks').textContent = Math.min(st.picks + 1, CONFIG.TRAINING.PICKS);
    UI.el('train-picks-max').textContent = CONFIG.TRAINING.PICKS;
    UI.el('train-passes').textContent = st.passes;
    UI.el('train-passes-max').textContent = CONFIG.TRAINING.PASSES;

    const card = st.card;
    if (card) {
      /* 並びはオーダー順。カードの中で誰が主力なのか分かりやすくする。
         複数の能力が上がるカードでは同じ選手が2行に分かれるので、先にまとめる */
      const order = orderIndex(state.team);
      const groups = [];
      const seen = new Map();
      card.targets.forEach((t) => {
        if (!seen.has(t.pid)) { const g = { pid: t.pid, ups: [] }; seen.set(t.pid, g); groups.push(g); }
        seen.get(t.pid).ups.push(t);
      });
      groups.sort((a, b) =>
        (order[a.pid] == null ? 99 : order[a.pid]) - (order[b.pid] == null ? 99 : order[b.pid]));
      const lines = groups.map((g) => {
        const p = Team.find(state.team, g.pid);
        if (!p) return '';
        const ups = g.ups.map((t) =>
          esc(t.label) + ' +' + t.amount + (t.unit ? esc(t.unit) : '')).join('　');
        return '<li class="tcard">' +
          '<div class="tcard__head"><b>' + esc(p.name) + '</b>' +
            '<span>' + p.grade + '年・' + UI.roleText(state.team, p) + '</span>' +
            '<em class="tcard__up">' + ups + '</em>' +
          '</div>' +
          '<div class="tcard__stats">' + statChips(p, g.ups) + '</div>' +
        '</li>';
      }).join('');
      UI.html('train-card',
        '<div class="traincard traincard--' + card.tier + (card.multi ? ' is-multi' : '') + '">' +
          '<p class="traincard__kind">' + esc(card.title) +
            '<span class="traincard__n">' + groups.length + '人</span>' +
            (card.multi ? '<span class="traincard__multi">複数</span>' : '') +
            (card.tierLabel ? '<span class="traincard__tier">' + esc(card.tierLabel) + '</span>' : '') +
          '</p>' +
          '<ul class="traincard__list">' + lines + '</ul>' +
        '</div>');
    } else {
      UI.html('train-card', '');
    }

    const passBtn = UI.el('btn-train-pass');
    const left = CONFIG.TRAINING.PASSES - st.passes;
    passBtn.disabled = !Training.canPass(st);
    passBtn.textContent = left > 0 ? '見送る（あと' + left + '回）' : '見送れません';
    UI.show('screen-training');
  }

  /** 選手ID → オーダーでの並び順。控えと投手は後ろに回す */
  function orderIndex(team) {
    const map = {};
    team.lineup.forEach((sl, i) => { map[sl.pid] = i; });
    (team.rotation || []).forEach((id, i) => { if (map[id] == null) map[id] = 20 + i; });
    team.batters.forEach((p) => { if (map[p.id] == null) map[p.id] = 10; });
    return map;
  }

  /**
   * 能力をひと通り並べる。上がるものだけ「いま → 上がったあと」で出し、
   * 残りはいまの値をそのまま添える。能力の評価には色を付ける。
   */
  /** ups は「この選手が今回上がるぶん」の一覧（「複数」のカードでは2つ入る） */
  function statChips(p, ups) {
    const list = Array.isArray(ups) ? ups : [ups];
    /* その能力が上がるなら上がり幅、上がらないなら null */
    const amt = (key) => {
      const t = list.find((x) => x.key === key);
      return t ? t.amount : null;
    };
    const chip = (label, key, now, after, unit) => {
      const up = after != null && after !== now;
      const body = up
        ? UI.rankNum(now) + '<em>→</em>' + UI.rankNum(after)
        : UI.rankNum(now);
      return '<span class="ts' + (up ? ' is-up' : '') + '"><i>' + esc(label) + '</i>' + body + '</span>';
    };
    const plain = (label, now, after, unit) => {
      const up = after != null && after !== now;
      return '<span class="ts' + (up ? ' is-up' : '') + '"><i>' + esc(label) + '</i>' +
        '<b class="rankval">' + now + '</b>' + (up ? '<em>→</em><b class="rankval">' + after + '</b>' : '') +
        (unit ? esc(unit) : '') + '</span>';
    };

    if (p.kind === 'pitcher') {
      const vUp = amt('velo');
      const out = [
        plain('最速', p.velo, vUp == null ? null : Math.min(168, p.velo + vUp), 'km/h'),
        chip('制球', 'control', p.control,
          amt('control') == null ? null : RNG.stat(p.control + amt('control'))),
        chip('スタミナ', 'stamina', p.stamina,
          amt('stamina') == null ? null : RNG.stat(p.stamina + amt('stamina'))),
      ];
      p.pitches.forEach((q) => {
        const t = list.find((x) => x.key === 'pitch' && x.pitch === q.name);
        out.push(plain(q.name, q.level, t ? Math.min(7, q.level + t.amount) : null));
      });
      const np = list.find((x) => x.key === 'newpitch');
      if (np) out.push('<span class="ts is-up"><i>' + esc(np.pitch) + '</i><b class="rankval">新</b><em>→</em><b class="rankval">' + np.amount + '</b></span>');
      return out.join('');
    }

    const stat = (label, key) =>
      chip(label, key, p[key], amt(key) == null ? null : RNG.stat(p[key] + amt(key)));
    const trUp = amt('traj');
    return [
      stat('ミート', 'meet'), stat('パワー', 'power'), stat('走力', 'speed'),
      stat('肩力', 'arm'), stat('守備', 'field'), stat('捕球', 'catch'),
      plain('弾道', p.traj, trUp == null ? null : Math.min(4, p.traj + trUp)),
    ].join('');
  }

  /** いまの能力をひと並びに。特訓で「誰を伸ばすか」を決める材料 */
  function abilityLine(p) {
    if (p.kind === 'pitcher') {
      return '最速<b class="rankval">' + p.velo + '</b>km/h　制球' + UI.rankNum(p.control) +
        '　スタミナ' + UI.rankNum(p.stamina) +
        '　' + esc(p.pitches.map((q) => q.name + q.level).join('・'));
    }
    return 'ミート' + UI.rankNum(p.meet) + '　パワー' + UI.rankNum(p.power) +
      '　走力' + UI.rankNum(p.speed) + '　肩' + UI.rankNum(p.arm) +
      '　守備' + UI.rankNum(p.field) + '　捕球' + UI.rankNum(p.catch) +
      '　弾道<b class="rankval">' + p.traj + '</b>';
  }

  function currentValue(p, t) {
    if (t.key === 'traj') return '弾道 ' + p.traj + ' → ' + Math.min(4, p.traj + t.amount);
    if (t.key === 'velo') return p.velo + ' → ' + Math.min(168, p.velo + t.amount) + 'km/h';
    if (t.key === 'pitch') {
      const q = p.pitches.find((x) => x.name === t.pitch);
      return q ? q.level + ' → ' + Math.min(7, q.level + t.amount) : '';
    }
    if (t.key === 'newpitch') return '新しく習得';
    return rankOf(p[t.key]) + ' ' + p[t.key] + ' → ' + rankOf(Math.min(100, p[t.key] + t.amount)) + ' ' + Math.min(100, p[t.key] + t.amount);
  }

  function trainingResult(state, nextLabel) {
    const rows = Training.summarize(state.training);
    const html = rows.length
      ? '<div class="tablewrap"><table class="growth"><thead><tr><th class="nm">選手</th><th>年</th><th>項目</th><th>上がり幅</th><th>変化</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td class="nm">' + esc(r.name) + '</td><td class="c">' + r.grade + '</td>' +
          '<td>' + esc(r.label) + '</td>' +
          '<td class="c up"><b class="gr__up">+' + r.amount + (r.unit ? esc(r.unit) : '') + '</b></td>' +
          '<td class="c">' + upText(r) + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="note">今回は伸びた選手がいませんでした。</p>';
    UI.html('train-result', html);
    UI.el('btn-train-done').textContent = nextLabel;
    UI.show('screen-training-result');
  }

  /* ---------- 試合開始前 ---------- */

  function pregame(state, opts) {
    const m = state.match;
    const view = opts.view;
    UI.el('pregame-title').textContent = m.label;
    const out = Team.all(state.team).filter((p) => !Team.all(view).includes(p));
    const html =
      '<p class="section-lead vs">' + esc(state.team.name) + '　<i>対</i>　' + esc(state.opponent.name) + '</p>' +
      (opts.extra || '') +
      (view.rebuilt ? '<p class="note note--warn">出場できない選手がいたため、オーダーを組み直しました。</p>' : '') +
      (out.length ? '<p class="note">出場できない選手：' + out.map((p) => esc(p.name) + '（' + esc(College.statusText(state, p) || '―') + '）').join('、') + '</p>' : '') +
      '<div class="twocol">' + lineupCard(view, { pickable: true }) +
        lineupCard(state.opponent) + '</div>';
    UI.html('pregame-body', html);
    const body = UI.el('pregame-body');
    const open = (pid) => {
      const p = Team.find(state.team, pid) || Team.find(state.opponent, pid);
      if (p) UI.openPlayer(p, { team: state.team, state, rename: !!Team.find(state.team, pid), onRename: () => { onChange(); pregame(state, opts); } });
    };
    bindRows(body, open);
    body.querySelectorAll('.pitname').forEach((b) =>
      b.addEventListener('click', () => open(b.dataset.pid)));
    /* 先発を選ぶ。ポップアップで押された投手を起用順のいちばん前に持ってくる */
    const sb = body.querySelector('#btn-starter');
    if (sb) sb.addEventListener('click', () => {
      UI.modal(starterPicker(view), { kind: 'starter', onOpen(mb) {
        mb.querySelectorAll('.spick__item').forEach((b) => b.addEventListener('click', () => {
          const pid = b.dataset.pid;
          const rot = view.rotation.slice();
          const i = rot.indexOf(pid);
          if (i > 0) { rot.splice(i, 1); rot.unshift(pid); view.rotation = rot; College.syncBack(state, view); onChange(); }
          UI.closeModal.back = null; UI.closeModal.after = null; UI.closeModal();
          pregame(state, opts);
        }));
      } });
    });
    UI.show('screen-pregame');
  }

  /* ---------- 勝敗 ---------- */

  function verdict(state) {
    const r = state.lastResult;
    const word = r.draw ? '引き分け' : (r.win ? '勝利' : '敗戦');
    const cls = r.draw ? ' is-draw' : (r.win ? ' is-win' : ' is-lose');
    let lead = '';
    if (r.card) {
      lead = 'このカード　' + r.card.w + '勝' + r.card.l + '敗' + (r.card.d ? r.card.d + '分' : '') +
        (r.card.done ? (r.kind === 'playoff' ? '' : (r.card.won ? '　勝ち点を獲得' : '　勝ち点を落とした')) : '');
    } else if (r.kind === 'national') {
      lead = r.replay ? '引き分け。再試合になる。' : (r.win ? (r.last ? '優勝！' : '次の回へ進む。') : 'ここで敗退。');
    }
    UI.html('verdict-body',
      '<div class="verdict__box' + cls + '">' +
        '<p class="verdict__where">' + esc(r.tourName) + '</p>' +
        '<h2 class="verdict__word">' + word + '</h2>' +
        '<p class="verdict__score">' + esc(state.team.name) + ' <b>' + r.myRuns + '</b>' +
          ' - <b>' + r.opRuns + '</b> ' + esc(r.oppName) + '</p>' +
        UI.decisionLines(r) +
        (r.cold ? '<p class="verdict__note">コールドゲーム</p>' :
          (r.walkoff ? '<p class="verdict__note">サヨナラ</p>' : (r.innings > 9 ? '<p class="verdict__note">延長' + r.innings + '回</p>' : ''))) +
        (lead ? '<p class="verdict__lead">' + esc(lead) + '</p>' : '') +
        ((r.injuries || []).length ? '<p class="verdict__note">負傷：' + r.injuries.map((x) => esc(x.name) + '（' + esc(x.text) + '・' + x.games + '試合）').join('、') + '</p>' : '') +
      '</div>');
    UI.show('screen-verdict');
  }

  /* ---------- 試合後の成長 ---------- */

  /** 「いくつ上がって、いくつになったか」。能力なら評価の文字も添える */
  function upText(u) {
    if (u.key === 'newpitch') {
      return '<span class="gr__to">習得（' + u.after + '）</span>';
    }
    if (u.key === 'velo') {
      return '<span class="gr__from">' + u.before + '</span>→<span class="gr__to">' + u.after + '</span>km/h';
    }
    if (u.key === 'traj') {
      return '<span class="gr__from">' + u.before + '</span>→<span class="gr__to">' + u.after + '</span>';
    }
    if (u.key === 'pitch') {
      return '<span class="gr__from">' + u.before + '</span>→<span class="gr__to">' + u.after + '</span>';
    }
    if (u.apt) {
      /* 守備適性は数値ではなく、もともと評価の文字（G〜A）で入っている */
      return '<span class="gr__from">' + u.before + '</span>→<span class="gr__to">' + u.after + '</span>';
    }
    return '<span class="gr__from">' + rankOf(u.before) + ' ' + u.before + '</span>→' +
      '<span class="gr__to">' + UI.rankNum(u.after) + '</span>';
  }

  function growth(state) {
    const report = (state.lastReport || []).filter((r) => r.ups && r.ups.length);
    const awake = report.filter((r) => r.awakened);
    const grew = report.filter((r) => !r.awakened);

    const card = (r) => '<article class="gr' + (r.awakened ? ' is-awake' : '') + '">' +
      '<header class="gr__head"><b>' + esc(r.name) + '</b>' +
        '<span>' + r.grade + '年・' + esc(r.role || '') + '</span>' +
        (r.awakened ? '<em class="gr__awake">覚醒</em>' : '') + '</header>' +
      '<ul class="gr__list">' + r.ups.map((u) =>
        '<li><span class="gr__label">' + esc(u.label) + '</span>' +
        '<span class="gr__up">+' + u.amount + (u.unit ? esc(u.unit) : '') + '</span>' +
        '<span class="gr__val">' + upText(u) + '</span></li>').join('') +
      '</ul></article>';

    const html =
      (awake.length
        ? '<div class="awakebox"><h4 class="awakebox__title">覚醒</h4>' +
          awake.map((r) => '<p class="awakebox__line"><b>' + esc(r.name) + '</b>（' + r.grade +
            '年）が覚醒した！</p>').join('') + '</div>'
        : '') +
      (report.length
        ? '<div class="grlist">' + awake.map(card).join('') + grew.map(card).join('') + '</div>'
        : '<p class="note">今回は伸びた選手がいませんでした。</p>');
    UI.html('growth-body', html);
    UI.show('screen-growth');
  }

  /* ---------- 優勝の演出（強奪高校野球の champ をそのまま使う） ---------- */

  function tourStars(t) {
    const score = (p) => p.kind === 'pitcher'
      ? (p.tour.outs || 0) / 3 * 1.1 + (p.tour.so || 0) * 0.3 - (p.tour.er || 0) * 0.8
      : (p.tour.h || 0) * 1.0 + (p.tour.hr || 0) * 2.2 + (p.tour.rbi || 0) * 0.6;
    return Team.all(t).slice().sort((a, b) => score(b) - score(a)).slice(0, 3);
  }

  function starList(t) {
    return '<ul class="champ__stars">' + tourStars(t).map((p) => {
      const s = p.tour;
      const line = p.kind === 'pitcher'
        ? Math.floor((s.outs || 0) / 3) + '回 ' + (s.er || 0) + '失点 ' + (s.so || 0) + '奪三振 ' + (s.w || 0) + '勝'
        : (s.h || 0) + '安打' + (s.hr ? ' ' + s.hr + '本塁打' : '') + ' ' + (s.rbi || 0) + '打点 打率' + UI.avg(s.h, s.ab);
      return '<li><b>' + esc(p.name) + '</b>' +
        '<span>' + p.grade + '年・' + (p.kind === 'pitcher' ? '投手' : posName(p.pos)) + '</span>' +
        '<span class="champ__stat">' + line + '</span></li>';
    }).join('') + '</ul>';
  }

  /** 優勝の画面（リーグ優勝・日本一）。html を返す */
  function champHtml(eyebrow, title, school, record, lead, team, note) {
    return '<div class="champ">' +
      '<p class="champ__eyebrow">' + esc(eyebrow) + '</p>' +
      '<h2 class="champ__title">' + esc(title) + '</h2>' +
      '<p class="champ__school">' + esc(school) + '</p>' +
      '<div class="champ__rays" aria-hidden="true"></div>' +
      (record ? '<p class="champ__record">' + record + '</p>' : '') +
      '<p class="champ__lead">' + esc(lead) + '</p>' +
      (team ? starList(team) : '') +
      (note ? '<p class="champ__note">' + esc(note) + '</p>' : '') +
    '</div>';
  }

  return {
    pick, ready, training, trainingResult, pregame, lineupCard, bindRows, captainBox, wireCaptain,
    abilityLine, pitchText, verdict, growth, trainingIntro, setOnChange, champHtml, starList, upText,
  };
})();
