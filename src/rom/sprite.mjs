// Battle Network sprite block decoder (BN4–6 format).
// Verified 2026-11-27 against all 78 frames of BN6 Falzar MegaMan (0x1D8000):
// pixels, anchors, durations and flags match the prior export exactly.
//
// Block layout (offsets relative to block start + 4 = base):
//   header byte 3      : sequence count
//   base + 4*i         : u32 offset of sequence i
//   frame record (20B) : u32 tiles, u32 palettes, u32 subanim, u32 oam, u16 ticks, u16 flags
//   flags              : 0x80 = last frame of sequence, 0x40 = sequence loops
//   tiles              : u32 byte size, then 4bpp tiles in 1D order
//   palettes           : u32 size (32), then consecutive 16-colour BGR555 palettes
//   subanim            : u32 table → entries [oamList, ticks, flags]
//   oam                : u32 table → 5-byte entries [tile, x, y, size|hflip 0x40|vflip 0x80, shape], 0xFF×5 ends
const SIZES = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
];

const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const u16 = (b, o) => b[o] | b[o + 1] << 8;
const s8 = v => v > 127 ? v - 256 : v;

export function sequenceCount(data, block) { return data[block + 3]; }

export function frameRecord(data, block, seq, index) {
  const base = block + 4;
  const f = base + u32(data, base + 4 * seq) + index * 20;
  return {
    tiles: base + u32(data, f), palettes: base + u32(data, f + 4),
    subanim: base + u32(data, f + 8), oam: base + u32(data, f + 12),
    ticks: u16(data, f + 16), flags: u16(data, f + 18),
  };
}

export function sequenceFrames(data, block, seq) {
  const frames = [];
  for (let i = 0; i < 64; i++) {
    const rec = frameRecord(data, block, seq, i);
    frames.push(rec);
    if (rec.flags & 0x80) break;
  }
  return frames;
}

function oamEntries(data, oamTable, list) {
  let p = oamTable + u32(data, oamTable + 4 * list);
  const out = [];
  for (let n = 0; n < 128; n++, p += 5) {
    if (data[p] === 0xFF && data[p + 1] === 0xFF && data[p + 2] === 0xFF && data[p + 3] === 0xFF && data[p + 4] === 0xFF) break;
    out.push({ tile: data[p], x: s8(data[p + 1]), y: s8(data[p + 2]), size: data[p + 3], shape: data[p + 4] });
  }
  return out;
}

export function subanimFirstList(data, rec) {
  return data[rec.subanim + u32(data, rec.subanim)];
}

// clearFrom: palette entries from this index are left transparent (fillers the game supplies from elsewhere).
export function decodeFrame(data, rec, { palette = 0, oamList = subanimFirstList(data, rec), clearFrom = 16 } = {}) {
  const tileBytes = u32(data, rec.tiles);
  const tiles = rec.tiles + 4;
  const colors = [];
  for (let i = 0; i < 16; i++) {
    const c = u16(data, rec.palettes + 4 + 2 * (16 * palette + i));
    colors.push([(c & 31) * 255 / 31 | 0, (c >> 5 & 31) * 255 / 31 | 0, (c >> 10 & 31) * 255 / 31 | 0]);
  }
  const ents = oamEntries(data, rec.oam, oamList);
  if (!ents.length) return { width: 1, height: 1, originX: 0, originY: 0, rgba: new Uint8ClampedArray(4), ticks: rec.ticks, flags: rec.flags };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of ents) {
    const [w, h] = SIZES[e.shape & 3][e.size & 3];
    x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + w); y1 = Math.max(y1, e.y + h);
  }
  const width = x1 - x0, height = y1 - y0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const e of ents) {
    const [w, h] = SIZES[e.shape & 3][e.size & 3];
    const hf = e.size & 0x40, vf = e.size & 0x80;
    let n = 0;
    for (let ty = 0; ty < h / 8; ty++) for (let tx = 0; tx < w / 8; tx++, n++) {
      const t = tiles + (e.tile + n) * 32;
      if ((e.tile + n) * 32 >= tileBytes) continue;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const byte = data[t + py * 4 + (px >> 1)];
        const v = px & 1 ? byte >> 4 : byte & 15;
        if (!v || v >= clearFrom) continue;
        let X = tx * 8 + px, Y = ty * 8 + py;
        if (hf) X = w - 1 - X;
        if (vf) Y = h - 1 - Y;
        const o = ((e.y - y0 + Y) * width + (e.x - x0 + X)) * 4;
        rgba[o] = colors[v][0]; rgba[o + 1] = colors[v][1]; rgba[o + 2] = colors[v][2]; rgba[o + 3] = 255;
      }
    }
  }
  return { width, height, originX: -x0, originY: -y0, rgba, ticks: rec.ticks, flags: rec.flags };
}

// Resolves a registry entry to the byte array and block offset to decode from.
export function openBlock(rom, entry, lz77) {
  const offset = parseInt(entry.offset, 16);
  if (entry.compression === 'lz77') return { data: lz77(rom, offset), block: 4 };
  return { data: rom, block: offset };
}
