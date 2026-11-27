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

test('EraseMan names and HP from the ROM tables; fights in the Navi list', () => {
  const vs = naviVariants('EraseMan');
  assert.equal(vs[0].name, 'EraseMan');
  const s = start('EraseMan');
  assert.equal(s.enemies[0].sprite, 'eraseman');
  assert.equal(s.enemies[0].hp, vs[0].hp);
});

test('EraseMan moves the ROM count of times before his first strike', () => {
  const s = start('EraseMan', 0, 3), e = s.enemies[0];
  s.player.invuln = 1e9;
  let moves = 0;
  for (let i = 0; i < 4000 && e.state !== 'strike'; i++) { const was = e.state; step(s, {}); if (was !== 'vanish' && e.state === 'vanish' && !e.after) moves++; }
  assert.equal(e.state, 'strike');
  assert.equal(moves, NAVI_AI.EraseMan.moveCount.value[0]);
});

test('EraseMan strike: 40-frame wind-up, then hits the panel two ahead for 60', () => {
  const { s, e } = findState('EraseMan', 0, 'strike', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = e.x - 2; s.player.y = e.y;
  const P = NAVI_AI.EraseMan;
  run(s, P.strikeWindup.value + P.strikeHold.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 40);
});

test('EraseMan beam: eye marker follows MegaMan, locks, and the beam hits the marked panel', () => {
  const { s, e } = findState('EraseMan', 0, 'mark', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  const mk = e.marker;
  assert.ok(s.hazards.includes(mk));
  s.player.x = 1; s.player.y = 2; s.player.hp = s.player.maxHp = 500;
  run(s, NAVI_AI.EraseMan.burstSeek.value + 2);
  assert.ok(mk.locked);
  const [lx, ly] = [mk.x, mk.y];
  for (let i = 0; i < 200 && !s.hazards.some(h => h.kind === 'burst'); i++) step(s, {});
  const b = s.hazards.find(h => h.kind === 'burst');
  assert.deepEqual([b.x, b.y], [lx, ly]);
  assert.equal(e.y, ly, 'EraseMan lines up in the marked row');
  assert.deepEqual([lx, ly], [1, 2], 'marker caught up with MegaMan');
  run(s, 1);
  assert.equal(s.player.hp, 400, 'base beam damage 100');
});

test('ChargeMan names and HP from the ROM tables (name abbreviated to 8 letters)', () => {
  const vs = naviVariants('ChargeMan');
  assert.deepEqual(vs.slice(0, 3).map(v => [v.name, v.hp]), [['ChrgeMan', 1000], ['ChrgeMnEX', 1500], ['ChrgeMnSP', 2000]]);
  assert.equal(start('ChargeMan').enemies[0].sprite, 'chargeman');
});

function chargeCycle(seed = 1) {
  const s = start('ChargeMan', 0, seed), e = s.enemies[0];
  s.player.invuln = 1e9;
  const seen = []; let prev = null;
  for (let i = 0; i < 9000 && seen.length < 9; i++) {
    step(s, {});
    const kind = e.state === 'run' ? (e.cars.length === 3 ? 'A' : e.cars.length === 2 ? 'C' : 'B') : null;
    if (kind && kind !== prev) seen.push(kind);
    if (e.state === 'idle') prev = null; else if (kind) prev = kind;
  }
  return { s, e, seen };
}

test('ChargeMan attack cycle from the ROM: 5 alternating B/C, then the big charge A; the toggle carries on', () => {
  const { seen } = chargeCycle();
  assert.deepEqual(seen.slice(0, 8), ['B', 'C', 'B', 'C', 'B', 'A', 'C', 'B']);
});

test('ChargeMan dash runs the length of MegaMan\'s row from off-screen and hits for 50', () => {
  const s = start('ChargeMan'), e = s.enemies[0];
  s.player.x = 0; s.player.y = 2;
  let minX = 9;
  for (let i = 0; i < 400 && s.player.hp === 100; i++) { step(s, {}); if (e.state === 'run') minX = Math.min(minX, e.fx); }
  assert.equal(e.y, 2);
  assert.equal(s.player.hp, 50);
  assert.ok(minX <= 0.5, 'reached MegaMan at the back column');
});

test('ChargeMan cannot be hit while off the field and returns to his start panel', () => {
  const s = start('ChargeMan'), e = s.enemies[0];
  const home = [e.x, e.y]; s.player.invuln = 1e9;
  let offField = false;
  for (let i = 0; i < 3000; i++) {
    step(s, {});
    if (e.x > 5 || e.x < 0) { offField = true; assert.ok(e.airborne); }
    if (offField && e.state === 'idle') break;
  }
  assert.deepEqual([e.x, e.y], home);
  assert.ok(!e.airborne);
});

test('ChargeMan train round: cars in the two other rows hit for 30', () => {
  const s = start('ChargeMan'), e = s.enemies[0];
  s.player.invuln = 1e9;
  for (let i = 0; i < 3000 && !(e.state === 'run' && e.cars.length === 2); i++) step(s, {});
  const rows = [e.y, ...e.cars.map(c => c.y)].sort();
  assert.deepEqual(rows, [0, 1, 2]);
  const car = e.cars[0];
  s.player.invuln = 0; s.player.y = car.y; s.player.x = 1;
  for (let i = 0; i < 300 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 70);
});

test('SpoutMan names and HP from the ROM tables', () => {
  const vs = naviVariants('SpoutMan');
  assert.equal(vs[0].name.slice(0, 5), 'Spout');
  const s = start('SpoutMan');
  assert.equal(s.enemies[0].sprite, 'spoutman');
  assert.equal(s.enemies[0].element, vs[0].element);
});

test('SpoutMan water bomb lands on the panel MegaMan stood on', () => {
  const { s, e } = findState('SpoutMan', 0, 'bomb', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  const [aim, hold] = NAVI_AI.SpoutMan.bombAim.value;
  assert.ok([2, 3].includes(e.x - s.player.x), 'stands 2 or 3 panels ahead of MegaMan');
  run(s, aim + hold - e.stateT);
  const lob = s.hazards.find(h => h.kind === 'lob');
  assert.deepEqual([lob.tx, lob.y], [s.player.x, s.player.y]);
  run(s, NAVI_AI.SpoutMan.bombFlight.value + 1);
  assert.equal(s.player.hp, 80);
});

test('SpoutMan hose: row highlights for 36 frames, then the stream hits MegaMan in that row', () => {
  const { s, e } = findState('SpoutMan', 0, 'hose', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = 1; s.player.y = e.y;
  run(s, 2);
  assert.ok(e.highlight && e.highlight[0].length > 0);
  run(s, NAVI_AI.SpoutMan.hoseAim.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 2);
  assert.equal(s.player.hp, 60, 'base hose damage 40');
});

test('SpoutMan hose repeats 2 times at base version, then sprinkler next turn', () => {
  const { s, e } = findState('SpoutMan', 0, 'hose', s => { s.player.invuln = 1e9; });
  let streams = 0, sawJump = false;
  for (let i = 0; i < 4000 && !sawJump; i++) { const n = s.hazards.filter(h => h.kind === 'stream').length; step(s, {}); if (s.hazards.filter(h => h.kind === 'stream').length > n) streams++; if (e.state === 'jump') sawJump = true; }
  assert.equal(streams, NAVI_AI.SpoutMan.hoseCount.value[0]);
  assert.ok(sawJump);
});

test('SpoutMan sprinkler: jumps into MegaMan\'s area and sprays the panels around him', () => {
  const { s, e } = findState('SpoutMan', 0, 'spin', s => { s.player.invuln = 1e9; s.player.x = 2; s.player.y = 2; });
  assert.ok(e.x < 3, 'stands in MegaMan\'s area');
  s.player.invuln = 0; s.player.x = e.x + 1; s.player.y = e.y;
  for (let i = 0; i < 80 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 80);
});

test('TomahawkMan names and HP from the ROM tables', () => {
  const vs = naviVariants('TomahawkMan');
  assert.equal(vs[0].name, 'TmhkMan', 'ROM abbreviation');
  assert.equal(start('TomahawkMan').enemies[0].sprite, 'tomahawkman');
});

test('TomahawkMan throws the axe onto MegaMan\'s column when MegaMan is at the back', () => {
  const { s, e } = findState('TomahawkMan', 0, 'throw', s => { s.player.invuln = 1e9; s.player.x = 0; });
  s.player.invuln = 0;
  run(s, 2);
  assert.deepEqual(e.highlight[0].map(c => c[0]), [0, 0, 0]);
  s.player.y = (s.player.y + 1) % 3; // anywhere in the column
  run(s, NAVI_AI.TomahawkMan.throwMark.value + NAVI_AI.TomahawkMan.throwFlight.value);
  assert.equal(s.player.hp, 60);
});

test('TomahawkMan swings in front when MegaMan is close: 2 columns x 3 rows', () => {
  const { s, e } = findState('TomahawkMan', 0, 'swing', s => { s.player.invuln = 1e9; s.player.x = 2; });
  assert.equal(e.x, 3);
  s.player.invuln = 0; s.player.x = 1; s.player.y = Math.min(2, e.y + 1);
  const P = NAVI_AI.TomahawkMan;
  run(s, P.swingWindup.value + P.swingHit.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 60);
});

test('TomahawkMan row chop: wave reaches each panel 5 frames after the last', () => {
  const { s, e } = findState('TomahawkMan', 0, 'chop', s => { s.player.invuln = 1e9; });
  const P = NAVI_AI.TomahawkMan;
  run(s, P.chopRaise.value + P.chopHit.value - e.stateT);
  const waves = s.hazards.filter(h => h.kind === 'axewave').sort((a, b) => b.x - a.x);
  assert.equal(waves.length, e.x);
  for (let i = 1; i < waves.length; i++) assert.equal(waves[i].start - waves[i - 1].start, P.chopStep.value);
  s.player.invuln = 0; s.player.x = 0; s.player.y = e.y;
  run(s, P.chopStep.value * (e.x - 1) + 2);
  assert.equal(s.player.hp, 20, 'base chop damage 80');
});

test('TomahawkMan moves only twice between attacks below half HP', () => {
  const s = start('TomahawkMan'), e = s.enemies[0];
  s.player.invuln = 1e9; e.hp = Math.floor(e.maxHp / 2) - 1;
  let moves = 0;
  for (let i = 0; i < 3000 && !['throw', 'swing', 'chop'].includes(e.state); i++) { const was = e.state; step(s, {}); if (was === 'idle' && e.state === 'vanish' && !e.after) moves++; }
  assert.equal(moves, 2);
});

test('TenguMan names and HP from the ROM tables', () => {
  const vs = naviVariants('TenguMan');
  assert.equal(vs[0].name, 'TenguMan');
  assert.equal(start('TenguMan').enemies[0].sprite, 'tenguman');
});

test('TenguMan nose spear: 3 panels ahead lit during the brace, then hit for 30', () => {
  const { s, e } = findState('TenguMan', 0, 'nose', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = e.x - 3; s.player.y = e.y;
  run(s, 2);
  assert.equal(e.highlight[0].length, 3);
  const P = NAVI_AI.TenguMan;
  run(s, P.noseBrace.value[0] + P.noseHit.value - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 70);
});

test('TenguMan tornadoes: three in MegaMan\'s area from a ROM pattern', () => {
  const { s, e } = findState('TenguMan', 0, 'fan', s => { s.player.invuln = 1e9; });
  run(s, NAVI_AI.TenguMan.tornadoWindup.value[0] - e.stateT + 1);
  const t = s.hazards.filter(h => h.kind === 'tornado');
  assert.equal(t.length, 3);
  assert.ok(t.every(h => h.x <= 2), 'all in MegaMan\'s area');
  assert.ok(e.pattern < 4, 'base version uses patterns 0-3');
});

test('TenguMan dash: path lights up, then he flies down MegaMan\'s row for 60', () => {
  const { s, e } = findState('TenguMan', 0, 'dashmark', s => { s.player.invuln = 1e9; });
  assert.equal(e.highlight[0].length, 6);
  assert.equal(e.y, s.player.y);
  s.player.invuln = 0;
  for (let i = 0; i < 80 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 40);
});

test('TenguMan cannot be hit while flying off the field and comes back to his panel', () => {
  const { s, e } = findState('TenguMan', 0, 'dashvanish', s => { s.player.invuln = 1e9; });
  const home = [e.homeX, e.homeY];
  run(s, 4);
  assert.ok(e.airborne);
  for (let i = 0; i < 200 && e.state !== 'idle'; i++) step(s, {});
  assert.deepEqual([e.x, e.y], home);
  assert.ok(!e.airborne);
});

test('GroundMan names and HP from the ROM tables', () => {
  const vs = naviVariants('GroundMan');
  assert.ok(vs[0].name.startsWith('Ground') || vs[0].name.startsWith('Grnd'), vs[0].name);
  assert.equal(start('GroundMan').enemies[0].sprite, 'groundman');
});

test('GroundMan attack order from the ROM: pop-up, pop-up, missiles, pop-up, pop-up, tank', () => {
  const s = start('GroundMan'), e = s.enemies[0];
  s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 20000 && seen.length < 6; i++) {
    const was = e.state; step(s, {});
    if (was !== e.state && ['burrow', 'missiles', 'tank'].includes(e.state)) seen.push(e.state);
  }
  assert.deepEqual(seen, ['burrow', 'burrow', 'missiles', 'burrow', 'burrow', 'tank']);
});

test('GroundMan drill pop-up: MegaMan\'s panel lights up, then drills burst out of it for 60', () => {
  const { s, e } = findState('GroundMan', 0, 'burrow', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  run(s, NAVI_AI.GroundMan.warpTicks.value[0]);
  assert.deepEqual(e.highlight[0][0], [s.player.x, s.player.y]);
  assert.ok(e.hidden && e.airborne);
  run(s, NAVI_AI.GroundMan.popMark.value[0] + 1);
  assert.equal(s.player.hp, 40);
  assert.deepEqual([e.x, e.y], [s.player.x, s.player.y]);
});

test('GroundMan drill missiles: he and two clones from a ROM pattern fly down three rows', () => {
  const { s, e } = findState('GroundMan', 0, 'missiles', s => { s.player.invuln = 1e9; });
  assert.equal(e.clones.length, 2);
  const rows = [e.y, ...e.clones.map(c => c.y)];
  assert.equal(new Set(rows).size, 3);
  s.player.invuln = 0; s.player.x = 1; s.player.y = e.clones[0].y;
  for (let i = 0; i < 120 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 10, 'base missile damage 90');
});

test('GroundMan drill tank drives down the row, then rocks fall with the first on MegaMan', () => {
  const { s, e } = findState('GroundMan', 0, 'rocks', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.hp = s.player.maxHp = 500;
  run(s, 2);
  const rocks = s.hazards.filter(h => h.kind === 'rock');
  assert.equal(rocks.length, NAVI_AI.GroundMan.rockCount.value[0]);
  assert.ok(rocks.some(r => r.x === s.player.x && r.y === s.player.y));
  run(s, NAVI_AI.GroundMan.rockFall.value);
  assert.equal(s.player.hp, 440, 'base rock damage 60');
});

test('DustMan names and HP from the ROM tables', () => {
  const vs = naviVariants('DustMan');
  assert.equal(vs[0].name, 'DustMan');
  assert.equal(start('DustMan').enemies[0].sprite, 'dustman');
});

test('DustMan junk throw: MegaMan\'s panel lights up, junk lands there for 50', () => {
  const { s, e } = findState('DustMan', 0, 'junk', s => { s.player.invuln = 1e9; });
  const P = NAVI_AI.DustMan;
  run(s, P.junkWindup.value - e.stateT);
  assert.deepEqual(e.highlight[0][0], [s.player.x, s.player.y]);
  s.player.invuln = 0;
  run(s, P.junkMark.value[0] + P.junkFlight.value);
  assert.equal(s.player.hp, 50);
});

test('DustMan vacuum pulls MegaMan to the front of his row, then hits for 100', () => {
  const { s, e } = findState('DustMan', 0, 'vacuum', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.hp = s.player.maxHp = 500; s.player.x = 0; s.player.y = e.y;
  const P = NAVI_AI.DustMan;
  run(s, P.vacuumOpen.value + P.vacuumPull.value - e.stateT);
  assert.equal(s.player.x, 2, 'pulled to the front column');
  run(s, P.vacuumHit.value + 1);
  assert.equal(s.player.hp, 400);
});

test('DustMan scrap shots: three shots down his row', () => {
  const { s, e } = findState('DustMan', 0, 'shots', s => { s.player.invuln = 1e9; });
  const P = NAVI_AI.DustMan;
  let shots = 0;
  for (let i = 0; i < P.shotLead.value + P.shotGap.value * 3; i++) { const n = s.hazards.filter(h => h.kind === 'scrap').length; step(s, {}); if (s.hazards.filter(h => h.kind === 'scrap').length > n) shots++; }
  assert.equal(shots, 3);
  assert.ok(s.hazards.filter(h => h.kind === 'scrap').every(h => h.y === e.y));
});

test('DustMan uses the vacuum after 7 other attacks', () => {
  const s = start('DustMan'), e = s.enemies[0];
  s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 30000 && !seen.includes('vacuum'); i++) { const was = e.state; step(s, {}); if (was !== e.state && ['junk', 'shots', 'vacuum'].includes(e.state)) seen.push(e.state); }
  assert.equal(seen.length, 8);
  assert.equal(seen[7], 'vacuum');
});

test('BlastMan names and HP from the ROM tables', () => {
  const vs = naviVariants('BlastMan');
  assert.equal(vs[0].name, 'BlastMan');
  assert.equal(start('BlastMan').enemies[0].sprite, 'blastman');
});

test('BlastMan fire punch leaves a blast on the panel in front of him', () => {
  const { s, e } = findState('BlastMan', 1, 'punch', s => { s.player.invuln = 1e9; });
  const P = NAVI_AI.BlastMan;
  s.player.invuln = 0; s.player.x = e.x - 1 >= 0 && e.x - 1 <= 2 ? e.x - 1 : 2; s.player.y = e.y;
  run(s, P.punchWindup.value + P.punchHit.value - e.stateT + 1);
  const b = s.hazards.find(h => h.kind === 'blast');
  assert.deepEqual([b.x, b.y], [e.x - 1, e.y]);
  if (e.x === 3) assert.equal(s.player.hp, 50, 'EX punch damage 50');
});

test('BlastMan fireball: lights 3 panels ahead at base version, then the fireball crosses them', () => {
  const { s, e } = findState('BlastMan', 0, 'fireball', s => { s.player.invuln = 1e9; });
  run(s, 11 - e.stateT);
  assert.equal(e.highlight[0].length, Math.min(3, e.x));
  s.player.invuln = 0; s.player.x = e.x - 2 >= 0 ? e.x - 2 : 0; s.player.y = e.y;
  for (let i = 0; i < 80 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 90, 'base fireball damage 10');
});

test('BlastMan fire storm: 2-second charge, base version sweeps all 3 rows from the right', () => {
  const { s, e } = findState('BlastMan', 0, 'storm', s => { s.player.invuln = 1e9; });
  assert.equal(e.pattern, 0);
  run(s, NAVI_AI.BlastMan.stormCharge.value + 10 - e.stateT);
  const f = s.hazards.filter(h => h.kind === 'fireball');
  assert.equal(f.length, 3);
  assert.deepEqual(f.map(h => h.y).sort(), [0, 1, 2]);
  s.player.invuln = 0;
  for (let i = 0; i < 80 && s.player.hp === 100; i++) step(s, {});
  assert.equal(s.player.hp, 80, 'base storm damage 20');
});

test('BlastMan EX storm can sweep the columns from the top or bottom', () => {
  let vertical = false;
  for (let seed = 1; seed < 60 && !vertical; seed++) {
    const s = start('BlastMan', 1, seed), e = s.enemies[0];
    s.player.invuln = 1e9;
    for (let i = 0; i < 6000 && e.state !== 'storm'; i++) step(s, {});
    if (e.pattern >= 2) vertical = true;
  }
  assert.ok(vertical);
});

test('DiveMan names and HP from the ROM tables', () => {
  const vs = naviVariants('DiveMan');
  assert.equal(vs[0].name, 'DiveMan');
  assert.equal(start('DiveMan').enemies[0].sprite, 'diveman');
});

test('DiveMan swims without returning to the panel he just left', () => {
  const s = start('DiveMan'), e = s.enemies[0];
  s.player.invuln = 1e9;
  let last = null, prev = [e.x, e.y], ok = true, swims = 0;
  for (let i = 0; i < 4000 && swims < 12; i++) {
    const was = e.state; step(s, {});
    if (was === 'dive' && e.state === 'swim') { if (last && e.x === last[0] && e.y === last[1]) ok = false; last = prev; prev = [e.x, e.y]; swims++; }
  }
  assert.ok(swims >= 4 && ok);
});

test('DiveMan torpedoes: two, each landing on the panel MegaMan stood on', () => {
  const { s, e } = findState('DiveMan', 0, 'torpedo', s => { s.player.invuln = 1e9; });
  let torps = 0;
  for (let i = 0; i < 100; i++) { const n = s.hazards.filter(h => h.kind === 'torpedo').length; step(s, {}); if (s.hazards.filter(h => h.kind === 'torpedo').length > n) torps++; }
  assert.equal(torps, 2);
});

test('DiveMan big wave rolls down all three rows of MegaMan\'s area', () => {
  const { s, e } = findState('DiveMan', 0, 'slam', s => { s.player.invuln = 1e9; });
  run(s, NAVI_AI.DiveMan.waveHit.value - e.stateT + 1);
  const w = s.hazards.filter(h => h.kind === 'wave' && h.big);
  assert.deepEqual(w.map(h => h.y).sort(), [0, 1, 2]);
  s.player.invuln = 0; s.player.hp = s.player.maxHp = 500;
  for (let i = 0; i < 40 && s.player.hp === 500; i++) step(s, {});
  assert.equal(s.player.hp, 470, 'base wave damage 30');
});

test('CircusMan names and HP from the ROM tables', () => {
  const vs = naviVariants('CircusMan');
  assert.equal(vs[0].name, 'CrcusMan', 'ROM abbreviation');
  assert.equal(start('CircusMan').enemies[0].sprite, 'circusman');
});

test('CircusMan clap: MegaMan\'s column lights up, then the hands clap on it', () => {
  const { s, e } = findState('CircusMan', 0, 'clap', s => { s.player.invuln = 1e9; });
  run(s, 1);
  assert.deepEqual(e.highlight[0].map(c => c[0]), [s.player.x, s.player.x, s.player.x]);
  s.player.invuln = 0; s.player.y = (s.player.y + 1) % 3;
  run(s, NAVI_AI.CircusMan.clapMark.value[0] + NAVI_AI.CircusMan.clapHit.value + 1);
  assert.equal(s.player.hp, 80);
});

test('CircusMan lions: 3 lions run down MegaMan\'s row through the hoop', () => {
  const { s, e } = findState('CircusMan', 0, 'lions', s => { s.player.invuln = 1e9; });
  const lions = new Set();
  for (let i = 0; i < 200; i++) { step(s, {}); for (const h of s.hazards) if (h.kind === 'lion') lions.add(h); }
  assert.equal(lions.size, 3);
  assert.ok([...lions].every(h => h.y === [...lions][0].y));
});

test('CircusMan tent traps MegaMan; mashing gets him out sooner', () => {
  const trapFor = mash => {
    const { s, e } = findState('CircusMan', 0, 'tentmark', s => { s.player.invuln = 1e9; });
    s.player.invuln = 0;
    for (let i = 0; i < 60 && !(s.player.trapped > 0); i++) step(s, {});
    assert.ok(s.player.trapped > 0, 'trapped');
    let t = 0;
    while (s.player.trapped > 0 && t < 400) { step(s, mash ? { a: t % 2 === 0 } : {}); t++; }
    return { t, s };
  };
  const still = trapFor(false), mashed = trapFor(true);
  assert.ok(still.t >= NAVI_AI.CircusMan.tentHold.value[0] - 2);
  assert.ok(mashed.t < still.t / 2);
  assert.ok(still.s.player.hp < 100, 'took tent damage');
});

test('CircusMan tent does not catch an invincible MegaMan', () => {
  const { s, e } = findState('CircusMan', 0, 'tentmark', s => { s.player.invuln = 1e9; });
  for (let i = 0; i < 60; i++) step(s, {});
  assert.ok(!(s.player.trapped > 0));
});

test('JudgeMan names and HP from the ROM tables', () => {
  const vs = naviVariants('JudgeMan');
  assert.equal(vs[0].name, 'JudgeMan');
  assert.equal(start('JudgeMan').enemies[0].sprite, 'judgeman');
});

test('JudgeMan whip: 3 panels ahead lit, then the whip hits for 30', () => {
  const { s, e } = findState('JudgeMan', 0, 'whip', s => { s.player.invuln = 1e9; });
  run(s, 1);
  assert.ok(e.highlight[0].length >= 1);
  const P = NAVI_AI.JudgeMan, hit = P.whipMark.value[0] + P.whipWind.value[0] - 16;
  s.player.invuln = 0; s.player.y = e.y; s.player.x = Math.max(0, e.x - 3);
  run(s, hit - e.stateT - 1);
  assert.equal(s.player.hp, 100);
  run(s, 1);
  assert.equal(s.player.hp, 70);
});

test('JudgeMan book press hits MegaMan\'s front column', () => {
  const { s, e } = findState('JudgeMan', 0, 'press', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.x = 2; s.player.y = 0;
  run(s, NAVI_AI.JudgeMan.pressMark.value[0] + 1);
  assert.equal(s.player.hp, 70);
});

test('JudgeMan summons a law book (ROM HP) at the front of MegaMan\'s row; it does not block the win', () => {
  const { s, e } = findState('JudgeMan', 0, 'book', s => { s.player.invuln = 1e9; });
  run(s, NAVI_AI.JudgeMan.bookMark.value[0] + 1);
  const book = s.enemies.find(o => o.family === 'LawBook');
  assert.ok(book);
  assert.equal(book.hp, 8);
  assert.deepEqual([book.x, book.y], [3, s.player.y]);
  e.hp = 0; step(s, {});
  assert.equal(s.phase, 'win');
});

test('ElementMan names and HP from the ROM tables', () => {
  const vs = naviVariants('ElementMan');
  assert.equal(vs[0].name, 'ElmntMan', 'ROM abbreviation');
  assert.equal(start('ElementMan').enemies[0].sprite, 'elementman');
});

test('ElementMan cycle: towers, then an element change after 3 attacks; the new element changes his weakness', () => {
  const s = start('ElementMan'), e = s.enemies[0];
  s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 20000 && seen.length < 8; i++) { const was = e.state; step(s, {}); if (was !== e.state && ['tower', 'change', 'fire', 'aqua', 'elec', 'wood'].includes(e.state)) seen.push(e.state); }
  assert.deepEqual(seen.slice(0, 4), ['tower', 'tower', 'tower', 'change']);
  assert.ok(['fire', 'aqua', 'elec', 'wood'].includes(e.element));
  assert.ok(seen.slice(4).some(k => k === e.element || ['fire', 'aqua', 'elec', 'wood'].includes(k)), 'uses an element attack after changing');
});

test('ElementMan tower strikes the panel MegaMan stood on', () => {
  const { s, e } = findState('ElementMan', 0, 'tower', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0;
  run(s, NAVI_AI.ElementMan.towerMark.value + 1);
  assert.equal(s.player.hp, 40, 'base tower damage 60');
});

test('ElementMan fire: five bursts on MegaMan\'s panel', () => {
  const { s, e } = findState('ElementMan', 0, 'fire', s => { s.player.invuln = 1e9; });
  const strikes = new Set();
  for (let i = 0; i < 200 && e.state === 'fire'; i++) { step(s, {}); for (const h of s.hazards) if (h.kind === 'estrike') strikes.add(h); }
  assert.equal(strikes.size, 5);
});

test('Colonel names and HP from the ROM tables', () => {
  const vs = naviVariants('Colonel');
  assert.deepEqual(vs.slice(0, 3).map(v => [v.name, v.hp]), [['Colonel', 1200], ['ColonelEX', 1600], ['ColonelSP', 2000]]);
  assert.equal(start('Colonel').enemies[0].sprite, 'colonel');
});

test('Colonel Screen Divide: MegaMan in the top-left corner gets the diagonal cut', () => {
  const s = start('Colonel'), e = s.enemies[0];
  s.player.x = 0; s.player.y = 0; s.player.invuln = 1e9;
  for (let i = 0; i < 2000 && e.state !== 'divide'; i++) step(s, {});
  assert.equal(e.state, 'divide');
  assert.equal(e.cut, 1);
  run(s, 1);
  assert.deepEqual(e.highlight[0], [[0, 0], [1, 1], [2, 2]]);
  s.player.invuln = 0;
  run(s, NAVI_AI.Colonel.divideMark.value[0]);
  assert.equal(s.player.hp, 20, 'base cut damage 80');
});

test('Colonel EX follows a cut with a second (cross) cut', () => {
  const s = start('Colonel', 1), e = s.enemies[0];
  s.player.x = 1; s.player.y = 1; s.player.invuln = 1e9;
  for (let i = 0; i < 2000 && e.state !== 'divide'; i++) step(s, {});
  for (let i = 0; i < 200 && e.cut !== 4; i++) step(s, {});
  assert.equal(e.cut, 4);
});

test('Colonel cannon: missiles land on MegaMan\'s panel', () => {
  const { s, e } = findState('Colonel', 0, 'cannon', s => { s.player.invuln = 1e9; s.player.x = 0; s.player.y = 1; });
  const m = new Set();
  for (let i = 0; i < 150 && e.state === 'cannon'; i++) { step(s, {}); for (const h of s.hazards) if (h.kind === 'cmissile') m.add(h); }
  assert.equal(m.size, NAVI_AI.Colonel.cannonCount.value[0]);
});

test('Colonel finisher unlocks when MegaMan\'s HP is at or below its damage', () => {
  const s = start('Colonel'), e = s.enemies[0];
  s.player.hp = 150; s.player.invuln = 1e9; s.player.x = 0; s.player.y = 1;
  for (let i = 0; i < 4000 && e.state !== 'finisher'; i++) step(s, {});
  assert.equal(e.state, 'finisher');
});

test('Bass names and HP from the ROM tables', () => {
  const vs = naviVariants('Bass');
  assert.deepEqual([vs[0].name, vs[0].hp], ['Bass', 1800]);
  assert.equal(start('Bass').enemies[0].sprite, 'bass');
});

test('Bass alternates basic attacks with one chosen by where MegaMan stands', () => {
  const s = start('Bass'), e = s.enemies[0];
  s.player.invuln = 1e9; s.player.x = 0;
  const seen = [];
  for (let i = 0; i < 8000 && seen.length < 4; i++) { const was = e.state; step(s, {}); if (was !== e.state && ['roll', 'rapid', 'breaker', 'blade'].includes(e.state)) seen.push(e.state); }
  assert.deepEqual(seen, ['roll', 'breaker', 'rapid', 'breaker']);
});

test('Bass Dark Arm Blade when MegaMan is near the front', () => {
  const s = start('Bass'), e = s.enemies[0];
  s.player.invuln = 1e9; s.player.x = 2;
  for (let i = 0; i < 8000 && e.state !== 'blade'; i++) step(s, {});
  assert.equal(e.state, 'blade');
  assert.equal(e.x, 3);
});

test('Bass Shooting Buster: the first shot targets MegaMan\'s panel, 8 shots at base', () => {
  const { s, e } = findState('Bass', 0, 'rapid', s => { s.player.invuln = 1e9; });
  const shots = new Set();
  for (let i = 0; i < 120 && e.state === 'rapid'; i++) { step(s, {}); for (const h of s.hazards) if (h.kind === 'estrike') shots.add(h); }
  assert.equal(shots.size, 8);
});

test('Gregar: HP from the spawn hook, fills the enemy area and is hit from any row', () => {
  assert.deepEqual(naviVariants('Gregar').slice(0, 4).map(v => [v.name, v.hp]), [['Gregar', 2500], ['GregarEX', 3000], ['GregarSP', 4000], ['GregarRV', 5000]]);
  const s = start('Gregar'), e = s.enemies[0];
  assert.equal(e.sprite, 'gregar');
  assert.equal(e.cells.length, 9);
  for (const y of [0, 2]) { s.player.y = y; const hp = e.hp; step(s, { a: true }); run(s, 12); assert.ok(e.hp < hp, 'buster from row ' + y); }
});

test('Gregar leaps twice, then claw attacks', () => {
  const s = start('Gregar'), e = s.enemies[0]; s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 3000 && seen.length < 3; i++) { const was = e.state; step(s, {}); if (e.state !== was && e.state !== 'idle') seen.push(e.state); }
  assert.deepEqual(seen.slice(0, 2), ['leap', 'leap']);
  assert.ok(['swipe', 'bite'].includes(seen[2]));
});

test('Gregar landing sends a shock down MegaMan\'s row', () => {
  const s = start('Gregar'), e = s.enemies[0];
  s.player.x = 0; s.player.y = 1;
  for (let i = 0; i < 400 && !s.hazards.some(h => h.kind === 'shock'); i++) step(s, {});
  assert.equal(e.state, 'leap');
  const before = s.player.hp;
  run(s, 20);
  assert.equal(before - s.player.hp, NAVI_AI.Gregar.jumpDamage.value[0]);
});

test('Gregar below half HP alternates Beast Breath and Giga Rush', () => {
  const s = start('Gregar'), e = s.enemies[0]; s.player.invuln = 1e9;
  e.hp = 1000; e.mem.c5 = 5; e.mem.c4 = 2; e.think = 1;
  step(s, {}); assert.equal(e.state, 'breath');
  e.mem.c5 = 5; e.mem.c4 = 2; e.state = 'idle'; e.think = 1;
  step(s, {}); assert.equal(e.state, 'rush');
  s.player.invuln = 0; s.player.hp = 1000;
  run(s, NAVI_AI.Gregar.rushMark.value[0] + 2);
  assert.equal(1000 - s.player.hp, NAVI_AI.Gregar.rushDamage.value[0]);
});

test('Falzar: HP from the spawn hook, fills the enemy area', () => {
  assert.deepEqual(naviVariants('Falzar').slice(0, 4).map(v => [v.name, v.hp]), [['Falzar', 2000], ['FalzarEX', 2800], ['FalzarSP', 3200], ['FalzarRV', 4000]]);
  const s = start('Falzar'), e = s.enemies[0];
  assert.equal(e.sprite, 'falzar');
  assert.equal(e.cells.length, 9);
});

test('Falzar moves twice, then Feather Shot or Gust; every third round Feather Rain', () => {
  const s = start('Falzar'), e = s.enemies[0]; s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 20000 && seen.length < 9; i++) { const was = e.state; step(s, {}); if (e.state !== was && e.state !== 'idle') seen.push(e.state); }
  assert.deepEqual(seen.slice(0, 2), ['move', 'move']);
  assert.ok(['shot', 'gust'].includes(seen[2]));
  assert.deepEqual(seen.slice(3, 5), ['move', 'move']);
  assert.ok(['shot', 'gust'].includes(seen[5]));
  assert.deepEqual(seen.slice(6, 9), ['move', 'move', 'rain']);
});

test('Falzar Feather Rain: the first feather lands on MegaMan for rain damage', () => {
  const { s } = findState('Falzar', 0, 'rain', s => { s.player.invuln = 1e9; });
  s.player.invuln = 0; s.player.hp = 1000;
  run(s, 10 + NAVI_AI.Falzar.rainMark.value[0] + 1);
  assert.equal(1000 - s.player.hp, NAVI_AI.Falzar.rainDamage.value[0]);
});

test('Falzar below half HP alternates Feather Storm and Drill Dive', () => {
  const s = start('Falzar'), e = s.enemies[0]; s.player.invuln = 1e9;
  e.hp = 900; Object.assign(e.mem, { c4: 2, c5: 2, c6: 2 }); e.think = 1;
  step(s, {}); assert.equal(e.state, 'storm');
  Object.assign(e.mem, { c4: 2, c5: 2, c6: 2 }); e.state = 'idle'; e.think = 1;
  step(s, {}); assert.equal(e.state, 'dive');
  s.player.invuln = 0; s.player.hp = 1000;
  run(s, NAVI_AI.Falzar.diveMark.value[0] + 8);
  assert.equal(1000 - s.player.hp, NAVI_AI.Falzar.diveDamage.value[0]);
});
