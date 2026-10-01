/* エンジン（画面を持たない部分）を Node の中に読み込む。
   ブラウザと同じく、ファイルを順番に同じ場所で評価するだけ。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = [
  'config', 'rng', 'names', 'player', 'team', 'sim', 'training', 'growth', 'persona',
  'universities', 'rivals', 'league', 'national', 'records', 'college', 'scouting', 'incidents',
  'soccer', 'pro', 'engine', 'storage',
];

function load() {
  const store = {};
  const ctx = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Error, Infinity, isNaN,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      _store: store,
    },
  };
  vm.createContext(ctx);
  let src = '';
  FILES.forEach((f) => {
    const p = path.join(__dirname, '..', 'js', 'engine', f + '.js');
    if (fs.existsSync(p)) src += fs.readFileSync(p, 'utf8') + '\n';
  });
  src += '\n;this.__exp = { CONFIG, RNG, NAMES, Player, Team, Sim, Training, Growth, Persona, Universities, League, National, Records, College, Scouting, Incidents, Engine, Rivals,' +
    ' Soccer: typeof Soccer !== "undefined" ? Soccer : null, Pro: typeof Pro !== "undefined" ? Pro : null, Storage: typeof Storage !== "undefined" ? Storage : null, rankOf };';
  vm.runInContext(src, ctx, { filename: 'engine-bundle.js' });
  const exp = ctx.__exp;
  exp.ctx = ctx;
  return exp;
}

module.exports = { load };
