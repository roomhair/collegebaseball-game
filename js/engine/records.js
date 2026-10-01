/* ==================================================
   大学野球  records.js

   長く遊ぶほど積み上がる記録。
   ・チーム通算（勝敗・優勝・全国大会・各部の在籍・プロ輩出）
   ・シーズンごとの成績（年度・春秋・所属・順位・勝ち点・全国・入れ替え戦）
   ・OB（引退・退部した選手）の記録とプロ入り選手の一覧
   ・年表（昇格、初優勝、日本一、不祥事、解散……）
   ・対戦成績（ライバル関係）
   どれも大学・選手の「内部ID」で持つので、名前を変えても壊れない。
   ================================================== */
'use strict';

const Records = (() => {

  function init(state) {
    state.records = {
      team: { w: 0, l: 0, d: 0, titles: 0, natApps: 0, natTitles: 0, japanTitles: 0,
              div: { 1: 0, 2: 0, 3: 0 }, pros: 0, playoffs: 0 },
      seasons: [],
      alumni: [],
      pros: [],
      chronicle: [],
      h2h: {},
      gone: [],          // 引退・退部した選手のID（復活させないため）
      soccerSeasons: [],
      proSeasons: [],
    };
  }

  function R(state) { if (!state.records) init(state); return state.records; }

  function chronicle(state, text, kind) {
    const r = R(state);
    r.chronicle.push({ y: state.year, t: state.term, text, kind: kind || 'info' });
    if (r.chronicle.length > 400) r.chronicle.splice(0, r.chronicle.length - 400);
  }

  /** 試合1つぶん（大学野球の公式戦）。oppId が大学IDなら対戦成績にも入れる */
  function game(state, oppId, my, op) {
    const r = R(state);
    if (my > op) r.team.w++; else if (op > my) r.team.l++; else r.team.d++;
    if (oppId) {
      const h = r.h2h[oppId] = r.h2h[oppId] || { w: 0, l: 0, d: 0 };
      if (my > op) h.w++; else if (op > my) h.l++; else h.d++;
    }
  }

  /** シーズンの記録を1行足す */
  function season(state, row) {
    const r = R(state);
    r.seasons.push(row);
    r.team.div[row.div] = (r.team.div[row.div] || 0) + 0.5;   // 春秋で半年ずつ
    if (row.rank === 1 && row.div === 1) r.team.titles++;
    return row;
  }

  function lastSeason(state) {
    const s = R(state).seasons;
    return s[s.length - 1] || null;
  }

  /** 選手をOBの記録に移す（卒業・退部・プロ入り） */
  function alumni(state, p, why) {
    const r = R(state);
    if (r.gone.indexOf(p.id) >= 0) return;
    r.gone.push(p.id);
    r.alumni.push({
      id: p.id, name: p.name, kind: p.kind, pos: p.pos, hand: (p.throws || '') + (p.bats || ''),
      enrolled: p.enrolled, left: state.year, why,
      career: p.career, seasons: p.seasons || [],
      top: (p.hl || []).slice().sort((a, b) => b.score - a.score).slice(0, 3),
      hist: (p.hist || []).slice(-12),
      path: p.path || null,
      rating: Player.rating(p),
      captain: !!p.wasCaptain,
      persona: p.persona ? p.persona.type : null,
      incidents: p.incidents || 0,
    });
    if (r.alumni.length > 600) r.alumni.splice(0, r.alumni.length - 600);
  }

  function isGone(state, pid) {
    return !!(state.records && state.records.gone.indexOf(pid) >= 0);
  }

  function pro(state, p, path) {
    const r = R(state);
    r.team.pros++;
    r.pros.push({ id: p.id, name: p.name, year: state.year, team: path.team, round: path.round, text: path.text,
                  kind: p.kind, pos: p.pos });
    chronicle(state, p.name + 'が' + path.text + 'でプロ入り', 'pro');
  }

  /**
   * 大学の評価（0〜100）。新入生が進学先を選ぶときの目安。
   * プロ輩出・全国大会の実績・リーグ優勝・最近の成績・育成の実績で決まる。
   */
  function prestige(state) {
    const r = R(state);
    const t = r.team;
    let v = 34;
    v += Math.min(16, t.pros * 2.2);
    v += Math.min(16, t.natTitles * 6 + t.natApps * 1.5);
    v += Math.min(10, t.titles * 2);
    /* 最近の成績（直近4シーズン） */
    const recent = r.seasons.slice(-4);
    recent.forEach((s, i) => {
      const w = 0.6 + i * 0.25;
      v += w * ({ 1: 3.5, 2: 0.5, 3: -2.5 }[s.div] || 0);
      if (s.div === 1 && s.rank === 1) v += w * 2;
      if (s.national && s.national.champion) v += w * 3;
    });
    /* 育成の実績：入部時より大きく伸びたOB */
    const grown = r.alumni.slice(-20).filter((a) => a.seasons.length >= 4 && a.rating >= 60).length;
    v += Math.min(6, grown * 0.8);
    /* 不祥事は評判を落とす */
    v -= Math.min(14, (state.scandal || 0));
    return Math.round(RNG.clamp(v, 0, 100));
  }

  function prestigeRank(v) {
    return v >= 80 ? 'S' : v >= 66 ? 'A' : v >= 52 ? 'B' : v >= 40 ? 'C' : v >= 28 ? 'D' : 'E';
  }

  /** いちばん因縁のある相手（試合数が多く、勝敗が拮抗している大学） */
  function rivals(state) {
    const h = R(state).h2h;
    return Object.keys(h).map((id) => {
      const x = h[id];
      const n = x.w + x.l + x.d;
      return { id, w: x.w, l: x.l, d: x.d, n, score: n - Math.abs(x.w - x.l) * 1.5 };
    }).filter((x) => x.n >= 4).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  return { init, chronicle, game, season, lastSeason, alumni, isGone, pro, prestige, prestigeRank, rivals };
})();
