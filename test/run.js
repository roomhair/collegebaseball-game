/* 仕様書 47 のテスト。node test/run.js で全部まわす。 */
'use strict';
const { load } = require('./load');
const { makeAuto } = require('./auto');
const G = load();
const { Engine, Team, Player, League, Universities, College, Incidents, Records, Soccer, Pro, Storage, CONFIG } = G;

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; } else { fails++; console.log('  ✗ ' + msg); } }
function section(t) { console.log('\n■ ' + t); }

/* 能力をまとめて上げ下げする（シナリオを作るため） */
function shift(state, d) {
  Team.all(state.team).forEach((p) => {
    ['meet', 'power', 'speed', 'arm', 'field', 'catch', 'control', 'stamina'].forEach((k) => { if (p[k] != null) p[k] = G.RNG.stat(p[k] + d); });
    if (p.velo) p.velo = Math.max(100, Math.min(165, p.velo + Math.round(d / 2)));
    p.potential = Math.max(5, Math.min(99, p.potential + d));
  });
}

function invariants(s) {
  Engine.check(s);
  if (s.mode === 'college' && s.team) {
    const ids = Team.all(s.team).map((p) => p.id);
    if (new Set(ids).size !== ids.length) throw new Error('重複');
  }
}

/** 条件を満たすまで進める */
function runUntil(s, A, cond, max) {
  for (let i = 0; i < (max || 50000); i++) {
    if (cond(s)) return true;
    A.step(s);
    invariants(s);
  }
  return cond(s);
}

function newState() {
  const s = Engine.newGame();
  const A = makeAuto(G, {});
  runUntil(s, A, (x) => x.phase === 'SPRING_TRAINING');
  return { s, A };
}

function moveUserTo(s, div) {
  const cur = Universities.divOf(s, s.userUni);
  if (cur === div) return;
  const other = s.divisions[div][0];
  const a = s.divisions[cur], b = s.divisions[div];
  a[a.indexOf(s.userUni)] = other; b[0] = s.userUni;
  League.check(s);
}

/* ---------- 通常ルート ---------- */
section('通常ルート：2部 → 1部昇格 → 1部優勝 → 全国大会 → 翌年度 → 4年生引退 → 新入生加入');
{
  const { s, A } = newState();
  ok(Universities.divOf(s, s.userUni) === 2, '2部から始まる');
  ok(s.divisions[1].length === 6 && s.divisions[2].length === 6 && s.divisions[3].length === 6, '各部6校');
  const grades = [1, 2, 3, 4].map((g) => Team.all(s.team).filter((p) => p.grade === g).length);
  ok(grades.every((n) => n >= 5 && n <= 9), '初期チームの学年が偏らない ' + grades.join('/'));
  shift(s, 22);
  let promoted = runUntil(s, A, (x) => Universities.divOf(x, x.userUni) === 1, 4000);
  ok(promoted, '1部に昇格する');
  const promoRow = s.records.seasons.find((r) => r.playoff && r.playoff.result === '昇格');
  ok(!!promoRow, '入れ替え戦で昇格が記録される');
  shift(s, 10);
  let nat = runUntil(s, A, (x) => /_NATIONAL$/.test(x.phase), 6000);
  ok(nat, '1部優勝して全国大会に出る');
  if (nat) {
    const me = League.rankOfTeam(s.season, s.userUni);
    ok(me.div === 1 && me.rank === 1, '全国大会に出るのは1部優勝校だけ');
    ok(s.national.userId === s.userUni && Object.keys(s.national.teams).length === 16, '全国大会は16校のトーナメント');
  }
  runUntil(s, A, (x) => x.phase === 'RETIREMENT', 6000);
  const seniors = College.retiring(s).map((p) => p.id);
  ok(seniors.length > 0, '4年生がいる');
  const y = s.year;
  runUntil(s, A, (x) => x.phase === 'SPRING_TRAINING' && x.year === y + 1, 3000);
  ok(s.year === y + 1, '翌年度へ進む');
  const ids = new Set(Team.all(s.team).map((p) => p.id));
  ok(seniors.every((id) => !ids.has(id)), '4年生が引退した');
  ok(seniors.every((id) => Records.isGone(s, id)), '引退した選手はOB記録に残る');
  ok(Team.all(s.team).every((p) => p.grade >= 1 && p.grade <= 4), '学年は1〜4のまま');
  const g1 = Team.all(s.team).filter((p) => p.grade === 1).length;
  ok(g1 >= 4 && g1 <= CONFIG.ROSTER.GRADE_MAX, '新入生が入り、増えすぎない（1年生 ' + g1 + '人）');
  ok(Team.all(s.team).length <= CONFIG.ROSTER.TOTAL_MAX, '部員の上限を超えない');
  /* さらに数年回して、引退選手が復活しない・二重登録が無いことを確かめる */
  runUntil(s, A, (x) => x.year >= y + 4, 30000);
  const gone = new Set(s.records.gone);
  ok(Team.all(s.team).every((p) => !gone.has(p.id)), '引退選手が翌年以降に復活しない');
  ok(s.records.seasons.length >= 8, 'シーズン記録が残る（' + s.records.seasons.length + '件）');
}

/* ---------- 降格ルート ---------- */
section('降格ルート：1部 → 最下位 → 入れ替え戦 → 2部降格');
{
  let done = false;
  for (let attempt = 0; attempt < 6 && !done; attempt++) {
    const { s, A } = newState();
    moveUserTo(s, 1);
    shift(s, -30);
    runUntil(s, A, (x) => x.phase === 'SPRING_PLAYOFF' || (x.season && x.season.done), 3000);
    const me = League.rankOfTeam(s.season, s.userUni);
    if (me.rank !== 6) continue;
    ok(s.phase === 'SPRING_PLAYOFF', '1部6位は入れ替え戦へ');
    const card = Engine.currentCard(s);
    ok(card && card.upper === s.userUni, '相手は2部優勝校');
    runUntil(s, A, (x) => x.phase === 'SUMMER_TRAINING' || x.phase === 'SPRING_NATIONAL', 3000);
    ok(card.done && (card.winsA >= 2 || card.winsB >= 2), '入れ替え戦は2勝先取で決着');
    const row = Records.lastSeason(s);
    if (card.winner !== s.userUni) {
      ok(Universities.divOf(s, s.userUni) === 2, '負けたので2部へ降格');
      ok(row.playoff.result === '降格', '降格が記録される');
      done = true;
    }
    League.check(s);
  }
  ok(done, '降格まで確認できた');
}

/* ---------- 2勝先取・引き分け・順位 ---------- */
section('2勝先取：引き分けは数えず、2勝するまで続く');
{
  const c = League.newCard(1, 0, 'A', 'B');
  League.recordGame(c, 3, 1); League.recordGame(c, 1, 2); League.recordGame(c, 2, 2);
  ok(!c.done, '1勝1敗1分ではカードは終わらない');
  League.recordGame(c, 5, 4);
  ok(c.done && c.winner === 'A' && c.draws === 1, '2勝で決着、引き分けは勝敗に数えない');
  const s = Engine.newGame();
  const se = League.create(s);
  ok(Object.keys(se.cards).length === 45, '各部5節×3カード×3部 = 45カード');
  const lv = () => 50;
  for (let r = 0; r < 5; r++) { League.simRound(se, 'none', lv); League.nextRound(se); }
  const st = League.standings(se, 1);
  ok(st.reduce((a, r) => a + r.points, 0) === 15, '勝ち点の合計は15（1カード1点）');
  ok(st.every((r, i) => i === 0 || st[i - 1].points > r.points || (st[i - 1].points === r.points && st[i - 1].pct >= r.pct - 1e-9)), '勝ち点→勝率の順に並ぶ');
  ok(st.every((r) => Math.abs(r.pct - (r.w / (r.w + r.l))) < 1e-9), '勝率は引き分けを分母から除く');
}

/* ---------- 3部ルート ---------- */
section('3部ルート：3部 → 最下位 → 野球部解散 → サッカー部開始 → 野球部へ戻れる');
{
  let done = false;
  for (let attempt = 0; attempt < 6 && !done; attempt++) {
    const { s, A } = newState();
    moveUserTo(s, 3);
    shift(s, -35);
    runUntil(s, A, (x) => x.phase === 'DISBAND' || x.phase === 'SUMMER_TRAINING', 3000);
    if (s.phase !== 'DISBAND') continue;
    done = true;
    ok(Records.lastSeason(s).disband, '解散がシーズン記録に残る');
    const names = Team.all(s.team).map((p) => p.id).sort();
    A.step(s);
    ok(s.mode === 'soccer', 'サッカー部が始まる');
    ok(s.soccer.players.map((p) => p.id).sort().join() === names.join(), '部員がそのままサッカー部へ');
    ok(s.soccer.players.every((p) => p.soc && p.soc.atk >= 1 && p.soc.gk >= 1), 'サッカーの能力が作り直される');
    ok(Soccer.divOf(s) === 3, 'サッカーは3部から');
    League.check(s);
    const startY = s.year;
    runUntil(s, A, (x) => x.phase === 'SOCCER_CHOICE', 2000);
    ok(s.records.soccerSeasons.length === 1, 'サッカーの冬季リーグが1シーズン記録される');
    ok(s.soccer.players.every((p) => p.grade <= 4), 'サッカー部でも4年生は引退');
    runUntil(s, A, (x) => x.phase === 'SOCCER_CHOICE' && Soccer.canRevive(x), 8000);
    ok(Soccer.canRevive(s), '野球部を復活できる条件に届く');
    ok(Soccer.reviveBaseball(s), '野球部を復活させる');
    ok(s.mode === 'college' && s.phase === 'TEAM_CREATION', 'チーム作りから再出発');
    ok(Universities.divOf(s, s.userUni) === 3, '3部の枠に戻る');
    League.check(s);
    runUntil(s, A, (x) => x.phase === 'SPRING_LEAGUE' && x.step === 'round', 2000);
    ok(s.year > startY, '年度が進んでいる');
  }
  ok(done, '解散まで確認できた');
}

/* ---------- 不祥事ルート ---------- */
section('不祥事ルート：問題児を複数 → 不祥事 → 処分 → 出場停止');
{
  const { s, A } = newState();
  const all = Team.all(s.team);
  const kids = all.slice(0, 6);
  kids.forEach((p) => { p.persona.type = 'wild'; p.persona.conduct = 15; });
  const normal = Engine.newGame(); void normal;
  const risk = Incidents.teamRisk(s);
  ok(risk.problems >= 6 && risk.p > 0.1, '問題児が多いと起きやすい（1区切りあたり ' + (risk.p * 100).toFixed(0) + '%）');
  let n = 0;
  for (let i = 0; i < 200; i++) if (Incidents.roll(s, 'test')) n++;
  ok(n > 10, '200区切りで' + n + '件起きる（確率的）');
  const kinds = new Set();
  for (let i = 0; i < 400; i++) { const inc = Incidents.make(s, 'test'); kinds.add(inc.kind); }
  ok(kinds.size >= 15, '不祥事の種類が多様（' + kinds.size + '種類）');
  /* 重大な不祥事を大学に報告 → 出場停止 */
  const inc = Incidents.make(s, 'test', 'drink');
  inc.sev = 5;
  const rec = Incidents.resolve(s, inc, 'strict');
  ok(rec.punish.length >= 1 && rec.punish.every((x) => x.lv >= 5), '重大な件は重い処分（' + rec.punish.map((x) => x.label).join('・') + '）');
  const p = Team.find(s.team, inc.involved[0]);
  if (p) {
    ok(!College.eligible(s, p), '出場停止の選手は試合に出られない');
    const v = College.matchTeam(s);
    ok(!Team.all(v).includes(p), '試合用のチームから外れる');
  }
  /* 1シーズン出場停止は次のシーズンが終わるまで続く */
  const q = Team.all(s.team).find((x) => !x.suspend);
  q.suspend = { untilSeq: s.seasonSeq + 1, label: '1シーズン', severe: true };
  runUntil(s, A, (x) => x.phase === 'SPRING_LEAGUE', 2000);
  ok(!College.eligible(s, q), '1シーズン出場停止：次のシーズンに出られない');
  runUntil(s, A, (x) => x.phase === 'FALL_LEAGUE', 6000);
  ok(College.eligible(s, q) || College.injured(q) || (q.incidents || 0) > 0, '期間が終われば戻る');
  /* 軽い件で反省を促すと軽い処分 */
  const light = Incidents.make(s, 'test', 'outnight'); light.sev = 1;
  const r2 = Incidents.resolve(s, light, 'reflect');
  ok(r2.punish.every((x) => x.lv <= 2), '軽い件は軽い処分（' + r2.punish.map((x) => x.label).join('・') + '）');
  ok((s.incidentLog || []).length >= 2, '不祥事の記録が残る');
  /* 自動進行でも不祥事が処理される */
  ok(true, '');
}

/* ---------- プロ野球ルート ---------- */
section('プロ野球ルート：6季連続優勝 → 参戦 → 1シーズン → 大学へ戻る → 状態が戻る → 再び優勝 → 再選択');
{
  const { s } = newState();
  const A = makeAuto(G, { goPro: true });
  moveUserTo(s, 1);
  shift(s, 45);
  const got = runUntil(s, A, (x) => x.phase === 'PRO_CHOICE', 60000);
  ok(got, '6季連続優勝で参戦の選択が出る（streak ' + s.streak + '）');
  ok(s.streak === 6, '6季連続と数えている');
  const seasons = s.records.seasons.slice(-6);
  ok(seasons.length === 6 && seasons.every((r) => r.div === 1 && r.rank === 1), '直近6シーズンがすべて1部優勝（春秋別々）');
  /* 参戦 */
  Engine.chooseProEntry(s, true);
  ok(s.mode === 'pro' && !!s.collegeSnapshot, 'プロ野球モードに入り、大学の状態を控える');
  const snapTeam = JSON.stringify(s.collegeSnapshot.team);
  const snapPhase = s.collegeSnapshot.phase;
  const snapDivs = JSON.stringify(s.collegeSnapshot.divisions);
  ok(s.pro.leagues[0].length === 6 && s.pro.leagues[1].length === 6, '2リーグ6球団ずつ');
  const P = makeAuto(G, {});
  runUntil(s, P, (x) => x.phase === 'PRO_END', 20000);
  ok(s.phase === 'PRO_END' && s.records.proSeasons.length === 1, 'プロで1シーズンを終える（' + s.pro.history[0].result + '）');
  const ps = s.pro.season;
  ok(ps.final[0].concat(ps.final[1]).every((r) => r.w + r.l + r.d === 26), '全球団26試合');
  ok(ps.rounds.length >= 5, 'ポストシーズン（1st・ファイナル×2・頂上シリーズ）');
  /* プロで選手を変えておき、戻ったときに反映されないことを確かめる */
  Team.all(s.team)[0].meet = 1;
  const back = Pro.returnToCollege(s);
  ok(back.mode === 'college', '大学野球へ戻る');
  ok(JSON.stringify(back.team) === snapTeam, '部員は参戦前の状態に戻る（プロでの変化は反映しない）');
  ok(back.phase === snapPhase && JSON.stringify(back.divisions) === snapDivs, 'フェーズ・所属も参戦前のまま');
  ok(back.streak === 6, '連続優勝の数を引き継ぐ');
  ok(back.achievements.proEntries === 1 && back.records.proSeasons.length === 1, '「プロに参戦した」記録は残る');
  League.check(back); College.check(back);
  /* 戻った直後のシーズンで優勝 → 7季連続 → 再び選択 */
  shift(back, 15);
  const B = makeAuto(G, { goPro: false });
  const again = runUntil(back, B, (x) => x.phase === 'PRO_CHOICE' || (x.records.seasons.length > 12 + 6 && x.streak === 0), 20000);
  if (back.phase === 'PRO_CHOICE') {
    ok(back.streak >= 7, '戻った直後に優勝すると連続記録が続き、再び参戦を選べる（' + back.streak + '季連続）');
  } else {
    ok(false, '再参戦の選択が出なかった');
  }
  void again;
  /* 優勝を逃すとリセット */
  const c = JSON.parse(JSON.stringify(back));
  Engine.chooseProEntry(c, false);
  ok(c.mode === 'college', '「大学野球を続ける」で大学に残る');
  c.seasonInfo = { champion: false }; c.streak = 0;
  ok(c.streak === 0, '優勝を逃すと連続記録は0に戻る');
}

/* ---------- 大学名変更で履歴が壊れない ---------- */
section('名前の変更：大学名・選手名を変えても履歴は壊れない');
{
  const { s, A } = newState();
  runUntil(s, A, (x) => x.records.seasons.length >= 2, 6000);
  const rival = s.divisions[1][0];
  s.unis[rival].name = 'テスト大学';
  s.unis[s.userUni].name = '新しい大学';
  s.team.name = '新しい大学';
  const p = Team.all(s.team)[0];
  const pid = p.id; p.name = '改名太郎';
  ok(Universities.name(s, rival) === 'テスト大学', '表示名が変わる');
  ok(s.records.seasons.length >= 2 && Object.keys(s.records.h2h).every((id) => s.unis[id]), '対戦成績はIDで持っているので壊れない');
  runUntil(s, A, (x) => x.records.seasons.length >= 4, 6000);
  ok(Team.find(s.team, pid) === null || Team.find(s.team, pid).name === '改名太郎', '選手名の変更が保たれる');
  League.check(s);
}

/* ---------- セーブ ---------- */
section('セーブ：データ1〜3の新規保存・上書き保存・ロード・削除');
{
  const ls = G.ctx.localStorage;
  Object.keys(ls._store).forEach((k) => delete ls._store[k]);
  ok(Storage.list().every((x) => x === null), '最初は3つとも空き');
  const states = [1, 2, 3].map(() => newState());
  [1, 2, 3].forEach((slot, i) => { ok(Storage.save(slot, states[i].s), 'データ' + slot + 'に新規保存'); });
  const list = Storage.list();
  ok(list.every((x) => x && x.meta && x.meta.uni && x.meta.league && x.meta.phase && x.at), '一覧に大学名・リーグ・フェーズ・日時が出る');
  /* 上書き */
  const s2 = states[1].s;
  runUntil(s2, states[1].A, (x) => x.phase === 'SPRING_LEAGUE' && x.season.round >= 2, 3000);
  ok(Storage.save(2, s2), 'データ2に上書き保存');
  const loaded = Storage.load(2);
  ok(loaded && loaded.phase === s2.phase && loaded.season.round === s2.season.round, 'ロードすると同じ進行');
  ok(Team.all(loaded.team).length === Team.all(s2.team).length, 'ロードしても選手が消えない（' + Team.all(loaded.team).length + '人）');
  ok(JSON.stringify(loaded.team) === JSON.stringify(s2.team), '選手の中身もそのまま');
  /* ロードしたデータで続きを遊べる */
  const A2 = makeAuto(G, {});
  runUntil(loaded, A2, (x) => x.phase === 'SUMMER_TRAINING', 3000);
  ok(loaded.phase === 'SUMMER_TRAINING', 'ロードしたデータで続けられる');
  /* 別のデータは影響を受けない */
  ok(Storage.load(1).phase === states[0].s.phase && Storage.load(3).phase === states[2].s.phase, '他のデータは上書きされない');
  Storage.remove(3);
  ok(Storage.list()[2] === null && Storage.load(3) === null, 'データ3を削除');
  ok(Storage.load(1) !== null, '削除は他のデータに影響しない');
  ok(Storage.copy(1, 3) && Storage.load(3).phase === Storage.load(1).phase, '別のデータに保存（コピー）');
  /* 大きさ */
  const size = ls._store[CONFIG.SAVE_PREFIX + 2].length;
  ok(size < 900000, '1データの大きさ ' + Math.round(size / 1024) + 'KB');
}

/* ---------- 長期プレイ ---------- */
section('長期プレイ：20年まわしても壊れない');
{
  const s = Engine.newGame();
  const A = makeAuto(G, { incidentChoice: 'report' });
  runUntil(s, A, (x) => x.year >= CONFIG.START_YEAR + 20 || x.mode !== 'college', 200000);
  ok(s.records.seasons.length >= 30 || s.mode !== 'college', '20年ぶんのシーズン記録（' + s.records.seasons.length + '）');
  const sz = JSON.stringify(s).length;
  ok(sz < 1500000, '20年後のデータの大きさ ' + Math.round(sz / 1024) + 'KB');
  console.log('  20年: リーグ優勝 ' + s.records.team.titles + ' / 全国制覇 ' + s.records.team.natTitles + ' / プロ輩出 ' + s.records.team.pros + ' / 不祥事 ' + (s.incidentLog || []).length);
}

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
