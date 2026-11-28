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
