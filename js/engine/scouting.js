/* ==================================================
   大学野球  scouting.js

   新入生スカウト（春のシーズンが終わった後）と、秋の終わりの進路決定。
   ・候補は高校3年生。能力も性格も、最初はぼんやりとしか見えない。
     「視察」すると情報が確かになっていく（ポイントに限りがある）。
   ・推薦枠を提示した選手だけが、こちらに来る可能性がある。
   ・ただし来てくれるとは限らない。他大学・プロ球団・社会人チームと取り合いになる。
     プロ志望の有望株はドラフトで指名されればプロへ行く。
   ・大学の評価（実績）が高いほど選ばれやすいが、必ずではない。
   ================================================== */
'use strict';

const Scouting = (() => {

  const POINTS = 8;          // 視察できる回数
  const MAX_LOOK = 2;        // 1人あたりの視察の深さ
  const POOL = 18;           // 候補の人数

  /* 候補の格。S は超高校級。出やすさと強さ */
  const TIERS = [
    { key: 'S', weight: 5 },
    { key: 'A', weight: 18 },
    { key: 'B', weight: 37 },
    { key: 'C', weight: 40 },
  ];

  /** スカウトの期間を始める。候補を作る */
  function start(state) {
    const cands = [];
    for (let i = 0; i < POOL; i++) cands.push(candidate(state, i));
    /* 投手と野手の両方が必ず混じるように */
    if (!cands.some((c) => c.player.kind === 'pitcher')) cands[0] = candidate(state, 0, 'pitcher');
    cands.sort((a, b) => 'SABC'.indexOf(a.tier) - 'SABC'.indexOf(b.tier));
    return {
      year: state.year,
      points: POINTS, offers: 0, special: null,
      cands,
      resolved: false,
      results: null,
    };
  }

  function candidate(state, i, forceKind) {
    const tier = RNG.weighted(TIERS).key;
    const kind = forceKind || (RNG.chance(0.38) ? 'pitcher' : 'batter');
    const lv = College.FRESH_LEVEL[tier] + RNG.norm(0, 1.8);
    const strong = tier === 'S' || tier === 'A';
    const p = College.newPlayer(kind, 1, lv, {
      pos: RNG.pick(FIELD_POSITIONS),
      route: '推薦',
      koshien: RNG.chance(strong ? 0.75 : tier === 'B' ? 0.3 : 0.08),
      hsCaptain: RNG.chance(0.18),
      persona: tier === 'S' && RNG.chance(0.25) ? { problem: true } : {},
    });
    p.hs = NAMES.highSchool(p.koshien);
    if (p.hsCaptain) p.persona.lead = Math.max(p.persona.lead, RNG.range(55, 85));
    p.rumorText = Persona.rumor(p.persona.type);
    /* 見え方のずれ（視察の深さごとに固定。開き直しても同じ見え方になるように） */
    const noise = {};
    ['meet', 'power', 'speed', 'arm', 'field', 'catch', 'control', 'stamina', 'velo', 'conduct', 'growth', 'potential'].forEach((k) => {
      noise[k] = [RNG.norm(0, 11), RNG.norm(0, 5)];
    });
    return {
      id: 'c' + p.id,
      player: p,
      tier,
      proWish: tier === 'S' ? RNG.chance(0.65) : tier === 'A' ? RNG.chance(0.35) : RNG.chance(0.06),
      shakaiWish: RNG.chance(tier === 'C' ? 0.22 : 0.12),
      /* 他大学の熱の入れよう（0〜1）。強い選手ほど取り合いになる */
      rival: RNG.clamp({ S: 0.85, A: 0.65, B: 0.4, C: 0.2 }[tier] + RNG.norm(0, 0.12), 0, 1),
      look: 0,
      seen: [Persona.episode(p.persona.type)],
      noise,
      offered: false,
    };
  }

  /* ---------- 見え方 ---------- */

  /** 視察の深さに応じた「見えている値」。0:ぼんやり 1:だいたい 2:確か */
  function seenValue(c, key, real) {
    const n = c.noise[key];
    if (c.look >= MAX_LOOK) return real;
    return real + (c.look === 0 ? n[0] : n[1]);
  }

  /** 能力の見え方（評価の文字。不確かなら「？」を付ける） */
  function abilityText(c, key) {
    const p = c.player;
    const v = seenValue(c, key, p[key]);
    return rankOf(v) + (c.look >= MAX_LOOK ? '' : '？');
  }

  function veloText(c) {
    const p = c.player;
    if (c.look >= MAX_LOOK) return p.velo + 'km/h';
    const v = Math.round(seenValue(c, 'velo', p.velo) / (c.look ? 1 : 1));
    const w = c.look ? 2 : 5;
    return (v - w) + '〜' + (v + w) + 'km/h';
  }

  function conductText(c) {
    const p = c.player;
    if (c.look === 0) return '不明';
    const r = Persona.conductRank(seenValue(c, 'conduct', p.persona.conduct));
    return c.look >= MAX_LOOK ? r : r + '？（噂）';
  }

  function growthText(c) {
    const p = c.player;
    if (c.look === 0) return '？';
    const r = Persona.grade5(seenValue(c, 'growth', p.growthRate));
    return c.look >= MAX_LOOK ? r : r + '？';
  }

  /** 将来性（潜在能力の見立て） */
  function futureText(c) {
    const p = c.player;
    const r = rankOf(seenValue(c, 'potential', p.potential));
    return c.look >= MAX_LOOK ? r : r + '？';
  }

  function personalityText(c) {
    return c.look >= MAX_LOOK ? '「' + c.player.rumorText + '」' : '「' + c.player.rumorText + '」らしい';
  }

  /* ---------- 操作 ---------- */

  /** 視察する。ポイントを1使い、見え方が確かになり、エピソードが増える */
  function look(sc, cid) {
    const c = sc.cands.find((x) => x.id === cid);
    if (!c || sc.points <= 0 || c.look >= MAX_LOOK) return false;
    sc.points--;
    c.look++;
    const e = Persona.episode(c.player.persona.type);
    if (c.seen.indexOf(e) < 0) c.seen.push(e);
    if (c.look >= MAX_LOOK) {
      const e2 = Persona.episode(c.player.persona.type);
      if (c.seen.indexOf(e2) < 0) c.seen.push(e2);
    }
    return true;
  }

  /** 推薦枠を出す／取り下げる */
  function toggleOffer(sc, cid) {
    const c = sc.cands.find((x) => x.id === cid);
    if (!c) return false;
    if (c.offered) {
      c.offered = false; sc.offers--;
      if (sc.special === cid) sc.special = null;
      return true;
    }
    if (sc.offers >= CONFIG.ROSTER.REC_SLOTS) return false;
    c.offered = true; sc.offers++;
    return true;
  }

  /** 特待生（1人だけ）。来てくれる見込みが大きく上がる */
  function toggleSpecial(sc, cid) {
    const c = sc.cands.find((x) => x.id === cid);
    if (!c || !c.offered) return false;
    sc.special = sc.special === cid ? null : cid;
    return true;
  }

  /** 来てくれそうか（画面に出す大まかな手応え。数字は出さない） */
  function feel(state, sc, c) {
    const p = chance(state, sc, c);
    if (p >= 0.7) return '好感触';
    if (p >= 0.45) return '脈あり';
    if (p >= 0.25) return '五分五分';
    return '厳しい';
  }

  /** こちらを選ぶ見込み（内部用） */
  function chance(state, sc, c) {
    const pres = Records.prestige(state);
    let p = 0.5 + (pres - 50) / 100 * 0.9;
    p -= { S: 0.32, A: 0.18, B: 0.06, C: 0 }[c.tier];
    p -= c.rival * 0.12;
    p += c.look * 0.05;                       // 足を運んだぶんだけ心証が良い
    if (sc.special === c.id) p += 0.28;
    if (c.proWish) p -= 0.08;
    if (c.shakaiWish) p -= 0.05;
    return RNG.clamp(p, 0.04, 0.95);
  }

  /** プロに指名されるか */
  function drafted(c) {
    if (!c.proWish) return false;
    return RNG.chance({ S: 0.82, A: 0.42, B: 0.08, C: 0.01 }[c.tier]);
  }

  /**
   * 秋の終わりの進路決定。推薦枠を出した選手が来るかどうかと、
   * 来なかった有望選手がどこへ行ったかをまとめる。
   * 戻り値の joined が入部する選手。
   */
  function resolve(state, sc) {
    if (sc.resolved) return sc.results;
    const joined = [], lost = [];
    const others = Object.keys(state.unis).filter((id) => id !== state.userUni);
    sc.cands.forEach((c) => {
      const p = c.player;
      let dest = null;
      if (drafted(c)) {
        const team = 'pt' + RNG.range(0, 11);
        const round = c.tier === 'S' ? RNG.range(1, 2) : RNG.range(2, 6);
        dest = { kind: 'pro', team, text: 'プロ入り（ドラフト' + round + '位）' };
      } else if (c.shakaiWish && RNG.chance(sc.special === c.id ? 0.25 : 0.55)) {
        dest = { kind: 'shakai', text: '社会人野球（' + RNG.pick(NAMES.COMPANIES) + '）へ' };
      } else if (c.offered && RNG.chance(chance(state, sc, c))) {
        dest = { kind: 'us', text: '入部' };
      } else {
        /* 他の大学へ。強い選手ほど1部の大学に行きやすい */
        const pool = c.tier === 'S' || c.tier === 'A'
          ? state.divisions[1].concat(state.divisions[2]).filter((id) => id !== state.userUni)
          : others;
        const uni = RNG.pick(pool);
        dest = { kind: 'uni', uni, text: '他大学（' + Universities.name(state, uni) + '）へ' };
        /* 有望な選手を取った大学は少し強くなる */
        if (state.unis[uni]) {
          state.unis[uni].recent = (state.unis[uni].recent || 0) + ({ S: 1.2, A: 0.6, B: 0.2, C: 0 }[c.tier]);
        }
      }
      c.dest = dest;
      if (dest.kind === 'us') {
        p.route = sc.special === c.id ? '特待生' : '推薦';
        joined.push(p);
      } else if (c.offered || c.tier === 'S' || c.tier === 'A') {
        lost.push({ name: p.name, tier: c.tier, kind: p.kind, pos: p.pos, text: dest.text, offered: c.offered });
      }
    });
    sc.resolved = true;
    sc.results = { joinedIds: joined.map((p) => p.id), lost };
    return sc.results;
  }

  /** 入部が決まった選手（resolve のあと） */
  function joinedPlayers(sc) {
    if (!sc || !sc.results) return [];
    const ids = new Set(sc.results.joinedIds);
    return sc.cands.filter((c) => ids.has(c.player.id)).map((c) => c.player);
  }

  return {
    start, look, toggleOffer, toggleSpecial, feel, chance, resolve, joinedPlayers,
    abilityText, veloText, conductText, growthText, futureText, personalityText,
    POINTS, MAX_LOOK,
  };
})();
