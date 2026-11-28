import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, confirmCustom, step, hitPlayer } from '../src/battle/engine.mjs';
import { BUGS } from '../data/rules.mjs';

const navi = bugs => ({ hpPlus: 0, attack: 0, speed: 0, charge: 0, custom: 5, flags: new Set(), bugs: Object.assign(Array(16).fill(0), bugs) });
const ready = (bugs, opts = {}) => { const s = createBattle({ seed: 7, navi: navi(bugs), ...opts }); confirmCustom(s); return s; };
const idle = (s, n) => { for (let i = 0; i < n; i++) step(s, {}); };

test('no bugs: nothing changes', () => {
  const s = ready({});
  assert.equal(s.hpBug, undefined); assert.equal(s.startBug, undefined);
  const hp = s.player.hp; s.player.invuln = 1e9; idle(s, 200); assert.equal(s.player.hp, hp);
});

test('HP bug (type 9): 1 HP every byte_80102A4[level] frames, faster after hits, never below 1', () => {
  const s = ready({ 9: 1 }), hp = s.player.hp;
  s.player.invuln = 1e9; idle(s, 400);
  assert.equal(hp - s.player.hp, Math.floor(400 / BUGS.hpDrainFrames.value[1]));
  s.player.invuln = 0; hitPlayer(s, 1); assert.equal(s.hpBug.level, 2);
  s.player.hp = 3; s.player.invuln = 1e9; idle(s, 400); assert.equal(s.player.hp, 1);
});

test('processing bug (type 1): a move slides to the last free panel', () => {
  const s = ready({ 1: 1 });
  assert.deepEqual([s.player.x, s.player.y], [1, 1]);
  step(s, { dir: 'up' }); idle(s, 30);
  assert.equal(s.player.y, 0);
  step(s, { dir: 'down' }); idle(s, 30);
  assert.equal(s.player.y, 2); // two panels in one move
});

test('custom bug (type 4): fewer chips from turn stat 0x63 on, at least 2', () => {
  const s = ready({ 4: 3 }); // level 3 → from turn 2
  assert.equal(s.customTurn, 1);
  s.hand = []; s.gauge = 1e9; step(s, { l: true });
  assert.equal(s.customTurn, 2);
  assert.equal(s.hand.length, Math.max(2, 5 - 1));
});

test('colour bugs (B / C): a start status from the game\'s list, 300 / 600 frames', () => {
  const kinds = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const s = createBattle({ seed, navi: navi({ 0xC: 2 }) });
    kinds.add(s.startBug);
    const p = s.player, T = { invisible: p.invis, invulnerable: p.invuln, blind: p.blind, confused: p.confused }[s.startBug];
    assert.equal(T, 600);
  }
  assert.deepEqual([...kinds].sort(), [...BUGS.startStatus.value].sort());
});

test('bubble: MegaMan can\'t move until it pops; invisible: hits pass through', () => {
  const s = ready({});
  s.player.bubble = 20; step(s, { dir: 'up' }); idle(s, 30); assert.equal(s.player.y, 1);
  s.player.invis = 50; const hp = s.player.hp; hitPlayer(s, 30); assert.equal(s.player.hp, hp);
});

test('buster bug (type 7) roll: the game\'s 16-slot table', () => {
  const [ones, twos] = BUGS.busterTable.value[3];
  assert.ok(ones + twos <= 16);
});

test('panel bug (type 3): left panels crack at about stat 0x13 / 8', () => {
  let cracks = 0, moves = 0;
  for (let seed = 1; seed < 60; seed++) {
    const s = ready({ 3: 3 }, { seed });
    step(s, { dir: s.player.y ? 'up' : 'down' }); idle(s, 30); moves++;
    if (s.panels.flat?.().some?.(c => c.type !== 'normal') ?? JSON.stringify(s.panels).match(/cracked|broken/)) cracks++;
  }
  assert.ok(cracks > 10 && cracks < 50, `${cracks}/${moves}`); // 4/8 expected
});

test('SuperArmor: WindBox gusts don\'t push MegaMan ("Won\'t be pushed!")', () => {
  const run = flags => {
    const s = createBattle({ seed: 3, enemies: [['WindBox', 0]], navi: { ...navi({}), flags: new Set(flags) } });
    confirmCustom(s); s.player.x = 1;
    for (let i = 0; i < 120; i++) step(s, {});
    return s.player.x;
  };
  assert.notEqual(run([]), 1); // pushed back
  assert.equal(run(['superArmor']), 1);
});

import { emotionOf } from '../src/battle/engine.mjs';
import { EMOTION } from '../data/rules.mjs';

test('emotions: a counter hit gives Full Synchro, a boosted chip doubles and uses it up, a hit ends it', () => {
  const s = ready({});
  assert.equal(emotionOf(s), 'normal');
  const e = s.enemies[0]; e.counterT = 10; e.x = 4; e.y = s.player.y; e.hp = 5000;
  s.hand = []; s.queue = [{ id: 99, name: 'Cannon', code: 'A' }];
  step(s, { b: true }); // A = chip: queue[0] → Cannon hits during the window
  assert.equal(emotionOf(s), 'synchro');
  s.player.state = 'idle'; s.queue = [{ id: 98, name: 'Cannon', code: 'A' }];
  const before = e.hp; step(s, { b: true });
  assert.equal(before - e.hp, 2 * 40); // Cannon 40 doubled
  assert.equal(emotionOf(s), 'normal');
  s.emotion.mood = 0xFF; s.player.invuln = 0; hitPlayer(s, 10);
  assert.equal(emotionOf(s), 'normal');
});

test('emotions: Angry after 120 frames paralysed or a 300-damage hit, for 600 frames', () => {
  const s = ready({});
  s.player.hp = 2000; s.player.invuln = 0; hitPlayer(s, 300); step(s, {});
  assert.equal(emotionOf(s), 'angry');
  assert.equal(s.emotion.anger, EMOTION.angryFrames.value);
  s.player.invuln = 1e9; for (let i = 0; i < 600; i++) step(s, {});
  assert.equal(emotionOf(s), 'normal');
});

test('emotion bug (type 2): a new emotion every 60 frames with the game\'s odds', () => {
  const s = ready({ 2: 1 }); s.player.invuln = 1e9; s.player.hp = 1e6;
  const seen = new Set();
  for (let i = 0; i < 60 * 200; i++) { step(s, {}); if (i % 60 === 1) seen.add(emotionOf(s)); }
  for (const k of ['normal', 'tired', 'angry', 'synchro']) assert.ok(seen.has(k), k);
});

test('Confused reverses the D-pad; Bubbled pops on a hit, Elec doubles', () => {
  const s = ready({});
  s.player.confused = 100; step(s, { dir: 'up' }); for (let i = 0; i < 30; i++) step(s, {});
  assert.equal(s.player.y, 2);
  s.player.bubble = 150; s.player.invuln = 0; const hp = s.player.hp;
  hitPlayer(s, 10, { element: 'elec' });
  assert.equal(hp - s.player.hp, 20); assert.equal(s.player.bubble, 0);
});
