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
  let s = after('Barr100', 70); s.player.invuln = 0; hitPlayer(s, 60); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 40);
  s.player.invuln = 0; hitPlayer(s, 60); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 0); // the breaking hit is stopped too
  s = after('LifeAur', 70); s.player.invuln = 0; hitPlayer(s, 150); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 1);
  s = after('BblWrap', 70); s.player.invuln = 0; hitPlayer(s, 80); assert.equal(s.player.hp, 100); assert.equal(s.player.barrier, 0);
  for (let i = 0; i < 320; i++) step(s, {}); assert.equal(s.player.barrier, 1);
  s = after('Invisibl', 110); assert.ok(s.player.invis > 300 && !s.timestop);
  s = after('Snctuary', 140); assert.equal(panelType(s, 0, 0), 'holy'); assert.equal(panelType(s, 2, 2), 'holy');
  s = after('RockCube', 70); assert.ok(s.enemies.some(e => e.family === 'Cube' && e.x === 2 && e.hp === 200));
});

test('batch 11: gauge chips, time bombs, instruments, Geddon', () => {
  let s = after('FstGauge', 150); s.gauge = 0; step(s, {}); assert.equal(s.gauge, 2);
  s = after('SloGauge', 150); s.gauge = 0; step(s, {}); assert.equal(s.gauge, 0.5);
  s = after('TimeBom1', 60, s => { s.enemies = s.enemies.filter(e => e.x !== 3 || e.y !== 1); }); // first free enemy panel in the row: (3, 1)
  const bomb = s.enemies.find(e => e.family === 'TimeBomb'); assert.ok(bomb && bomb.x === 3);
  for (let i = 0; i < 260; i++) step(s, {});
  assert.equal(bomb.hp, 0); assert.equal(hurt(s).length, 8);
  s = after('Timpani', 120); for (let i = 0; i < 60; i++) step(s, {});
  assert.ok(s.enemies.filter(e => e.owner !== 'player').every(e => e.paralyzed > 0));
  s = after('Geddon', 260);
  assert.ok([0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => !(x === 1 && y === 1)).every(([x, y]) => panelType(s, x, y) === 'broken' || s.enemies.some(e => e.x === x && e.y === y)));
});

test('traps: AntiDmg, BodyGrd, AntiSwrd and ElemTrap spring on the right hits', () => {
  let s = after('AntiDmg', 140); s.player.invuln = 0;
  hitPlayer(s, 5); assert.equal(s.player.hp, 95); assert.ok(s.trap); // under 10: no
  s.player.invuln = 0; s.attacker = s.enemies.find(e => e.x === 5 && e.y === 0); hitPlayer(s, 40);
  assert.equal(s.player.hp, 95); assert.equal(s.trap, null);
  for (let i = 0; i < 10; i++) step(s, {});
  assert.deepEqual(hurt(s), [[5, 0, 100]]);
  s = after('BodyGrd', 140); s.player.invuln = 0; hitPlayer(s, 40); for (let i = 0; i < 260; i++) step(s, {});
  assert.equal(hurt(s).reduce((n, h) => n + h[2], 0), 1000); // 10 shurikens of 100
  s = after('AntiSwrd', 140); s.player.invuln = 0; hitPlayer(s, 40); assert.equal(s.player.hp, 60); // not a sword: no
  s.player.invuln = 0; hitPlayer(s, 40, { sword: true }); assert.equal(s.player.hp, 60); for (let i = 0; i < 120; i++) step(s, {});
  assert.deepEqual(hurt(s).map(h => h[2]), Array(9).fill(300)); // three waves over the 3×3 enemy block
  s = after('ElemTrap', 140); s.player.invuln = 0; hitPlayer(s, 20, { element: 'fire' });
  assert.equal(s.player.hp, 80); assert.equal(hurt(s).length, 9); assert.ok(hurt(s).every(h => h[2] >= 240));
});
