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

test('the game\'s hit areas: 0x14 shapes from the ROM', () => {
  assert.equal(REGIONS.length, 0x14);
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
