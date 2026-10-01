/* ==================================================
   大学野球  cloud.js（強奪高校野球の cloud.js を3データ対応にしたもの）

   claude.ai の公開版（枠の中）で動いているときだけ、localStorage と同じ中身を
   サーバー側（Artifact の db）にも置き、ブラウザ側が消えていたら書き戻す。
   ふつうのサイトでは window.claude が無いので、丸ごと何もしない。
   ================================================== */
'use strict';

const Cloud = (() => {
  let ready = null;
  const sent = {}, sending = {}, pending = {};

  function find() {
    if (ready) return ready;
    ready = (async () => {
      try {
        if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return null;
        const db = await window.claude.use('db');
        if (!db) return null;
        let base = 'saves/shared';
        try {
          const user = await window.claude.use('user');
          const id = user && await user.id();
          if (id) base = 'data/users/' + id;
        } catch (e) { /* 共通の場所のまま */ }
        return { db, base };
      } catch (e) { return null; }
    })();
    return ready;
  }

  function ref(r, slot) { return r.db.doc(r.base + '/slot' + slot); }

  async function push(slot, raw) {
    const r = await find();
    if (!r) return false;
    if (sent[slot] === raw) return true;
    if (sending[slot]) { pending[slot] = raw; return true; }
    sending[slot] = true;
    try { await ref(r, slot).set({ raw, at: Date.now() }); sent[slot] = raw; }
    catch (e) { console.warn('サーバー側に保存できませんでした', e); }
    finally {
      sending[slot] = false;
      const next = pending[slot]; pending[slot] = null;
      if (next && next !== sent[slot]) push(slot, next);
    }
    return true;
  }

  async function wipe(slot) {
    const r = await find();
    if (!r) return;
    sent[slot] = ''; pending[slot] = null;
    try { await ref(r, slot).delete(); } catch (e) { /* 続けられる */ }
  }

  /** 起動時。サーバー側のほうが新しいデータを書き戻す。戻した数を返す */
  async function restore() {
    const r = await find();
    if (!r) return 0;
    let n = 0;
    for (let slot = 1; slot <= CONFIG.SLOTS; slot++) {
      try {
        const snap = await ref(r, slot).get();
        if (!snap.exists) continue;
        const d = snap.data() || {};
        if (typeof d.raw !== 'string' || !d.raw) continue;
        sent[slot] = d.raw;
        const key = CONFIG.SAVE_PREFIX + slot;
        let here = '', hereAt = 0;
        try { here = localStorage.getItem(key) || ''; if (here) hereAt = JSON.parse(here).at || 0; } catch (e) { here = ''; }
        if (here === d.raw) continue;
        if (here && hereAt >= (d.at || 0)) { push(slot, here); continue; }
        localStorage.setItem(key, d.raw);
        n++;
      } catch (e) { /* 次へ */ }
    }
    return n;
  }

  return { push, wipe, restore };
})();
