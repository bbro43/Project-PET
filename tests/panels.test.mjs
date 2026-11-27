import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step, confirmCustom, formation } from '../src/battle/engine.mjs';
import { crackPanel, setPanel } from '../src/battle/panels.mjs';
import { PANELS } from '../data/rules.mjs';

const run = (s, input, n) => { for (let i = 0; i < n; i++) step(s, input); return s; };
// A quiet battle: one Cragger in the back corner (it waits 240 frames before doing anything).
const start = (field = 'normal') => { const s = createBattle({ seed: 3, field, enemies: formation('Cragger', 0, 1) }); confirmCustom(s); s.enemies[0].x = 5; s.enemies[0].y = 0; s.enemies[0].think = 1e9; s.enemies[0].started = true; return s; };
const type = (s, x, y) => s.panels[y][x].type;
const move = (s, dir) => { step(s, { dir }); run(s, {}, 12); };

test('a cracked panel breaks when MegaMan steps off it; a hole blocks movement and repairs itself', () => {
  const s = start();
  crackPanel(s, 1, 1); assert.equal(type(s, 1, 1), 'cracked');
  crackPanel(s, 1, 1); assert.equal(type(s, 1, 1), 'cracked', 'still cracked while he stands on it');
  move(s, 'up');
  assert.equal(type(s, 1, 1), 'broken');
  move(s, 'down');
  assert.deepEqual([s.player.x, s.player.y], [1, 0], 'cannot step into the hole');
  run(s, {}, PANELS.brokenRepair.value);
  assert.equal(type(s, 1, 1), 'normal');
});

test('cracking a cracked empty panel breaks it', () => {
  const s = start();
  crackPanel(s, 0, 2); crackPanel(s, 0, 2);
  assert.equal(type(s, 0, 2), 'broken');
});

test('poison drains 1 HP every 7 frames', () => {
  const s = start('normal'); setPanel(s, 1, 1, 'poison');
  const hp = s.player.hp; run(s, {}, 70);
  assert.equal(hp - s.player.hp, 10);
});

test('holy panel halves damage (rounded up)', () => {
  const s = start('holy');
  s.hazards.push({ kind: 'planebomb', x: 1, y: 1, burst: s.tick + 1, damage: 21, owner: s.enemies[0].id });
  run(s, {}, 2);
  assert.equal(s.player.hp, 100 - 11);
});

test('fire on grass: double damage, and the grass burns away', () => {
  const s = start('grass'); s.enemies[0].element = 'fire';
  s.hazards.push({ kind: 'planebomb', x: 1, y: 1, burst: s.tick + 1, damage: 10, owner: s.enemies[0].id });
  run(s, {}, 2);
  assert.equal(s.player.hp, 80); assert.equal(type(s, 1, 1), 'normal');
});

test('wood viruses heal on grass', () => {
  const s = createBattle({ seed: 3, field: 'grass', enemies: formation('Shrubby', 0, 1) }); confirmCustom(s);
  const e = s.enemies[0]; e.think = 1e9; e.hp = 20; s.player.invuln = 1e9;
  run(s, {}, 200);
  assert.equal(e.element, 'wood'); assert.equal(e.hp, 30);
});

test('ice: MegaMan keeps sliding until he leaves the ice; aqua on ice freezes him', () => {
  const s = start('ice');
  move(s, 'left'); run(s, {}, 20);
  assert.equal(s.player.x, 0);
  step(s, { dir: 'right' }); run(s, {}, 40);
  assert.equal(s.player.x, 2, 'slid to the edge of his area');
  s.enemies[0].element = 'aqua';
  s.hazards.push({ kind: 'planebomb', x: 2, y: 1, burst: s.tick + 1, damage: 10, owner: s.enemies[0].id });
  run(s, {}, 2);
  assert.ok(s.player.paralyzed > 0 && s.player.frozen); assert.equal(type(s, 2, 1), 'normal');
});

test('volcano erupts on its cycle: bubbles 40 frames, then a 50-damage flame', () => {
  const s = start('normal'); setPanel(s, 1, 1, 'volcano');
  let first = null;
  for (let i = 0; i < 400 && first === null; i++) { const hp = s.player.hp; step(s, {}); if (s.player.hp < hp) first = { t: s.tick, d: hp - s.player.hp }; }
  assert.equal(first.d, 50);
  assert.equal(first.t, PANELS.volcanoCycle.value + PANELS.volcanoEruption.value.warn);
});

test('Cragger\'s punch cracks MegaMan\'s column', () => {
  const s = createBattle({ seed: 125, enemies: formation('Cragger', 0, 1) }); confirmCustom(s);
  s.player.x = 1; s.player.y = 1;
  for (let i = 0; i < 400 && !s.events.some(ev => ev.type === 'playerHit'); i++) step(s, {});
  assert.deepEqual([0, 1, 2].map(y => type(s, 1, y)), ['cracked', 'cracked', 'cracked']);
});
