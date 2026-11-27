// Chip art decoded from the ROM: the 16×16 icon and the 56×48 picture of each chip.
// The chip table (ChipDataArr) holds pointers to the icon tiles, picture tiles and picture palette;
// icons share one palette. Offsets: data/registry.json "chipart".
const hex = s => parseInt(s, 16);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const palette = (rom, o) => Array.from({ length: 16 }, (_, i) => { const c = u16(rom, o + 2 * i); return [(c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3]; });

// Pure decode: RGBA for a chip's icon (16×16, colour 0 clear) or picture (56×48, opaque).
export function decodeChipArt(rom, src) {
  const table = hex(src.table), size = 0x2C, iconPal = palette(rom, hex(src.iconPalette));
  const ptr = (id, k) => u32(rom, table + id * size + 0x20 + 4 * k) & 0x1FFFFFF;
  function tiles(off, tw, th, pal, clear) {
    const w = tw * 8, h = th * 8, rgba = new Uint8ClampedArray(w * h * 4);
    for (let t = 0; t < tw * th; t++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = (rom[off + t * 32 + y * 4 + (x >> 1)] >> ((x & 1) * 4)) & 15;
      if (clear && !v) continue;
      const p = (((t / tw | 0) * 8 + y) * w + (t % tw) * 8 + x) * 4, c = pal[v];
      rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255;
    }
    return { rgba, width: w, height: h };
  }
  return {
    count: src.count,
    icon: id => tiles(ptr(id, 0), 2, 2, iconPal, true),
    picture: id => tiles(ptr(id, 1), 7, 6, palette(rom, ptr(id, 2)), false),
  };
}

export function buildChipArt(rom, src) {
  const d = decodeChipArt(rom, src), cache = new Map();
  const canvas = f => { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').putImageData(new ImageData(f.rgba, f.width, f.height), 0, 0); return c; };
  const get = (kind, id) => { const k = kind + id; if (!cache.has(k)) cache.set(k, id > 0 && id < d.count ? canvas(d[kind](id)) : null); return cache.get(k); };
  return { icon: id => get('icon', id), picture: id => get('picture', id) };
}
