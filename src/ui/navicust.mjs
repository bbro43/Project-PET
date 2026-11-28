// NAVICUSTOMIZER: the BN6 screen decoded from the ROM (bank.navicust), the game's board colours and rules
// (src/battle/navicust.mjs). Parts list on the right (names from the ROM), INFORMATION below it.
// INFORMATION: the game's descriptions. List: Up/Down pick, A take, Select compress (when the code is "entered": the app lets every part compress),
// Left to the board. Holding a part: D-pad move, L/R turn, A place, B put back.
// Board: A on a part → Move / Remove; Right (at the edge) or B back to the list. Start: RUN (checks, saves).
import { PROGRAMS, CROSSES, LAYOUTS, COMMAND_ROW, COLOR_NAMES, programOf, cellsOf, colorOf, gridOf, canPlace, run, stats } from '../battle/navicust.mjs';

const STORE = 'pet.navicust.v1';
export function loadNaviCust() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (Array.isArray(s?.parts)) return s; } catch {}
  return { parts: [] };
}
export const saveNaviCust = n => { try { localStorage.setItem(STORE, JSON.stringify({ parts: n.parts })); } catch {} };
export const naviStats = n => stats(n.parts);

// The list: every program in each of its colours, then the Cross parts.
const ENTRIES = [
  ...PROGRAMS.flatMap(p => p.variants.map(v => ({ id: p.id, variant: v.variant, color: v.color, name: p.name, plus: p.plus }))),
  ...CROSSES.map(c => ({ id: c.id, variant: 0, color: c.variants[0].color, name: c.short, cross: true })),
];
// Bug types by the Navi stat their effect sets (byte_813CC18): 1 ProcessingBug (0x31), 2 EmotionBug (0x24),
// 4 TurnsUntilCustBugActivates (0x63); the others' stats are unnamed in the disassembly, so they show as numbers.
const BUG_NAMES = ['', 'Processing', 'Emotion', '', 'Custom'];
const CELL = (x, y) => [3 + 20 * x, 19 + 20 * y]; // board cell (x, y) top-left on screen
const ROWS = 4;

export function createNaviCustUI({ getBank, navi, onExit }) {
  let mode = 'list', cur = 0, top = 0, held = null, heldFrom = null, bx = 3, by = 3, menu = 0, msg = null, compress = false;
  const say = t => { msg = t; };
  const layout = LAYOUTS[2];

  function input(k) {
    if (msg) { if (k === 'a' || k === 'b' || k === 'start') msg = null; return; }
    if (mode === 'list') {
      if (k === 'up') { cur = Math.max(0, cur - 1); if (cur < top) top = cur; }
      else if (k === 'down') { cur = Math.min(ENTRIES.length - 1, cur + 1); if (cur >= top + ROWS) top = cur - ROWS + 1; }
      else if (k === 'l') { cur = Math.max(0, cur - ROWS); top = Math.max(0, top - ROWS); }
      else if (k === 'r') { cur = Math.min(ENTRIES.length - 1, cur + ROWS); top = Math.max(0, Math.min(ENTRIES.length - ROWS, top + ROWS)); }
      else if (k === 'select') compress = !compress;
      else if (k === 'a') { const e = ENTRIES[cur]; held = { id: e.id, variant: e.variant, x: 3, y: 3, rot: 0, compressed: compress && !e.cross }; heldFrom = null; mode = 'place'; }
      else if (k === 'left') mode = 'board';
      else if (k === 'start') runCheck();
      else if (k === 'b') onExit();
      return;
    }
    if (mode === 'place') {
      const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
      if (step) { held.x = Math.max(-1, Math.min(7, held.x + step[0])); held.y = Math.max(-1, Math.min(7, held.y + step[1])); }
      else if (k === 'r' || k === 'l') held.rot = (held.rot + (k === 'r' ? 1 : 3)) & 3;
      else if (k === 'select' && !programOf(held.id).cross) held.compressed = !held.compressed;
      else if (k === 'a') {
        if (!canPlace(navi.parts, held, layout)) { say("It won't fit|there."); return; }
        navi.parts.push(held); held = null; mode = heldFrom ? 'board' : 'list'; saveNaviCust(navi);
      } else if (k === 'b') { if (heldFrom) navi.parts.push(heldFrom); held = null; mode = heldFrom ? 'board' : 'list'; }
      return;
    }
    if (mode === 'board') {
      const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
      if (step) { if (k === 'right' && bx >= 6) { mode = 'list'; return; } bx = Math.max(0, Math.min(6, bx + step[0])); by = Math.max(0, Math.min(6, by + step[1])); }
      else if (k === 'a') { if (gridOf(navi.parts)[by][bx]) { mode = 'menu'; menu = 0; } }
      else if (k === 'b') mode = 'list';
      else if (k === 'start') runCheck();
      return;
    }
    if (mode === 'menu') {
      if (k === 'up' || k === 'down') menu ^= 1;
      else if (k === 'b') mode = 'board';
      else if (k === 'a') {
        const i = gridOf(navi.parts)[by][bx] - 1; if (i < 0) { mode = 'board'; return; }
        const [p] = navi.parts.splice(i, 1);
        if (menu === 0) { held = { ...p }; heldFrom = p; mode = 'place'; } else mode = 'board';
        saveNaviCust(navi);
      }
    }
  }
  function runCheck() {
    const s = stats(navi.parts), bugs = s.run.levels.map((n, t) => n ? `${BUG_NAMES[t] ? BUG_NAMES[t] + ' bug' : 'Bug type ' + t} Lv${n}` : '').filter(Boolean);
    saveNaviCust(navi);
    say(bugs.length ? (s.bugStop ? 'RUN! BugStop|holds the bugs.' : `RUN! Bugs:|${bugs.slice(0, 3).join('|')}`) : `RUN! OK.|Programs: ${s.run.programs.length}|Plus Parts: ${s.run.plus.length}`);
  }
  function tap(x, y) {
    if (msg) { msg = null; return; }
    if (x >= 140 && y >= 22 && y < 22 + 16 * ROWS) { const i = top + ((y - 24) / 16 | 0); if (i === cur && mode === 'list') input('a'); else { cur = Math.min(ENTRIES.length - 1, Math.max(0, i)); mode = 'list'; } return; }
    const gx = Math.floor((x - 3) / 20), gy = Math.floor((y - 19) / 20);
    if (gx >= 0 && gx < 7 && gy >= 0 && gy < 7) {
      if (mode === 'place') { if (held.x === gx && held.y === gy) input('a'); else { held.x = gx; held.y = gy; } return; }
      bx = gx; by = gy; mode = 'board'; input('a'); return;
    }
    if (y < 16) input(mode === 'list' ? 'b' : 'start');
  }

  function text(g, str, x, y, color) {
    const T = getBank()?.custom?.text;
    if (!T) { g.fillStyle = color || '#fff'; g.font = '8px monospace'; g.fillText(str, x, y + 11); return; }
    const c = T(str);
    if (!color) { g.drawImage(c, x, y); return; }
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tg = t.getContext('2d'); tg.drawImage(c, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = color; tg.fillRect(0, 0, t.width, 9);
    g.drawImage(t, x, y);
  }
  const rgbOf = e => { const c = getBank()?.navicust?.colors[0][e.color] ?? 0x7fff; return `rgb(${(c & 31) << 3},${(c >> 5 & 31) << 3},${(c >> 10 & 31) << 3})`; };

  function draw(g) {
    const N = getBank()?.navicust;
    g.save(); g.imageSmoothingEnabled = false;
    if (!N) { g.fillStyle = '#000'; g.fillRect(0, 0, 240, 160); text(g, 'Import a BN6 ROM', 40, 70); g.restore(); return; }
    // board cells: installed parts, the held part highlighted
    const parts = navi.parts, grid = gridOf(parts);
    const cells = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => {
      const i = grid[y][x] - 1, frame = layout[y][x] === 3;
      if (i < 0) return { color: 0, frame };
      const P = programOf(parts[i].id);
      return { color: colorOf(parts[i]), plus: P.plus, frame: false, covered: frame };
    }));
    let fits = true;
    if (held) {
      const P = programOf(held.id); fits = canPlace(parts, held, layout);
      const blink = (performance.now() >> 7) & 1;
      for (const [x, y] of cellsOf(held)) if (x >= 0 && x < 7 && y >= 0 && y < 7 && layout[y][x])
        cells[y][x] = { color: colorOf(held), plus: P.plus, hi: fits || blink, frame: false };
    }
    g.drawImage(N.board(cells), 0, 0);
    // parts that sit off the board while held: outline only
    if (held) for (const [x, y] of cellsOf(held)) if (x >= 0 && x <= 6 && y >= 0 && y <= 6 && !layout[y][x]) { const [sx, sy] = CELL(x, y); g.strokeStyle = '#f04040'; g.strokeRect(sx + 1.5, sy + 1.5, 16, 16); } // corner cells: off the board
    // list
    for (let r = 0; r < ROWS; r++) {
      const i = top + r; if (i >= ENTRIES.length) break;
      const e = ENTRIES[i], y = 26 + 16 * r;
      if (i === cur) { g.fillStyle = mode === 'list' ? 'rgba(248,248,160,.55)' : 'rgba(248,248,248,.25)'; g.fillRect(142, y - 2, 94, 15); }
      g.fillStyle = rgbOf(e); g.fillRect(144, y + 2, 8, 8); g.strokeStyle = '#183048'; g.strokeRect(144.5, y + 2.5, 7, 7);
      if (e.plus) { g.fillStyle = 'rgba(24,48,72,.6)'; g.fillRect(147, y + 3, 2, 6); g.fillRect(145, y + 5, 6, 2); }
      text(g, e.name, 155, y);
    }
    g.fillStyle = '#f8f8f8'; g.fillRect(236, 26 + Math.round((16 * ROWS - 10) * cur / (ENTRIES.length - 1)), 2, 10); // list position
    // INFORMATION
    const e = held ? ENTRIES.find(x => x.id === held.id && x.variant === held.variant) : mode === 'list' ? ENTRIES[cur] : (() => { const i = gridOf(parts)[by][bx] - 1; return i >= 0 ? ENTRIES.find(x => x.id === parts[i].id && x.variant === parts[i].variant) : null; })();
    if (e) { // the game's description (CompText873ECC8), 3 lines of up to 8 characters
      const P = programOf(e.id), C = held?.compressed || (mode === 'list' && compress && !e.cross);
      P.info.slice(0, 3).forEach((l, i) => text(g, l, 150, 111 + 12 * i));
      if (C) text(g, 'C', 222, 111, '#f8f040');
    }
    // cursor on the board
    if (mode === 'board' || mode === 'menu') {
      const [sx, sy] = CELL(bx, by), f = N.cursor[(performance.now() / 100 | 0) % N.cursor.length];
      g.drawImage(f.image, sx + 9 - f.originX, sy + 9 - f.originY);
    }
    if (mode === 'menu') { const [sx, sy] = CELL(bx, by), m = N.menu; const mx = Math.min(240 - m.image.width, sx + 20), my = Math.min(160 - m.image.height, sy); g.drawImage(m.image, mx, my); g.fillStyle = '#f8f040'; g.fillRect(mx + 3, my + 4 + 10 * menu, 3, 5); }
    if (msg) {
      g.fillStyle = 'rgba(8,24,48,.94)'; g.fillRect(12, 96, 216, 60); g.strokeStyle = '#a8d8f8'; g.strokeRect(12.5, 96.5, 215, 59);
      msg.split('|').forEach((l, i) => text(g, l, 20, 99 + 14 * i));
    }
    g.restore();
  }
  return { input, tap, draw };
}
