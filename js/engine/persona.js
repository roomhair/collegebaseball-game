/* ==================================================
   大学野球  persona.js

   選手の「人となり」。能力値とは別に、性格・素行・キャプテンシー・
   成長力・潜在能力を持たせる。
   ・性格の種類（type）そのものは表に出さない。スカウトの段階では
     エピソードや評判（「〜らしい」）から推し量ってもらう。
   ・入部して1シーズン一緒に過ごすと、監督には本当の性格が見えてくる（known）。
   ・素行（conduct）が低い選手を集めすぎると不祥事が起きやすくなる。
     ただし素行が悪い＝必ず不祥事、ではない（incidents.js が確率で決める）。
   ================================================== */
'use strict';

const Persona = (() => {

  /* 性格の種類。数字は素行・統率・メンタル・向上心・協調性への寄与 */
  const TYPES = {
    serious:     { label: '真面目',       weight: 16, conduct: 22, lead: 4,   mental: 0,   drive: 10,  team: 8 },
    passionate:  { label: '熱血',         weight: 12, conduct: 4,  lead: 16,  mental: 8,   drive: 14,  team: 6 },
    calm:        { label: '冷静沈着',     weight: 10, conduct: 10, lead: 6,   mental: 20,  drive: 2,   team: 2 },
    caring:      { label: '面倒見が良い', weight: 10, conduct: 12, lead: 20,  mental: 4,   drive: 2,   team: 20 },
    jokester:    { label: 'お調子者',     weight: 10, conduct: -10, lead: 2,  mental: -4,  drive: -4,  team: 12 },
    mypace:      { label: 'マイペース',   weight: 10, conduct: 0,  lead: -8,  mental: 12,  drive: 0,   team: -8 },
    lone:        { label: '一匹狼',       weight: 6,  conduct: -6, lead: -14, mental: 8,   drive: 12,  team: -20 },
    wild:        { label: 'ヤンチャ',     weight: 8,  conduct: -30, lead: 6,  mental: 6,   drive: 4,   team: -6 },
    sensitive:   { label: '繊細',         weight: 7,  conduct: 10, lead: -6,  mental: -20, drive: 6,   team: 4 },
    competitive: { label: '負けず嫌い',   weight: 9,  conduct: -2, lead: 6,   mental: 6,   drive: 20,  team: -4 },
    lazy:        { label: '怠け癖',       weight: 5,  conduct: -16, lead: -6, mental: 0,   drive: -22, team: 0 },
  };
  const TYPE_KEYS = Object.keys(TYPES);

  /* ---------- エピソード ----------
     性格を言い当てるのではなく、場面で匂わせる。
     本当の性格に沿ったものが出やすいが、たまに外れたもの（ただの噂）も混じる。 */
  const EPISODES = {
    serious: [
      '練習後、毎日最後までグラウンドに残っていたらしい',
      '練習ノートを3年間1日も欠かさずつけていたという',
      '雨の日も一人で室内練習場の掃除をしていたらしい',
      '寮の門限を一度も破ったことがないと監督が話していた',
    ],
    passionate: [
      '県大会の決勝で、周囲が緊張している中でも率先して声を出していた',
      '負けた試合のあと、誰よりも悔しがって泣いていたという',
      '練習試合でも全力疾走を欠かさず、相手校の監督から褒められたらしい',
    ],
    calm: [
      '大量リードされた場面でも表情ひとつ変えなかったという',
      'ピンチでマウンドに集まると、いつも最初に作戦を口にしていた',
      '記者の質問に淡々と、的確に答えていたらしい',
    ],
    caring: [
      '練習中、後輩のミスを誰よりも早くフォローしていた',
      '試合に出られない同級生のために、毎日ノックを手伝っていたらしい',
      '新入部員の名前を入部初日に全員覚えていたという',
    ],
    jokester: [
      'ベンチのムードメーカーで、負けている試合でも笑いを取っていたらしい',
      '寮でいたずらをして先輩に怒られたことが何度かあるという',
      '取材のカメラを見つけると、すぐにポーズを取っていたらしい',
    ],
    mypace: [
      '集合時間ぎりぎりに来ることが多いが、練習は黙々とこなしていたという',
      'チームの流行りには一切乗らず、自分の調整法を貫いていたらしい',
      '試合前でもいつも通り昼寝をしていたと同級生が話していた',
    ],
    lone: [
      'チームの輪から少し離れて、一人でバットを振っていることが多かったという',
      '試合に負けた後、監督に何も言わず一人でグラウンド整備をしていた',
      '仲間と出かけることはほとんどなく、休日も一人で練習していたらしい',
    ],
    wild: [
      '寮で他の選手とトラブルになったことがあるらしい',
      '他校の選手と口論になり、試合後に呼び出されたことがあるという',
      '髪型のことで何度も指導を受けていたらしい',
      '練習をさぼって街に出ていたという噂がある',
    ],
    sensitive: [
      '大事な場面でエラーをした後、しばらく練習に出てこなかったらしい',
      '試合前は食事が喉を通らないほど緊張するという',
      '監督に叱られた翌日、誰よりも早く練習に来ていたらしい',
    ],
    competitive: [
      '紅白戦で打ち取られた投手に、翌日もう一度勝負を挑んでいたという',
      'レギュラー争いに負けた日、夜遅くまで素振りをしていたらしい',
      'じゃんけんで負けても本気で悔しがるという',
    ],
    lazy: [
      '才能はあるのに、走り込みになると姿が見えなくなるらしい',
      '練習の手を抜いているように見えると、何度か注意されていたという',
      '試合の日だけは別人のように集中するという話もある',
    ],
  };

  /* 評判。性格の種類を直接言わず、周囲の見立てとして出す */
  const RUMORS = {
    serious: ['真面目で手のかからない選手という評判', '指導者の言うことをよく聞くという声'],
    passionate: ['チームを熱くする選手という評判', '声でチームを引っ張るタイプらしい'],
    calm: ['どんな場面でも動じないという評判', '大人びた選手という声'],
    caring: ['面倒見が良いという評判', '後輩から慕われているらしい'],
    jokester: ['明るく、場を和ませる選手という評判', '調子に乗りやすいという声も'],
    mypace: ['マイペースだが結果は出すという評判', '何を考えているか分からないという声'],
    lone: ['人付き合いは苦手だという評判', '練習の虫だが孤立しがちらしい'],
    wild: ['やんちゃな一面があるという評判', '扱いが難しいという声も聞こえる'],
    sensitive: ['繊細で、気持ちの浮き沈みがあるという評判', '真面目すぎて考え込むらしい'],
    competitive: ['とにかく負けず嫌いという評判', '練習から誰にも負けたくない性格らしい'],
    lazy: ['才能頼みだという評判', '練習熱心とは言えないという声'],
  };

  function rollType(opt) {
    if (opt && opt.type) return opt.type;
    if (opt && opt.problem) return RNG.chance(0.7) ? 'wild' : RNG.pick(['lazy', 'jokester', 'lone']);
    if (opt && opt.good) return RNG.pick(['serious', 'caring', 'passionate', 'calm']);
    const list = TYPE_KEYS.map((k) => ({ k, weight: TYPES[k].weight }));
    return RNG.weighted(list).k;
  }

  /**
   * 選手に人となりを付ける。新しく作った選手には必ずこれを通す。
   * opt: { problem, good, type, talentBoost }
   */
  function assign(p, opt) {
    opt = opt || {};
    const type = rollType(opt);
    const T = TYPES[type];
    const c = (base, add, sd) => Math.round(RNG.clamp(RNG.norm(base + add, sd), 1, 100));
    p.persona = {
      type,
      conduct: c(62, T.conduct, 13),
      lead: c(45, T.lead, 15),
      mental: c(50, T.mental, 14),
      drive: c(52, T.drive, 14),
      team: c(52, T.team, 12),
    };
    if (opt.problem) p.persona.conduct = Math.min(p.persona.conduct, RNG.range(12, 34));
    /* 成長力。才能（talent）とは別に引く。「いまは弱いが伸びる」選手を作るため */
    p.growthRate = Math.round(RNG.clamp(RNG.norm(52 + T.drive * 0.5 + (opt.growthBoost || 0), 16), 5, 99));
    const r = Player.rating(p);
    p.potential = Math.round(RNG.clamp(
      r + 8 + p.growthRate * 0.24 + (p.talent || 0) * 5 + RNG.norm(0, 6) + (opt.potentialBoost || 0),
      r + 3, 98));
    const isPit = p.kind === 'pitcher';
    p.height = Math.round(RNG.clamp(RNG.norm(isPit ? 180 : 175.5, 5.5), 160, 198));
    const bulk = isPit ? 0.5 : (p.power || 40) / 100;
    p.weight = Math.round(RNG.clamp((p.height - 100) * (0.78 + bulk * 0.22) + RNG.norm(0, 4), 55, 115));
    p.condition = 0;          // 調子 -2〜+2
    p.fatigue = 0;            // 疲労 0〜100
    p.hist = p.hist || [];    // その選手の歩み（文章）
    p.seasons = p.seasons || [];
    p.known = !!opt.known;    // 監督に本当の性格が見えているか
    p.episodes = [episode(type), episode(type)].filter((x, i, a) => a.indexOf(x) === i);
    return p;
  }

  /** 性格に沿ったエピソードを1つ。2割は無関係の噂が混じる */
  function episode(type) {
    const t = RNG.chance(0.8) ? type : RNG.pick(TYPE_KEYS);
    return RNG.pick(EPISODES[t]);
  }

  function rumor(type) {
    const t = RNG.chance(0.78) ? type : RNG.pick(TYPE_KEYS);
    return RNG.pick(RUMORS[t]);
  }

  function label(type) { return TYPES[type] ? TYPES[type].label : '―'; }

  /** 素行の評価。A がいちばん良い */
  function conductRank(v) {
    return v >= 80 ? 'A' : v >= 64 ? 'B' : v >= 46 ? 'C' : v >= 30 ? 'D' : 'E';
  }

  /** 成長力・キャプテンシーなどの評価（A〜E） */
  function grade5(v) {
    return v >= 78 ? 'A' : v >= 62 ? 'B' : v >= 44 ? 'C' : v >= 28 ? 'D' : 'E';
  }

  /** 潜在能力（天井）を評価にしたもの。将来性の表示に使う */
  function potentialRank(v) { return rankOf(v); }

  /** 監督から見えている性格の書き方 */
  function shownPersonality(p) {
    if (!p.persona) return '―';
    if (p.known) return label(p.persona.type);
    return '（' + (p.rumorText || rumor(p.persona.type)) + '）';
  }

  /**
   * 不祥事の起こしやすさ（0〜）。素行が低いほど急に上がる。
   * ヤンチャやお調子者は、同じ素行でも少しだけ高い。
   */
  function riskOf(p) {
    if (!p.persona) return 0.1;
    const c = p.persona.conduct;
    let r = Math.pow(Math.max(0, 80 - c) / 50, 2.2);
    if (p.persona.type === 'wild') r *= 1.35;
    if (p.persona.type === 'jokester') r *= 1.15;
    if (p.persona.type === 'serious') r *= 0.6;
    return r;
  }

  /** 素行が問題になりそうな選手か（チームの「要注意」表示に使う） */
  function isProblem(p) { return p.persona && p.persona.conduct < 40; }

  /** 調子のラベル */
  const COND = { '-2': '絶不調', '-1': '不調', '0': '普通', '1': '好調', '2': '絶好調' };
  function condLabel(v) { return COND[String(v | 0)] || '普通'; }
  function condMark(v) { return ['↓↓', '↓', '→', '↑', '↑↑'][(v | 0) + 2] || '→'; }

  function fatigueLabel(v) {
    return v >= 70 ? '疲労大' : v >= 45 ? '疲れ気味' : v >= 20 ? '少し疲れ' : '元気';
  }

  /** 1試合ぶんの調子の揺れ。メンタルが弱いほど振れやすい */
  function rollCondition(p, push) {
    const m = p.persona ? p.persona.mental : 50;
    const vol = 0.32 + (60 - m) / 220;
    let c = p.condition || 0;
    if (RNG.chance(Math.max(0.12, vol))) c += RNG.chance(0.5 + (push || 0)) ? 1 : -1;
    /* 真ん中に戻ろうとする */
    if (c > 0 && RNG.chance(0.18)) c--;
    if (c < 0 && RNG.chance(0.18)) c++;
    p.condition = RNG.clamp(c, -2, 2);
    return p.condition;
  }

  return {
    TYPES, TYPE_KEYS, assign, episode, rumor, label, conductRank, grade5, potentialRank,
    shownPersonality, riskOf, isProblem, condLabel, condMark, fatigueLabel, rollCondition,
  };
})();
