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
