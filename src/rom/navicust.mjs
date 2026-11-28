// The BN6 NAVICUSTOMIZER screen, decoded from the ROM on device (setup sub_81356F4 → sub_8135B94):
// a palette list resolved through sub_811FB84 (PET theme 0), a decompAndCopyData list, BG palettes 4–11 from
// 0x201CF80, then BG1 = frame (0x201BE80, 30×20) + board (0x201C380 / 0x201C780 / 0x201CB80 by Expand Memory,
// 17×17 at tile (1,2)), BG2 = 0x201D180 (12×9 at (17,11)), BG3 = the INFORMATION box (ROM 0x813565C, 10×6 at (18,13)).
// Screen mode 0x10 (byte_8001618): BG1/BG2 tiles at 0x6000000, BG3 at 0x6008000.
// Parts are drawn the way the game does (sub_813C1C0): every board cell's tiles use their own palette entries
// (byte_813C4E8 / 813C51C / 813C550), which get the part's colour (byte_813C2EC) and, for Plus Parts, the pattern
// colour (byte_813C308); frame cells get 0x5A91 when empty and 0x3968 when a part covers them.
import { lz77 } from './lz77.mjs';
import { sequenceFrames, decodeFrame } from './sprite.mjs';

const hex = s => parseInt(s, 16);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const A = p => (p & 0x7fffffff) - 0x8000000;
export const rgb15 = c => [(c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3];

export function decodeNaviCust(rom, src) {
  const vram = new Uint8Array(0x18000), bgpal = new Uint8Array(0x200), objpal = new Uint8Array(0x200), ram = new Map();
  const load = (s, dest, size) => {
    const data = s & 0x80000000 ? lz77(rom, A(s)).subarray(4) : rom.subarray(A(s), A(s) + size);
    if (dest >= 0x6000000 && dest < 0x6018000) vram.set(data.subarray(0, 0x6018000 - dest), dest - 0x6000000);
    else if (dest >= 0x3001960 && dest < 0x3001B60) bgpal.set(data.subarray(0, 0x3001B60 - dest), dest - 0x3001960);
    else if (dest >= 0x3001550 && dest < 0x3001750) objpal.set(data.subarray(0, 0x3001750 - dest), dest - 0x3001550);
    else ram.set(dest, data);
  };
  // sub_811FB84: a palette source is looked up per variant and replaced by the PET theme's (theme 0)
  const resolve = (s, variant) => {
    const L = A(u32(rom, A(u32(rom, hex(src.resolve[0]))) + 4 * variant));
    for (let i = 0; i < 64; i++) {
      const v = u32(rom, L + 4 * i);
      if (v === 0xffffffff) break;
      if (v === s) return u32(rom, A(u32(rom, A(u32(rom, A(u32(rom, hex(src.resolve[1]))) + 4 * variant)) + 4 * i)));
    }
    return s;
  };
  for (let k = 0; k < 3; k++) { const o = hex(src.palettes) + 16 * k, s = u32(rom, o), size = u32(rom, o + 12); load(resolve(s, u32(rom, o + 4)), u32(rom, o + 8), size < 0x10000 ? size : 0x20); }
  for (let o = hex(src.data); ; o += 12) { const s = u32(rom, o); if (!s) break; load(s, u32(rom, o + 4), u32(rom, o + 8)); }
  bgpal.set(ram.get(0x201CF80).subarray(0, 0x100), 0x80);

  // BG1 as palette indexes (pal·16 + colour), so board cells can be recoloured per frame
  const W = 240, H = 160, index = new Int16Array(W * H).fill(-1), over = new Uint8ClampedArray(W * H * 4);
  const layer = (map, w, h, ox, oy, cb, toIndex) => {
    for (let i = 0; i < w * h; i++) {
      const e = u16(map, 2 * i), t = e & 0x3ff, hf = (e >> 10) & 1, vf = (e >> 11) & 1, pal = e >> 12;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y, v = (vram[cb + 32 * t + sy * 4 + (sx >> 1)] >> ((sx & 1) * 4)) & 15;
        if (!v) continue;
        const X = (ox + i % w) * 8 + x, Y = (oy + (i / w | 0)) * 8 + y;
        if (X >= W || Y >= H) continue;
        if (toIndex) index[Y * W + X] = pal * 16 + v;
        else { const [r, g, b] = rgb15(u16(bgpal, (pal * 16 + v) * 2)), p = (Y * W + X) * 4; over[p] = r; over[p + 1] = g; over[p + 2] = b; over[p + 3] = 255; }
      }
    }
  };
  const exp = src.expand ?? 2;
  layer(ram.get(0x201BE80), 30, 20, 0, 0, 0, true);
  layer(ram.get([0x201C380, 0x201C780, 0x201CB80][exp]), 17, 17, 1, 2, 0, true);
  layer(ram.get(0x201D180), 12, 9, 17, 11, 0, false);
  layer(rom.subarray(hex(src.infoBox)), 10, 6, 18, 13, 0x8000, false);

  const tables = hex(src.tables); // byte_813C2EC (Falzar)
  const colors = [0, 1].map(set => Array.from({ length: 7 }, (_, i) => u16(rom, tables + 14 * set + 2 * i)));
  const pattern = [0, 1].map(set => Array.from({ length: 7 }, (_, i) => u16(rom, tables + 0x1C + 14 * set + 2 * i)));
  const palmap = rom.subarray(tables + 0x1FC + 0x34 * exp, tables + 0x1FC + 0x34 * exp + 49); // byte_813C4E8 + 0x34·n
  const sprite = (addr, seq, palette = 0) => { const b = ram.get(addr), fr = sequenceFrames(b, 0, seq); return fr.map(r => decodeFrame(b, r, { palette })); };
  return {
    index, overlay: { rgba: over, width: W, height: H }, bgpal, colors, pattern, palmap,
    cursor: sprite(0x20218F0, 0), hand: sprite(0x20218F0, 1), listBar: sprite(0x201DD70, 0)[0],
    menu: sprite(0x20222F0, 0)[0], banners: [0, 1, 2].map(q => sprite(0x20226F0, q)[0]),
  };
}

// Canvas helpers (browser): the static overlay, sprites, and the board drawn with per-cell colours.
export function buildNaviCust(d) {
  const canvas = ({ rgba, width, height }) => { const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0); return c; };
  const spr = f => ({ image: canvas(f), originX: f.originX, originY: f.originY, ticks: f.ticks });
  const img = new ImageData(240, 160), pal = new Uint32Array(256), base = new Uint32Array(256);
  const pack = c => { const [r, g, b] = typeof c === 'number' ? rgb15(c) : c; return (255 << 24) | (b << 16) | (g << 8) | r; };
  for (let i = 0; i < 256; i++) base[i] = pack(u16(d.bgpal, 2 * i));
  const out = document.createElement('canvas'); out.width = 240; out.height = 160;
  return {
    overlay: canvas(d.overlay), cursor: d.cursor.map(spr), hand: d.hand.map(spr), listBar: spr(d.listBar), menu: spr(d.menu), banners: d.banners.map(spr),
    colors: d.colors, pattern: d.pattern,
    // cells: 7×7 of { color (game colour 0–6 or an [r,g,b] for a Cross part), plus, frame, covered, hi (the brighter set 1) }
    board(cells, set = 0) {
      pal.set(base);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const k = d.palmap[7 * y + x]; if (!k) continue;
        const c = cells[y][x], e = 64 + k, set1 = c.hi ? 1 : set;
        let a, b;
        if (c.frame && !c.hi) a = b = c.covered ? (set1 ? 0x41AA : 0x3968) : (set1 ? 0x6F15 : 0x5A91);
        else if (Array.isArray(c.color)) a = b = c.hi ? c.color.map(v => Math.min(255, v + 60)) : c.color;
        else { a = d.colors[set1][c.color || 0]; b = c.plus ? d.pattern[set1][c.color] : a; }
        pal[e] = pack(a); pal[e + 1] = pack(b);
      }
      const px = new Uint32Array(img.data.buffer);
      for (let i = 0; i < d.index.length; i++) { const v = d.index[i]; px[i] = v < 0 ? 0 : pal[v]; }
      const g = out.getContext('2d'); g.putImageData(img, 0, 0); g.drawImage(this.overlay, 0, 0);
      return out;
    },
  };
}
