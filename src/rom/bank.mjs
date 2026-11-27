// Builds drawable sprite sequences from an imported ROM using data/registry.json.
import { lz77 } from './lz77.mjs';
import { openBlock, sequenceFrames, decodeFrame } from './sprite.mjs';

export async function buildBank(rom, gameId, registry) {
  const bank = {};
  for (const [key, sprite] of Object.entries(registry.sprites)) {
    const src = sprite.sources[gameId];
    if (!src) continue;
    const { data, block } = openBlock(rom, src, lz77);
    const sequences = {};
    for (const [role, { seq }] of Object.entries(sprite.sequences)) {
      sequences[role] = await Promise.all(sequenceFrames(data, block, seq).map(async rec => {
        const f = decodeFrame(data, rec);
        const canvas = document.createElement('canvas');
        canvas.width = f.width; canvas.height = f.height;
        canvas.getContext('2d').putImageData(new ImageData(f.rgba, f.width, f.height), 0, 0);
        return { image: canvas, originX: f.originX, originY: f.originY, ticks: f.ticks, loop: !!(f.flags & 0x40) };
      }));
    }
    bank[key] = sequences;
  }
  return bank;
}

// Frame to show `t` ticks into a sequence (holds the last frame unless looping).
export function frameAt(frames, t) {
  const total = frames.reduce((n, f) => n + f.ticks, 0);
  const loop = frames[frames.length - 1].loop;
  if (loop && total) t %= total;
  for (const f of frames) { if (t < f.ticks) return f; t -= f.ticks; }
  return frames[frames.length - 1];
}
