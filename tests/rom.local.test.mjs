// Local-only: verifies registry offsets against real ROMs. Skipped unless ROM_DIR
// points at a folder of .gba files. ROMs are never committed.
//   ROM_DIR=/path/to/roms node --test tests/rom.local.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { identify } from '../src/rom/gba.mjs';
import { lz77 } from '../src/rom/lz77.mjs';
import { sequenceCount, sequenceFrames, decodeFrame } from '../src/rom/sprite.mjs';

const dir = process.env.ROM_DIR;
const registry = JSON.parse(readFileSync(new URL('../data/registry.json', import.meta.url)));

test('registry sprite blocks match ROM bytes and decode cleanly', { skip: !dir && 'ROM_DIR not set' }, () => {
  const roms = {};
  for (const f of readdirSync(dir).filter(f => /\.gba$/i.test(f))) {
    const rom = new Uint8Array(readFileSync(join(dir, f)));
    const g = identify(rom);
    if (g) roms[g.id] = rom;
  }
  let checked = 0;
  for (const [key, sprite] of Object.entries(registry.sprites)) {
    for (const [game, src] of Object.entries(sprite.sources)) {
      const rom = roms[game];
      if (!rom) continue;
      const off = parseInt(src.offset, 16);
      const bytes = src.compression === 'lz77' ? lz77(rom, off) : rom.subarray(off, off + src.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), src.sha256, `${key}/${game} hash`);
      const block = src.compression === 'lz77' ? 4 : 0;
      for (let seq = 0; seq < sequenceCount(bytes, block); seq++) {
        for (const rec of sequenceFrames(bytes, block, seq)) assert.ok(decodeFrame(bytes, rec).width > 0);
      }
      checked++;
    }
  }
  assert.ok(checked > 0, 'no registry entries matched the supplied ROMs');
});
