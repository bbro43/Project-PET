import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step, pick, confirmCustom, canPick, survivalWave, formation, elementMultiplier } from '../src/battle/engine.mjs';
import BN6 from '../data/bn6-viruses.mjs';
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
  const s = start({ seed: 5 });
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
  const s = start({ seed: 6, enemies: formation('Mettaur', 0, 3) });
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
  assert.equal(survivalWave(1).length, 1);
  assert.equal(survivalWave(5).length, 3);
  assert.ok(survivalWave(10).every(([, v]) => v === 3), 'reaches Ω variants');
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
    const s = start({ seed: 42, enemies: [['Mettaur', 1], ['Champy', 0], ['Gunner', 2]] });
    for (let i = 0; i < 3000; i++) { step(s, script(i)); if (s.phase === 'custom') confirmCustom(s); }
    return JSON.stringify({ p: s.player, e: s.enemies, t: s.tick, h: s.hazards });
  };
  assert.equal(play(), play());
});

test('virus stats come from the ROM tables', () => {
  assert.deepEqual(BN6.families.Mettaur.variants.map(v => [v.hp, v.damage]), [[40, 10], [80, 20], [120, 40], [160, 60], [120, 40], [180, 80]]);
  assert.deepEqual(BN6.families.Champy.variants.slice(0, 3).map(v => v.name), ['Champy', 'Chumpy', 'Chimpy']);
  const s = start({ seed: 1, enemies: [['Mettaur', 2], ['Champy', 3], ['Gunner', 0]] });
  assert.deepEqual(s.enemies.map(e => [e.name, e.hp, e.damage, e.palette]),
    [['Mettaur3', 120, 40, 2], ['ChampySP', 220, 200, 3], ['Gunner', 60, 10, 0]]);
  assert.equal(s.enemies[1].element, 'fire');
});

test('element weakness doubles damage', () => {
  assert.equal(elementMultiplier('aqua', 'fire'), 2);
  assert.equal(elementMultiplier('fire', 'aqua'), 1);
  assert.equal(elementMultiplier('none', 'fire'), 1);
});

test('Champy warps in front of MegaMan, punches, then returns home', () => {
  const s = start({ seed: 11, enemies: formation('Champy', 0, 1) });
  const c = s.enemies[0];
  s.player.y = c.y; // Champy only acts when MegaMan is in its row
  let warped = null, hit = false;
  for (let i = 0; i < 400 && !hit; i++) {
    step(s, {});
    if (c.state === 'ready' && !warped) warped = [c.x, c.y];
    hit = s.events.some(e => e.type === 'playerHit');
  }
  assert.deepEqual(warped, [s.player.x + 1, s.player.y]);
  assert.ok(hit);
  assert.equal(s.player.hp, 100 - 20); // table 0x810CDAE
  run(s, {}, 60);
  assert.deepEqual([c.x, c.y], [c.homeX, c.homeY]);
});

test('Champy punch misses if MegaMan moves away during wind-up', () => {
  const s = start({ seed: 11, enemies: formation('Champy', 0, 1) });
  for (let i = 0; i < 400 && s.enemies[0].state !== 'ready'; i++) step(s, {});
  run(s, { dir: 'up' }, 2);
  run(s, {}, 40);
  assert.equal(s.player.hp, 100);
});

test('Gunner crosshair tracks MegaMan, locks, and fires a 3-shot burst', () => {
  const s = start({ seed: 12, enemies: formation('Gunner', 0, 1) });
  const g = s.enemies[0];
  s.player.invuln = 0;
  let shots = 0, lockedAt = null;
  for (let i = 0; i < 600 && g.state !== 'recover'; i++) {
    step(s, {});
    if (g.target?.locked && !lockedAt) lockedAt = [g.target.x, g.target.y];
    shots += s.events.filter(ev => ev.type === 'shot').length;
  }
  assert.deepEqual(lockedAt, [s.player.x, s.player.y]);
  assert.equal(shots, 3);
  assert.equal(s.player.hp, 90, 'first shot hits, invincibility absorbs the rest');
});

test('Gunner burst misses when MegaMan leaves the locked panel', () => {
  const s = start({ seed: 12, enemies: formation('Gunner', 0, 1) });
  const g = s.enemies[0];
  s.player.y = g.y;
  for (let i = 0; i < 600 && !(g.target && g.target.lockAt !== undefined); i++) step(s, {});
  assert.ok(g.target && g.target.lockAt !== undefined, 'crosshair reached MegaMan');
  run(s, { dir: s.player.y > 0 ? 'up' : 'down' }, 2);
  run(s, {}, 40);
  assert.equal(s.player.hp, 100);
});

test('different virus families attack independently', () => {
  const s = start({ seed: 13, enemies: [['Mettaur', 0], ['Gunner', 0]] });
  s.player.invuln = 1e9;
  const [m, g] = s.enemies; s.player.y = g.y;
  let mAtk = false, gFire = false;
  for (let i = 0; i < 1200 && !(mAtk && gFire); i++) { step(s, {}); mAtk ||= m.state === 'attack'; gFire ||= g.state === 'fire'; }
  assert.ok(mAtk && gFire);
});

test('Mettaur2 waits its turn hidden under its helmet (guarded); shockwave speed by version', () => {
  const s = start({ seed: 21, enemies: formation('Mettaur', 1, 2) });
  s.player.invuln = 1e9;
  let guarded = false, wave = null;
  for (let i = 0; i < 600 && !(guarded && wave); i++) { step(s, {}); guarded ||= s.enemies.some(e => e.guard); wave ||= s.hazards.find(h => h.kind === 'wave'); }
  assert.ok(guarded, 'the waiting Mettaur hides');
  assert.equal(wave.step, 16, 'Mettaur2 wave: 16 frames per panel (0x80C6B00)');
  assert.equal(wave.damage, 30, 'Mettaur2 damage 30 (0x8109F28)');
});

test('Shooter (odd version) sweeps its crosshair one panel per shot', () => {
  const s = start({ seed: 22, enemies: formation('Gunner', 1, 1) });
  s.player.invuln = 1e9;
  const g = s.enemies[0], xs = [];
  for (let i = 0; i < 600 && xs.length < 5; i++) { step(s, {}); for (const f of s.effects) if (f.kind === 'shot' && f.t === 1) xs.push(f.x); }
  assert.deepEqual(xs, [2, 1, 0, 1, 2]);
});

for (const fam of ['Piranha', 'Heady', 'Swordy', 'KillerEye', 'Quaker']) {
  test(`${fam} (every version) attacks MegaMan within 30 seconds`, () => {
    for (let v = 0; v < 6; v++) {
      const s = start({ seed: 30 + v, enemies: formation(fam, v, 1) });
      let hit = false;
      for (let i = 0; i < 1800 && !hit; i++) {
        s.player.hp = 1000; s.player.invuln = 0;
        // stand where most attacks reach: in the virus's row, at the front of MegaMan's area
        const e = s.enemies[0]; if (e && i % 60 === 0) { s.player.y = e.y; s.player.x = 2; }
        step(s, {}); hit = s.events.some(ev => ev.type === 'playerHit');
      }
      assert.ok(hit, `${fam} version ${v}`);
    }
  });
}

test('Quaker shockwave speed and damage come from its tables', () => {
  const s = start({ seed: 40, enemies: formation('Quaker', 2, 1) });
  s.player.invuln = 1e9;
  let w = null;
  for (let i = 0; i < 600 && !w; i++) { step(s, {}); w = s.hazards.find(h => h.kind === 'wave'); }
  assert.equal(w.step, 11); assert.equal(w.damage, 100);
});

for (const fam of ['Catack', 'OldStove', 'HauntedCandle']) {
  test(`${fam} (every version) attacks MegaMan within 30 seconds`, () => {
    for (let v = 0; v < 6; v++) {
      const s = start({ seed: 50 + v, enemies: formation(fam, v, 1) });
      let hit = false;
      for (let i = 0; i < 1800 && !hit; i++) {
        s.player.hp = 1000; s.player.invuln = 0;
        const e = s.enemies[0]; if (e && i % 60 === 0) { s.player.y = e.y; s.player.x = 2; }
        step(s, {}); hit = s.events.some(ev => ev.type === 'playerHit');
      }
      assert.ok(hit, `${fam} version ${v}`);
    }
  });
}

test('WindBox blows MegaMan back; VacuumFan pulls him forward', () => {
  for (const [v, x0, x1] of [[0, 2, 0], [1, 0, 2]]) {
    const s = start({ seed: 60, enemies: formation('WindBox', v, 1) });
    s.player.x = x0; s.player.y = 1;
    run(s, {}, 120);
    assert.equal(s.player.x, x1, `version ${v}`);
  }
});

test('Trumpy (base) makes its allies invincible while it plays', () => {
  const s = start({ seed: 61, enemies: [['Trumpy', 0], ['Mettaur', 0]] });
  s.player.invuln = 1e9;
  const [t, m] = s.enemies;
  for (let i = 0; i < 1200 && t.state !== 'play'; i++) step(s, {});
  assert.equal(t.state, 'play');
  run(s, {}, 5);
  const hp = m.hp; m.invuln > 0 && assert.ok(true);
  assert.ok(m.invuln > 0);
});

for (const [fam, versions] of [['Kettle', [1, 2, 3, 4, 5]], ['Puffy', [0, 1, 2, 3, 4, 5]], ['StarFish', [0, 1, 2, 3, 4, 5]], ['Dragon', [0, 1, 2, 3, 4, 5]], ['ScareCrow', [0, 1, 2, 3, 4, 5]]]) {
  test(`${fam} attacks MegaMan within 30 seconds`, () => {
    for (const v of versions) {
      const s = start({ seed: 70 + v, enemies: formation(fam, v, 1) });
      let hit = false;
      for (let i = 0; i < 1800 && !hit; i++) {
        s.player.hp = 1000; s.player.invuln = 0;
        const e = s.enemies[0]; if (e && i % 60 === 0) { s.player.y = e.y; s.player.x = 2; }
        step(s, {}); hit = s.events.some(ev => ev.type === 'playerHit');
      }
      assert.ok(hit, `${fam} version ${v}`);
    }
  });
}

test('the base Kettle never attacks; ScareCrow heals itself every 180 frames', () => {
  const s = start({ seed: 80, enemies: [['Kettle', 0], ['ScareCrow', 0]] });
  s.player.invuln = 1e9;
  const [k, c] = s.enemies;
  c.hp = 1;
  run(s, {}, 200);
  assert.equal(k.state, 'idle');
  assert.equal(c.hp, c.maxHp);
});

for (const [fam, versions] of [['PulseBulb', [0, 1, 2, 3, 4, 5]], ['BigHat', [0, 1, 2, 3, 4, 5]], ['BombCorn', [0, 1, 2, 3, 4, 5]], ['Shrubby', [0, 1, 2, 3, 4, 5]], ['HoneyBomber', [0, 1, 2, 3, 4, 5]]]) {
  test(`${fam} attacks MegaMan within 30 seconds`, () => {
    for (const v of versions) {
      const s = start({ seed: 90 + v, enemies: formation(fam, v, 1) });
      let hit = false;
      for (let i = 0; i < 1800 && !hit; i++) {
        s.player.hp = 1000; s.player.invuln = 0;
        const e = s.enemies[0]; if (e && i % 60 === 0) { s.player.y = e.y; s.player.x = 2; }
        step(s, {}); hit = s.events.some(ev => ev.type === 'playerHit');
      }
      assert.ok(hit, `${fam} version ${v}`);
    }
  });
}

test('PulseBulb is guarded while closed', () => {
  const s = start({ seed: 99, enemies: formation('PulseBulb', 0, 1) });
  run(s, {}, 2);
  assert.ok(s.enemies[0].guard);
});

for (const fam of ['FighterPlane', 'DarkMech', 'SnakeArm', 'Armadillo', 'Cragger', 'Nightmare']) {
  test(`${fam} attacks MegaMan within 30 seconds`, () => {
    for (let v = 0; v < 6; v++) {
      const s = start({ seed: 110 + v, enemies: formation(fam, v, 1) });
      let hit = false;
      for (let i = 0; i < 1800 && !hit; i++) {
        s.player.hp = 1000; s.player.invuln = 0;
        const e = s.enemies[0]; if (e && i % 60 === 0) { s.player.y = e.y; s.player.x = 2; }
        step(s, {}); hit = s.events.some(ev => ev.type === 'playerHit');
      }
      assert.ok(hit, `${fam} version ${v}`);
    }
  });
}

test('FighterPlane bombs all nine panels of MegaMan\'s area in a snake', () => {
  const s = start({ seed: 120, enemies: formation('FighterPlane', 0, 1) });
  s.player.invuln = 1e9;
  const seen = [];
  for (let i = 0; i < 3000 && seen.length < 9; i++) { step(s, {}); for (const f of s.effects) if (f.kind === 'bombblast' && f.t === 1) seen.push(`${f.x},${f.y}`); }
  assert.deepEqual(seen, ['2,0', '2,1', '2,2', '1,2', '1,1', '1,0', '0,0', '0,1', '0,2']);
});

test('FighterPlane flies through MegaMan\'s row, wraps round and comes home', () => {
  const s = start({ seed: 121, enemies: formation('FighterPlane', 0, 1) });
  const e = s.enemies[0], home = e.x;
  s.player.y = e.y; s.player.x = 1;
  let hit = false, wrapped = false;
  for (let i = 0; i < 400; i++) { step(s, {}); hit ||= s.events.some(ev => ev.type === 'playerHit'); wrapped ||= e.state === 'fly' && e.drawX > home; s.player.invuln = 0; s.player.hp = 1000; }
  assert.ok(hit && wrapped); assert.equal(e.x, home);
});

test('DarkMech elec ball paralyzes MegaMan, then a DarkMech warps beside him and slashes', () => {
  const s = start({ seed: 122, enemies: formation('DarkMech', 0, 1) });
  const e = s.enemies[0];
  let para = false, slash = false;
  for (let i = 0; i < 2400 && !slash; i++) {
    if (!(s.player.paralyzed > 0)) { s.player.y = e.y; s.player.x = 1; }
    const hp = s.player.hp; step(s, {});
    if (s.player.paralyzed > 0) { para = true; assert.ok(!(s.player.invuln > 0)); }
    if (para && hp - s.player.hp === 100) slash = true;
    if (s.player.hp < 300) s.player.hp = 1000;
  }
  assert.ok(para, 'paralyzed'); assert.ok(slash, 'slashed for 100');
});

test('SnakeArm pops up two panels ahead of MegaMan and leaps onto his panel', () => {
  const s = start({ seed: 123, enemies: formation('SnakeArm', 0, 1) });
  const e = s.enemies[0]; s.player.x = 2; s.player.y = 1;
  let popped = null, hit = false;
  for (let i = 0; i < 1800 && !hit; i++) { step(s, {}); if (e.state === 'warn' && !popped) popped = [e.x, e.y]; hit = s.events.some(ev => ev.type === 'playerHit'); }
  assert.deepEqual(popped, [4, 1]); assert.ok(hit);
  assert.equal(s.player.hp, 100 - 60);
});

test('Armadillo rolls 3 panels forward, then hops back home', () => {
  const s = start({ seed: 124, enemies: formation('Armadillo', 0, 1) });
  const e = s.enemies[0]; s.player.invuln = 1e9; s.player.y = e.y; const home = e.x;
  let far = 9;
  for (let i = 0; i < 1200; i++) { step(s, {}); if (e.state === 'roll' || e.state === 'wait') far = Math.min(far, e.fx); if (e.state === 'rest') break; }
  assert.equal(far, Math.max(0, home - 3)); assert.equal(e.x, home);
});

test('Cragger punches MegaMan\'s column (the panels above and below too)', () => {
  const s = start({ seed: 125, enemies: formation('Cragger', 0, 1) });
  s.player.x = 1; s.player.y = 1;
  let marked = null;
  for (let i = 0; i < 400; i++) {
    step(s, {});
    const e = s.enemies[0]; if (e.highlight && !marked) { marked = e.highlight[0].map(c => c.join(',')); s.player.y = 0; }
    if (s.events.some(ev => ev.type === 'playerHit')) break;
  }
  assert.deepEqual(marked, ['1,0', '1,1', '1,2']); assert.equal(s.player.hp, 50);
});

test('sprites come from imported ROMs in order Gregar, Falzar, Colonel, ProtoMan, Red Sun, Blue Moon', async () => {
  const { pickSources, SOURCE_ORDER } = await import('../src/rom/bank.mjs');
  assert.deepEqual(SOURCE_ORDER, ['bn6g', 'bn6f', 'bn5tc', 'bn5tp', 'bn4rs', 'bn4bm']);
  const reg = { sprites: {
    megaman: { sources: { bn6f: 1, bn6g: 1, bn5tp: 1, bn4bm: 1 } },
    falzar: { sources: { bn6f: 1 } },
    gregar: { sources: { bn6g: 1 } },
    bn5only: { sources: { bn5tp: 1, bn5tc: 1 } },
    bn4only: { sources: { bn4bm: 1, bn4rs: 1 } },
  } };
  assert.deepEqual(pickSources(reg, ['bn4bm', 'bn5tp', 'bn6f', 'bn6g', 'bn4rs', 'bn5tc']),
    { megaman: 'bn6g', falzar: 'bn6f', gregar: 'bn6g', bn5only: 'bn5tc', bn4only: 'bn4rs' });
  assert.deepEqual(pickSources(reg, ['bn4bm', 'bn5tp', 'bn6f']),
    { megaman: 'bn6f', falzar: 'bn6f', bn5only: 'bn5tp', bn4only: 'bn4bm' });
});

import { DEFAULT_FOLDER, CHIP_DATA, addCustom } from '../src/battle/engine.mjs';

test('default folder is the game\'s starting folder, chips carry ROM damage', () => {
  assert.equal(DEFAULT_FOLDER.length, 30);
  assert.deepEqual(DEFAULT_FOLDER.slice(0, 5), [['Cannon', 'A'], ['Cannon', 'A'], ['Cannon', 'B'], ['Cannon', 'B'], ['AirShot', '*']]);
  assert.equal(CHIP_DATA.Cannon.damage, 40); assert.equal(CHIP_DATA.Sword.damage, 80); assert.equal(CHIP_DATA.MiniBomb.damage, 50);
  assert.deepEqual(CHIP_DATA.Cannon.codes, ['A', 'B', 'C', '*']);
});

test('Atk+10 adds 10 to the attack chip picked before it', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 2, 1) });
  s.hand = [{ name: 'Cannon', code: 'A' }, { name: 'Atk+10', code: '*' }];
  pick(s, 0); pick(s, 1); confirmCustom(s);
  assert.equal(s.queue.length, 1);
  const e = s.enemies[0], hp = e.hp; s.player.y = e.y;
  step(s, { b: true });
  assert.equal(hp - e.hp, 50);
});

test('Add: no chips this turn, 10 in hand next turn', () => {
  const s = createBattle({ seed: 9 });
  addCustom(s);
  assert.equal(s.phase, 'battle'); assert.equal(s.queue.length, 0);
  s.player.invuln = 1e9; s.enemies[0].think = 1e9;
  run(s, {}, val('customGaugeTicks')); step(s, { l: true });
  assert.equal(s.phase, 'custom'); assert.equal(s.hand.length, 10);
});

test('Vulcan1: three shots, each also hitting the panel behind its target', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 2, 2) });
  s.hand = [{ name: 'Vulcan1', code: 'D' }]; pick(s, 0); confirmCustom(s);
  const [a, b] = s.enemies; a.x = 3; a.y = 1; b.x = 4; b.y = 1; a.think = b.think = 1e9; s.player.y = 1; s.player.invuln = 1e9;
  const ha = a.hp, hb = b.hp;
  step(s, { b: true }); run(s, {}, 30);
  assert.equal(ha - a.hp, 30); assert.equal(hb - b.hp, 30);
});

test('CrakShot breaks the panel in front and sends it into the first enemy in the row', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 2, 1) });
  s.hand = [{ name: 'CrakShot', code: 'A' }]; pick(s, 0); confirmCustom(s);
  const e = s.enemies[0]; e.think = 1e9; s.player.y = e.y; s.player.invuln = 1e9; const hp = e.hp;
  step(s, { b: true }); run(s, {}, 40);
  assert.equal(s.panels[e.y][2].type, 'broken'); assert.equal(hp - e.hp, 60);
});

test('BusterUp raises the buster by 1; chips without an effect yet do nothing', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 2, 1) });
  s.hand = [{ name: 'BusterUp', code: '*' }, { name: 'Guardian', code: '*' }]; pick(s, 0); pick(s, 1); confirmCustom(s);
  const e = s.enemies[0]; e.think = 1e9; s.player.y = e.y; s.player.invuln = 1e9;
  step(s, { b: true }); run(s, {}, 30);
  assert.equal(s.busterUp, 1);
  step(s, { b: true }); run(s, {}, 5);
  assert.ok(s.events.length >= 0); assert.equal(s.player.state === 'chip' && s.player.chip?.name === 'Guardian', false);
  const hp = e.hp; step(s, { a: true }); step(s, {}); run(s, {}, 2);
  assert.equal(hp - e.hp, 2);
});

test('Vulcan1 fires 3 shots 11 frames apart after a 2-frame raise (0x80EBF6E, dword_80EBFEC)', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 2, 1) });
  s.hand = [{ name: 'Vulcan1', code: 'B' }]; pick(s, 0); confirmCustom(s);
  const e = s.enemies[0]; e.think = 1e9; s.player.y = e.y; s.player.invuln = 1e9; e.hp = 999;
  const t0 = s.tick; step(s, { b: true });
  const hits = [];
  for (let i = 0; i < 60; i++) { step(s, {}); for (const ev of s.events) if (ev.type === 'hit') hits.push(s.tick - t0); }
  assert.deepEqual(hits, [3, 14, 25]);
});

test('intro: BATTLE START! freezes the battle; deleted enemies dissolve over 53 frames (0x801746E)', async () => {
  const { BANNER, DELETE } = await import('../src/battle/engine.mjs');
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 0, 1), intro: true }); confirmCustom(s);
  assert.equal(s.banner?.kind, 'start');
  const tick = s.tick; run(s, {}, BANNER.start);
  assert.equal(s.tick, tick, 'no battle time under the banner'); assert.equal(s.banner, null);
  const e = s.enemies[0]; e.think = 1e9; s.player.y = e.y; s.player.invuln = 1e9; e.hp = 1;
  step(s, { a: true }); step(s, {});
  assert.equal(s.phase, 'win'); assert.ok(e.deadT <= 1);
  run(s, {}, 100);
  assert.equal(e.deadT, DELETE.hold + DELETE.fade);
});

test('WhiCapsl after an attack chip paralyzes what it hits; alone it pops (0x8010488)', () => {
  const s = createBattle({ seed: 4, enemies: formation('Mettaur', 0, 1) });
  s.hand = [{ name: 'Cannon', code: '*' }, { name: 'WhiCapsl', code: '*' }, { name: 'WhiCapsl', code: '*' }]; pick(s, 0); pick(s, 1); confirmCustom(s);
  assert.equal(s.queue.length, 1); assert.equal(s.queue[0].status, 'paralyze');
  const e = s.enemies[0]; e.think = 1e9; e.hp = 999; s.player.y = e.y; s.player.invuln = 1e9;
  step(s, { b: true });
  assert.ok(e.paralyzed > 0, 'paralyzed');
  const x = e.x, y = e.y; e.think = 0; run(s, {}, 60);
  assert.deepEqual([e.x, e.y], [x, y], 'no AI while paralyzed');
  const s2 = createBattle({ seed: 4, enemies: formation('Mettaur', 0, 1) });
  s2.hand = [{ name: 'WhiCapsl', code: '*' }]; pick(s2, 0); confirmCustom(s2);
  assert.equal(s2.queue[0].name, 'WhiCapsl');
  step(s2, { b: true }); assert.ok(s2.effects.some(f => f.kind === 'capsule'));
});
