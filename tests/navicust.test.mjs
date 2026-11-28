import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROGRAMS, LAYOUTS, canPlace, run, stats, cellsOf, CROSSES } from '../src/battle/navicust.mjs';

const id = name => PROGRAMS.find(p => p.name === name).id;
const part = (name, x, y, rot = 0, variant = 0) => ({ id: id(name), variant, x, y, rot, compressed: false });

test('program data from the ROM: 46 programs, Plus Parts flagged, the full board 5×5 with a frame', () => {
  assert.equal(PROGRAMS.length, 46);
  assert.ok(PROGRAMS.find(p => p.name === 'HP+500').plus);
  assert.ok(!PROGRAMS.find(p => p.name === 'SuprArmr').plus);
  assert.deepEqual(LAYOUTS[2].map(r => r.join('')), ['0333330', '3111113', '3111113', '3111113', '3111113', '3111113', '0333330']);
  assert.deepEqual(LAYOUTS[0][1].join(''), '3111130');
});

test('placement: on the board, not only on the frame, no overlap', () => {
  const ua = part('UnderSht', 3, 3);
  assert.ok(canPlace([], ua));
  assert.ok(!canPlace([ua], { ...ua }));                     // overlap
  assert.ok(!canPlace([], part('UnderSht', 0, 0)));          // off the board (corner)
  assert.equal(cellsOf(ua).length, 2);
});

test('RUN: programs work on the command line, bug off it; Plus Parts work off it', () => {
  const custom = part('Custom1', 3, 3), hp = part('HP+50', 1, 2); // HP+50 centred on row 1 would reach the frame
  const s = stats([custom, hp]);
  assert.equal(s.custom, 6); assert.equal(s.hpPlus, 50);
  assert.equal(s.run.bugs.reduce((a, b) => a + b, 0), 0);
  const off = part('Custom1', 3, 5); // program off the line → its bug type (4) and no effect
  const t = stats([off]);
  assert.equal(t.custom, 5); assert.equal(t.run.bugs[PROGRAMS.find(p => p.name === 'Custom1').bug], 2); // off the line + on the frame (3 rows tall)
});

test('RUN: two touching parts of the same colour bug, a Cross part picks the form', () => {
  // Attack+1 (white variant 0? colours [3,4,5]) — use two HP+50 of the same colour side by side
  const a = part('HP+50', 2, 2), b = part('HP+50', 3, 2);
  const r = run([a, b]);
  const hpBug = PROGRAMS.find(p => p.name === 'HP+50').bug;
  assert.equal(r.bugs[hpBug], 2);
  const s = stats([{ id: CROSSES[0].id, variant: 0, x: 1, y: 3, rot: 0 }]);
  assert.equal(s.cross, 'HeatCross');
});

import { createBattle, step, confirmCustom, CHARGE_TIMES, hitPlayer } from '../src/battle/engine.mjs';
test('battle uses the Customizer: HP+, Attack, Charge, Custom, SuperArmor, UnderShirt', () => {
  const navi = { hpPlus: 100, attack: 4, speed: 4, charge: 4, custom: 8, flags: new Set(['superArmor', 'underShirt']) };
  const s = createBattle({ seed: 2, navi });
  assert.equal(s.player.maxHp, 200);
  assert.equal(s.chargeTime, CHARGE_TIMES[4]);
  assert.equal(s.hand.length, 8);
  confirmCustom(s);
  const e = s.enemies[0], hp0 = e.hp;
  s.player.y = e.y;
  step(s, { a: true }); step(s, { a: false }); // tap the buster
  assert.equal(hp0 - e.hp, 5);                 // Attack 4 → 5 damage
  s.player.hp = 10; s.player.invuln = 0; s.player.state = 'idle'; s.attacker = null;
  hitPlayer(s, 50);                            // UnderShirt: 10 HP → 1; SuperArmor: no flinch
  assert.equal(s.player.hp, 1);
  assert.notEqual(s.player.state, 'flinch');
});
