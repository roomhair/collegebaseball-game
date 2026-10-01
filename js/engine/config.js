/* ==================================================
   大学野球  config.js（強奪高校野球の config.js を大学向けに拡張）

   ゲーム全体で使う定数。数字をいじりたくなったら、まずここを見る。
   ・能力値は 1〜100 の素の数字で持ち、表示のときだけ S〜G に直す。
     （内部で文字にしてしまうと、特訓で +3 するような計算ができない）
   ・「乙大人園」は全国大会の名前。権利のからむ実名は使わないので、
     既定の名前もユーザーが設定画面から変えられるようにしてある。
   ================================================== */
'use strict';

const CONFIG = {
  SAVE_PREFIX: 'cbbgame.slot',   // localStorage の鍵（データ1〜3 で slot1〜slot3）
  SAVE_VERSION: 1,
  SLOTS: 3,
  START_YEAR: 2026,

  /* 名前の初期値。ゲーム中の設定画面からいつでも変えられる */
  DEFAULT_NAMES: {
    league: '関東六大学リーグ',
    springNational: '全国大学野球大会',
    fallNational: '平成帝京大会',
    hsNational: '甲子園',
    proLeagueA: '太平洋リーグ',
    proLeagueB: '大陸リーグ',
    proLeagueFinal: 'リーグ決勝シリーズ',
    proSeries: '日本頂上シリーズ',
    soccerLeague: '関東大学サッカーリーグ',
    soccerNational: '全日本大学サッカー選手権',
  },

  /* チーム作りで見せる組の数 */
  PICK_SETS: 3,
  NEWCOMER_SETS: 3,

  /* 部員の人数。学年ごとに偏らないよう、1学年あたりの目安を持つ */
  ROSTER: {
    BAT_PER_GRADE: [5, 4, 5, 4],   // チーム作りの野手（1〜4年）。合計18
    PIT_PER_GRADE: [2, 3, 2, 3],   // チーム作りの投手。合計10
    GRADE_TARGET: 7,               // 1学年の目安
    GRADE_MAX: 9,                  // 1学年の上限（新入生が増えすぎないように）
    TOTAL_MAX: 34,                 // 部員の上限
    MIN_BAT: 13, MIN_PIT: 6,
    REC_SLOTS: 5,                  // 推薦枠
  },

  /* 特訓（強奪高校野球と同じ「選択5回・見送り3回」） */
  TRAINING: {
    PICKS: 5,
    PASSES: 3,
    /* 年2回あり、4年間で8回になるので、高校（3年で3回）より1回の額面を抑える */
    SCALE: 0.55,
  },

  /* 試合ごとの成長。大学は年に25試合前後こなすので、高校より1試合の伸びを小さくしてある。
     中身の式は強奪高校野球の growth.js のまま */
  GROWTH: {
    PER_GAME_BAT: 11.0 * 0.30,
    /* 投手は1カード3試合を2〜3人で回すようになったので（スタミナの持ち越し）、
       1人が1試合で伸びる幅を野手より大きくしてある */
    PER_GAME_PIT: 6.9 * 0.30 * 1.9,
    MAX_STEP: 4,
    HEAD_SPAN: 22,
    HEAD_CURVE: 1.9,
    BASE: 0.55,
    PERF: 0.32,
    BENCH: 0.30,
  },

  /* 試合 */
  GAME: {
    INNINGS: 9,
    TIEBREAK_FROM: 10,   // 延長はタイブレーク（無死一二塁）から
    MAX_INNINGS: 20,
    LEAGUE_MAX_INNINGS: 12,  // リーグ戦・入れ替え戦は12回で引き分け
    COLD: [{ inning: 5, diff: 10 }, { inning: 7, diff: 7 }],
  },

  /* 大学の強さ（Team.strength とおおむね同じ目盛り） */
  LEVEL: {
    DIV_BASE: { 1: 57, 2: 49, 3: 41 },
    DIV_SPREAD: 4.5,
    NATIONAL_FROM: 60,     // 全国大会の1回戦の相手
    NATIONAL_STEP: 2.2,    // 1つ勝ち上がるごとに
    PRO_BASE: 72,
    PRO_SPREAD: 5,
  },
};

/* ===== 能力の評価（S〜G） =====
   S90〜100、A80〜89、B70〜79、C60〜69、D50〜59、E40〜49、F15〜39、G1〜14 */
const RANK_TABLE = [
  { min: 90, rank: 'S' },
  { min: 80, rank: 'A' },
  { min: 70, rank: 'B' },
  { min: 60, rank: 'C' },
  { min: 50, rank: 'D' },
  { min: 40, rank: 'E' },
  { min: 15, rank: 'F' },
  { min: 1,  rank: 'G' },
];

function rankOf(v) {
  const n = Math.max(1, Math.min(100, Math.round(v)));
  for (const r of RANK_TABLE) if (n >= r.min) return r.rank;
  return 'G';
}

/* ===== 守備位置 =====
   key は内部用、short はスコアブックの1文字、num は守備番号。
   DH は守る場所が無いので適性を持たない（誰でも入れる）。 */
const POSITIONS = [
  { key: 'P',  short: '投', name: '投手' },
  { key: 'C',  short: '捕', name: '捕手' },
  { key: '1B', short: '一', name: '一塁手' },
  { key: '2B', short: '二', name: '二塁手' },
  { key: '3B', short: '三', name: '三塁手' },
  { key: 'SS', short: '遊', name: '遊撃手' },
  { key: 'LF', short: '左', name: '左翼手' },
  { key: 'CF', short: '中', name: '中堅手' },
  { key: 'RF', short: '右', name: '右翼手' },
  { key: 'DH', short: '指', name: '指名打者' },
];

/* 野手データセットに一人ずつ入れる守備位置（捕一二三遊左中右）。
   DHは入れない。指名打者は生まれつきの持ち場ではなく、
   守れる位置を持った野手の中から毎回選ぶ「役割」にしてある */
const FIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const DATASET_POSITIONS = FIELD_POSITIONS.slice();
/* オーダーで選べる9枠（守備位置8つ＋DH）。選手の生まれつきの持ち場である
   DATASET_POSITIONS とは別にしてある：DHは誰でも選べる「役割」であって、
   持ち場ではないため */
const LINEUP_POSITIONS = FIELD_POSITIONS.concat(['DH']);

const POS = {};
POSITIONS.forEach((p) => { POS[p.key] = p; });

function posShort(key) { return POS[key] ? POS[key].short : '―'; }
function posName(key) { return POS[key] ? POS[key].name : '―'; }

/* 守備の近さ。主ポジションから遠いほど適性が落ちる。
   （捕手だけは特殊で、他とつながりが薄い） */
const POS_NEAR = {
  C:  { C: 0, '1B': 3, '2B': 5, '3B': 4, SS: 6, LF: 6, CF: 7, RF: 6 },
  '1B': { C: 5, '1B': 0, '2B': 3, '3B': 2, SS: 4, LF: 3, CF: 5, RF: 3 },
  '2B': { C: 5, '1B': 2, '2B': 0, '3B': 2, SS: 1, LF: 3, CF: 3, RF: 3 },
  '3B': { C: 4, '1B': 1, '2B': 2, '3B': 0, SS: 2, LF: 3, CF: 4, RF: 3 },
  SS: { C: 5, '1B': 2, '2B': 1, '3B': 1, SS: 0, LF: 3, CF: 3, RF: 3 },
  LF: { C: 6, '1B': 2, '2B': 4, '3B': 3, SS: 5, LF: 0, CF: 1, RF: 1 },
  CF: { C: 6, '1B': 3, '2B': 3, '3B': 4, SS: 4, LF: 1, CF: 0, RF: 1 },
  RF: { C: 6, '1B': 2, '2B': 4, '3B': 3, SS: 5, LF: 1, CF: 1, RF: 0 },
};

/* ===== 変化球 =====
   weight は「その球種を持っている投手がどれくらいいるか」。
   現実と同じで、スライダーやカーブはありふれていて、
   ナックルを投げる投手はまず居ない。 */
const PITCH_TYPES = [
  { name: 'スライダー',   weight: 100 },
  { name: 'カーブ',       weight: 88 },
  { name: 'チェンジアップ', weight: 62 },
  { name: 'フォーク',     weight: 52 },
  { name: 'カットボール', weight: 40 },
  { name: 'シュート',     weight: 38 },
  { name: 'ツーシーム',   weight: 26 },
  { name: 'スプリット',   weight: 16 },
  { name: 'シンカー',     weight: 14 },
  { name: 'スローカーブ', weight: 10 },
  { name: 'ナックルカーブ', weight: 5 },
  { name: 'スクリュー',   weight: 3.5 },
  { name: 'パーム',       weight: 2 },
  { name: 'ナックル',     weight: 0.25 },   // めちゃくちゃレア
];

/* ===== 大会 ===== */
const ROUND_NAMES = ['1回戦', '2回戦', '準々決勝', '準決勝', '決勝'];

/* 野手・投手それぞれの、特訓で伸ばせる能力 */
const BATTER_STATS = [
  { key: 'meet',  label: 'ミート' },
  { key: 'power', label: 'パワー' },
  { key: 'speed', label: '走力' },
  { key: 'arm',   label: '肩力' },
  { key: 'field', label: '守備' },
  { key: 'catch', label: '捕球' },
];
const PITCHER_STATS = [
  { key: 'control', label: '制球' },
  { key: 'stamina', label: 'スタミナ' },
];

/* 弾道の呼び方（1〜4。数字が大きいほど高い） */
const TRAJ_LABEL = ['', 'ライナー', 'やや低い', 'やや高い', '高い'];
