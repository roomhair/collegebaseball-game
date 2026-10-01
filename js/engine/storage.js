/* ==================================================
   大学野球  storage.js

   ブラウザに3つまで保存できる（データ1〜データ3）。
   ・1つのデータは localStorage の1つの鍵（cbbgame.slot1 など）に入る。
   ・データ選択画面に出す見出し（大学名・リーグ・順位・何年目・フェーズ・
     最終プレイ日時）は meta として別に持ち、全部を読まなくても一覧を出せる。
   ・保存できない環境（プライベートモード等）でも遊べなくはならない。
   ・公開版（claude.ai の枠の中）では Cloud にも同じ中身を置く（cloud.js）。
   ================================================== */
'use strict';

/* 保存の置き場所。ブラウザが保存を禁止しているとき（ファイルを直接開いた・プライベートモード等）は、
   画面を閉じるまでのあいだだけ覚えておく仮の置き場所で代わりにする（遊べなくはしない） */
const LS = (() => {
  try {
    const k = '__cbbgame_test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch (e) {
    const m = {};
    return {
      memory: true,
      getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; },
    };
  }
})();

const Storage = {

  key(slot) { return CONFIG.SAVE_PREFIX + slot; },

  /** 本当にブラウザに保存できるか（できないときは閉じると消える） */
  persistent() { return !LS.memory; },

  /** 一覧用の見出しを作る */
  metaOf(state) {
    const h = Engine.header(state) || {};
    let league = '', rank = '';
    if (state.mode === 'college' && state.divisions) {
      const d = Universities.divOf(state, state.userUni);
      league = d + '部';
      const last = Records.lastSeason(state);
      if (state.season && state.season.round > 0 && !state.season.done) {
        rank = League.rankOfTeam(state.season, state.userUni).rank + '位';
      } else if (last) {
        rank = (last.div === d ? last.rank + '位' : '（前季 ' + last.div + '部' + last.rank + '位）');
      }
    } else if (state.mode === 'soccer') {
      league = 'サッカー ' + Soccer.divOf(state) + '部';
    } else if (state.mode === 'pro') {
      league = 'プロ野球'; rank = Pro.placeText(state);
    }
    return {
      uni: state.userUni ? Universities.name(state, state.userUni) : '（チーム作り中）',
      league, rank,
      yearNo: state.year - state.startYear + 1,
      year: state.year,
      phase: h.phase || '',
      mode: state.mode,
    };
  },

  save(slot, state) {
    try {
      const pack = {
        v: CONFIG.SAVE_VERSION,
        seq: Player.currentSeq(),
        at: Date.now(),
        meta: this.metaOf(state),
        d: state,
      };
      const raw = JSON.stringify(pack);
      LS.setItem(this.key(slot), raw);
      if (typeof Cloud !== 'undefined') Cloud.push(slot, raw);
      return true;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('保存できませんでした', e);
      return false;
    }
  },

  /** 読み込む。壊れていたら null（勝手に消さない） */
  load(slot) {
    try {
      const raw = LS.getItem(this.key(slot));
      if (!raw) return null;
      const pack = JSON.parse(raw);
      if (!pack || pack.v !== CONFIG.SAVE_VERSION || !pack.d) return null;
      if (pack.seq) Player.setSeq(pack.seq);
      return pack.d;
    } catch (e) {
      return null;
    }
  },

  /** 一覧（データ1〜3）。空きは null */
  list() {
    const out = [];
    for (let i = 1; i <= CONFIG.SLOTS; i++) {
      let item = null;
      try {
        const raw = LS.getItem(this.key(i));
        if (raw) {
          const pack = JSON.parse(raw);
          item = { slot: i, at: pack.at, meta: pack.meta || {}, broken: !pack.d };
        }
      } catch (e) {
        item = { slot: i, at: 0, meta: {}, broken: true };
      }
      out.push(item);
    }
    return out;
  },

  remove(slot) {
    try { LS.removeItem(this.key(slot)); } catch (e) { /* 何もしない */ }
    if (typeof Cloud !== 'undefined') Cloud.wipe(slot);
  },

  /** データをまるごと別の番号へ写す（「別のデータに保存」） */
  copy(from, to) {
    try {
      const raw = LS.getItem(this.key(from));
      if (!raw) return false;
      LS.setItem(this.key(to), raw);
      if (typeof Cloud !== 'undefined') Cloud.push(to, raw);
      return true;
    } catch (e) { return false; }
  },
};
