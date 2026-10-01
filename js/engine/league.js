/* ==================================================
   大学野球  league.js

   春・秋のリーグ戦と入れ替え戦。
   ・各部6大学の総当たり（5節）。1つの対戦（カード）は「2勝先取」。
     引き分けは勝敗に数えず、どちらかが2勝するまで続ける。
   ・カードを取った大学に勝ち点1。
   ・順位は 勝ち点 → 勝率（引き分けは分母から除く）→ 直接対決 →
     得失点差 → 抽選 の順に決める。
   ・リーグ戦のあとに入れ替え戦（1部6位×2部1位、2部6位×3部1位。2勝先取）。
   ================================================== */
'use strict';

const League = (() => {

  /** 円卓法で総当たりの組み合わせを作る。6校なら5節×3カード */
  function roundRobin(ids) {
    const list = RNG.shuffle(ids.slice());
    const n = list.length;
    const rounds = [];
    const arr = list.slice();
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());   // 先頭を固定して回す
    }
    return rounds;
  }

  function newCard(div, round, a, b) {
    return {
      key: div + '-' + round + '-' + a + '-' + b,
      div, round, a, b,
      games: [],                // { a: 得点, b: 得点, inn }
      winsA: 0, winsB: 0, draws: 0,
      done: false, winner: null,
    };
  }

  /** シーズン（春か秋）を作る */
  function create(state) {
    const divs = { 1: state.divisions[1].slice(), 2: state.divisions[2].slice(), 3: state.divisions[3].slice() };
    const schedule = {};
    const cards = {};
    const lots = {};
    [1, 2, 3].forEach((d) => {
      schedule[d] = roundRobin(divs[d]).map((pairs, r) =>
        pairs.map(([a, b]) => {
          const c = newCard(d, r, a, b);
          cards[c.key] = c;
          return c.key;
        }));
      divs[d].forEach((id) => { lots[id] = RNG.rand(); });
    });
    return {
      year: state.year, term: state.term, seq: state.seasonSeq,
      divs, schedule, cards, lots,
      round: 0,           // いまの節（0始まり）
      done: false,
    };
  }

  /** そのカードの1試合を記録する。a・b はカードの a/b の得点 */
  function recordGame(card, ra, rb, inn) {
    if (card.done) return card;
    card.games.push({ a: ra, b: rb, inn: inn || 9 });
    if (ra > rb) card.winsA++;
    else if (rb > ra) card.winsB++;
    else card.draws++;
    if (card.winsA >= 2 || card.winsB >= 2) {
      card.done = true;
      card.winner = card.winsA >= 2 ? card.a : card.b;
    }
    return card;
  }

  /** 自分が出ないカードを最後まで回す */
  function simCard(card, levelOf) {
    let guard = 0;
    while (!card.done && guard++ < 30) {
      const g = Universities.quickGame(levelOf(card.a), levelOf(card.b), true);
      recordGame(card, g.a, g.b, g.inn);
    }
    /* ここまで来ても決まらないことは実質ないが、念のため強いほうに */
    if (!card.done) {
      card.done = true;
      card.winner = levelOf(card.a) >= levelOf(card.b) ? card.a : card.b;
    }
    return card;
  }

  /** その節で、自分が出るカード（無ければ null） */
  function userCard(season, uid, round) {
    const r = round == null ? season.round : round;
    for (const d of [1, 2, 3]) {
      const keys = season.schedule[d][r] || [];
      for (const k of keys) {
        const c = season.cards[k];
        if (c.a === uid || c.b === uid) return c;
      }
    }
    return null;
  }

  /** その節の、自分以外のカードを全部回す */
  function simRound(season, uid, levelOf) {
    const r = season.round;
    [1, 2, 3].forEach((d) => {
      (season.schedule[d][r] || []).forEach((k) => {
        const c = season.cards[k];
        if (c.a === uid || c.b === uid) return;
        simCard(c, levelOf);
      });
    });
  }

  function roundDone(season) {
    const r = season.round;
    return [1, 2, 3].every((d) => (season.schedule[d][r] || []).every((k) => season.cards[k].done));
  }

  /** 次の節へ。全部終わったら done */
  function nextRound(season) {
    season.round++;
    if (season.round >= 5) { season.done = true; season.round = 5; }
    return season;
  }

  /* ---------- 順位表 ---------- */

  function emptyRow(id) {
    return { id, points: 0, w: 0, l: 0, d: 0, rf: 0, ra: 0, cards: 0, played: 0 };
  }

  function rowsOf(season, div) {
    const rows = {};
    season.divs[div].forEach((id) => { rows[id] = emptyRow(id); });
    Object.keys(season.cards).forEach((k) => {
      const c = season.cards[k];
      if (c.div !== div) return;
      const A = rows[c.a], B = rows[c.b];
      c.games.forEach((g) => {
        A.rf += g.a; A.ra += g.b; B.rf += g.b; B.ra += g.a;
        if (g.a > g.b) { A.w++; B.l++; } else if (g.b > g.a) { B.w++; A.l++; } else { A.d++; B.d++; }
      });
      if (c.done) {
        A.played++; B.played++;
        rows[c.winner].points++;
      }
    });
    return rows;
  }

  /** 勝率。引き分けは分母に入れない */
  function pct(r) { return r.w + r.l ? r.w / (r.w + r.l) : 0; }

  /** 同じ勝ち点・勝率で並んだ大学どうしの直接対決（そのグループ内での勝ち点、次に勝ち越し数） */
  function h2h(season, div, group) {
    const set = new Set(group);
    const pts = {}, net = {};
    group.forEach((id) => { pts[id] = 0; net[id] = 0; });
    Object.keys(season.cards).forEach((k) => {
      const c = season.cards[k];
      if (c.div !== div || !set.has(c.a) || !set.has(c.b)) return;
      if (c.done) pts[c.winner]++;
      net[c.a] += c.winsA - c.winsB;
      net[c.b] += c.winsB - c.winsA;
    });
    return (id) => pts[id] * 100 + net[id];
  }

  /** 順位表（1位から）。各行に rank を入れて返す */
  function standings(season, div) {
    const rows = rowsOf(season, div);
    const list = Object.keys(rows).map((id) => rows[id]);
    /* 勝ち点・勝率で並べ、そろったところだけ直接対決以降で決める */
    list.sort((a, b) => (b.points - a.points) || (pct(b) - pct(a)));
    const out = [];
    let i = 0;
    while (i < list.length) {
      let j = i + 1;
      while (j < list.length && list[j].points === list[i].points &&
             Math.abs(pct(list[j]) - pct(list[i])) < 1e-9) j++;
      const group = list.slice(i, j);
      if (group.length > 1) {
        const hh = h2h(season, div, group.map((r) => r.id));
        group.sort((a, b) =>
          (hh(b.id) - hh(a.id)) ||
          ((b.rf - b.ra) - (a.rf - a.ra)) ||
          (season.lots[b.id] - season.lots[a.id]));
      }
      group.forEach((r) => out.push(r));
      i = j;
    }
    out.forEach((r, k) => { r.rank = k + 1; r.pct = pct(r); });
    return out;
  }

  function rankOfTeam(season, id) {
    for (const d of [1, 2, 3]) {
      if (season.divs[d].indexOf(id) >= 0) {
        const row = standings(season, d).find((r) => r.id === id);
        return { div: d, rank: row.rank, row };
      }
    }
    return null;
  }

  /* ---------- 入れ替え戦 ---------- */

  /** リーグ戦の順位から、入れ替え戦の組み合わせを作る */
  function makePlayoffs(season) {
    const s1 = standings(season, 1), s2 = standings(season, 2), s3 = standings(season, 3);
    return [
      Object.assign(newCard('p12', 0, s1[5].id, s2[0].id), { upperDiv: 1, upper: s1[5].id, lower: s2[0].id }),
      Object.assign(newCard('p23', 0, s2[5].id, s3[0].id), { upperDiv: 2, upper: s2[5].id, lower: s3[0].id }),
    ];
  }

  /**
   * 入れ替え戦の結果を、来季の所属に反映する。
   * 上位の部の6位が負ければ入れ替え、勝てば残留。各部6校は崩れない。
   */
  function applyPlayoffs(state, playoffs) {
    const moves = [];
    playoffs.forEach((pc) => {
      if (!pc.done) return;
      const up = pc.upperDiv, lo = up + 1;
      if (pc.winner === pc.lower) {
        const U = state.divisions[up], L = state.divisions[lo];
        const iu = U.indexOf(pc.upper), il = L.indexOf(pc.lower);
        if (iu >= 0 && il >= 0) {
          U[iu] = pc.lower; L[il] = pc.upper;
          moves.push({ up: pc.lower, down: pc.upper, from: lo, to: up });
        }
      }
    });
    check(state);
    return moves;
  }

  /** 各部がちょうど6校で、重複が無いことを確かめる（壊れていたら例外） */
  function check(state) {
    const seen = new Set();
    [1, 2, 3].forEach((d) => {
      const list = state.divisions[d];
      if (list.length !== 6) throw new Error(d + '部の大学数が6ではありません: ' + list.length);
      list.forEach((id) => {
        if (seen.has(id)) throw new Error('大学が重複しています: ' + id);
        seen.add(id);
      });
    });
    if (seen.size !== 18) throw new Error('大学数が18ではありません');
  }

  return {
    create, recordGame, simCard, userCard, simRound, roundDone, nextRound,
    standings, rankOfTeam, makePlayoffs, applyPlayoffs, check, pct, newCard,
  };
})();
