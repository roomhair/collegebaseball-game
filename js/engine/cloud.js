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
        let base = 'saves/shared-';
        try {
          const user = await window.claude.use('user');
          const id = user && await user.id();
          if (id) base = 'data/users/' + id + '/';
        } catch (e) { /* 共通の場所のまま */ }
        return { db, base };
      } catch (e) { return null; }
    })();
    return ready;
  }

  /* 1つの文書は256KiBまでなので、長い保存は分けて置く（日本語は1文字3バイトになりうる） */
  const CHUNK = 60000;
  function ref(r, slot, part) { return r.db.doc(r.base + 'slot' + slot + (part == null ? '' : 'p' + part)); }

  async function writeAll(r, slot, raw) {
    const n = Math.ceil(raw.length / CHUNK);
    for (let i = 0; i < n; i++) await ref(r, slot, i).set({ s: raw.slice(i * CHUNK, (i + 1) * CHUNK) });
    await ref(r, slot).set({ n, at: Date.now(), len: raw.length });
  }

  async function readAll(r, slot) {
    const head = await ref(r, slot).get();
    if (!head.exists) return null;
    const d = head.data() || {};
    let raw = '';
    for (let i = 0; i < (d.n || 0); i++) {
      const c = await ref(r, slot, i).get();
      if (!c.exists) return null;
      raw += (c.data() || {}).s || '';
    }
    if (d.len && raw.length !== d.len) return null;
    return { raw, at: d.at || 0 };
  }

  /* 1操作ごとに保存が走るので、少し間を置いてまとめて送る */
  const timers = {};
  function push(slot, raw) {
    pending[slot] = raw;
    clearTimeout(timers[slot]);
    timers[slot] = setTimeout(() => flush(slot), 2500);
    return true;
  }

  async function flush(slot) {
    const r = await find();
    if (!r) return;
    const raw = pending[slot];
    if (!raw || raw === sent[slot]) return;
    if (sending[slot]) { timers[slot] = setTimeout(() => flush(slot), 1500); return; }
    sending[slot] = true;
    pending[slot] = null;
    try { await writeAll(r, slot, raw); sent[slot] = raw; }
    catch (e) { console.warn('サーバー側に保存できませんでした', e); pending[slot] = pending[slot] || raw; }
    finally { sending[slot] = false; }
  }

  async function wipe(slot) {
    const r = await find();
    if (!r) return;
    sent[slot] = ''; pending[slot] = null; clearTimeout(timers[slot]);
    try { await ref(r, slot).delete(); } catch (e) { /* 続けられる */ }
  }

  /** 起動時。サーバー側のほうが新しいデータを書き戻す。戻した数を返す */
  async function restore() {
    const r = await find();
    if (!r) return 0;
    let n = 0;
    for (let slot = 1; slot <= CONFIG.SLOTS; slot++) {
      try {
        const d = await readAll(r, slot);
        if (!d || !d.raw) continue;
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
