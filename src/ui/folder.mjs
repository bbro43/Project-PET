// CHIP FOLDER and FOLDER EDIT, drawn with the BN6 screens decoded from the ROM (bank.menus) plus the
// chip art, battle text font, code letters, element icons and digits already decoded for battle.
// Folder rules from the ROM: 30 chips; copies of one chip limited by its MB (sub_8135500: ≤19 MB → 5,
// ≤29 → 4, ≤39 → 3, ≤49 → 2, else 1); one of each MegaChip / GigaChip (CompText86CF1A8). The overall
// Mega / Giga caps come from the Navi's stats in the game; 5 and 1 are the base values (recalled).
import CHIPDATA from '../../data/bn6-chips.mjs';

const STORE = 'pet.folders.v1';
export const FOLDER_SIZE = 30;
export const MEGA_CAP = 5, GIGA_CAP = 1; // recalled base values (Navi stats in the game)
const CHIPS = CHIPDATA.chips;
const byName = new Map(CHIPS.filter(c => c.name).map(c => [c.name, c]));

export const copyLimit = mb => mb <= 19 ? 5 : mb <= 29 ? 4 : mb <= 39 ? 3 : mb <= 49 ? 2 : 1;
// The Pack: every standard, Mega and Giga chip in each of its codes, in library (No.) order.
export const PACK = CHIPS.filter(c => c.name && ['standard', 'mega', 'giga'].includes(c.class) && c.codes.length && c.library)
  .sort((a, b) => (a.class === b.class ? 0 : a.class === 'standard' ? -1 : b.class === 'standard' ? 1 : a.class === 'mega' ? -1 : 1) || a.library - b.library)
  .flatMap(c => c.codes.map(code => [c.name, code]));

export function loadFolders(defaultFolder) {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s?.folders?.length) return s; } catch {}
  return { equipped: 0, folders: [{ name: 'LanFldr', chips: defaultFolder.map(c => [...c]) }, null, null] };
}
export const saveFolders = f => { try { localStorage.setItem(STORE, JSON.stringify(f)); } catch {} };
export const equippedFolder = f => (f.folders[f.equipped] || f.folders[0]).chips;

// Why adding `chip` to `chips` (with slot `skip` being replaced) would break a rule, or null.
export function folderRule(chips, chip, skip = -1) {
  const d = byName.get(chip[0]);
  if (!d) return 'Unknown chip.';
  const rest = chips.filter((_, i) => i !== skip);
  const same = rest.filter(c => c[0] === chip[0]).length;
  if (d.class === 'mega') { if (same) return 'You can only use\n1 of the same\nMegaChip.'; if (rest.filter(c => byName.get(c[0])?.class === 'mega').length >= MEGA_CAP) return `You can use only\n${MEGA_CAP} MegaChips.`; }
  if (d.class === 'giga') { if (same) return 'You can only use\n1 of the same\nGigaChip.'; if (rest.filter(c => byName.get(c[0])?.class === 'giga').length >= GIGA_CAP) return `You can use only\n${GIGA_CAP} GigaChips.`; }
  if (same >= copyLimit(d.mb)) return `The total capacity\nfor this chip is\n${copyLimit(d.mb)}.`;
  return null;
}

const ELEMENT_INDEX = { fire: 0, aqua: 1, elec: 2, wood: 3, plus: 4, sword: 5, cursor: 6, obstacle: 7, wind: 8, break: 9, none: 10 };
const CODE_INDEX = c => c === '*' ? 26 : c.charCodeAt(0) - 65;
const ROWS = 7, ROW_H = 16;

export function createFolderUI({ getBank, folders, onExit }) {
  let view = 'folders', slot = folders.equipped, page = 0, msg = null, msgT = 0;
  const pos = [{ top: 0, cur: 0 }, { top: 0, cur: 0 }]; // folder page, pack page
  let held = null; // { side, index }
  const chips = () => folders.folders[slot]?.chips || [];
  const list = side => side === 0 ? chips() : PACK;
  const say = t => { msg = t; msgT = 0; };

  function input(k) {
    if (msg) { if (k === 'a' || k === 'b') msg = null; return; }
    if (view === 'folders') {
      if (k === 'left') slot = Math.max(0, slot - 1);
      else if (k === 'right') slot = Math.min(2, slot + 1);
      else if (k === 'r' || k === 'l') { if (folders.folders[slot]) { folders.equipped = slot; saveFolders(folders); } }
      else if (k === 'a') {
        if (!folders.folders[slot]) { folders.folders[slot] = { name: `Folder${slot + 1}`, chips: folders.folders[0].chips.map(c => [...c]) }; saveFolders(folders); }
        view = 'edit'; page = 0; held = null; pos[0].top = pos[0].cur = 0;
      } else if (k === 'b') onExit();
      return;
    }
    const P = pos[page], n = list(page).length;
    if (k === 'up') { P.cur = Math.max(0, P.cur - 1); if (P.cur < P.top) P.top = P.cur; }
    else if (k === 'down') { P.cur = Math.min(n - 1, P.cur + 1); if (P.cur >= P.top + ROWS) P.top = P.cur - ROWS + 1; }
    else if (k === 'l') { P.cur = Math.max(0, P.cur - ROWS); P.top = Math.max(0, P.top - ROWS); }
    else if (k === 'r') { P.cur = Math.min(n - 1, P.cur + ROWS); P.top = Math.max(0, Math.min(n - ROWS, P.top + ROWS)); }
    else if (k === 'right' && page === 0) page = 1;
    else if (k === 'left' && page === 1) page = 0;
    else if (k === 'a') pick();
    else if (k === 'b') {
      if (held) { held = null; return; }
      if (chips().length !== FOLDER_SIZE) { say(`The folder needs\n${FOLDER_SIZE} chips.`); return; }
      saveFolders(folders); view = 'folders';
    }
  }
  // A: pick up a chip, then A on a chip on the other side swaps it in (the Pack never runs out here).
  function pick() {
    const side = page, i = pos[page].cur, c = chips();
    if (!held || held.side === side) { held = { side, index: i }; return; }
    const fi = side === 0 ? i : held.index, pi = side === 1 ? i : held.index, chip = PACK[pi];
    const why = folderRule(c, chip, fi);
    if (why) { say(why); held = null; return; }
    if (fi < c.length) c[fi] = [...chip]; else c.push([...chip]);
    held = null; saveFolders(folders);
  }
  // Taps: rows select (a second tap acts as A); the right / left edge switches pages; folder slots on the CHIP FOLDER screen.
  function tap(x, y) {
    if (msg) { msg = null; return; }
    if (view === 'folders') {
      if (y >= 16 && y < 48) { const s = Math.min(2, Math.max(0, (x - 13) / 72 | 0)); if (s === slot) input('a'); else slot = s; }
      else if (y < 16) onExit();
      return;
    }
    const lx = page === 0 ? 104 : 8;
    if (y >= 32 && y < 32 + ROWS * ROW_H && x >= lx && x < lx + 128) {
      const i = pos[page].top + ((y - 32) / ROW_H | 0);
      if (i < list(page).length) { if (i === pos[page].cur) pick(); else pos[page].cur = i; }
    } else if (page === 0 && x >= 160 && y < 32) page = 1;
    else if (page === 1 && x < 80 && y < 32) page = 0;
    else if (y < 16) input('b');
  }

  function text(g, M, str, x, y, color) { // the battle text font (8 px apart); tinted when a colour is given
    const T = getBank()?.custom?.text;
    if (!T) { g.fillStyle = color || '#fff'; g.font = '8px monospace'; g.fillText(str, x, y + 11); return; }
    const c = T(str);
    if (!color) { g.drawImage(c, x, y); return; }
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tg = t.getContext('2d'); tg.drawImage(c, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = color; tg.fillRect(0, 0, t.width, 9);
    g.drawImage(t, x, y);
  }
  function row(g, chip, x, y, selected) { // icon · name · element · code · MB (positions from the owner's screenshot)
    const b = getBank(), d = byName.get(chip[0]);
    const icon = b?.chips?.icon(d?.id); if (icon) g.drawImage(icon, x + 1, y);
    text(g, null, chip[0], x + 18, y);
    if (b?.custom) g.drawImage(b.custom.element(ELEMENT_INDEX[d?.icon] ?? 10, 0), x + 80, y);
    text(g, null, chip[1], x + 97, y);
    mb(g, d?.mb, x + 122, y);
    if (selected) { g.fillStyle = 'rgba(255,200,40,.35)'; g.fillRect(x, y, 122, ROW_H); }
  }
  function plain(g, str, x, y) { // description text: the font's light strokes only (no outline), in dark grey
    const T = getBank()?.custom?.text; if (!T) return text(g, null, str, x, y);
    const c = T(str), t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tg = t.getContext('2d'); tg.drawImage(c, 0, 0);
    const im = tg.getImageData(0, 0, t.width, t.height), D = im.data;
    for (let p = 0; p < D.length; p += 4) {
      if (D[p] + D[p + 1] + D[p + 2] > 480) { D[p] = 72; D[p + 1] = 72; D[p + 2] = 80; } else D[p + 3] = 0;
    }
    tg.putImageData(im, 0, 0); g.drawImage(t, x, y);
  }
  function mb(g, v, right, y) { // the game's small yellow MB digits, with the small "MB" label under them, right-aligned
    const M = getBank()?.menus; if (v == null) return;
    if (!M?.smallDigits) { text(g, '#f8e030', `${v}MB`, right - 24, y); return; }
    const s = String(v);
    for (let k = 0; k < s.length; k++) g.drawImage(M.smallDigits[+s[k]], right - 8 * (s.length - k), y);
    g.drawImage(M.mbLabel, right - 16, y + 8);
  }
  function card(g, chip, x, y) { // the ROM chip card, with the chip's picture, code letter, element and power
    const b = getBank(), M = b.menus, d = chip && byName.get(chip[0]);
    g.drawImage(M.card.image, x, y);
    if (!d) return;
    const pic = b.chips?.picture(d.id); if (pic) g.drawImage(pic, x + 13, y + 6);
    const cls = { standard: 0, mega: 1, giga: 2 }[d.class] ?? 0;
    if (b.custom) {
      g.drawImage(b.custom.letter(CODE_INDEX(chip[1]), cls), x + 13, y + 56);
      g.drawImage(b.custom.element(ELEMENT_INDEX[d.icon] ?? 10, cls), x + 24, y + 56);
      const dmg = d.damage ? String(d.damage) : '';
      for (let k = 0; k < dmg.length; k++) g.drawImage(b.custom.digit(+dmg[k], cls), x + 69 - 8 * (dmg.length - k), y + 56);
    }
    const lines = M.describe?.(d.id);
    if (lines?.some(l => l.trim())) lines.slice(0, 3).forEach((l, i) => plain(g, l, x + 6, y + 70 + 16 * i));
    else { text(g, null, d.name, x + 6, y + 78); mb(g, d.mb, x + 70, y + 94); }
  }
  function arrow(g, x, y) { g.fillStyle = (performance.now() >> 8) & 1 ? '#f8a020' : '#f8c040'; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + 8, y + 8); g.lineTo(x, y + 14); g.fill(); }

  function draw(g) {
    const b = getBank(), M = b?.menus;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, 240, 160);
    if (!M) { g.fillStyle = '#fff'; g.font = '10px monospace'; g.fillText('Import a BN6 ROM to edit folders.', 8, 80); g.restore(); return; }
    if (view === 'folders') {
      g.drawImage(M.chipFolder, 0, 0);
      const cx = 13 + 72 * slot; // selected slot: light-blue fill with blinking bracket corners
      g.fillStyle = '#2880c8'; g.fillRect(cx + 1, 21, 69, 24); g.fillStyle = '#48c8f8'; g.fillRect(cx + 2, 22, 67, 20);
      g.fillStyle = (performance.now() >> 8) & 1 ? '#f89818' : '#f8c040';
      for (const [px, py, dx, dy] of [[cx - 1, 19, 1, 1], [cx + 72, 19, -1, 1], [cx - 1, 46, 1, -1], [cx + 72, 46, -1, -1]]) {
        g.fillRect(dx > 0 ? px : px - 7, dy > 0 ? py : py - 3, 7, 3); g.fillRect(dx > 0 ? px : px - 3, dy > 0 ? py : py - 7, 3, 7);
      }
      folders.folders.forEach((f, i) => {
        const x = 13 + 72 * i;
        if (f) text(g, null, f.name, x + 4, 26);
        if (i === folders.equipped && f) { // EQUIP pill: orange rim, dark fill
          g.fillStyle = '#f89818'; g.fillRect(x + 15, 15, 37, 10); g.fillRect(x + 14, 16, 39, 8);
          g.fillStyle = '#184048'; g.fillRect(x + 16, 16, 35, 8); g.fillRect(x + 15, 17, 37, 6);
          text(g, '#40f060', 'EQUIP', x + 15, 13);
        }
      });
      const f = folders.folders[slot];
      if (f) {
        text(g, null, f.name, 96, 49);
        f.chips.slice(0, 5).forEach((c, i) => row(g, c, 96, 65 + i * ROW_H, false));
      }
    } else {
      g.drawImage(M.folderEdit, 0, 0);
      g.drawImage(M.folderPanel, page * 240, 0, 240, 136, 0, 16, 240, 136);
      const lx = page === 0 ? 104 : 8, L = list(page), P = pos[page];
      text(g, null, page === 0 ? folders.folders[slot].name : 'Pack', 104, 16);
      if (page === 0) text(g, '#80f0a0', `${chips().length}/${FOLDER_SIZE}`, 186, 2);
      for (let r = 0; r < ROWS; r++) {
        const i = P.top + r; if (i >= L.length) break;
        row(g, L[i], lx, 32 + r * ROW_H, held && held.side === page && held.index === i);
      }
      arrow(g, lx - 10, 32 + (P.cur - P.top) * ROW_H);
      const sb = 32 + Math.round((ROWS * ROW_H - 12) * (P.cur / Math.max(1, L.length - 1)));
      g.fillStyle = '#f0f8f8'; g.fillRect(page === 0 ? 229 : 133, sb, 4, 12);
      card(g, L[P.cur], page === 0 ? 8 : 156, 18);
    }
    if (msg) { // message box in the battle text font
      g.fillStyle = 'rgba(8,24,48,.92)'; g.fillRect(16, 104, 208, 52); g.strokeStyle = '#a8d8f8'; g.strokeRect(16.5, 104.5, 207, 51);
      msg.split('\n').forEach((line, i) => text(g, null, line, 24, 106 + i * 15));
    }
    g.restore();
  }
  return { input, tap, draw, get view() { return view; } };
}
