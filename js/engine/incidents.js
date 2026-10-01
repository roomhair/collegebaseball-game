/* ==================================================
   大学野球  incidents.js

   不祥事と、ときどき起きる出来事。
   ・不祥事は「素行の悪い選手がいる＝必ず起きる」ではない。
     部員それぞれの起こしやすさ（素行・性格）を合計し、問題児が固まるほど
     割り増し、チームの雰囲気とキャプテンの統率で割り引いた確率で起きる。
   ・起きたら監督が対応を選ぶ。選んだ結果（処分の重さ・評判への響き・
     本人の変化）は事前には見せない。
   ・処分は重大度・本人の前歴・チームへの影響を見て決まる。
   ================================================== */
'use strict';

const Incidents = (() => {

  /* 不祥事の種類。sev は重大度の範囲（1〜5）、n は関わる人数 */
  const KINDS = [
    { key: 'break',    sev: [1, 2], n: 1, text: '{a}が練習中に苛立ってベンチの備品を壊した。' },
    { key: 'noise',    sev: [1, 2], n: 2, text: '寮で{a}と{b}が夜遅くまで騒ぎ、近隣から苦情が入った。' },
    { key: 'fight',    sev: [2, 4], n: 2, text: '練習後、{a}と{b}が口論から殴り合いの喧嘩になった。' },
    { key: 'rival',    sev: [2, 3], n: 1, text: '{a}が{uni}の選手と街で口論になり、大学に連絡が入った。' },
    { key: 'sns',      sev: [2, 4], n: 1, text: '{a}がSNSに不適切な投稿をし、拡散されてしまった。' },
    { key: 'outnight', sev: [1, 2], n: 1, text: '{a}が無断で寮を外泊し、門限を大きく破った。' },
    { key: 'skip',     sev: [2, 3], n: 1, text: '{a}の練習の無断欠席が続いていることが分かった。' },
    { key: 'umpire',   sev: [2, 4], n: 1, text: '{a}が試合中、判定に納得できず審判に暴言を吐いた。' },
    { key: 'oppo',     sev: [2, 3], n: 1, text: '{a}が試合中に{uni}の選手ともみ合いになった。' },
    { key: 'drink',    sev: [3, 5], n: 2, text: '{a}と{b}が関わった飲酒絡みの騒ぎが、大学に報告された。' },
    { key: 'campus',   sev: [1, 3], n: 1, text: '{a}が学内で迷惑行為をはたらき、学生課から連絡が来た。' },
    { key: 'defy',     sev: [2, 3], n: 1, text: '{a}が監督の指示に公然と反発し、練習の場を離れた。' },
    { key: 'bully',    sev: [3, 5], n: 2, text: '{a}が下級生の{b}に対して、いじめにあたる行為をしていたことが分かった。' },
    { key: 'postgame', sev: [2, 4], n: 1, text: '試合後、{a}が相手チームの応援席とトラブルを起こした。' },
    { key: 'outside',  sev: [2, 4], n: 1, text: '{a}が学外のアルバイト先でトラブルを起こし、警察から事情を聞かれた。' },
    { key: 'cheat',    sev: [2, 3], n: 1, text: '{a}が授業の試験で不正をしたとして、大学から呼び出しを受けた。' },
    { key: 'gamble',   sev: [3, 5], n: 1, text: '{a}が賭け事に関わっていたという情報が大学に寄せられた。' },
    { key: 'traffic',  sev: [2, 4], n: 1, text: '{a}が自転車の危険運転で事故を起こし、相手にけがをさせた。' },
    { key: 'hazing',   sev: [3, 4], n: 2, text: '{a}が中心になって、{b}ら下級生に理不尽な上下関係を強いていた。' },
    { key: 'leak',     sev: [1, 2], n: 1, text: '{a}がチームの作戦メモを外部に漏らしていた。' },
  ];

  /* 処分の段階 */
  const PUNISH = [
    { lv: 0, label: '注意' },
    { lv: 1, label: '厳重注意' },
    { lv: 2, label: '一定期間の練習禁止' },
    { lv: 3, label: '謹慎（3試合の出場停止）' },
    { lv: 4, label: '6試合の出場停止' },
    { lv: 5, label: '半シーズン（10試合）の出場停止' },
    { lv: 6, label: '1シーズンの出場停止' },
    { lv: 7, label: '退部' },
  ];

  /* 監督の対応 */
  const CHOICES = [
    { key: 'strict',   label: '厳しく処分する' },
    { key: 'reflect',  label: '本人に反省を促す' },
    { key: 'internal', label: 'チーム内で解決する' },
    { key: 'report',   label: '大学側に報告する' },
  ];

  /* ---------- 起きるかどうか ---------- */

  function teamRisk(state) {
    const all = Team.all(state.team);
    let sum = 0;
    all.forEach((p) => { sum += Persona.riskOf(p); });
    const problems = all.filter(Persona.isProblem).length;
    /* 問題児が固まるほど、互いに引っ張り合って起きやすくなる */
    const cluster = 1 + 0.32 * Math.max(0, problems - 1);
    const m = state.team.morale == null ? 55 : state.team.morale;
    const moraleK = RNG.clamp(1.35 - m / 100 * 0.8, 0.6, 1.4);
    const cap = Team.captain(state.team);
    const capK = cap && cap.persona ? RNG.clamp(1.25 - cap.persona.lead / 100 * 0.6, 0.65, 1.25) : 1.2;
    return { sum, problems, p: RNG.clamp(sum * 0.0105 * cluster * moraleK * capK, 0.004, 0.42) };
  }

  /** 区切り（カードの終わり・特訓の後など）ごとに呼ぶ。起きれば保留中の出来事を返す */
  function roll(state, where) {
    if (!state.team || Team.all(state.team).length < 10) return null;
    const risk = teamRisk(state);
    if (!RNG.chance(risk.p)) return null;
    return make(state, where);
  }

  /** 不祥事を1つ作る（テストからも呼ぶ） */
  function make(state, where, forceKind) {
    const all = Team.all(state.team);
    const weighted = all.map((p) => ({ p, weight: Persona.riskOf(p) + 0.02 }));
    const a = RNG.weighted(weighted).p;
    const kind = forceKind ? KINDS.find((k) => k.key === forceKind) : RNG.pick(KINDS);
    let b = null;
    if (kind.n >= 2) {
      const rest = all.filter((p) => p !== a);
      if (kind.key === 'bully' || kind.key === 'hazing') {
        const younger = rest.filter((p) => p.grade < a.grade);
        b = RNG.pick(younger.length ? younger : rest);
      } else {
        b = RNG.weighted(rest.map((p) => ({ p, weight: Persona.riskOf(p) + 0.05 }))).p;
      }
    }
    const others = Object.keys(state.unis || {}).filter((id) => id !== state.userUni);
    const uni = others.length ? Universities.name(state, RNG.pick(others)) : '他大学';
    let sev = RNG.range(kind.sev[0], kind.sev[1]);
    /* いじめ・上下関係の強要では、被害者側（b）は処分しない */
    const victim = kind.key === 'bully' || kind.key === 'hazing';
    const involved = [a].concat(b && !victim ? [b] : []);
    return {
      type: 'incident', kind: kind.key, sev, where: where || '',
      year: state.year, term: state.term,
      text: kind.text.replace('{a}', a.name).replace('{b}', b ? b.name : '').replace('{uni}', uni),
      involved: involved.map((p) => p.id),
      victim: victim && b ? b.id : null,
      names: involved.map((p) => p.name),
      options: CHOICES.map((c) => ({ key: c.key, label: c.label })),
    };
  }

  /* ---------- 対応と処分 ---------- */

  function punishLevel(sev, choice, prior, discovered) {
    /* 大学側の「公正な」処分の目安 */
    const fair = [0, 1, 2, 3.5, 5, 6.2][sev] + prior * 0.8;
    let lv;
    if (choice === 'strict') lv = fair + 1.2;
    else if (choice === 'reflect') lv = fair - 1.4;
    else if (choice === 'internal') lv = Math.min(1, fair - 3);
    else lv = fair;
    if (discovered) lv = fair + 1.5;     // 隠していたことが明るみに出た
    lv += RNG.norm(0, 0.5);
    return Math.round(RNG.clamp(lv, 0, 7));
  }

  function apply(state, p, lv) {
    p.suspend = p.suspend || {};
    if (lv === 2) p.suspend.practiceBan = Math.max(p.suspend.practiceBan || 0, 2);
    if (lv === 3) p.suspend.games = Math.max(p.suspend.games || 0, 3);
    if (lv === 4) p.suspend.games = Math.max(p.suspend.games || 0, 6);
    if (lv === 5) p.suspend.games = Math.max(p.suspend.games || 0, 10);
    if (lv === 6) {
      p.suspend.untilSeq = (state.seasonSeq || 0) + 1;
      p.suspend.label = '1シーズン';
      p.suspend.severe = true;
    }
    if (!p.suspend.games && p.suspend.untilSeq == null && !p.suspend.practiceBan) p.suspend = null;
  }

  /** 部を去らせる（退部）。記録には残す */
  function expel(state, p) {
    Records.alumni(state, p, '退部');
    state.team.batters = state.team.batters.filter((x) => x.id !== p.id);
    state.team.pitchers = state.team.pitchers.filter((x) => x.id !== p.id);
    Team.checkCaptain(state.team);
    if (state.team.batters.length >= 9) Team.repair(state.team);
  }

  /**
   * 監督の対応を受けて、結果を決める。戻り値は画面に出す文と処分の一覧。
   */
  function resolve(state, inc, choice) {
    const lines = [];
    const out = [];
    const team = state.team;
    let discovered = false;
    if (choice === 'internal' && inc.sev >= 3 && RNG.chance(0.25 + inc.sev * 0.1)) discovered = true;
    if (choice === 'reflect' && inc.sev >= 4 && RNG.chance(0.35)) discovered = true;

    inc.involved.forEach((pid) => {
      const p = Team.find(team, pid);
      if (!p) return;
      const prior = p.incidents || 0;
      p.incidents = prior + 1;
      const lv = punishLevel(inc.sev, choice, prior, discovered);
      const T = p.persona ? p.persona.type : 'serious';
      /* 本人の変化。性格によって、効く対応が違う */
      let dc = 0;
      if (choice === 'strict') dc = (T === 'wild' || T === 'lone') ? RNG.range(-4, 8) : RNG.range(4, 10);
      if (choice === 'reflect') dc = (T === 'serious' || T === 'caring' || T === 'sensitive' || T === 'passionate') ? RNG.range(6, 14) : RNG.range(-6, 6);
      if (choice === 'internal') dc = (T === 'jokester' || T === 'mypace') ? RNG.range(-2, 6) : RNG.range(-4, 5);
      if (choice === 'report') dc = RNG.range(2, 8);
      if (p.persona) p.persona.conduct = Math.round(RNG.clamp(p.persona.conduct + dc, 1, 100));
      if (lv >= 7) {
        lines.push(p.name + '：' + PUNISH[7].label);
        out.push({ pid, name: p.name, lv, label: PUNISH[7].label });
        College.addHist(p, state, inc.text.replace(/。$/, '') + ' → 退部');
        expel(state, p);
        return;
      }
      apply(state, p, lv);
      lines.push(p.name + '：' + PUNISH[lv].label);
      out.push({ pid, name: p.name, lv, label: PUNISH[lv].label });
      College.addHist(p, state, '不祥事（' + PUNISH[lv].label + '）');
    });

    /* チームと評判への響き */
    let dm = 0, scandal = 0;
    if (choice === 'strict') { dm = RNG.range(-4, 2); scandal = inc.sev * 0.5; }
    if (choice === 'reflect') { dm = RNG.range(-1, 4); scandal = inc.sev * 0.6; }
    if (choice === 'internal') { dm = RNG.range(-2, 5); scandal = 0.2; }
    if (choice === 'report') { dm = RNG.range(-3, 1); scandal = inc.sev * 0.8; }
    if (discovered) {
      dm -= 5; scandal = inc.sev * 2.2;
      lines.unshift(choice === 'internal'
        ? '内々に収めたはずの件が外部に漏れ、報道された。大学は重い処分を下した。'
        : '反省で済ませた件が問題視され、大学があらためて処分を決めた。');
    }
    team.morale = RNG.clamp((team.morale == null ? 55 : team.morale) + dm, 5, 95);
    state.scandal = (state.scandal || 0) + scandal;
    if (dm >= 3) lines.push('チームは一つにまとまった。');
    else if (dm <= -3) lines.push('チームの雰囲気が少し悪くなった。');

    const record = Object.assign({}, inc, { choice, punish: out, discovered, lines });
    state.incidentLog = state.incidentLog || [];
    state.incidentLog.push(record);
    if (state.incidentLog.length > 120) state.incidentLog.splice(0, state.incidentLog.length - 120);
    if (inc.sev >= 3 || discovered || out.some((x) => x.lv >= 5)) {
      Records.chronicle(state, '不祥事：' + inc.text.replace(/。$/, '') + '（' + out.map((x) => x.name + ' ' + x.label).join('、') + '）', 'scandal');
    }
    return record;
  }

  /* ---------- ときどき起きる出来事 ---------- */

  const EVENTS = [
    { key: 'surge',    weight: 14 },
    { key: 'slump',    weight: 12 },
    { key: 'hot',      weight: 12 },
    { key: 'injury',   weight: 8 },
    { key: 'clash',    weight: 8 },
    { key: 'captain',  weight: 5 },
    { key: 'transfer', weight: 4 },
    { key: 'proscout', weight: 8 },
    { key: 'media',    weight: 6 },
    { key: 'ob',       weight: 5 },
  ];

  function rollEvent(state, where) {
    if (!state.team || Team.all(state.team).length < 10) return null;
    if (where === 'national' && RNG.chance(0.5)) return pressure(state);
    if (!RNG.chance(0.2)) return null;
    const kind = RNG.weighted(EVENTS).key;
    return makeEvent(state, kind) || null;
  }

  function pickPlayer(state, fn) {
    const list = Team.all(state.team).filter(fn || (() => true));
    return list.length ? RNG.pick(list) : null;
  }

  function makeEvent(state, kind) {
    const t = state.team;
    const ev = { type: 'event', kind, options: null, year: state.year, term: state.term };
    if (kind === 'surge') {
      const p = pickPlayer(state, (q) => (q.growthRate || 50) >= 55 && Player.rating(q) < (q.potential || 99) - 4);
      if (!p) return null;
      const keys = p.kind === 'pitcher' ? ['control', 'stamina'] : RNG.shuffle(['meet', 'power', 'speed', 'arm', 'field', 'catch']).slice(0, 2);
      const NM = { control: '制球', stamina: 'スタミナ', meet: 'ミート', power: 'パワー', speed: '走力', arm: '肩力', field: '守備', catch: '捕球' };
      /* 「元がいくつで、いくつ伸びて、いくつになったか」を残す（画面に出す） */
      const ups = keys.map((k) => {
        const b = p[k];
        p[k] = RNG.stat(b + RNG.range(3, 6));
        return { label: NM[k], before: b, after: p[k] };
      });
      if (p.kind === 'pitcher' && RNG.chance(0.5)) {
        const vb = p.velo;
        p.velo = Math.min(160, p.velo + RNG.range(1, 3));
        if (p.velo > vb) ups.push({ label: '球速', before: vb, after: p.velo, unit: 'km/h' });
      }
      const fmt = (u) => u.unit
        ? u.label + ' ' + u.before + '→' + u.after + u.unit + '（+' + (u.after - u.before) + '）'
        : u.label + ' ' + rankOf(u.before) + u.before + '→' + rankOf(u.after) + u.after + '（+' + (u.after - u.before) + '）';
      ev.text = p.name + '（' + p.grade + '年）の練習の成果が一気に表れた。';
      ev.ups = ups;
      ev.lines = ups.map(fmt);
      College.addHist(p, state, C(state) + ' 急成長');
      return ev;
    }
    if (kind === 'slump') {
      const p = pickPlayer(state, (q) => (t.lineup || []).some((s) => s.pid === q.id) || (t.rotation || [])[0] === q.id);
      if (!p) return null;
      p.condition = -2;
      ev.text = p.name + 'がスランプに陥っている。調子が上がるまで時間がかかりそうだ。';
      College.addHist(p, state, C(state) + ' スランプ');
      return ev;
    }
    if (kind === 'hot') {
      const p = pickPlayer(state);
      if (!p) return null;
      p.condition = 2;
      ev.text = p.name + 'の状態が上がっている。いまが使いどきかもしれない。';
      return ev;
    }
    if (kind === 'injury') {
      const p = pickPlayer(state, (q) => !College.injured(q));
      if (!p) return null;
      const g = RNG.range(2, 7);
      p.injury = { games: g, text: '練習中の故障' };
      ev.text = p.name + 'が練習中に故障した。全治まで' + g + '試合ほどかかる見込み。';
      College.addHist(p, state, C(state) + ' 練習中の故障で離脱');
      return ev;
    }
    if (kind === 'clash') {
      const a = pickPlayer(state, (q) => q.persona && (q.persona.type === 'competitive' || q.persona.type === 'lone' || q.persona.type === 'wild'));
      const b = a && pickPlayer(state, (q) => q !== a && q.grade === a.grade);
      if (!a || !b) return null;
      ev.text = a.name + 'と' + b.name + 'が、起用をめぐってぶつかっている。チーム内の空気がぎくしゃくしている。';
      ev.ids = [a.id, b.id];
      ev.options = [
        { key: 'talk', label: '二人を呼んで話し合わせる' },
        { key: 'leave', label: '様子を見る' },
        { key: 'captain', label: 'キャプテンに任せる' },
      ];
      return ev;
    }
    if (kind === 'captain') {
      const cap = Team.captain(t);
      const rival = pickPlayer(state, (q) => q !== cap && q.persona && q.persona.lead >= 62 && q.grade >= 3);
      if (!cap || !rival || (cap.persona && cap.persona.lead >= rival.persona.lead)) return null;
      ev.text = 'チームの中で「' + rival.name + 'のほうがキャプテンにふさわしい」という声が上がっている。';
      ev.ids = [cap.id, rival.id];
      ev.options = [
        { key: 'keep', label: cap.name + 'に続けてもらう' },
        { key: 'swap', label: rival.name + 'をキャプテンにする' },
      ];
      return ev;
    }
    if (kind === 'transfer') {
      const p = pickPlayer(state, (q) => q.grade <= 2 && Player.rating(q) >= 45 && !(t.lineup || []).some((s) => s.pid === q.id));
      if (!p) return null;
      const others = Object.keys(state.unis).filter((id) => id !== state.userUni);
      const uni = Universities.name(state, RNG.pick(others));
      ev.text = '出場機会の少ない' + p.name + '（' + p.grade + '年）に、' + uni + 'から転部の誘いが来ているらしい。';
      ev.ids = [p.id];
      ev.uni = uni;
      ev.options = [
        { key: 'promise', label: '出場機会を約束して引き止める' },
        { key: 'free', label: '本人の意思に任せる' },
      ];
      return ev;
    }
    if (kind === 'proscout') {
      const p = pickPlayer(state, (q) => q.grade >= 3 && Player.rating(q) >= 55);
      if (!p) return null;
      p.condition = Math.min(2, (p.condition || 0) + 1);
      if (p.persona) p.persona.drive = Math.min(100, p.persona.drive + 5);
      ev.text = 'プロ球団のスカウトが' + p.name + 'を視察に来た。本人の目の色が変わった。';
      College.addHist(p, state, C(state) + ' プロのスカウトが視察');
      return ev;
    }
    if (kind === 'media') {
      ev.text = state.team.name + '野球部が地元紙に大きく取り上げられた。注目が集まる一方で、硬くなっている選手もいる。';
      state.scandal = Math.max(0, (state.scandal || 0) - 1);
      Team.all(t).forEach((p) => { if (p.persona && p.persona.mental < 38 && RNG.chance(0.5)) p.condition = Math.max(-2, (p.condition || 0) - 1); });
      return ev;
    }
    if (kind === 'ob') {
      t.morale = RNG.clamp((t.morale || 55) + 4, 5, 95);
      ev.text = 'OB会から差し入れと激励が届いた。部員たちの表情が明るい。';
      return ev;
    }
    return null;
  }

  function pressure(state) {
    const shaky = Team.all(state.team).filter((p) => p.persona && p.persona.mental < 40);
    shaky.forEach((p) => { if (RNG.chance(0.6)) p.condition = Math.max(-2, (p.condition || 0) - 1); });
    return {
      type: 'event', kind: 'pressure', year: state.year, term: state.term, options: null,
      text: '全国大会を前に、チームには緊張が漂っている。' +
        (shaky.length ? shaky.slice(0, 3).map((p) => p.name).join('・') + 'らは、少し硬くなっているようだ。' : '浮き足立っている選手はいないようだ。'),
    };
  }

  function C(state) { return state.year + '年' + (state.term === 'spring' ? '春' : '秋'); }

  /** 選択肢のある出来事の結果 */
  function resolveEvent(state, ev, key) {
    const t = state.team;
    const lines = [];
    if (ev.kind === 'clash') {
      const [a, b] = ev.ids.map((id) => Team.find(t, id));
      const r = RNG.rand();
      if (key === 'talk') {
        if (r < 0.65) { t.morale = Math.min(95, t.morale + 4); lines.push('腹を割って話し、二人はわだかまりを解いた。'); }
        else { t.morale = Math.max(5, t.morale - 2); lines.push('話し合いは平行線に終わった。'); }
      } else if (key === 'leave') {
        if (r < 0.4) { lines.push('時間が解決し、二人は自然と元に戻った。'); }
        else { t.morale = Math.max(5, t.morale - 5); lines.push('対立はくすぶり続け、周りの部員も気をつかっている。'); if (a) a.condition = -1; }
      } else {
        const cap = Team.captain(t);
        const lead = cap && cap.persona ? cap.persona.lead : 40;
        if (RNG.chance(lead / 100)) { t.morale = Math.min(95, t.morale + 5); lines.push((cap ? cap.name : 'キャプテン') + 'が間に入り、チームはかえって結束した。'); }
        else { t.morale = Math.max(5, t.morale - 3); lines.push('キャプテンの手には負えなかった。'); }
      }
      void b;
    } else if (ev.kind === 'captain') {
      const [cap, rival] = ev.ids.map((id) => Team.find(t, id));
      if (key === 'swap' && rival) {
        t.captainId = rival.id; rival.wasCaptain = true;
        College.addHist(rival, state, C(state) + ' キャプテンに就任');
        t.morale = Math.min(95, t.morale + 2);
        lines.push(rival.name + 'が新しいキャプテンになった。');
        if (cap && cap.persona && cap.persona.mental < 45) { cap.condition = -1; lines.push(cap.name + 'は少し落ち込んでいる。'); }
      } else {
        lines.push((cap ? cap.name : 'キャプテン') + 'の続投を決めた。');
        if (RNG.chance(0.4)) { t.morale = Math.max(5, t.morale - 3); lines.push('一部の部員は不満そうだ。'); }
      }
    } else if (ev.kind === 'transfer') {
      const p = Team.find(t, ev.ids[0]);
      if (p) {
        if (key === 'promise') {
          p.promised = true;
          lines.push(p.name + 'は残ることを決めた。約束どおり起用しないと、また気持ちが揺れるかもしれない。');
          t.morale = Math.max(5, t.morale - 1);
        } else if (RNG.chance(0.45)) {
          lines.push(p.name + 'は' + ev.uni + 'への転部を選んだ。');
          College.addHist(p, state, C(state) + ' ' + ev.uni + 'へ転部');
          Records.alumni(state, p, '転部');
          t.batters = t.batters.filter((x) => x.id !== p.id);
          t.pitchers = t.pitchers.filter((x) => x.id !== p.id);
          Team.checkCaptain(t);
          if (t.batters.length >= 9) Team.repair(t);
        } else {
          lines.push(p.name + 'は悩んだ末、ここで勝負すると決めた。');
          if (p.persona) p.persona.drive = Math.min(100, p.persona.drive + 8);
        }
      }
    }
    return Object.assign({}, ev, { choice: key, lines });
  }

  return { KINDS, PUNISH, CHOICES, teamRisk, roll, make, resolve, rollEvent, makeEvent, resolveEvent, expel };
})();
