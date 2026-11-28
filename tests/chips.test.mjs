import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, confirmCustom, step } from '../src/battle/engine.mjs';
import { CHIP_BEHAVIOUR, REGIONS } from '../data/rules.mjs';

// Fill the enemy area with tough Mettaurs, use one chip, and return which panels were hit.
function hits(name, at = [1, 1]) {
  const s = createBattle({ seed: 4, enemies: [] }); confirmCustom(s);
  s.enemies = [];
  for (let x = 2; x < 6; x++) for (let y = 0; y < 3; y++) s.enemies.push({ id: 100 + x * 3 + y, family: 'Mettaur', x, y, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' });
  [s.player.x, s.player.y] = at; s.player.invuln = 1e9;
  s.queue = [{ id: 1, name, code: 'A' }];
  step(s, { b: true });
  return s.enemies.filter(e => e.hp < 5000).map(e => [e.x, e.y]).sort();
}

test('the game\'s hit areas: 0x2F shapes from the ROM', () => {
  assert.equal(REGIONS.length, 0x2F);
  assert.deepEqual(REGIONS[4], [[0, 0], [0, -1], [0, 1]]);
});

test('swords hit the game\'s areas', () => {
  assert.deepEqual(hits('Sword'), [[2, 1]]);
  assert.deepEqual(hits('WideSwrd'), [[2, 0], [2, 1], [2, 2]]);
  assert.deepEqual(hits('LongSwrd'), [[2, 1], [3, 1]]);
  assert.deepEqual(hits('LifeSrd'), [[2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [3, 2]]);
  assert.deepEqual(hits('FtrSword'), [[2, 1], [3, 1], [4, 1]]);
  assert.deepEqual(hits('CrosSwrd'), [[2, 1], [3, 0], [3, 2]].concat([]).sort()); // X centred on the front panel (row 0/2 behind are MegaMan's)
});

test('GigaCannons hit the target and the four diagonals around it (area 0xC)', () => {
  assert.deepEqual(hits('GigaCan1'), [[2, 1], [3, 0], [3, 2]]); // target (2,1); its diagonals on MegaMan's side are empty
});

function after(name, frames, setup = () => {}) {
  const s = createBattle({ seed: 4, enemies: [] }); confirmCustom(s);
  s.enemies = [];
  for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) s.enemies.push({ id: 100 + x * 3 + y, family: 'Mettaur', x, y, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' });
  setup(s);
  s.player.x = 1; s.player.y = 1; s.player.invuln = 1e9; s.queue = [{ id: 1, name, code: 'A' }];
  step(s, { b: true }); for (let i = 0; i < frames; i++) step(s, {});
  return s;
}
const hurt = s => s.enemies.filter(e => e.hp < 5000).map(e => [e.x, e.y, 5000 - e.hp]).sort();

test('bombs: MiniBomb one panel 3 ahead, BigBomb 3×3, EnergBom 3 hits', () => {
  assert.deepEqual(hurt(after('MiniBomb', 80)), [[4, 1, 50]]);
  assert.equal(hurt(after('BigBomb', 80)).length, 9); // the 3×3 around (4, 1)
  assert.deepEqual(hurt(after('EnergBom', 120)), [[4, 1, 120]]);
});

import { panelType } from '../src/battle/panels.mjs';
test('seeds change the panels: 3×3 on an empty panel, one panel when they hit someone', () => {
  const s = after('IceSeed', 80, s => { s.enemies = s.enemies.filter(e => !(e.x === 4 && e.y === 1)); });
  let n = 0; for (let x = 3; x <= 5; x++) for (let y = 0; y < 3; y++) if (panelType(s, x, y) === 'ice') n++;
  assert.equal(n, 9);
  const h = after('GrasSeed', 80);
  let g = 0; for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) if (panelType(h, x, y) === 'grass') g++;
  assert.equal(g, 1); assert.equal(panelType(h, 4, 1), 'grass');
});

test('panel shots: DublShot lifts 2 panels in the row, TrplShot the front column', () => {
  const d = after('DublShot', 2, s => { s.enemies = []; });
  assert.deepEqual([[2, 1], [3, 1]].map(([x, y]) => panelType(d, x, y)), ['broken', 'broken']);
  const t = after('TrplShot', 2, s => { s.enemies = []; });
  assert.deepEqual([0, 1, 2].map(y => panelType(t, 2, y)), ['broken', 'broken', 'broken']);
});

test('burners: FireBrn lights 3 panels ahead, WideBrn widens after the first; panels crack after', () => {
  const f = after('FireBrn1', 40);
  assert.deepEqual(hurt(f).map(([x, y]) => [x, y]), [[3, 1], [4, 1]]); // flames on (2,1), (3,1), (4,1)
  const w = after('WideBrn1', 70);
  assert.deepEqual(hurt(w).map(([x, y]) => [x, y]), [[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]]);
  assert.equal(panelType(f, 2, 1), 'cracked');
});

test('wave arms: a shockwave down the row; PwrWave in three rows', () => {
  assert.deepEqual(hurt(after('WaveArm1', 60)).map(([x, y]) => [x, y]), [[3, 1], [4, 1], [5, 1]]);
  assert.equal(hurt(after('PwrWave1', 60)).length, 9);
});

test('shells pierce down the row; ParaShl in all three rows', () => {
  assert.deepEqual(hurt(after('IronShl1', 60)).map(([x, y]) => [x, y]), [[3, 1], [4, 1], [5, 1]]);
  assert.equal(hurt(after('ParaShl', 60)).length, 9);
});

test('ElecPulse: the panel ahead and the next column, once each', () => {
  const s = after('ElcPuls1', 70);
  assert.deepEqual(hurt(s).map(([x, y]) => [x, y]), [[3, 0], [3, 1], [3, 2]]); // from (2,1): (2,1) and column 3
  assert.ok(hurt(s).every(([, , d]) => d === 100));
});

test('AuraHead flies 3 panels; StreamHd sends 5 to the edge', () => {
  assert.deepEqual(hurt(after('AuraHed1', 40)).map(([x, y]) => [x, y]), [[3, 1], [4, 1]]); // from (1,1): panels 2–4
  const s = after('StreamHd', 120);
  assert.deepEqual(hurt(s).map(([x, y, d]) => [x, y, d]), [[3, 1, 750], [4, 1, 750], [5, 1, 750]]);
});
