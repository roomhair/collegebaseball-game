const G = require('./load').load();
const { makeAuto } = require('./auto');
const mode = process.argv[2];
if (mode === 'off') { const orig = G.College.recoverPitchers; G.College.recoverPitchers = (t) => orig(t, true); }
const st = { 0: [0, 0, 0, 0, 0], 1: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 0] };
const E = G.Engine; const orig = E.autoGame;
for (let r = 0; r < 6; r++) {
  const s = E.newGame(); const A = makeAuto(G, {});
  let k = 0;
  while (s.year < 2032 && k++ < 200000 && s.mode === 'college') {
    if (s.step === 'pregame' && s.match.kind === 'league') {
      const c = E.currentCard(s); const gi = Math.min(2, c.games.length);
      const out = E.autoGame(s);
      const v = out.view; const myS = G.Team.find(v, v.rotation[0]);
      const opS = G.Team.find(s.opponent, s.opponent.rotation[0]);
      const x = st[gi]; x[0]++; x[1] += s.lastResult.win ? 1 : 0; x[2] += s.lastResult.draw ? 0 : 1;
      x[3] += G.Player.rating(myS); x[4] += G.Player.rating(opS);
      continue;
    }
    A.step(s);
  }
}
[0, 1, 2].forEach((g) => { const x = st[g]; console.log(mode, '第' + (g + 1) + '戦', 'n', x[0], 'win%', (x[1] / x[2]).toFixed(3), '自先発', (x[3] / x[0]).toFixed(1), '相手先発', (x[4] / x[0]).toFixed(1)); });
