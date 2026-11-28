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

import { createBattle, step, confirmCustom, CHARGE_TIMES, hitPlayer, shuffleHand } from '../src/battle/engine.mjs';
import { setPanel } from '../src/battle/panels.mjs';
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

const nav = (flags, extra = {}) => ({ hpPlus: 0, attack: 0, speed: 0, charge: 0, custom: 5, flags: new Set(flags), ...extra });
const ready = s => { confirmCustom(s); for (const e of s.enemies) e.paralyzed = 1e6; s.player.invuln = 0; return s; };

test('FstBarr: the barrier soaks the first 10 damage', () => {
  const s = ready(createBattle({ seed: 3, navi: nav(['firstBarrier']) }));
  hitPlayer(s, 4); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 6);
  hitPlayer(s, 10); assert.equal(s.player.hp, 96);
});

test('B+Left: Shield blocks for 20 ticks, Reflect answers with 50, AntiDmg throws a star', () => {
  for (const [ability, check] of [['Shield', s => assert.equal(s.player.hp, 100)], ['Reflect', s => assert.ok(s.enemies.some(e => e.maxHp - e.hp === 50) || s.enemies.every(e => e.hp >= 0))], ['AntiDmg', s => assert.equal(s.player.hp, 100)]]) {
    const s = ready(createBattle({ seed: 3, navi: nav([], { bLeft: ability }) }));
    for (const e of s.enemies) { e.hp = e.maxHp = 400; }
    s.player.y = s.enemies[0].y;
    for (let i = 0; i < 40; i++) step(s, { a: true }); // B held (the first press fires a shot), then Left
    step(s, { a: true, dir: 'left' });
    assert.equal(s.player.state, ability === 'AntiDmg' ? 'antidmg' : 'guard');
    const hp0 = s.enemies[0].hp; s.attacker = s.enemies[0]; hitPlayer(s, 30); s.attacker = null;
    check(s);
    if (ability !== 'Shield') assert.equal(hp0 - s.enemies[0].hp, 50);
    else assert.equal(hp0 - s.enemies[0].hp, 0);
  }
});

test('NumbrOpn deals 10 chips; ChpShufl reshuffles once', () => {
  const s = createBattle({ seed: 4, navi: nav(['numberOpen', 'chipShuffle']) });
  assert.equal(s.hand.length, 10);
  const before = s.hand.map(c => c.id).join();
  assert.ok(shuffleHand(s)); assert.equal(s.hand.length, 10);
  assert.ok(!shuffleHand(s));
  assert.notEqual(s.hand.map(c => c.id).join(), before);
});

test('AirShoes walk onto holes; FlotShoe ignores poison', () => {
  const s = ready(createBattle({ seed: 5, navi: nav(['airShoes', 'floatShoes']) }));
  s.player.x = 1; s.player.y = 1; setPanel(s, 0, 1, 'broken'); setPanel(s, 1, 1, 'poison');
  for (let i = 0; i < 60; i++) step(s, {});
  assert.equal(s.player.hp, 100);
  step(s, { dir: 'left' }); for (let i = 0; i < 30; i++) step(s, {});
  assert.equal(s.player.x, 0);
});

test('AutoHeal: 10% back when the battle is won', () => {
  const s = ready(createBattle({ seed: 6, navi: nav(['autoHeal']) }));
  s.player.hp = 50; for (const e of s.enemies) e.hp = 0;
  step(s, {});
  assert.equal(s.player.hp, 60);
});

import { REGUPS, REG_MAX } from '../src/battle/navicust.mjs';
test('RegUP parts: Regular memory 4 + 1/2/3 each, at most 99 (sub_803CFB0)', () => {
  const [r1, r2, r3] = REGUPS.map(r => r.id);
  assert.equal(stats([]).reg, 4);
  assert.equal(stats([{ id: r1, x: 1, y: 1, rot: 0 }, { id: r3, x: 2, y: 1, rot: 0 }]).reg, 8);
  const many = []; for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) many.push({ id: r3, x, y, rot: 0 });
  assert.equal(stats(many).reg, Math.min(REG_MAX, 4 + 3 * 25));
});

test('compression codes from the ROM (byte_813B522): 10 buttons for every program whose shape compresses', () => {
  for (const P of PROGRAMS) {
    const shrinks = JSON.stringify(P.shape) !== JSON.stringify(P.compressed);
    assert.equal(!!P.code, shrinks, P.name);
    if (P.code) assert.match(P.code, /^[ABLR]{10}$/);
  }
  assert.equal(PROGRAMS.find(p => p.name === 'SuprArmr').code, 'ABLLAALRBA');
});
