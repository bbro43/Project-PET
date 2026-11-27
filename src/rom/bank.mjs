// Builds drawable sprite sequences from an imported ROM using data/registry.json.
// Sequences are decoded lazily per (sprite, palette) so virus variants get their own colours.
import { lz77 } from './lz77.mjs';
import { openBlock, sequenceFrames, decodeFrame } from './sprite.mjs';

function toCanvas(f) {
  const canvas = document.createElement('canvas');
  canvas.width = f.width; canvas.height = f.height;
  canvas.getContext('2d').putImageData(new ImageData(f.rgba, f.width, f.height), 0, 0);
  return canvas;
}

export function buildBank(rom, gameId, registry) {
  const blocks = {}, cache = new Map();
  for (const [key, sprite] of Object.entries(registry.sprites)) {
    const src = sprite.sources[gameId];
    if (src) blocks[key] = { ...openBlock(rom, src, lz77), roles: sprite.sequences };
  }
  return {
    has: key => key in blocks,
    get(key, palette = 0) {
      const id = key + ':' + palette;
      if (cache.has(id)) return cache.get(id);
      const b = blocks[key];
      if (!b) return null;
      const sequences = {};
      for (const [role, { seq }] of Object.entries(b.roles)) {
        sequences[role] = sequenceFrames(b.data, b.block, seq).map(rec => {
          const f = decodeFrame(b.data, rec, { palette });
          return { image: toCanvas(f), originX: f.originX, originY: f.originY, ticks: f.ticks, loop: !!(f.flags & 0x40) };
        });
      }
      cache.set(id, sequences);
      return sequences;
    },
  };
}

// Frame to show `t` ticks into a sequence (holds the last frame unless looping).
export function frameAt(frames, t) {
  const total = frames.reduce((n, f) => n + f.ticks, 0);
  const loop = frames[frames.length - 1].loop;
  if (loop && total) t %= total;
  for (const f of frames) { if (t < f.ticks) return f; t -= f.ticks; }
  return frames[frames.length - 1];
}
