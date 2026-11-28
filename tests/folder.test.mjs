import assert from 'node:assert/strict';
import { test } from 'node:test';
import { folderRule, copyLimit, PACK, FOLDER_SIZE } from '../src/ui/folder.mjs';
import { DEFAULT_FOLDER, CHIP_DATA, createBattle, confirmCustom } from '../src/battle/engine.mjs';

test('copy limit by MB (sub_8135500): ≤19 → 5, ≤29 → 4, ≤39 → 3, ≤49 → 2, else 1', () => {
  assert.deepEqual([0, 19, 20, 29, 30, 39, 40, 49, 50, 99].map(copyLimit), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
});

test('folder rules: same-chip cap, one of each Mega / Giga, Mega and Giga caps', () => {
  const cannon = ['Cannon', 'A'];                      // 6 MB → 5 copies
  const four = Array(4).fill(cannon);
  assert.equal(folderRule(four, cannon), null);
  assert.match(folderRule([...four, cannon], cannon), /capacity/);
  assert.equal(folderRule([...four, cannon], cannon, 0), null, 'replacing one of them is fine');
  const mega = PACK.find(([n]) => CHIP_DATA[n].class === 'mega'), giga = PACK.find(([n]) => CHIP_DATA[n].class === 'giga');
  assert.match(folderRule([mega], mega), /1 of the same\nMegaChip/);
  assert.match(folderRule([giga], giga), /GigaChip/);
  const megas = [...new Set(PACK.filter(([n]) => CHIP_DATA[n].class === 'mega').map(([n]) => n))].slice(0, 6).map(n => PACK.find(c => c[0] === n));
  assert.match(folderRule(megas.slice(0, 5), megas[5]), /only\n5 MegaChips/);
});

test('the Pack holds every standard / Mega / Giga chip code; the default folder is 30 chips and battles use the folder given', () => {
  assert.ok(PACK.length > 600);
  assert.ok(PACK.every(([n, code]) => CHIP_DATA[n].codes.includes(code)));
  assert.equal(DEFAULT_FOLDER.length, FOLDER_SIZE);
  const folder = Array(30).fill(['Sword', 'S']);
  const s = createBattle({ seed: 2, folder }); confirmCustom(s);
  assert.ok([...s.hand, ...s.draw].every(c => c.name === 'Sword'));
});

import { setRegular, REG_MEMORY } from '../src/ui/folder.mjs';
import { deal } from '../src/battle/engine.mjs';

test('Regular chip: only chips within the Regular memory (4 MB at the start)', () => {
  assert.equal(REG_MEMORY, 4);
  const f = { chips: [['Cannon', 'A'], ['AirShot', '*']], reg: null };
  assert.match(setRegular(f, 0), /too/);           // Cannon is 6 MB
  assert.equal(f.reg, null);
  assert.equal(setRegular(f, 1), null); assert.equal(f.reg, 1); // AirShot is 4 MB
  setRegular(f, 1); assert.equal(f.reg, null);      // Select again clears it
});

test('Regular chip is always drawn first; GigaChips never in the first hand', () => {
  const folder = Array.from({ length: 29 }, (_, i) => ({ id: i, name: i === 17 ? 'AirShot' : 'Cannon', code: 'A' }));
  const gname = Object.values(CHIP_DATA).find(c => c.class === 'giga').name;
  folder.push({ id: 29, name: gname, code: 'A' });
  for (let seed = 1; seed < 40; seed++) {
    const s = { seed };
    const out = deal(s, folder, 17);
    assert.equal(out.length, 30);
    assert.equal(out[0].id, 17);
    assert.ok(out.findIndex(c => c.name === gname) >= 10);
  }
  const b = createBattle({ seed: 5, regular: 6 });
  assert.equal(b.hand[0].id, 6);
});

import { sortChips, SORTS } from '../src/ui/folder.mjs';
test('sorting follows the game keys (ties by chip then code)', () => {
  const f = [['Vulcan1', 'D'], ['Cannon', 'B'], ['AirShot', '*'], ['Cannon', 'A'], ['MiniBomb', 'L']];
  assert.equal(SORTS.length, 7);
  assert.deepEqual(sortChips(f, 0).map(c => c.join()), ['Cannon,A', 'Cannon,B', 'AirShot,*', 'Vulcan1,D', 'MiniBomb,L']); // ID order
  assert.deepEqual(sortChips(f, 1).map(c => c[0]), ['AirShot', 'Cannon', 'Cannon', 'MiniBomb', 'Vulcan1']);              // ABCDE
  assert.deepEqual(sortChips(f, 2).map(c => c[1]), ['A', 'B', 'D', 'L', '*']);                                             // Code
  assert.deepEqual(sortChips(f, 3, true).map(c => c[0]), ['MiniBomb', 'Cannon', 'Cannon', 'AirShot', 'Vulcan1']);       // Attack, high first
  assert.deepEqual(sortChips(f, 5, true).map(c => c[0]).slice(0, 1), ['Cannon']); // there are no duplicates of chip+code, so ties → chip order
});

import { setTag, TAG_MEMORY } from '../src/ui/folder.mjs';
test('Tag chips: two chips totalling at most 60 MB, never the Regular', () => {
  assert.equal(TAG_MEMORY, 60);
  const f = { chips: [['Cannon', 'A'], ['AirShot', '*'], ['Vulcan1', 'D'], ['HiCannon', 'L'], ['M-Cannon', 'M']], reg: 1, tag: null };
  assert.match(setTag(f, 1).msg, /Regular/);
  let r = setTag(f, 0); assert.equal(r.pending, 0);
  r = setTag(f, 2, r.pending); assert.deepEqual(f.tag, [0, 2]);
  assert.match(setRegular(f, 0), /Tag/);
  setTag(f, 2); assert.equal(f.tag, null); // Tag again clears the pair
});

test('Tagged chips come adjacent, after the first slot', () => {
  const folder = Array.from({ length: 30 }, (_, i) => ({ id: i, name: 'Cannon', code: 'A' }));
  for (let seed = 1; seed < 60; seed++) {
    const out = deal({ seed }, folder, 4, [7, 20]);
    assert.equal(out.length, 30); assert.equal(out[0].id, 4);
    const a = out.findIndex(c => c.id === 7);
    assert.ok(a >= 1 && a <= 19); assert.equal(out[a + 1].id, 20);
    assert.equal(new Set(out.map(c => c.id)).size, 30);
  }
});
