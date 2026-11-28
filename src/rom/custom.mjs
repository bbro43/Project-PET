// Custom screen graphics decoded from the ROM: the window frame (BG tiles + 15×20 tilemap,
// 4 palettes by chip class), the code strips, the damage digits and the element icons.
// Layout (tile rects from byte_8027B2C) is in data/registry.json "customscreen".
const hex = s => parseInt(s, 16);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const color = c => [(c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3];
const readPalette = (rom, o, n = 16) => Array.from({ length: n }, (_, i) => color(u16(rom, o + 2 * i)));

function blit(rom, rgba, w, tileOff, px, py, pal, hf = 0, vf = 0) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y;
    const v = (rom[tileOff + sy * 4 + (sx >> 1)] >> ((sx & 1) * 4)) & 15;
    if (!v) continue;
    const p = ((py + y) * w + px + x) * 4, c = pal[v];
    rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255;
  }
}

export function decodeCustom(rom, src) {
  const pals = [0, 1, 2, 3].map(k => readPalette(rom, hex(src.palettes) + 32 * k));
  const tiles = hex(src.tiles), map = hex(src.tilemap), skip = new Set(src.emptyTiles);
  function frame(cls = 0) { // 120×160, clear where the game draws other layers
    const rgba = new Uint8ClampedArray(120 * 160 * 4), pal = pals[cls];
    for (let i = 0; i < 300; i++) {
      const e = u16(rom, map + 2 * i), t = e & 0x3ff;
      if (skip.has(t)) continue;
      blit(rom, rgba, 120, tiles + 32 * t, (i % 15) * 8, (i / 15 | 0) * 8, pal, (e >> 10) & 1, (e >> 11) & 1);
    }
    return { rgba, width: 120, height: 160 };
  }
  const stack = (off, tw, th, pal, colMajor) => { // tw×th tiles, 32 bytes each
    const w = tw * 8, rgba = new Uint8ClampedArray(w * th * 8 * 4);
    for (let k = 0; k < tw * th; k++) { const x = colMajor ? (k / th | 0) : k % tw, y = colMajor ? k % th : (k / tw | 0); blit(rom, rgba, w, off + 32 * k, x * 8, y * 8, pal); }
    return { rgba, width: w, height: th * 8 };
  };
  // Selected-chip column (the game draws it on another layer): frame side tiles down both edges,
  // a 16×16 box per chip between them. 32 × (16·count).
  function column(cls = 0) {
    const [, , n] = src.layout.column, h = 16 * n, rgba = new Uint8ClampedArray(32 * h * 4), box = readPalette(rom, hex(src.boxPalette));
    for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) {
      const t = tiles + 32 * src.sideTiles[r], y = 16 * k + 8 * r;
      blit(rom, rgba, 32, t, 0, y, pals[cls]); blit(rom, rgba, 32, t, 24, y, pals[cls], 1);
      for (let c = 0; c < 2; c++) blit(rom, rgba, 32, hex(src.boxTiles) + 32 * (2 * r + c), 8 + 8 * c, y, box);
    }
    return { rgba, width: 32, height: h };
  }
  // Battle message font (8×16 glyphs, top tile then bottom tile): A–Z, then the banner bar fill, '!', bar left end, bar right end.
  const fontPal = src.font ? readPalette(rom, hex(src.font.palette)) : null;
  const glyph = k => { // letters are 14 rows tall; rows 0–1 are cleared (row 0 of the 'A' tile holds unrelated data)
    const g = stack(hex(src.font.glyphs) + 0x40 * k, 1, 2, fontPal, true);
    g.rgba.fill(0, 0, 8 * 2 * 4); return g;
  };
  return {
    frame, column, glyph: src.font ? glyph : null,
    code: (k, cls = 0) => stack(hex(src.codes) + 0x40 * k, 2, 1, pals[cls]),          // 16×8 strip, k = 0..25 A–Z, 26 *, 27 empty
    letter: (k, cls = 0) => stack(hex(src.letters) + 0x40 * k, 1, 2, pals[cls], true), // 8×16 code letter under the picture
    digit: (d, cls = 0) => stack(hex(src.digits) + 0x40 * d, 1, 2, pals[cls], true),   // 8×16
    element: (e, cls = 0) => {                                                         // 16×16, colours 10–15 per element
      const pal = pals[cls].slice(); readPalette(rom, hex(src.elementPalettes) + 12 * e, 6).forEach((c, i) => { pal[10 + i] = c; });
      return stack(hex(src.elements) + 0x80 * e, 2, 2, pal);
    },
    layout: src.layout,
  };
}

export function buildCustom(rom, src) {
  const d = decodeCustom(rom, src), cache = new Map();
  const canvas = f => { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').putImageData(new ImageData(f.rgba, f.width, f.height), 0, 0); return c; };
  const get = (k, f) => { if (!cache.has(k)) cache.set(k, canvas(f())); return cache.get(k); };
  return {
    layout: d.layout,
    frame: cls => get('f' + cls, () => d.frame(cls)),
    column: cls => get('k' + cls, () => d.column(cls)),
    glyph: d.glyph ? k => get('g' + k, () => d.glyph(k)) : null,
    code: (k, cls) => get(`c${k}.${cls}`, () => d.code(k, cls)),
    letter: (k, cls) => get(`l${k}.${cls}`, () => d.letter(k, cls)),
    digit: (n, cls) => get(`d${n}.${cls}`, () => d.digit(n, cls)),
    element: (e, cls) => get(`e${e}.${cls}`, () => d.element(e, cls)),
  };
}
