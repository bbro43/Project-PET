// Builds drawable sprite sequences from an imported ROM using data/registry.json.
// Sequences are decoded lazily per (sprite, palette) so virus variants get their own colours.
import { lz77 } from './lz77.mjs';
import { openBlock, sequenceFrames, decodeFrame } from './sprite.mjs';
import { buildField } from './field.mjs';
import { buildChipArt } from './chips.mjs';
import { buildCustom } from './custom.mjs';
import { buildMenus } from './menus.mjs';
import { decodeNaviCust, buildNaviCust } from './navicust.mjs';

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

// Sprite source priority across every imported ROM (user decision, 0.32.0):
// Gregar, Falzar, Team Colonel, Team ProtoMan, Red Sun, Blue Moon.
export const SOURCE_ORDER = ['bn6g', 'bn6f', 'bn5tc', 'bn5tp', 'bn4rs', 'bn4bm'];

// Which imported ROM supplies each sprite: the first one in `order` that is imported and mapped.
export function pickSources(registry, imported, order = SOURCE_ORDER) {
  const ids = [...order.filter(id => imported.includes(id)), ...imported.filter(id => !order.includes(id))];
  const pick = {};
  for (const part of ['field', 'chipart', 'customscreen', 'menus', 'navicust']) { // battle field panels, chip icons and pictures
    const id = ids.find(id => registry[part]?.sources[id]);
    if (id) Object.defineProperty(pick, '$' + part, { value: id, enumerable: false });
  }
  for (const [key, sprite] of Object.entries(registry.sprites)) {
    const id = ids.find(id => sprite.sources[id]);
    if (id) pick[key] = id;
  }
  return pick;
}

// `roms` maps game ids to imported ROM bytes; every sprite comes from its highest-priority ROM.
export function buildBank(roms, registry, order = SOURCE_ORDER) {
  const blocks = {}, cache = new Map(), from = pickSources(registry, Object.keys(roms), order);
  for (const [key, id] of Object.entries(from)) {
    const sprite = registry.sprites[key];
    blocks[key] = { ...openBlock(roms[id], sprite.sources[id], lz77), roles: sprite.sequences, layers: sprite.layers, clearFrom: sprite.clearFrom };
  }
  return {
    field: from.$field ? buildField(roms[from.$field], registry.field.sources[from.$field]) : null,
    chips: from.$chipart ? buildChipArt(roms[from.$chipart], registry.chipart.sources[from.$chipart]) : null,
    custom: from.$customscreen ? buildCustom(roms[from.$customscreen], registry.customscreen.sources[from.$customscreen]) : null,
    menus: from.$menus ? buildMenus(roms[from.$menus], registry.menus.sources[from.$menus]) : null,
    navicust: from.$navicust ? buildNaviCust(decodeNaviCust(roms[from.$navicust], registry.navicust.sources[from.$navicust])) : null,
    has: key => key in blocks,
    sourceOf: key => from[key] || null,
    sources: [...new Set([...Object.values(from), from.$field, from.$chipart, from.$customscreen, from.$menus, from.$navicust].filter(Boolean))],
    get(key, palette = 0) {
      const id = key + ':' + palette;
      if (cache.has(id)) return cache.get(id);
      const b = blocks[key];
      if (!b) return null;
      const sequences = {};
      for (const [role, { seq, layers: own }] of Object.entries(b.roles)) {
        const stack = own || b.layers;
        if (stack && stack.length > 1) {
          const layers = stack.map(off => sequenceFrames(b.data, b.block, typeof off === 'object' ? off.seq : seq + off)); // {seq} = a fixed sequence (shadow)
          sequences[role] = layers[0].map((rec, i) => {
            const parts = layers.map(l => decodeFrame(b.data, l[Math.min(i, l.length - 1)], { palette }));
            const c = compose(parts);
            return { image: c.canvas, originX: c.originX, originY: c.originY, ticks: rec.ticks, loop: !!(rec.flags & 0x40) };
          });
          continue;
        }
        sequences[role] = sequenceFrames(b.data, b.block, seq + (stack && typeof stack[0] === 'number' ? stack[0] : 0)).map(rec => {
          const f = decodeFrame(b.data, rec, { palette, clearFrom: b.clearFrom });
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
