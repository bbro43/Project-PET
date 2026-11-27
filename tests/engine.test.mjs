import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step, pick, confirmCustom, canPick, survivalWave } from '../src/battle/engine.mjs';
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
  const s = start({ seed: 5, formation: 'met1' });
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
  const s = start({ seed: 6, formation: 'met3' });
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
  assert.deepEqual(survivalWave(1), ['Mettaur']);
  assert.equal(survivalWave(5).length, 3);
  assert.ok(survivalWave(8).every(t => t === 'Mettaur3'));
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
    const s = start({ seed: 42, formation: 'met3' });
    for (let i = 0; i < 3000; i++) { step(s, script(i)); if (s.phase === 'custom') confirmCustom(s); }
    return JSON.stringify({ p: s.player, e: s.enemies, t: s.tick, h: s.hazards });
  };
  assert.equal(play(), play());
});
