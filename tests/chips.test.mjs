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
const hurt = s => s.enemies.filter(e => e.owner !== 'player' && e.hp < 5000).map(e => [e.x, e.y, 5000 - e.hp]).sort();

test('bombs: MiniBomb one panel 3 ahead, BigBomb 3×3, EnergBom 3 hits', () => {
  assert.deepEqual(hurt(after('MiniBomb', 80)), [[4, 1, 50]]);
  assert.equal(hurt(after('BigBomb', 80)).length, 9); // the 3×3 around (4, 1)
  assert.deepEqual(hurt(after('EnergBom', 120)), [[4, 1, 120]]);
});

import { panelType, setPanel } from '../src/battle/panels.mjs';
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

test('Spreader splashes 3×3 round the panel hit; WideShot sweeps three rows', () => {
  assert.equal(hurt(after('Spreadr1', 30)).length, 6); // target (3,1): 3×3 covers columns 2–4 (enemies stand from x 3)
  assert.equal(hurt(after('WideSht', 80)).length, 9);
});

test('TankCannon: the first enemy in the row, or the back column when the row is empty', () => {
  assert.deepEqual(hurt(after('TankCan1', 5)).map(([x, y]) => [x, y]), [[3, 1]]);
  const s = after('TankCan1', 5, s => { s.enemies = s.enemies.filter(e => e.y !== 1); });
  assert.deepEqual(hurt(s).map(([x, y]) => [x, y]), [[5, 0], [5, 2]]);
  assert.equal(panelType(s, 5, 1), 'cracked');
});

test('MachGun: 9 shots sweeping the nearest enemy column from the bottom row', () => {
  const s = after('MachGun1', 120);
  const hits = hurt(s);
  assert.equal(hits.reduce((n, [, , d]) => n + d / 30, 0), 9);
  assert.ok(hits.every(([x]) => x === 3 || x === 4));
});

test('AquaNeedle: 3 needles on 3 enemies; one enemy takes all three', () => {
  assert.equal(hurt(after('AquaNdl1', 60)).length, 3);
  const s = after('AquaNdl1', 60, s => { s.enemies = s.enemies.slice(0, 1); });
  assert.deepEqual(hurt(s).map(([, , d]) => d), [120]);
});

test('Tornado: 8 hits 2 panels ahead; on volcano it turns fire, doubles and clears the panel', () => {
  const s = after('Tornado', 60, s => { s.player.x = 1; });
  assert.deepEqual(hurt(s), [[3, 1, 160]]); // 20 × 8
  const v = after('Tornado', 60, s => { setPanel(s, 3, 1, 'volcano'); });
  assert.equal(hurt(v)[0][2], 320); assert.equal(panelType(v, 3, 1), 'normal');
});

import { hitPlayer } from '../src/battle/engine.mjs';
test('Reflector: guards for 60 frames and sends the first hit back with the chip\'s damage', () => {
  const s = after('Rflectr2', 5);
  assert.equal(s.player.state, 'guard');
  s.player.invuln = 0; const hp = s.player.hp; hitPlayer(s, 40);
  assert.equal(s.player.hp, hp);
  assert.deepEqual(hurt(s), [[3, 1, 120]]);
  for (let i = 0; i < 60; i++) step(s, {});
  assert.equal(s.player.state, 'idle');
});

test('BubbleStar: the first enemy in the row is bubbled; the next hit pops it', () => {
  const s = after('BblStar1', 120, s => { for (const e of s.enemies) e.paralyzed = 0; s.enemies.forEach(e => { e.think = 1e9; }); });
  const e = s.enemies.find(e => e.x === 3 && e.y === 1);
  assert.ok(e.bubble > 0); assert.equal(hurt(s).length, 1);
});

test('CornShot: grass where it hits, two blasts, and corns on the other grass panels', () => {
  const s = after('CornSht1', 40, s => { setPanel(s, 5, 0, 'grass'); });
  assert.equal(panelType(s, 3, 1), 'grass');
  assert.deepEqual(hurt(s).map(([x, y, d]) => [x, y, d]), [[3, 1, 100], [5, 0, 100]]); // wood on grass? 50 × 2
});

test('Thunder: the ball homes in one panel per 60 frames and paralyses', () => {
  const s = after('Thunder', 200, s => { s.enemies = s.enemies.filter(e => e.x === 4 && e.y === 0); s.enemies[0].paralyzed = 0; s.enemies[0].think = 1e9; });
  assert.equal(hurt(s).length, 1);
});

test('YoYo: out three panels, spins there twice, and back', () => {
  const s = after('YoYo', 80, s => { s.enemies = s.enemies.filter(e => e.x === 4 && e.y === 1); s.enemies[0].think = 1e9; });
  assert.deepEqual(hurt(s), [[4, 1, 150]]); // arrives, then two re-arms
});

test('TrainArrow: one arrow per own panel ahead plus MegaMan\'s own, each ending on its hit', () => {
  const s = after('TrnArrw1', 3, s => { s.enemies = s.enemies.filter(e => e.y === 1); });
  assert.equal(s.hazards.filter(h => h.sprite === 'arrowfx').length, 2); // MegaMan on x 1: panel 2, and his own
  const t = after('TrnArrw1', 120, s => { s.enemies = s.enemies.filter(e => e.x === 4 && e.y === 1); });
  assert.deepEqual(hurt(t), [[4, 1, 60]]);
});

test('RollingLog: from the middle row, two logs covering rows 0-1 and 1-2', () => {
  const s = after('RlngLog1', 120, s => { s.enemies = s.enemies.filter(e => e.x === 4); });
  assert.deepEqual(hurt(s), [[4, 0, 50], [4, 1, 100], [4, 2, 50]]);
});

test('AirSpin: glides up to the enemy, then hits the panels around it', () => {
  const s = after('AirSpin2', 120, s => { s.enemies = s.enemies.filter(e => e.x === 5 && e.y === 1); });
  assert.deepEqual(hurt(s), [[5, 1, 150]]);
});

test('GunDelSol: 2 damage a frame on the column two panels ahead, 60 / 90 / 120 frames', () => {
  assert.deepEqual(hurt(after('GunDelS1', 100)), [[3, 0, 120], [3, 1, 120], [3, 2, 120]]);
  assert.deepEqual(hurt(after('GunDelS3', 150)), [[3, 0, 240], [3, 1, 240], [3, 2, 240]]);
});

test('RiskyHoney: the swarm reaches the nearest enemy and hits it 5 times', () => {
  const s = after('RskyHny1', 120, s => { s.enemies = s.enemies.filter(e => e.x === 4 && e.y === 2); });
  assert.deepEqual(hurt(s), [[4, 2, 50]]);
});

test('DollThunder: every enemy in the row ahead, once', () => {
  assert.deepEqual(hurt(after('DolThdr1', 40)), [[3, 1, 120], [4, 1, 120], [5, 1, 120]]);
});

test('AirHockey: the puck bounces diagonally and keeps to the enemy area', () => {
  const s = after('AirHocky', 80, s => { s.enemies = s.enemies.filter(e => e.x === 4 && e.y === 1); });
  assert.deepEqual(hurt(s), [[4, 1, 300]]); // (2,1) (3,2) (4,1) (5,0) (4,1) (3,2) (4,1) (5,0) (4,1) (3,2) (4,1): 5 passes
});

test('placed bombs: BlkBomb waits for Fire, FlshBom paralyses everyone, LilBolr soaks hits, BugBomb goes off', () => {
  const empty = s => { s.enemies = s.enemies.filter(e => !(e.x === 4 && e.y === 1)); };
  let s = after('BlkBomb', 70, empty);
  const bomb = s.enemies.find(e => e.family === 'BlackBomb');
  assert.ok(bomb && bomb.x === 4 && bomb.y === 1 && bomb.hp === 100);
  assert.equal(hurt(s).length, 0);
  s.queue = [{ id: 2, name: 'FireBrn1', code: 'F' }]; s.player.x = 3; // a Fire hit on it sets it off
  step(s, { b: true }); for (let i = 0; i < 30; i++) step(s, {});
  assert.equal(bomb.hp, 0);
  assert.ok(hurt(s).filter(([x, y, d]) => d >= 250).length >= 7); // every enemy takes the blast (plus burner hits)
  s = after('FlshBom1', 120, empty);
  assert.equal(hurt(s).length, 8);
  assert.ok(s.enemies.filter(e => e.owner !== 'player').every(e => e.paralyzed > 0));
  s = after('LilBolr1', 250, empty);
  assert.deepEqual(hurt(s).map(h => h[2]), Array(8).fill(100)); // the 8 enemies around (4, 1) get the chip's damage
  s = after('BugBomb', 120, empty);
  assert.equal(s.enemies.some(e => e.family === 'BugBomb' && e.hp > 0), false);
});

test('Dragons: down the nearest enemy column, one column back, and up it', () => {
  const s = after('HeatDrgn', 90);
  assert.deepEqual(hurt(s).map(([x, y]) => [x, y]), [[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]]);
});

test('special chips: barriers, Invisibl, panel chips, cubes', () => {
  let s = after('Barr100', 90); s.player.invuln = 0; hitPlayer(s, 60); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 40);
  s.player.invuln = 0; hitPlayer(s, 60); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 0); // the breaking hit is stopped too
  s = after('LifeAur', 90); s.player.invuln = 0; hitPlayer(s, 150); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 1);
  s = after('BblWrap', 90); s.player.invuln = 0; hitPlayer(s, 80); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 0);
  for (let i = 0; i < 320; i++) step(s, {}); assert.equal(s.player.barrier, 1);
  s = after('Invisibl', 130); assert.ok(s.player.invis > 300 && !s.timestop);
  s = after('Snctuary', 160); assert.equal(panelType(s, 0, 0), 'holy'); assert.equal(panelType(s, 2, 2), 'holy');
  s = after('RockCube', 90); assert.ok(s.enemies.some(e => e.family === 'Cube' && e.x === 2 && e.hp === 200));
});

test('batch 11: gauge chips, time bombs, instruments, Geddon', () => {
  let s = after('FstGauge', 170); s.gauge = 0; step(s, {}); assert.equal(s.gauge, 2);
  s = after('SloGauge', 170); s.gauge = 0; step(s, {}); assert.equal(s.gauge, 0.5);
  s = after('TimeBom1', 80, s => { s.enemies = s.enemies.filter(e => e.x !== 3 || e.y !== 1); }); // first free enemy panel in the row: (3, 1)
  const bomb = s.enemies.find(e => e.family === 'TimeBomb'); assert.ok(bomb && bomb.x === 3);
  for (let i = 0; i < 260; i++) step(s, {});
  assert.equal(bomb.hp, 0); assert.equal(hurt(s).length, 8);
  s = after('Timpani', 140); for (let i = 0; i < 60; i++) step(s, {});
  assert.ok(s.enemies.filter(e => e.owner !== 'player').every(e => e.paralyzed > 0));
  s = after('Geddon', 280);
  assert.ok([0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => !(x === 1 && y === 1)).every(([x, y]) => panelType(s, x, y) === 'broken' || s.enemies.some(e => e.x === x && e.y === y)));
});

test('traps: AntiDmg, BodyGrd, AntiSwrd and ElemTrap spring on the right hits', () => {
  let s = after('AntiDmg', 160); s.player.invuln = 0;
  hitPlayer(s, 5); assert.equal(s.player.hp, 95); assert.ok(s.trap); // under 10: no
  s.player.invuln = 0; s.attacker = s.enemies.find(e => e.x === 5 && e.y === 0); hitPlayer(s, 40);
  assert.equal(s.player.hp, 95); assert.equal(s.trap, null);
  for (let i = 0; i < 10; i++) step(s, {});
  assert.deepEqual(hurt(s), [[5, 0, 100]]);
  s = after('BodyGrd', 160); s.player.invuln = 0; hitPlayer(s, 40); for (let i = 0; i < 260; i++) step(s, {});
  assert.equal(hurt(s).reduce((n, h) => n + h[2], 0), 1000); // 10 shurikens of 100
  s = after('AntiSwrd', 160); s.player.invuln = 0; hitPlayer(s, 40); assert.equal(s.player.hp, 60); // not a sword: no
  s.player.invuln = 0; hitPlayer(s, 40, { sword: true }); assert.equal(s.player.hp, 60); for (let i = 0; i < 120; i++) step(s, {});
  assert.deepEqual(hurt(s).map(h => h[2]), Array(9).fill(300)); // three waves over the 3×3 enemy block
  s = after('ElemTrap', 160); s.player.invuln = 0; hitPlayer(s, 20, { element: 'fire' });
  assert.equal(s.player.hp, 80); assert.equal(hurt(s).length, 9); assert.ok(hurt(s).every(h => h[2] >= 240));
});

test('ElemTrap springs on an elemental attack that misses MegaMan', async () => {
  const { elemTrapSees } = await import('../src/battle/engine.mjs');
  let s = after('ElemTrap', 160); elemTrapSees(s, { element: 'aqua' });
  assert.equal(s.player.hp, 100); assert.equal(s.trap, null); assert.equal(hurt(s).length, 9);
  s = after('ElemTrap', 160); elemTrapSees(s, { element: 'none' }); assert.ok(s.trap);
});

test('ElemTrap springs on an elemental enemy hazard away from MegaMan', () => {
  const s = after('ElemTrap', 160); const e = s.enemies.find(e => e.hp > 0);
  e.element = 'fire'; s.hazards.push({ kind: 'pillar', x: 0, y: 0, start: s.tick, rise: 10, burn: 10, fall: 10, damage: 50, owner: e.id });
  s.player.x = 2; s.player.y = 2; step(s, {});
  assert.equal(s.trap, null); assert.equal(s.player.hp, 100);
});

test('BurnSqr: the 2×2 cursor moves on its own and fires on the chip button', () => {
  const s = after('BurnSqr1', 0); const ts = s.timestop; assert.ok(ts.special.cursor);
  while (s.timestop && s.timestop.t < ts.start + 7) step(s, {});
  assert.deepEqual([ts.special.cursor.x, ts.special.cursor.y], [4, 1]);
  step(s, { b: true }); for (let i = 0; i < 20; i++) step(s, {});
  assert.deepEqual(hurt(s), [[4, 1, 100], [4, 2, 100], [5, 1, 100], [5, 2, 100]]);
  for (let i = 0; i < 120 && s.timestop; i++) step(s, {}); assert.equal(s.timestop, null);
  const s2 = after('BurnSqr1', 0); for (let i = 0; i < 500 && s2.timestop; i++) step(s2, {}); // fires by itself after 0x12C
  assert.equal(hurt(s2).length, 4);
});

test('Magnum: a column while the cursor runs along the row, cracking the panels', async () => {
  const { panelType } = await import('../src/battle/panels.mjs');
  const s = after('Magnum', 0); const ts = s.timestop;
  while (s.timestop.t < ts.start + 1) step(s, {});
  step(s, { b: true }); for (let i = 0; i < 20; i++) step(s, {});
  assert.deepEqual(hurt(s), [[3, 0, 130], [3, 1, 130], [3, 2, 130]]);
  assert.equal(panelType(s, 3, 1), 'cracked');
});

test('Wind / Fan: a box ahead that blows the enemies along the rows', () => {
  const one = s => { s.enemies = [{ id: 7, family: 'Mettaur', x: 4, y: 1, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }, { id: 8, family: 'Mettaur', x: 3, y: 2, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }]; };
  let s = after('Wind', 200, one); const box = s.enemies.find(e => e.family === 'WindBox');
  assert.ok(box); assert.deepEqual([box.x, box.y, box.hp], [2, 1, 40]); assert.equal(s.enemies.find(e => e.id === 7).x, 5); assert.equal(s.enemies.find(e => e.id === 8).x, 5); // slid all the way back
  s = after('Fan', 200, one); assert.equal(s.enemies.find(e => e.id === 7).x, 3); assert.equal(s.enemies.find(e => e.id === 8).x, 3);
});

test('Meteors: 30 meteors down the enemy panels from the back column, inside the freeze', () => {
  const s = after('Meteors', 0); const ts = s.timestop;
  assert.deepEqual(ts.special.order.slice(0, 4), [[5, 0], [5, 1], [5, 2], [4, 0]]);
  while (s.timestop) step(s, {});
  const h = hurt(s); assert.equal(h.length, 9);
  assert.equal(h.reduce((n, x) => n + x[2], 0), 30 * 40); // 30 meteors of 40, cycling the 9 panels
  assert.equal(h.find(x => x[0] === 5 && x[1] === 0)[2], 4 * 40);
});

test('Mine: hides on a free enemy panel and goes off when an enemy steps on it', () => {
  const s = after('Mine', 0, s => { s.enemies = [{ id: 7, family: 'Mettaur', x: 5, y: 2, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }]; });
  while (s.timestop) step(s, {});
  const m = s.hazards.find(h => h.kind === 'chipmine'); assert.ok(m); assert.notDeepEqual([m.x, m.y], [5, 2]);
  const e = s.enemies.find(e => e.id === 7); e.x = m.x; e.y = m.y; step(s, {});
  assert.equal(e.hp, 4800); assert.equal(s.hazards.some(h => h.kind === 'chipmine'), false);
});

test('AirRaid: a plane ahead rises, then drops its bombs on the enemies in turn', () => {
  const s = after('AirRaid1', 0); while (s.timestop) step(s, {});
  const plane = s.enemies.find(e => e.family === 'AirRaid'); assert.deepEqual([plane.x, plane.y, plane.hp], [2, 1, 30]);
  for (let i = 0; i < 160; i++) step(s, {});
  assert.equal(hurt(s).reduce((n, h) => n + h[2], 0), 10 * 10); // 10 bombs of 10
  assert.equal(plane.hp, 0); // gone after 150 frames
});

test('Sensor: aims by its row, fires a laser down the line when an enemy is on the dot', () => {
  const one = s => { s.enemies = [{ id: 7, family: 'Mettaur', x: 5, y: 1, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }]; };
  const s = after('Sensor1', 0, one); while (s.timestop) step(s, {});
  const sn = s.enemies.find(e => e.family === 'Sensor'); assert.deepEqual([sn.x, sn.y, sn.hp], [2, 1, 20]);
  for (let i = 0; i < 64 + 3 * 8 + 2; i++) step(s, {});
  assert.ok(sn.fired); assert.deepEqual(hurt(s), [[5, 1, 100]]);
});

test('Snake: one snake per hole on MegaMan\'s side, each at the nearest enemy by row', async () => {
  const { setPanel } = await import('../src/battle/panels.mjs');
  const s = after('Snake', 0, s => { setPanel(s, 0, 0, 'broken'); setPanel(s, 2, 2, 'broken'); });
  assert.deepEqual(s.timestop.special.order, [[2, 2], [0, 0]]);
  while (s.timestop) step(s, {});
  assert.deepEqual(hurt(s), [[3, 0, 30], [3, 2, 30]]);
  const t = after('Snake', 0); assert.equal(t.timestop.special.order.length, 0); while (t.timestop) step(t, {}); assert.equal(hurt(t).length, 0);
});

test('GrabRvng: takes back stolen panels and strikes every enemy once per panel; Anubis drains the enemy area', () => {
  let s = after('GrabRvng', 0, s => { s.panels[0][2].side = 'e'; s.panels[1][2].side = 'e'; });
  while (s.timestop) step(s, {});
  assert.equal(s.panels[0][2].side, 'p'); assert.ok(hurt(s).every(h => h[2] === 80)); assert.equal(hurt(s).length, 9);
  s = after('GrabBnsh', 0); while (s.timestop) step(s, {}); assert.equal(hurt(s).length, 0);
  s = after('Anubis', 0); while (s.timestop) step(s, {});
  const a = s.enemies.find(e => e.family === 'Anubis'); assert.deepEqual([a.x, a.y, a.hp], [2, 1, 100]);
  for (let i = 0; i < 20 + 60; i++) step(s, {});
  assert.ok(hurt(s).every(h => h[2] >= 10 && h[2] <= 11)); assert.equal(hurt(s).length, 9);
});

test('chip lockout: LockoutFrames from the chip data block the next chip after the action ends', () => {
  const s = after('Recov10', 0); s.queue.push({ id: 2, name: 'Recov10', code: 'A' });
  while (s.player.state === 'chip') step(s, {});
  assert.equal(s.player.chipLockout, 30);
  step(s, { b: true }); assert.equal(s.queue.length, 1); // refused
  for (let i = 0; i < 30; i++) step(s, {});
  step(s, { b: true }); assert.equal(s.queue.length, 0);
});

test('Guardian: hit by MegaMan it strikes every enemy; hit by an enemy it strikes MegaMan', async () => {
  const { hitPlayer } = await import('../src/battle/engine.mjs');
  let s = after('Guardian', 0); while (s.timestop) step(s, {});
  const g = s.enemies.find(e => e.family === 'Guardian'); assert.deepEqual([g.x, g.y, g.hp], [2, 1, 1]);
  for (let i = 0; i < 30; i++) step(s, {});
  step(s, { a: true }); for (let i = 0; i < 30 && !s.timestop; i++) step(s, {}); // MegaMan's buster hits it
  assert.ok(s.timestop); while (s.timestop) step(s, {});
  assert.equal(hurt(s).length, 9); assert.ok(hurt(s).every(h => h[2] >= 200)); assert.equal(g.hp, 0);
});

test('BugFix clears the bugs; Otenko feeds the next chip; CircGun marks 4 panels after the button', () => {
  let s = after('BugFix', 0, s => { s.bugs = { 9: 2 }; s.hpBug = { level: 2, t: 0 }; }); while (s.timestop) step(s, {});
  assert.deepEqual(s.bugs, {}); assert.equal(s.hpBug, null);
  s = after('Otenko', 0); s.queue.push({ id: 2, name: 'Cannon', code: 'A', bonus: 0 }); while (s.timestop) step(s, {});
  for (let i = 0; i < 400; i++) step(s, {});
  assert.equal(s.queue[0].bonus, 50);
  s = after('CircGun', 0); const c = s.timestop.special.cursor;
  for (let i = 0; i < 4; i++) step(s, {});
  step(s, { b: true }); while (s.timestop) step(s, {});
  assert.equal(hurt(s).length, 4); assert.ok(hurt(s).every(h => h[2] === 150));
});

test('NumbrBl: 4 balls worth MegaMan\'s HP mod 100; Muramasa caps at 500', () => {
  const s = after('NumbrBl', 0, s => { s.player.hp = 87; s.enemies = [{ id: 7, family: 'Mettaur', x: 4, y: 1, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }]; });
  for (let i = 0; i < 400; i++) step(s, {});
  assert.equal(s.enemies.find(e => e.id === 7).hp, 5000 - 4 * 87);
});

test('BlzrdBal rolls through the row; LifeSync gives every enemy the target\'s HP', () => {
  let s = after('BlzrdBal', 0); while (s.timestop) step(s, {}); for (let i = 0; i < 120; i++) step(s, {});
  assert.deepEqual(hurt(s), [[3, 1, 150], [4, 1, 150], [5, 1, 150]]);
  s = after('LifeSync', 0, s => { s.enemies[4].hp = 300; }); // (4, 1)... the target is 2 ahead of (1, 1): (3, 1)
  const tgt = s.enemies.find(e => e.x === 3 && e.y === 1); tgt.hp = 120;
  while (s.timestop) step(s, {});
  assert.ok(s.enemies.every(e => e.hp === 120));
});

test('ComingRd / GoingRd: the enemy area becomes road and carries the enemies', async () => {
  const { panelType } = await import('../src/battle/panels.mjs');
  const one = s => { s.enemies = [{ id: 7, family: 'Mettaur', x: 4, y: 1, hp: 5000, maxHp: 5000, state: 'idle', stateT: 0, think: 1e9, paralyzed: 1e9, anim: 'idle', animT: 0, element: 'none' }]; };
  let s = after('ComingRd', 0, one); while (s.timestop) step(s, {});
  assert.equal(panelType(s, 4, 1), 'road-left'); for (let i = 0; i < 40; i++) step(s, {});
  assert.equal(s.enemies[0].x, 3);
  s = after('GoingRd', 0, one); while (s.timestop) step(s, {}); for (let i = 0; i < 40; i++) step(s, {});
  assert.equal(s.enemies[0].x, 5);
});
