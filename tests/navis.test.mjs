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

test('ElecMan ThunderBolt marks MegaMan\'s panel and strikes it after 30 frames', () => {
  for (let seed = 1; seed < 60; seed++) {
    const s = start('ElecMan', 0, seed);
    const e = s.enemies[0];
    let marked = null;
    for (let i = 0; i < 2000 && !marked; i++) { step(s, {}); if (e.state === 'thunderbolt') marked = { ...e.target }; }
    if (!marked) continue;
    const hp = s.player.hp;
    run(s, NAVI_AI.ElecMan.thunderboltDelay.value);
    assert.equal(s.player.hp, hp - 40);
    return;
  }
  assert.fail('ElecMan never used ThunderBolt');
});

test('ElecMan ThunderBolt can be dodged by leaving the marked panel', () => {
  for (let seed = 1; seed < 60; seed++) {
    const s = start('ElecMan', 0, seed);
    const e = s.enemies[0];
    for (let i = 0; i < 2000 && e.state !== 'thunderbolt'; i++) step(s, {});
    if (e.state !== 'thunderbolt' || e.stateT > 2) continue;
    run(s, 2, { dir: s.player.y === 0 ? 'down' : 'up' });
    run(s, 40);
    assert.equal(s.player.hp, 100);
    return;
  }
  assert.fail('no ThunderBolt observed');
});

test('ElecMan stays in his own area and is hit by the buster', () => {
  const s = start('ElecMan');
  for (let i = 0; i < 3000; i++) {
    step(s, { a: i % 20 < 2 });
    const e = s.enemies[0];
    assert.ok(e.x >= 3 && e.x <= 5);
  }
  assert.ok(s.enemies[0].hp < 900);
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
