// CHIP FOLDER and FOLDER EDIT, drawn with the BN6 screens decoded from the ROM (bank.menus) plus the
// chip art, battle text font, code letters, element icons and digits already decoded for battle.
// Folder rules from the ROM: 30 chips; copies of one chip limited by its MB (sub_8135500: ≤19 MB → 5,
// ≤29 → 4, ≤39 → 3, ≤49 → 2, else 1); one of each MegaChip / GigaChip (CompText86CF1A8). The overall
// Mega / Giga caps and the Regular memory are Navi stats; their starting values (MegaLevel 5, GigaLevel 1,
// RegUP 4 MB) are set by initNaviStats_WithDefaultStatsMaybe_8013438. A chip can be the folder's Regular only
// if its MB ≤ the Regular memory (sub_8134A00); each folder's Regular index is Navi stat 0x2E + folder (0xFF = none).
import CHIPDATA from '../../data/bn6-chips.mjs';

const STORE = 'pet.folders.v1';
export const FOLDER_SIZE = 30;
export const MEGA_CAP = 5, GIGA_CAP = 1, REG_MEMORY = 4; // starting Navi stats (rom-verified, 0x8013438)
const CHIPS = CHIPDATA.chips;
const byName = new Map(CHIPS.filter(c => c.name).map(c => [c.name, c]));

export const copyLimit = mb => mb <= 19 ? 5 : mb <= 29 ? 4 : mb <= 39 ? 3 : mb <= 49 ? 2 : 1;
const ELEMENT_INDEX = { fire: 0, aqua: 1, elec: 2, wood: 3, plus: 4, sword: 5, cursor: 6, obstacle: 7, wind: 8, break: 9, none: 10 };
const CODE_INDEX = c => c === '*' ? 26 : c.charCodeAt(0) - 65;

// Sorting, as the game does it (list entries built by sub_811FCB8, sorted by sub_8120018 with the shell sorts
// sub_30069A8 ascending / sub_3006A5E descending). Each key is the high half of a word whose low half is
// chip << 7 | code, so ties fall back to chip then code (kept ascending when the key sorts descending).
// Keys, in the sort menu's order: ID (id_sort_pos), ABCDE (alphabet_sort_pos), Code, Attack (sub_811FF80),
// Element (byte_811FF60), No. (copies of that chip + code), MB; key 7 (chip + code) is the opening order.
export const SORTS = ['ID', 'ABCDE', 'Code', 'Attack', 'Element', 'No.', 'MB'];
export const SORT_DESC = [false, false, false, true, false, true, false]; // first pick: byte_30069A0[mode] ^ 4 (0x81347F8)
const ELEMENT_ORDER = [0, 1, 2, 3, 8, 4, 6, 7, 5, 9, 10];
const attackKey = d => d.flags & 0x10 ? 1 : d.flags & 2 ? (d.damage > 999 ? d.tiers?.[0] ?? 0 : d.damage) : 5;
const low = ([name, code]) => ((byName.get(name)?.id ?? 0) << 7) | CODE_INDEX(code);
export function sortChips(list, mode, desc = false) {
  const count = new Map(); for (const c of list) count.set(c.join(), (count.get(c.join()) || 0) + 1);
  const key = c => {
    const d = byName.get(c[0]);
    return [d.order, d.abc, CODE_INDEX(c[1]), attackKey(d), ELEMENT_ORDER[ELEMENT_INDEX[d.icon] ?? 10], count.get(c.join()), d.mb, 0][mode];
  };
  const k = list.map(c => [c, key(c), low(c)]);
  k.sort((a, b) => (desc ? b[1] - a[1] : a[1] - b[1]) || a[2] - b[2]);
  return k.map(x => x[0]);
}
// The Pack: every standard, Mega and Giga chip in each of its codes, in the game's opening order (key 7).
export const PACK = sortChips(CHIPS.filter(c => c.name && ['standard', 'mega', 'giga'].includes(c.class) && c.codes.length && c.library)
  .flatMap(c => c.codes.map(code => [c.name, code])), 7);

export function loadFolders(defaultFolder) {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s?.folders?.length) return s; } catch {}
  return { equipped: 0, folders: [{ name: 'LanFldr', chips: defaultFolder.map(c => [...c]) }, null, null] };
}
export const saveFolders = f => { try { localStorage.setItem(STORE, JSON.stringify(f)); } catch {} };
export const equippedFolder = f => (f.folders[f.equipped] || f.folders[0]).chips;
export const equippedRegular = f => (f.folders[f.equipped] || f.folders[0]).reg ?? null;
export const equippedTag = f => (f.folders[f.equipped] || f.folders[0]).tag ?? null;
export const TAG_MEMORY = 60; // two tagged chips may total at most 60 MB (sub_81349E8: 0x3C − tagged MB ≥ chip MB)
// Select on a folder chip: make it the Regular (again to clear it). Returns a message when not allowed.
export function setRegular(folder, i) {
  if (folder.reg === i) { folder.reg = null; return null; }
  const d = byName.get(folder.chips[i]?.[0]);
  if (!d) return null;
  if (folder.tag?.includes(i)) return 'A Tag chip can\'t\nbe your Regular.';
  if (d.mb > REG_MEMORY) return `This chip is too\nbig for your\nRegular memory.`;
  folder.reg = i; return null;
}

// Tag on folder slot i: the first pick waits (`pending`), the second makes the pair (sub_8133D64).
// Tag on a chip that is already tagged clears the pair. Returns { pending, msg }.
export function setTag(folder, i, pending = null) {
  if (folder.tag?.includes(i)) { folder.tag = null; return { pending: null, msg: null }; }
  if (folder.reg === i) return { pending, msg: 'Your Regular chip\ncan\'t be tagged.' };
  const mb = j => byName.get(folder.chips[j]?.[0])?.mb ?? 99;
  if (pending == null || pending === i) {
    if (mb(i) > TAG_MEMORY) return { pending: null, msg: `Tag chips can total\nup to ${TAG_MEMORY} MB.` };
    return { pending: i, msg: null };
  }
  if (mb(pending) + mb(i) > TAG_MEMORY) return { pending, msg: `Tag chips can total\nup to ${TAG_MEMORY} MB.` };
  folder.tag = [pending, i]; return { pending: null, msg: null };
}

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

const ROWS = 7, ROW_H = 16;

export function createFolderUI({ getBank, folders, onExit }) {
  let view = 'folders', slot = folders.equipped, page = 0, msg = null, msgT = 0;
  const pos = [{ top: 0, cur: 0 }, { top: 0, cur: 0 }]; // folder page, pack page
  let held = null; // { side, index }
  let sortOpen = false, sortCur = 0, pack = PACK.slice();
  let choice = null, tagPending = null; // Select: the Regular / Tag choice (the game's script 0xA)
  const sorted = [{ mode: -1, desc: false }, { mode: -1, desc: false }]; // last sort per side (S2001c04 in the game)
  const chips = () => folders.folders[slot]?.chips || [];
  const list = side => side === 0 ? chips() : pack;
  function applySort(side, mode) {
    const S = sorted[side];
    S.desc = S.mode === mode ? !S.desc : SORT_DESC[mode]; S.mode = mode; // the same choice again reverses it
    if (side === 1) { pack = sortChips(pack, mode, S.desc); return; }
    const F = folders.folders[slot], regChip = F.reg != null ? F.chips[F.reg] : null, tagChips = F.tag?.map(i => F.chips[i]);
    F.chips = sortChips(F.chips, mode, S.desc);
    if (regChip) F.reg = F.chips.indexOf(regChip); // the Regular and Tag chips follow their chips
    if (tagChips) F.tag = tagChips.map(c => F.chips.indexOf(c));
    tagPending = null;
    saveFolders(folders);
  }
  const say = t => { msg = t; msgT = 0; };

  function input(k) {
    if (msg) { if (k === 'a' || k === 'b') msg = null; return; }
    if (view === 'folders') {
      if (k === 'left') slot = Math.max(0, slot - 1);
      else if (k === 'right') slot = Math.min(2, slot + 1);
      else if (k === 'r' || k === 'l') { if (folders.folders[slot]) { folders.equipped = slot; saveFolders(folders); } }
      else if (k === 'a') {
        if (!folders.folders[slot]) { folders.folders[slot] = { name: `Folder${slot + 1}`, chips: folders.folders[0].chips.map(c => [...c]) }; saveFolders(folders); }
        view = 'edit'; page = 0; held = null; sortOpen = false; pos[0].top = pos[0].cur = 0;
        pack = PACK.slice(); sorted[1].mode = -1; // the Pack opens in chip order (key 7), as in the game
      } else if (k === 'b') onExit();
      return;
    }
    if (choice) {
      if (k === 'up' || k === 'down') choice.cur ^= 1;
      else if (k === 'b' || k === 'select') choice = null;
      else if (k === 'a') {
        const F = folders.folders[slot], { at, cur } = choice; choice = null;
        if (cur === 0) { const why = setRegular(F, at); if (why) say(why); }
        else { const r = setTag(F, at, tagPending); tagPending = r.pending; if (r.msg) say(r.msg); }
        saveFolders(folders);
      }
      return;
    }
    if (k === 'start' && !held) { sortOpen = !sortOpen; sortCur = Math.max(0, sorted[page].mode); return; }
    if (sortOpen) {
      if (k === 'up') sortCur = (sortCur + SORTS.length - 1) % SORTS.length;
      else if (k === 'down') sortCur = (sortCur + 1) % SORTS.length;
      else if (k === 'a') applySort(page, sortCur);
      else if (k === 'b') sortOpen = false;
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
    else if (k === 'select' && page === 0 && !held) choice = { at: P.cur, cur: 0 };
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
    const fi = side === 0 ? i : held.index, pi = side === 1 ? i : held.index, chip = pack[pi];
    const why = folderRule(c, chip, fi);
    if (why) { say(why); held = null; return; }
    if (fi < c.length) c[fi] = [...chip]; else c.push([...chip]);
    const F = folders.folders[slot]; if (F.reg === fi && (byName.get(chip[0])?.mb ?? 99) > REG_MEMORY) F.reg = null;
    if (F.tag?.includes(fi) && F.tag.reduce((t, j) => t + (byName.get(c[j]?.[0])?.mb ?? 99), 0) > TAG_MEMORY) F.tag = null;
    if (tagPending === fi) tagPending = null;
    held = null; saveFolders(folders);
  }
  // Taps: rows select (a second tap acts as A); the right / left edge switches pages; folder slots on the CHIP FOLDER screen.
  function tap(x, y) {
    if (msg) { msg = null; return; }
    if (sortOpen) { // a tap on an option sorts by it; anywhere else closes the menu
      const mx = page === 0 ? 16 : 168, k = (y - 32) / 16 | 0;
      if (x >= mx && x < mx + 64 && y >= 32 && k < SORTS.length) { sortCur = k; applySort(page, k); } else sortOpen = false;
      return;
    }
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
  function regMemory(g, x, y) { // the Regular memory ("4MB") next to the folder name: a 2-digit field from x (0x8134514), then MB
    const M = getBank()?.menus; if (!M?.regDigits) return;
    const s = String(REG_MEMORY).padStart(2, ' ');
    for (let k = 0; k < 2; k++) if (s[k] !== ' ') g.drawImage(M.regDigits[+s[k]], x + 8 * k, y);
    g.drawImage(M.regMB, x + 16, y);
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
  // the game's cursor: 3 frames of 6 (dword_81331FC), at x 90 (folder) / 0 (Pack), y 32 + 16·row (sub_81345D4 / sub_81345E8)
  const frame3 = () => Math.floor(performance.now() / (1000 / 60) / 6) % 3;
  function cursor(g, x, y) { const M = getBank()?.menus; if (M?.cursor) g.drawImage(M.cursor[frame3()], x, y); else arrow(g, x + 4, y); }
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
        regMemory(g, 186, 55);
        f.chips.slice(0, 5).forEach((c, i) => row(g, c, 96, 65 + i * ROW_H, false));
      }
    } else {
      g.drawImage(M.folderEdit, 0, 0);
      g.drawImage(M.folderPanel, page * 240, 0, 240, 136, 0, 16, 240, 136);
      const lx = page === 0 ? 104 : 8, L = list(page), P = pos[page];
      text(g, null, page === 0 ? folders.folders[slot].name : 'Pack', 104, 16);
      if (M.countBox) g.drawImage(M.countBox.image, 212 - M.countBox.originX, 12 - M.countBox.originY);
      if (page === 0) text(g, '#a8f0f0', `${chips().length}/${FOLDER_SIZE}`, 191, 3);
      for (let r = 0; r < ROWS; r++) {
        const i = P.top + r; if (i >= L.length) break;
        row(g, L[i], lx, 32 + r * ROW_H, held && held.side === page && held.index === i);
      }
      const reg = folders.folders[slot]?.reg;
      if (page === 0 && M.regFrame && reg != null && reg >= P.top && reg < P.top + ROWS) // the game's REG frame sprite (x 165, y 40 + 16·row, origin 69,8)
        g.drawImage(M.regFrame.image, 165 - M.regFrame.originX, 40 + 16 * (reg - P.top) - M.regFrame.originY);
      const F0 = folders.folders[slot], tags = [...(F0?.tag || []), ...(tagPending != null ? [tagPending] : [])];
      if (page === 0 && M.tagFrame) for (const t of tags) if (t >= P.top && t < P.top + ROWS) // the game's TAG frame (blob 0x203526C seq 1)
        g.drawImage(M.tagFrame.image, 165 - M.tagFrame.originX, 40 + 16 * (t - P.top) - M.tagFrame.originY);
      if (page === 0) regMemory(g, 194, 22);
      cursor(g, page === 0 ? 90 : 0, 32 + (P.cur - P.top) * ROW_H);
      if (M.pageArrow) { // page arrows (sub_8134594 at x 231 on the folder page; sub_81345B0, flipped, at 243 − 240 on the Pack)
        const a = M.pageArrow[frame3()];
        if (page === 0) g.drawImage(a, 231, 22);
        else { g.save(); g.translate(3 + 8, 22); g.scale(-1, 1); g.drawImage(a, 0, 0); g.restore(); }
      }
      if (L.length > ROWS) { // scroll thumb: x 226 / 0x182 − 240, y 28 + top·100 / (count − 7) (sub_8134538 / sub_8134548 → sub_811FA98)
        const ty = 28 + Math.floor(P.top * 100 / (L.length - ROWS)), tx = page === 0 ? 226 : 146;
        if (M.scrollThumb) g.drawImage(M.scrollThumb, tx, ty); else { g.fillStyle = '#f0f8f8'; g.fillRect(tx + 2, ty, 4, 16); }
      }
      card(g, L[P.cur], page === 0 ? 8 : 156, 18);
      if (sortOpen && M.sortMenu) { // the game's SORT window (BG0 column 2 on the folder page, 21 on the Pack)
        const mx = page === 0 ? 16 : 168;
        g.drawImage(M.sortMenu, mx, 16);
        cursor(g, mx - 8, 32 + 16 * sortCur);
      }
    }
    if (choice) { // Select: Regular / Tag (the game asks the same in its text box)
      g.fillStyle = 'rgba(8,24,48,.92)'; g.fillRect(16, 104, 208, 52); g.strokeStyle = '#a8d8f8'; g.strokeRect(16.5, 104.5, 207, 51);
      text(g, null, 'Regular', 40, 108); text(g, null, 'Tag', 40, 128);
      cursor(g, 22, 108 + 20 * choice.cur);
    }
    if (msg) { // message box in the battle text font
      g.fillStyle = 'rgba(8,24,48,.92)'; g.fillRect(16, 104, 208, 52); g.strokeStyle = '#a8d8f8'; g.strokeRect(16.5, 104.5, 207, 51);
      msg.split('\n').forEach((line, i) => text(g, null, line, 24, 106 + i * 15));
    }
    g.restore();
  }
  return { input, tap, draw, get view() { return view; } };
}
