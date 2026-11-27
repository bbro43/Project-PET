import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step, pick, confirmCustom, canPick, survivalWave, formation, elementMultiplier } from '../src/battle/engine.mjs';
import BN6 from '../data/bn6-viruses.mjs';
import { val } from '../data/rules.mjs';

const run = (s, input, n) => { for (let i = 0; i < n; i++) step(s, input); return s; };
const start = opts => { const s = createBattle(opts); confirmCustom(s); return s; };

test('battle opens on the custom screen with a 5-chip hand', () => {
  const s = createBattle({ seed: 7 });
  assert.equal(s.phase, 'custom');
  assert.equal(s.hand.length, 5);
  step(s, { a: true });
  assert.equal(s.tick, 0, 'simulation is paused during custom');
});

test('chip selection follows same-code or same-name rules', () => {
  const s = createBattle({ seed: 1 });
  s.hand = [{ name: 'Cannon', code: 'A' }, { name: 'Sword', code: 'S' }, { name: 'Cannon', code: 'B' }, { name: 'AirShot', code: '*' }, { name: 'Recov30', code: 'A' }];
  pick(s, 0);
  assert.ok(canPick(s, 2), 'same name, different code');
  assert.ok(canPick(s, 3), 'asterisk code');
  assert.ok(canPick(s, 4), 'same code A');
  assert.ok(!canPick(s, 1), 'different name and code');
  pick(s, 4); assert.ok(!canPick(s, 2), 'Cannon A + Recov30 A excludes Cannon B');
  confirmCustom(s);
  assert.deepEqual(s.queue.map(c => c.name), ['Cannon', 'Recov30']);
  assert.equal(s.hand.length, 3, 'unused chips stay in hand');
});

test('movement vanishes, relocates, reappears and stays in own area', () => {
  const s = start({ seed: 2 });
  step(s, { dir: 'right' });
  assert.equal(s.player.state, 'vanish');
  run(s, {}, val('moveVanishTicks'));
  assert.equal(s.player.x, 2);
  run(s, {}, val('moveAppearTicks') + 1);
  run(s, { dir: 'right' }, 30);
  assert.equal(s.player.x, 2, 'cannot enter enemy area');
});

test('buster tap hits the first virus in the row for 1', () => {
  const s = start({ seed: 3 });
  const met = s.enemies[0];
  step(s, { a: true }); step(s, {});
  assert.equal(met.hp, 39);
});

test('held buster charges and release fires a 10-damage charge shot', () => {
  const s = start({ seed: 3 });
  const met = s.enemies[0];
  s.player.invuln = 99999; // isolate charging from the Mettaur's shockwave
  run(s, { a: true }, val('chargeDelay') + val('chargeTime') + 1);
  assert.equal(s.player.charge, val('chargeTime'));
  const before = met.hp;
  step(s, {});
  assert.equal(before - met.hp, 10);
});

test('taking a hit cancels a charge in progress', () => {
  const s = start({ seed: 3 });
  s.player.y = 0;
  for (let i = 0; i < 600 && s.player.state !== 'flinch'; i++) step(s, { a: true });
  assert.equal(s.player.state, 'flinch');
  assert.equal(s.player.charge, 0);
});

test('chips execute in queue order with correct damage', () => {
  const s = createBattle({ seed: 4 });
  s.hand = [{ name: 'Cannon', code: 'A' }, { name: 'Cannon', code: 'A' }, { name: 'Recov30', code: 'A' }];
  pick(s, 0); confirmCustom(s);
  const met = s.enemies[0];
  step(s, { b: true });
  assert.equal(met.hp, 0, 'Cannon 40 deletes a 40 HP Mettaur');
  assert.equal(s.phase, 'win');
});

test('Mettaur aligns, swings and its shockwave damages then grants invincibility', () => {
  const s = start({ seed: 5 });
  s.player.y = 0;
  let hit = 0;
  for (let i = 0; i < 600 && !hit; i++) { step(s, {}); hit = s.events.filter(e => e.type === 'playerHit').length; }
  assert.equal(s.enemies[0].y, 0, 'Mettaur moved into the player row');
  assert.equal(s.player.hp, 90);
  assert.equal(s.player.state, 'flinch');
  const hp = s.player.hp;
  run(s, {}, 60);
  assert.equal(s.player.hp, hp, 'invincible after hit');
});

test('only one Mettaur attacks at a time', () => {
  const s = start({ seed: 6, enemies: formation('Mettaur', 0, 3) });
  let maxAttacking = 0;
  for (let i = 0; i < 1500; i++) {
    step(s, {});
    maxAttacking = Math.max(maxAttacking, s.enemies.filter(e => e.state === 'attack').length);
  }
  assert.equal(maxAttacking, 1);
});

test('custom gauge refills and L reopens custom with hand topped up', () => {
  const s = start({ seed: 8 });
  run(s, { l: true }, 10);
  assert.equal(s.phase, 'battle', 'L ignored before gauge is full');
  s.player.invuln = 99999;
  run(s, {}, val('customGaugeTicks'));
  step(s, { l: true });
  assert.equal(s.phase, 'custom');
  assert.equal(s.hand.length, 5);
});

test('survival advances waves and escalates', () => {
  assert.equal(survivalWave(1).length, 1);
  assert.equal(survivalWave(5).length, 3);
  assert.ok(survivalWave(10).every(([, v]) => v === 3), 'reaches Ω variants');
  const s = start({ mode: 'survival', seed: 9 });
  s.enemies.forEach(e => (e.hp = 1));
  step(s, { a: true });
  assert.equal(s.phase, 'wave');
  run(s, {}, 90);
  assert.equal(s.wave, 2);
  assert.equal(s.phase, 'custom');
});

test('simulation is deterministic for identical seeds and inputs', () => {
  const script = i => ({ a: i % 50 < 30, dir: ['up', 'down', null, 'left', 'right'][i % 5], b: i % 97 === 0, l: i % 300 === 0 });
  const play = () => {
    const s = start({ seed: 42, enemies: [['Mettaur', 1], ['Champy', 0], ['Gunner', 2]] });
    for (let i = 0; i < 3000; i++) { step(s, script(i)); if (s.phase === 'custom') confirmCustom(s); }
    return JSON.stringify({ p: s.player, e: s.enemies, t: s.tick, h: s.hazards });
  };
  assert.equal(play(), play());
});

test('virus stats come from the ROM tables', () => {
  assert.deepEqual(BN6.families.Mettaur.variants.map(v => [v.hp, v.damage]), [[40, 10], [80, 20], [120, 40], [160, 60], [120, 40], [180, 80]]);
  assert.deepEqual(BN6.families.Champy.variants.slice(0, 3).map(v => v.name), ['Champy', 'Chumpy', 'Chimpy']);
  const s = start({ seed: 1, enemies: [['Mettaur', 2], ['Champy', 3], ['Gunner', 0]] });
  assert.deepEqual(s.enemies.map(e => [e.name, e.hp, e.damage, e.palette]),
    [['Mettaur3', 120, 40, 2], ['ChampySP', 220, 200, 3], ['Gunner', 60, 10, 0]]);
  assert.equal(s.enemies[1].element, 'fire');
});

test('element weakness doubles damage', () => {
  assert.equal(elementMultiplier('aqua', 'fire'), 2);
  assert.equal(elementMultiplier('fire', 'aqua'), 1);
  assert.equal(elementMultiplier('none', 'fire'), 1);
});

test('Champy warps in front of MegaMan, punches, then returns home', () => {
  const s = start({ seed: 11, enemies: formation('Champy', 0, 1) });
  const c = s.enemies[0];
  let warped = null, hit = false;
  for (let i = 0; i < 400 && !hit; i++) {
    step(s, {});
    if (c.state === 'ready' && !warped) warped = [c.x, c.y];
    hit = s.events.some(e => e.type === 'playerHit');
  }
  assert.deepEqual(warped, [s.player.x + 1, s.player.y]);
  assert.ok(hit);
  assert.equal(s.player.hp, 100 - 50);
  run(s, {}, 60);
  assert.deepEqual([c.x, c.y], [c.homeX, c.homeY]);
});

test('Champy punch misses if MegaMan moves away during wind-up', () => {
  const s = start({ seed: 11, enemies: formation('Champy', 0, 1) });
  for (let i = 0; i < 400 && s.enemies[0].state !== 'ready'; i++) step(s, {});
  run(s, { dir: 'up' }, 2);
  run(s, {}, 40);
  assert.equal(s.player.hp, 100);
});

test('Gunner crosshair tracks MegaMan, locks, and fires a 3-shot burst', () => {
  const s = start({ seed: 12, enemies: formation('Gunner', 0, 1) });
  const g = s.enemies[0];
  s.player.invuln = 0;
  let shots = 0, lockedAt = null;
  for (let i = 0; i < 600 && g.state !== 'recover'; i++) {
    step(s, {});
    if (g.target?.locked && !lockedAt) lockedAt = [g.target.x, g.target.y];
    shots += s.events.filter(ev => ev.type === 'shot').length;
  }
  assert.deepEqual(lockedAt, [s.player.x, s.player.y]);
  assert.equal(shots, 3);
  assert.equal(s.player.hp, 90, 'first shot hits, invincibility absorbs the rest');
});

test('Gunner burst misses when MegaMan leaves the locked panel', () => {
  const s = start({ seed: 12, enemies: formation('Gunner', 0, 1) });
  const g = s.enemies[0];
  for (let i = 0; i < 600 && g.state !== 'lock'; i++) step(s, {});
  run(s, { dir: 'up' }, 2);
  run(s, {}, 40);
  assert.equal(s.player.hp, 100);
});

test('different virus families attack independently', () => {
  const s = start({ seed: 13, enemies: [['Mettaur', 0], ['Gunner', 0]] });
  s.player.invuln = 1e9;
  let both = false;
  for (let i = 0; i < 1200 && !both; i++) { step(s, {}); both = s.turns.Mettaur !== undefined && s.turns.Gunner !== undefined; }
  assert.ok(both);
});
