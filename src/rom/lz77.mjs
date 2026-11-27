// GBA BIOS LZ77 (type 0x10) decompression.
export function lz77(rom, offset) {
  if (rom[offset] !== 0x10) throw new Error('Not LZ77 data at 0x' + offset.toString(16));
  const size = rom[offset + 1] | rom[offset + 2] << 8 | rom[offset + 3] << 16;
  const out = new Uint8Array(size);
  let i = offset + 4, n = 0;
  while (n < size) {
    const flags = rom[i++];
    for (let bit = 0; bit < 8 && n < size; bit++) {
      if (flags & (0x80 >> bit)) {
        const x = rom[i] << 8 | rom[i + 1]; i += 2;
        const len = (x >> 12) + 3, dist = (x & 0xFFF) + 1;
        if (dist > n) throw new Error('Bad LZ77 back-reference');
        for (let k = 0; k < len && n < size; k++, n++) out[n] = out[n - dist];
      } else out[n++] = rom[i++];
    }
  }
  return out;
}
