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

test('a Mettaur shockwave stops at a broken panel but rolls over a cracked one (panel flag 0x10)', () => {
  for (const [kind, reaches] of [['broken', false], ['cracked', true]]) {
    const s = createBattle({ seed: 5, enemies: formation('Mettaur', 0, 1) }); confirmCustom(s);
    s.player.x = 0; s.player.y = 0; s.enemies[0].y = 0;
    s.hazards.push({ kind: 'wave', owner: s.enemies[0].id, family: 'Mettaur', x: 2, y: 0, dir: -1, step: 4, next: s.tick + 4, damage: 10, start: s.tick });
    if (kind === 'broken') setPanel(s, 1, 0, 'broken'); else crackPanel(s, 1, 0);
    const hp = s.player.hp; s.enemies[0].think = 1e9;
    let maxX = 9; for (let i = 0; i < 30; i++) { step(s, {}); const w = s.hazards.find(h => h.kind === 'wave'); if (w) maxX = Math.min(maxX, w.x); }
    assert.equal(s.player.hp < hp, reaches, `${kind}: ${reaches ? 'wave reaches MegaMan' : 'wave dies at the hole'}`);
    if (!reaches) assert.equal(maxX, 2);
  }
});

test('AreaGrab freezes time, takes the enemy front column (10 damage to whoever stands there) and it returns after 1800 frames', async () => {
  const { GRAB } = await import('../data/rules.mjs');
  const s = createBattle({ seed: 3, enemies: formation('Mettaur', 0, 1) }); confirmCustom(s);
  const met = s.enemies[0]; met.x = 3; met.y = 2; met.think = 1e9; s.player.invuln = 1e9;
  const hp = met.hp, tick = s.tick;
  s.queue = [{ name: 'AreaGrab', code: '*' }];
  step(s, { b: true });
  let frozen = 0; while (s.timestop) { step(s, {}); frozen++; }
  assert.equal(s.tick, tick + 1, 'no battle time passes while frozen');
  assert.ok(frozen >= GRAB.beamFall.value + GRAB.hold.value);
  assert.deepEqual(s.panels.map(r => r[3].side), ['p', 'p', 'e'], 'the panel under the Mettaur is not taken');
  assert.equal(met.hp, hp - 10, 'the beam hits the Mettaur');
  s.player.x = 2; s.player.y = 1; move(s, 'right');
  assert.equal(s.player.x, 3, 'MegaMan can step onto the taken panel');
  run(s, {}, GRAB.returnTicks.value);
  assert.equal(s.panels[0][3].side, 'e', 'it goes back after the timer');
  assert.equal(s.panels[1][3].side, 'p', 'not while MegaMan stands on it');
  move(s, 'left'); run(s, {}, 2);
  assert.equal(s.panels[1][3].side, 'e');
});
