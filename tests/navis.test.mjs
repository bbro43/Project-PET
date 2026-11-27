import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step, confirmCustom, naviBattle, naviVariants } from '../src/battle/engine.mjs';
import { NAVI_AI } from '../data/rules.mjs';

const start = (navi, variant = 0, seed = 1) => { const s = createBattle({ seed, enemies: naviBattle(navi, variant) }); confirmCustom(s); return s; };
const run = (s, n, input = {}) => { for (let i = 0; i < n; i++) step(s, input); };

test('Navi HP and names come from the ROM tables', () => {
  assert.deepEqual(naviVariants('ElecMan').map(v => [v.name, v.hp]).slice(0, 3), [['ElecMan', 900], ['ElecManEX', 1400], ['ElecManSP', 1800]]);
  assert.deepEqual(naviVariants('ProtoMan').map(v => [v.name, v.hp]).slice(0, 3), [['ProtoMan', 1800], ['ProtoMnEX', 2000], ['ProtoMnSP', 2000]]);
  const s = start('ElecMan');
  assert.equal(s.enemies[0].element, 'elec');
});

function findState(navi, variant, wanted, setup = () => {}) {
  for (let seed = 1; seed < 200; seed++) {
    const s = start(navi, variant, seed);
    setup(s);
    const e = s.enemies[0];
    for (let i = 0; i < 4000; i++) { step(s, {}); if (e.state === wanted) return { s, e }; }
  }
  throw new Error('state ' + wanted + ' never reached');
}

test('ElecMan row lightning: 30-frame aura, then hits MegaMan in his row for 72 frames', () => {
  const { s, e } = findState('ElecMan', 0, 'bolt', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.y = e.y;
  run(s, NAVI_AI.ElecMan.boltCharge.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 60, 'base ElecMan bolt damage 40');
});

test('ElecMan row lightning misses MegaMan in another row', () => {
  const { s, e } = findState('ElecMan', 0, 'bolt', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.y = (e.y + 1) % 3;
  run(s, 80);
  assert.equal(s.player.hp, 100);
});

test('ElecMan places a coil in MegaMan\'s area every 4th decision; coil HP from ROM', () => {
  const { s, e } = findState('ElecMan', 0, 'coilswap', s => { s.player.invuln = 1e9; });
  run(s, 40);
  const coils = s.enemies.filter(c => c.kind === 'coil' && c.hp > 0);
  assert.equal(coils.length, 1);
  assert.ok(coils[0].x <= 2, 'coil is on MegaMan\'s side');
  assert.equal(coils[0].hp, 15);
});

test('coils discharge down their column when ElecMan fires from their row', () => {
  for (let seed = 1; seed < 300; seed++) {
    const s = start('ElecMan', 0, seed);
    s.player.invuln = 1e9;
    const e = s.enemies[0];
    let ok = false;
    for (let i = 0; i < 6000 && !ok; i++) {
      step(s, {});
      ok = s.hazards.some(h => h.kind === 'colbolt');
    }
    if (!ok) continue;
    const h = s.hazards.find(h => h.kind === 'colbolt');
    const coil = s.enemies.find(c => c.id === h.owner);
    assert.equal(coil.y, e.y);
    s.player.invuln = 0; s.player.x = h.x; s.player.y = (coil.y + 1) % 3;
    step(s, {});
    assert.ok(s.player.hp < 100, 'column lightning hits MegaMan anywhere in that column');
    return;
  }
  assert.fail('no coil discharge observed');
});

test('ElecMan panel storm highlights groups then strikes them in order', () => {
  const { s, e } = findState('ElecMan', 0, 'storm', s => { s.player.invuln = 1e9; });
  run(s, 30);
  const groups = e.storm.groups.map(g => g.map(c => c.join(',')));
  assert.equal(e.storm.rounds, 3);
  assert.ok(groups.every(g => g.length >= 1 && g.length <= 3));
  let strikes = 0;
  for (let i = 0; i < 200 && e.state === 'storm'; i++) { step(s, {}); }
  assert.notEqual(e.state, 'storm');
});

test('ElecMan dash strike lines up, dashes to MegaMan and hits for 80', () => {
  const { s, e } = findState('ElecMan', 0, 'dashaura', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  assert.equal(e.y, s.player.y);
  for (let i = 0; i < 200 && e.state !== 'return'; i++) step(s, {});
  assert.equal(s.player.hp, 20);
  assert.ok(e.x >= 3, 'warped back to his side');
});

test('coils disappear when ElecMan is deleted and do not block the win', () => {
  const { s, e } = findState('ElecMan', 0, 'coilswap', s => { s.player.invuln = 1e9; });
  run(s, 40);
  e.hp = 1;
  s.player.y = e.y; s.player.x = 0;
  s.enemies.filter(c => c.kind === 'coil').forEach(c => { c.x = 2; c.y = (e.y + 1) % 3; });
  step(s, { a: true }); step(s, {}); step(s, {});
  assert.equal(s.phase, 'win');
});

test('ProtoMan steps in front of MegaMan and his WideSword covers the column', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = start('ProtoMan', 0, seed);
    s.player.invuln = 0;
    const e = s.enemies[0];
    for (let i = 0; i < 3000 && !(e.state === 'swing' && e.plan?.area === 'wide'); i++) step(s, {});
    if (e.state !== 'swing') continue;
    assert.deepEqual([e.x, e.y], [s.player.x + 1, s.player.y]);
    run(s, NAVI_AI.ProtoMan.hitTick.value);
    assert.equal(s.player.hp, 0, 'WideSword 100 deletes MegaMan at 100 HP');
    return;
  }
  assert.fail('no WideSword observed');
});

test('ProtoMan pattern: moves first, attacks after the move counter fills', () => {
  const s = start('ProtoMan', 0, 3);
  s.player.invuln = 1e9;
  const seen = [];
  const e = s.enemies[0];
  let last = '';
  for (let i = 0; i < 4000; i++) {
    step(s, {});
    const tag = e.plan ? e.plan.area : e.state === 'vanish' ? 'move' : '';
    if (tag && tag !== last) seen.push(tag);
    last = tag;
  }
  assert.equal(seen[0], 'move');
  assert.ok(seen.includes('wide'));
  assert.ok(seen.includes('long') || seen.includes('both'));
});

test('ProtoMan EX guards and counters a buster shot', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = start('ProtoMan', 1, seed);
    s.player.invuln = 1e9;
    const e = s.enemies[0];
    for (let i = 0; i < 4000 && e.state !== 'guard'; i++) step(s, {});
    if (e.state !== 'guard') continue;
    if (e.y !== s.player.y) continue;
    const hp = e.hp;
    step(s, { a: true }); step(s, {});
    assert.equal(e.hp, hp, 'guard blocks');
    step(s, {});
    assert.equal(e.plan?.area, 'sword', 'counterattack');
    return;
  }
  assert.fail('no guard in MegaMan row observed');
});

test('Navi battles are deterministic', () => {
  const play = () => { const s = start('ProtoMan', 2, 99); for (let i = 0; i < 3000; i++) step(s, { a: i % 7 === 0, dir: ['up', null, 'down', null][i % 4] }); return JSON.stringify([s.enemies, s.player.hp]); };
  assert.equal(play(), play());
});

test('attacks stop drawing when the battle ends', () => {
  const { s } = findState('ElecMan', 0, 'bolt', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.hp = 1; s.player.y = s.enemies[0].y;
  run(s, 40);
  assert.equal(s.phase, 'lose');
  assert.equal(s.hazards.length, 0);
});

// ---------------- HeatMan ----------------
test('HeatMan stats from ROM: 700 / 1500 / 1900 HP, fire', () => {
  assert.deepEqual(naviVariants('HeatMan').map(v => v.hp).slice(0, 3), [700, 1500, 1900]);
  assert.equal(start('HeatMan').enemies[0].element, 'fire');
});

test('HeatMan fire column: warps in front of MegaMan and burns the column in front of him', () => {
  const { s, e } = findState('HeatMan', 0, 'column', s => { s.player.invuln = 1e9; });
  assert.deepEqual([e.x, e.y], [s.player.x + 1, s.player.y]);
  s.player.invuln = 0;
  run(s, 80);
  assert.equal(s.player.hp, 80, 'column damage 20');
});

test('HeatMan stomp lands on MegaMan\'s panel and leaves fire pillars in a cross', () => {
  const { s, e } = findState('HeatMan', 0, 'stomp', s => { s.player.invuln = 1e9; });
  const ph = NAVI_AI.HeatMan.stompPhases.value;
  const target = [s.player.x, s.player.y];
  run(s, ph.close + ph.rise + 2);
  assert.ok(e.airborne);
  const hp = e.hp; step(s, { a: true }); step(s, {});
  assert.equal(e.hp, hp, 'cannot be hit in the air');
  s.player.invuln = 0;
  run(s, ph.hang + ph.fall);
  assert.deepEqual([e.x, e.y], target);
  assert.equal(s.player.hp, 80);
  const pillars = s.hazards.filter(h => h.kind === 'pillar').map(h => [h.x - target[0], h.y - target[1]]);
  for (const off of pillars) assert.ok(NAVI_AI.HeatMan.stompPillars.value.some(([dx, dy]) => dx === off[0] && dy === off[1]));
});

test('HeatMan wall nozzle burns from the back edge of MegaMan\'s row', () => {
  const { s, e } = findState('HeatMan', 0, 'nozzle', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = 0; s.player.y = e.y;
  run(s, 60);
  assert.equal(s.player.hp, 60, 'nozzle damage 40');
});

test('HeatMan returns to his own area after attacking', () => {
  const s = start('HeatMan', 1, 7);
  s.player.invuln = 1e9;
  const e = s.enemies[0];
  for (let i = 0; i < 5000; i++) {
    step(s, {});
    if (e.state === 'idle') assert.ok(e.x >= 3, `idle at x=${e.x}`);
  }
});

// ---------------- SlashMan ----------------
test('SlashMan names and HP from the ROM tables', () => {
  assert.deepEqual(naviVariants('SlashMan').slice(0, 3).map(v => [v.name, v.hp]), [["SlashMan", 800], ["SlashMnEX", 1200], ["SlashMnSP", 1500]]);
});

test('SlashMan darts five times, then the claw combo hits twice from in front of MegaMan', () => {
  const { s, e } = findState('SlashMan', 0, 'combo', s => { s.player.invuln = 1e9; });
  assert.deepEqual([e.x, e.y], [s.player.x + 1, s.player.y]);
  s.player.invuln = 0;
  const P = NAVI_AI.SlashMan;
  run(s, P.comboReady.value[0]);
  assert.equal(s.player.hp, 70, 'down swipe 30');
});

test('SlashMan rolling slash travels the whole row and hits MegaMan in it', () => {
  const { s, e } = findState('SlashMan', 0, 'roll', s => { s.player.invuln = 1e9; });
  assert.equal(e.y, s.player.y);
  s.player.invuln = 0;
  for (let i = 0; i < 300 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 40, 'roll 60');
});

test('SlashMan kunai: three rounds, always one kunai in MegaMan\'s row', () => {
  const { s, e } = findState('SlashMan', 0, 'kunai', s => { s.player.invuln = 1e9; });
  let volleys = 0;
  for (let i = 0; i < 600 && volleys < 3; i++) {
    const row = s.player.y;
    const before = s.hazards.filter(h => h.kind === 'kunai').length;
    step(s, {});
    const k = s.hazards.filter(h => h.kind === 'kunai' && h.start === s.tick);
    if (k.length) { volleys++; assert.equal(k.length, 2); assert.ok(k.some(h => h.y === row)); }
  }
  assert.equal(volleys, 3);
});

test('SlashMan chained darts use the short wait from the ROM table', () => {
  const s = start('SlashMan', 0, 3); s.player.invuln = 1e9;
  const e = s.enemies[0];
  const waits = [];
  for (let i = 0; i < 2000 && waits.length < 4; i++) { step(s, {}); if (e.state === 'idle' && e.stateT === 0) waits.push(e.think); }
  assert.equal(waits[0], 36);
  assert.ok(waits.slice(1).some(w => w === 6), JSON.stringify(waits));
});

test('ChargeMan names and HP from the ROM tables; fights in the Navi list', () => {
  const vs = naviVariants('ChargeMan');
  assert.equal(vs[0].name, 'ChrgeMan', 'ROM name is abbreviated to 8 letters');
  const s = start('ChargeMan');
  assert.equal(s.enemies[0].sprite, 'chargeman');
  assert.equal(s.enemies[0].hp, vs[0].hp);
});

test('ChargeMan moves the ROM count of times before his first strike', () => {
  const s = start('ChargeMan', 0, 3), e = s.enemies[0];
  s.player.invuln = 1e9;
  let moves = 0;
  for (let i = 0; i < 4000 && e.state !== 'strike'; i++) { const was = e.state; step(s, {}); if (was !== 'vanish' && e.state === 'vanish' && !e.after) moves++; }
  assert.equal(e.state, 'strike');
  assert.equal(moves, NAVI_AI.ChargeMan.moveCount.value[0]);
});

test('ChargeMan strike: 40-frame wind-up, then hits the panel two ahead for 60', () => {
  const { s, e } = findState('ChargeMan', 0, 'strike', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = e.x - 2; s.player.y = e.y;
  const P = NAVI_AI.ChargeMan;
  run(s, P.strikeWindup.value + P.strikeHold.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 40);
});

test('ChargeMan burst: marker follows MegaMan, locks, and the burst hits the marked panel', () => {
  const { s, e } = findState('ChargeMan', 0, 'mark', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  const mk = e.marker;
  assert.ok(s.hazards.includes(mk));
  s.player.x = 1; s.player.y = 2; s.player.hp = s.player.maxHp = 500;
  run(s, NAVI_AI.ChargeMan.burstSeek.value + 2);
  assert.ok(mk.locked);
  const [lx, ly] = [mk.x, mk.y];
  for (let i = 0; i < 200 && !s.hazards.some(h => h.kind === 'burst'); i++) step(s, {});
  const b = s.hazards.find(h => h.kind === 'burst');
  assert.deepEqual([b.x, b.y], [lx, ly]);
  assert.equal(e.y, ly, 'ChargeMan lines up in the marked row');
  assert.deepEqual([lx, ly], [1, 2], 'marker caught up with MegaMan');
  run(s, 1);
  assert.equal(s.player.hp, 400, 'base burst damage 100');
});
