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

// Layered sprites (the Cybeasts) are drawn as several sequences stacked on one origin:
// frame i of each layer is merged into a single canvas.
function compose(parts) {
  const x0 = Math.min(...parts.map(f => -f.originX)), y0 = Math.min(...parts.map(f => -f.originY));
  const x1 = Math.max(...parts.map(f => f.width - f.originX)), y1 = Math.max(...parts.map(f => f.height - f.originY));
  const canvas = document.createElement('canvas');
  canvas.width = x1 - x0; canvas.height = y1 - y0;
  const g = canvas.getContext('2d');
  for (const f of parts) g.drawImage(toCanvas(f), -f.originX - x0, -f.originY - y0);
  return { canvas, originX: -x0, originY: -y0 };
}

// `others` maps game ids to other imported ROMs. A sprite missing from the chosen ROM is taken
// from one of them (each BN6 version only carries the full sprite for its own Cybeast).
export function buildBank(rom, gameId, registry, others = {}) {
  const blocks = {}, cache = new Map();
  for (const [key, sprite] of Object.entries(registry.sprites)) {
    let src = sprite.sources[gameId], from = rom;
    if (!src) {
      const alt = Object.keys(others).find(id => sprite.sources[id]);
      if (alt) { src = sprite.sources[alt]; from = others[alt]; }
    }
    if (src) blocks[key] = { ...openBlock(from, src, lz77), roles: sprite.sequences, layers: sprite.layers };
  }
  return {
    has: key => key in blocks,
    get(key, palette = 0) {
      const id = key + ':' + palette;
      if (cache.has(id)) return cache.get(id);
      const b = blocks[key];
      if (!b) return null;
      const sequences = {};
      for (const [role, { seq, layers: own }] of Object.entries(b.roles)) {
        const stack = own || b.layers;
        if (stack && stack.length > 1) {
          const layers = stack.map(off => sequenceFrames(b.data, b.block, seq + off));
          sequences[role] = layers[0].map((rec, i) => {
            const parts = layers.map(l => decodeFrame(b.data, l[Math.min(i, l.length - 1)], { palette }));
            const c = compose(parts);
            return { image: c.canvas, originX: c.originX, originY: c.originY, ticks: rec.ticks, loop: !!(rec.flags & 0x40) };
          });
          continue;
        }
        sequences[role] = sequenceFrames(b.data, b.block, seq + (stack ? stack[0] : 0)).map(rec => {
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
