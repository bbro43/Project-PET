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
    if (!v || !pal[v]) continue;
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
  // Battle text font (renderTextGfx 0x8045F8C with dword_86B7AE0): 8×16 per character code, 8 px apart, palette index 1 fill, 2 outline.
  const textPal = src.text ? readPalette(rom, hex(src.text.palette)) : null;
  const CHARS = { ' ': 0, '*': 0x25, '-': 0x98, '=': 0x9A, ':': 0x9B, '%': 0x9C, '?': 0x9D, '+': 0x9E, '!': 0xA2, '&': 0xA3, ',': 0xA4, '.': 0xA6, '/': 0xAC, "'": 0xA9 };
  const code = ch => ch >= '0' && ch <= '9' ? 1 + (ch.charCodeAt(0) - 48) : ch >= 'A' && ch <= 'Z' ? 0x0B + ch.charCodeAt(0) - 65 : ch >= 'a' && ch <= 'z' ? 0x26 + ch.charCodeAt(0) - 97 : CHARS[ch] ?? 0;
  const text = str => {
    const w = 8 * str.length, rgba = new Uint8ClampedArray(Math.max(1, w) * 16 * 4);
    [...str].forEach((ch, i) => { blit(rom, rgba, w, hex(src.text.glyphs) + 64 * code(ch), 8 * i, 0, textPal); blit(rom, rgba, w, hex(src.text.glyphs) + 64 * code(ch) + 32, 8 * i, 8, textPal); });
    return { rgba, width: Math.max(1, w), height: 16 };
  };
  // Battle HUD (BG charblock 2, palette 13 = 0x86E1C78): the custom gauge (layout word_801ED6C, 18×2 tiles at column 6)
  // and the HP box (byte_801EDFC, 6×2). Tiles: 0x1A0– from 0x86E1638 (list off_801ECB4), 0x222– from 0x86E489C,
  // 0x23E– from 0x86E4C1C (0x801DF32). Fill (0x801C640): tiles 0x922A full, 0x9222 + ((v >> 7) & 7) for the partial tile,
  // from column 7 of the second row; palette by gauge state (0x801C5F4: < 0x1500, < 0x2A00, < 0x4000, full).
  const H = src.hud;
  const hudTile = t => t >= 0x23E ? hex(H.gaugeTiles2) + 32 * (t - 0x23E) : t >= 0x222 ? hex(H.gaugeTiles) + 32 * (t - 0x222) : hex(H.boxTiles) + 32 * (t - 0x1A0);
  const layout = (entries, w, h, pal) => {
    const rgba = new Uint8ClampedArray(w * 8 * h * 8 * 4);
    entries.forEach((e, i) => blit(rom, rgba, w * 8, hudTile(e & 0x3ff), (i % w) * 8, (i / w | 0) * 8, pal, (e >> 10) & 1, (e >> 11) & 1));
    return { rgba, width: w * 8, height: h * 8 };
  };
  const words = (o, n) => Array.from({ length: n }, (_, i) => u16(rom, o + 2 * i));
  const gaugePal = state => readPalette(rom, state === 0 ? hex(H.palette) : hex(H.statePalettes) + 32 * (state - 1));
  const gauge = (v, state) => {
    const e = words(hex(H.gauge), 36);
    for (let c = 0; c < 16; c++) e[19 + c] = 0x9222;
    for (let c = 0; c < v >> 10; c++) e[19 + c] = 0x922A;
    if (v < 0x4000) e[19 + (v >> 10)] = 0x9222 + ((v >> 7) & 7);
    return layout(e, 18, 2, gaugePal(state));
  };
  const hpBox = () => layout(words(hex(H.box), 12), 6, 2, readPalette(rom, hex(H.palette)));
  // HP digits: the 8×16 digit tiles (dword_86E411C) with their background colour (index 8) left clear over the box.
  const hpDigit = d => { const pal = pals[0].slice(); pal[8] = null; return stack(hex(src.digits) + 0x40 * d, 1, 2, pal, true); };
  return {
    hud: H ? { gauge, hpBox, hpDigit } : null,
    text: src.text ? text : null,
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
    text: d.text ? str => get('t' + str, () => d.text(str)) : null,
    gauge: d.hud ? (v, state) => get(`G${v >> 7}.${state}`, () => d.hud.gauge(v, state)) : null,
    hpBox: d.hud ? () => get('hp', () => d.hud.hpBox()) : null,
    hpDigit: d.hud ? n => get('h' + n, () => d.hud.hpDigit(n)) : null,
    code: (k, cls) => get(`c${k}.${cls}`, () => d.code(k, cls)),
    letter: (k, cls) => get(`l${k}.${cls}`, () => d.letter(k, cls)),
    digit: (n, cls) => get(`d${n}.${cls}`, () => d.digit(n, cls)),
    element: (e, cls) => get(`e${e}.${cls}`, () => d.element(e, cls)),
  };
}
