const G = require('./load').load();
const { makeAuto } = require('./auto');
const pol = JSON.parse(process.argv[2] || '{}');
const by = {1:[],2:[],3:[],4:[]}, routes = {};
for (let r = 0; r < 4; r++) {
  const s = G.Engine.newGame(); const A = makeAuto(G, pol); let n = 0;
  while (s.year < 2034 && n < 100000) { A.step(s); n++; }
  G.Team.all(s.team).forEach((p) => { by[p.grade].push(G.Player.rating(p)); routes[p.route] = (routes[p.route]||0)+1; });
}
for (const g in by) { const a = by[g].sort((x,y)=>x-y); console.log('grade', g, 'avg', (a.reduce((x,y)=>x+y,0)/a.length).toFixed(1), 'med', a[a.length>>1], 'max', a[a.length-1], 'n', a.length/4); }
console.log(routes);
