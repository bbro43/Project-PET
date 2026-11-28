// BN6 menu screens decoded from the ROM: CHIP FOLDER (0x812386C) and FOLDER EDIT (0x8133EC0).
// Each screen's setup runs two of the game's own transfer lists: a palette list (src, variant, dest, size)
// and a decompAndCopyData list (src | 0x80000000 = LZ77, dest, size), read as pointers straight from the ROM
// at the offsets in data/registry.json "menus". The lists fill a small model of VRAM, palette RAM and
// work RAM; the background layers are then drawn from the game's tilemaps (BG1 tiles at 0x6000000,
// BG0 at 0x6008000; screen mode 0x10 of byte_8001618). Compressed blobs start with a 4-byte size word.
import { lz77 } from './lz77.mjs';
import { sequenceFrames, decodeFrame } from './sprite.mjs';

const hex = s => parseInt(s, 16);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const BG_PAL = 0x3001960, OBJ_PAL = 0x3001550; // palette buffers copied to 0x5000000 / 0x5000200

function machine(rom) {
  const m = { vram: new Uint8Array(0x18000), bgpal: new Uint8Array(0x200), objpal: new Uint8Array(0x200), ram: new Map() };
  m.load = (src, dest, size) => {
    const a = (src & 0x7fffffff) - 0x8000000;
    const data = src & 0x80000000 ? lz77(rom, a).subarray(4) : rom.subarray(a, a + size);
    if (dest >= 0x6000000 && dest < 0x6018000) m.vram.set(data.subarray(0, 0x6018000 - dest), dest - 0x6000000);
    else if (dest >= BG_PAL && dest < BG_PAL + 0x200) m.bgpal.set(data.subarray(0, BG_PAL + 0x200 - dest), dest - BG_PAL);
    else if (dest >= OBJ_PAL && dest < OBJ_PAL + 0x200) m.objpal.set(data.subarray(0, OBJ_PAL + 0x200 - dest), dest - OBJ_PAL);
    else m.ram.set(dest, data);
  };
  return m;
}
function runScreen(rom, src) {
  const m = machine(rom);
  for (let k = 0; k < 4; k++) { // palette list: variant 0 (sub_811FB84 maps every BN6 entry to itself)
    const o = hex(src.palettes) + 16 * k, size = u32(rom, o + 12);
    m.load(u32(rom, o), u32(rom, o + 8), size < 0x1000 ? size : 0x20);
  }
  for (let o = hex(src.data); ; o += 12) {
    const s = u32(rom, o);
    if (!s) break;
    m.load(s, u32(rom, o + 4), u32(rom, o + 8));
  }
  return m;
}
const color = c => [(c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3];
// Draw a tilemap (u16 entries: tile | hflip 0x400 | vflip 0x800 | palette << 12) into an RGBA buffer.
function drawMap(m, out, W, H, map, w, h, charbase, ox = 0, oy = 0) {
  for (let i = 0; i < w * h; i++) {
    const e = u16(map, 2 * i), t = e & 0x3ff, hf = (e >> 10) & 1, vf = (e >> 11) & 1, pal = (e >> 12) * 32, base = charbase + 32 * t;
    const tx = (ox + i % w) * 8, ty = (oy + (i / w | 0)) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y, v = (m.vram[base + sy * 4 + (sx >> 1)] >> ((sx & 1) * 4)) & 15;
      if (!v) continue;
      const X = tx + x, Y = ty + y;
      if (X >= W || Y >= H) continue;
      const [r, g, b] = color(u16(m.bgpal, pal + 2 * v)), p = (Y * W + X) * 4;
      out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
    }
  }
}
// `n` consecutive 8×8 BG tiles from VRAM offset `at`, side by side, in BG palette `pal`.
function tiles(m, at, n, pal, clear = 0) { // `clear`: an extra colour index left transparent
  const rgba = new Uint8ClampedArray(8 * n * 8 * 4);
  for (let k = 0; k < n; k++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = (m.vram[at + 32 * k + y * 4 + (x >> 1)] >> ((x & 1) * 4)) & 15;
    if (!v || v === clear) continue;
    const [r, g, b] = color(u16(m.bgpal, pal * 32 + 2 * v)), p = (y * 8 * n + 8 * k + x) * 4;
    rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = 255;
  }
  return { rgba, width: 8 * n, height: 8 };
}
// `n` consecutive 8×8 OBJ tiles (tile index `t` in sprite VRAM 0x6010000) in OBJ palette `pal`.
function objTiles(m, t, n, pal) {
  const rgba = new Uint8ClampedArray(8 * n * 8 * 4);
  for (let k = 0; k < n; k++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = (m.vram[0x10000 + 32 * (t + k) + y * 4 + (x >> 1)] >> ((x & 1) * 4)) & 15;
    if (!v) continue;
    const [r, g, b] = color(u16(m.objpal, pal * 32 + 2 * v)), p = (y * 8 * n + 8 * k + x) * 4;
    rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = 255;
  }
  return { rgba, width: 8 * n, height: 8 };
}
// A w×h-tile OBJ (1D mapping: tile t + row·w + col) in OBJ palette `pal`.
function objBlock(m, t, w, h, pal) {
  const W = 8 * w, rgba = new Uint8ClampedArray(W * 8 * h * 4);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const one = objTiles(m, t + r * w + c, 1, pal);
    for (let y = 0; y < 8; y++) rgba.set(one.rgba.subarray(y * 32, y * 32 + 32), ((r * 8 + y) * W + c * 8) * 4);
  }
  return { rgba, width: W, height: 8 * h };
}
// Chip descriptions (TextScriptChipDescriptions0 for ids 0–255, TextScriptChipDesc1 for 256+; pointers at 0x8027D50):
// a table of u16 offsets, then one script per chip: control codes, the text in the game charmap (0xE9 = new line), 0xE7 ends it.
const CHARMAP = { 0x98: '-', 0x9A: '=', 0x9B: ':', 0x9C: '%', 0x9D: '?', 0x9E: '+', 0xA2: '!', 0xA3: '&', 0xA4: ',', 0xA6: '.', 0xAC: '/', 0x25: '*' };
function describe(rom, tables, id) {
  const T = hex(tables[id > 255 ? 1 : 0]), i = id & 0xff;
  let o = T + u16(rom, T + 2 * i);
  const lines = [''];
  for (let guard = 0; guard < 200; guard++) {
    const b = rom[o++];
    if (b === 0xE7) break;
    if (b === 0xE8) { o += 3; continue; }
    if (b === 0xF1) { o += 2; continue; }
    if (b === 0xE9) { lines.push(''); continue; }
    if (b >= 0xE4) continue;
    lines[lines.length - 1] += b === 0 ? ' ' : b <= 10 ? String(b - 1) : b <= 0x24 ? String.fromCharCode(54 + b) : b >= 0x26 && b <= 0x3F ? String.fromCharCode(59 + b) : CHARMAP[b] ?? '';
  }
  return lines;
}
const layer = (m, W, H, parts) => { const rgba = new Uint8ClampedArray(W * H * 4); for (const p of parts) drawMap(m, rgba, W, H, ...p); return { rgba, width: W, height: H }; };
const sprite = (buf, seq = 0) => sequenceFrames(buf, 0, seq).map(rec => decodeFrame(buf, rec));

export function decodeMenus(rom, src) {
  const cf = runScreen(rom, src.chipFolder), fe = runScreen(rom, src.folderEdit);
  return {
    // CHIP FOLDER: frame (eTextScript201BA20, 30×20) + folder panel (201BF20, 20×13 at column 9, row 6), BG1
    chipFolder: layer(cf, 240, 160, [[cf.ram.get(0x201BA20), 30, 20, 0], [cf.ram.get(0x201BF20), 20, 13, 0, 9, 6]]),
    // FOLDER EDIT: frame (unk_201CA20, 30×20) and the wide panel (unk_2020A20, 60×17 from row 2; the Pack page is 240 px to the right)
    folderEdit: layer(fe, 240, 160, [[fe.ram.get(0x201CA20), 30, 20, 0]]),
    folderPanel: layer(fe, 480, 136, [[fe.ram.get(0x2020A20), 60, 17, 0]]),
    sortMenu: layer(fe, 64, 136, [[fe.ram.get(0x203486C), 8, 17, 0x8000]]), // BG0, column 2 (folder page) or 21 (Pack)
    card: sprite(fe.ram.get(0x2024A20))[0],   // the chip card (OBJ, own palette)
    // small row numbers: BG tiles 16–25 (0–9) and 26–27 ("MB") from 0x6006800, palette 9 (yellow digits, white MB)
    // Regular memory number (sub_812053C, tile 0x160 palette 8): digits 0x161–0x16A, "MB" 0x16C–0x16D
    regDigits: Array.from({ length: 10 }, (_, d) => objTiles(fe, 0x161 + d, 1, 8)),
    regMB: objTiles(fe, 0x16C, 2, 8),
    // cursor (byte_81331F4: tiles 0x240 / 0x244 / 0x248, palette 12, 16×16, 6 frames each) and the page arrow
    // (byte_81331EC: tiles 0x250 / 0x24F / 0x24E, 8×8; flipped on the Pack side), both drawn by sub_811FAF4
    countBox: sprite(fe.ram.get(0x2034B6C), 0)[2], // the 30/30 box (object type 0xD, sub_8117BE8): last frame of its opening, at (212,12)
    scrollThumb: objBlock(fe, 0x24C, 1, 2, 12),    // list scroll thumb (sub_8134558: tile 0xC24C, 8×16)
    cursor: [0x240, 0x244, 0x248].map(t => objBlock(fe, t, 2, 2, 12)),
    pageArrow: [0x250, 0x24F, 0x24E].map(t => objBlock(fe, t, 1, 1, 12)),
    regFrame: sprite(fe.ram.get(0x203526C), 0)[0],
    tagFrame: sprite(fe.ram.get(0x203526C), 1)[0], // REG frame (seq 0; seq 1 is TAG), drawn round the Regular chip's row
    smallDigits: Array.from({ length: 10 }, (_, d) => tiles(fe, 0x6800 + 32 * (16 + d), 1, 9, 13)),
    mbLabel: tiles(fe, 0x6800 + 32 * 26, 2, 9, 13),
    describe: src.descriptions ? id => describe(rom, src.descriptions, id) : null,
  };
}

export function buildMenus(rom, src) {
  const d = decodeMenus(rom, src);
  const canvas = f => { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').putImageData(new ImageData(f.rgba, f.width, f.height), 0, 0); return c; };
  return {
    chipFolder: canvas(d.chipFolder), folderEdit: canvas(d.folderEdit), folderPanel: canvas(d.folderPanel), sortMenu: canvas(d.sortMenu),
    card: { image: canvas(d.card), originX: d.card.originX, originY: d.card.originY },
    countBox: { image: canvas(d.countBox), originX: d.countBox.originX, originY: d.countBox.originY }, scrollThumb: canvas(d.scrollThumb),
    cursor: d.cursor.map(canvas), pageArrow: d.pageArrow.map(canvas),
    regDigits: d.regDigits.map(canvas), regMB: canvas(d.regMB),
    tagFrame: { image: canvas(d.tagFrame), originX: d.tagFrame.originX, originY: d.tagFrame.originY },
    regFrame: { image: canvas(d.regFrame), originX: d.regFrame.originX, originY: d.regFrame.originY },
    smallDigits: d.smallDigits.map(canvas), mbLabel: canvas(d.mbLabel),
    describe: d.describe ? (cache => id => cache.get(id) ?? (cache.set(id, d.describe(id)), cache.get(id)))(new Map()) : null,
  };
}
