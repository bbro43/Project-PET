// Battle field panels decoded from the ROM (BG tiles, per-type tilemaps, BG palettes and the
// palette animations for poison, holy and roads). Offsets: data/registry.json "field".
import { lz77 } from './lz77.mjs';

const hex = s => parseInt(s, 16);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const color = c => [(c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3];
const readPalette = (rom, o) => Array.from({ length: 16 }, (_, i) => color(u16(rom, o + 2 * i)));

// Pure decode (no DOM): everything needed to paint any panel at any tick.
export function decodeField(rom, src) {
  const tiles = lz77(rom, hex(src.tiles.offset));
  const palettes = [readPalette(rom, hex(src.palette0))];
  for (let n = 1; n <= 8; n++) palettes.push(readPalette(rom, hex(src.palettes) + 32 * (n - 1)));
  const anims = {}; // palette → [{ colors, ticks }]
  for (const a of src.paletteAnims) anims[a.palette] = a.frames.map(([o, ticks]) => ({ colors: readPalette(rom, hex(o)), ticks }));
  const tilemap = hex(src.tilemap);
  const entries = (type, side, row) => {
    const o = tilemap + ((type * 6 + side * 3 + row) - 1) * 32;
    return Array.from({ length: 15 }, (_, i) => { const e = u16(rom, o + 2 * i); return { tile: (e & 0x3ff) - src.tileBase, hf: (e >> 10) & 1, vf: (e >> 11) & 1, pal: e >> 12 }; });
  };
  // Which frame of each animated palette shows at a tick (0x800C192 steps each table on its own timer).
  const paletteAt = (pal, tick) => {
    const fr = anims[pal];
    if (!fr) return palettes[pal];
    const total = fr.reduce((n, f) => n + f.ticks, 0);
    let t = tick % total;
    for (const f of fr) { if (t < f.ticks) return f.colors; t -= f.ticks; }
    return fr[0].colors;
  };
  const frameKey = (pals, tick) => pals.map(p => { const fr = anims[p]; if (!fr) return 0; const total = fr.reduce((n, f) => n + f.ticks, 0); let t = tick % total, i = 0; while (t >= fr[i].ticks) { t -= fr[i].ticks; i++; } return i; }).join('.');
  // 40×24 RGBA for one panel.
  function paint(type, side, row, tick = 0) {
    const rgba = new Uint8ClampedArray(40 * 24 * 4);
    entries(type, side, row).forEach((e, i) => {
      if (e.tile < 0 || e.tile * 32 + 32 > tiles.length) return;
      const pal = paletteAt(e.pal, tick);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const sx = e.hf ? 7 - x : x, sy = e.vf ? 7 - y : y;
        const b = tiles[e.tile * 32 + sy * 4 + (sx >> 1)], v = (b >> ((sx & 1) * 4)) & 15;
        if (!v) continue;
        const px = ((i % 5) * 8 + x + ((Math.floor(i / 5) * 8 + y) * 40)) * 4, c = pal[v];
        rgba[px] = c[0]; rgba[px + 1] = c[1]; rgba[px + 2] = c[2]; rgba[px + 3] = 255;
      }
    });
    return rgba;
  }
  const palsOf = (type, side, row) => [...new Set(entries(type, side, row).map(e => e.pal))];
  return { paint, entries, palsOf, frameKey };
}

// Canvas cache for the renderer.
export function buildField(rom, src) {
  const f = decodeField(rom, src), cache = new Map();
  return {
    panel(type, side, row, tick) {
      const pals = f.palsOf(type, side, row), key = `${type}.${side}.${row}.${f.frameKey(pals, tick)}`;
      let c = cache.get(key);
      if (!c) {
        c = document.createElement('canvas'); c.width = 40; c.height = 24;
        c.getContext('2d').putImageData(new ImageData(f.paint(type, side, row, tick), 40, 24), 0, 0);
        cache.set(key, c);
      }
      return c;
    },
  };
}
