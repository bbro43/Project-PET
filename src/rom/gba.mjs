// Identifies supported Battle Network ROMs by GBA header game code.
// SHA-1 values were measured from the US ROMs used to build the registry;
// a different hash is accepted but flagged so offsets can be double-checked.
import { listZip, readZipEntry } from './zip.mjs';

export const GAMES = {
  B4WE: { id: 'bn4rs', title: 'Battle Network 4 Red Sun', series: 4, sha1: 'a97e96a7da03abd70f7953328e511b9fa29179f1' },
  B4BE: { id: 'bn4bm', title: 'Battle Network 4 Blue Moon', series: 4, sha1: '5e017c803ddc768efb8010314b46bc17e9757f71' },
  BRBE: { id: 'bn5tp', title: 'Battle Network 5 Team ProtoMan', series: 5, sha1: 'b3774e96b1f107bb8b1db79b216be41b9bc5bac0' },
  BRKE: { id: 'bn5tc', title: 'Battle Network 5 Team Colonel', series: 5, sha1: '5f472f78d8de2df01d5039e045c043cb40969a39' },
  BR5E: { id: 'bn6g', title: 'Battle Network 6 Cybeast Gregar', series: 6, sha1: '89fe0bac4fd3d2ab1d2ca35e87ef8b1294a84cd6' },
  BR6E: { id: 'bn6f', title: 'Battle Network 6 Cybeast Falzar', series: 6, sha1: '0676ecd4d58a976af3346caebb44b9b6489ad099' },
};

export function identify(rom) {
  if (rom.length < 0xC0) return null;
  const code = String.fromCharCode(...rom.subarray(0xAC, 0xB0));
  const game = GAMES[code];
  return game ? { code, ...game } : null;
}

export async function sha1Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Accepts a .gba file or a .zip containing one or more .gba files.
export async function extractRoms(bytes) {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return [bytes];
  const out = [];
  for (const entry of listZip(bytes)) {
    if (/\.gba$/i.test(entry.name)) out.push(await readZipEntry(bytes, entry));
  }
  return out;
}
