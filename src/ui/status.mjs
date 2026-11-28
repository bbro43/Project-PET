// STATUS: the BN6 screen decoded from the ROM (bank.menus.status; sub_8126B6C). Two pages side by side on BG2,
// Left / Right switch between them (the green page arrow):
//   MegaMan page: the HP box (OBJ digits, current / max), MegaMan in his box, BUSTER Attack / Speed / Charge LV
//   (Navi stats 1–3, shown + 1; text scripts 5–7) and the charge shot (script 11 "Pwr ChargeS").
//   Folder page: FOLDER Reg.Mem / MegaChip / GigaChip (stats 9, 0xB, 0xC; scripts 8–10) and PROGRM, the programs
//   installed in the Navi Customizer (names from TextScript873EA50), 4 at a time, L / R to scroll.
// The chatbox at the bottom is the game's (style 4, MegaMan's mugshot 0x37) with its line "Here is my status."
// Text is drawn with the battle text font; the game renders these lines with its menu font (not decoded yet).
import { frameAt } from '../rom/bank.mjs';
import { programOf } from '../battle/navicust.mjs';

const LINES = { attack: 'Attack LV', speed: 'Speed  LV', charge: 'Charge LV', reg: 'Reg.Mem ', mega: 'MegaChip ', giga: 'GigaChip ', shot: 'Pwr ChargeS', none: 'None', say: 'Here is my status.' };

export function createStatusUI({ getBank, navi, stats, onExit }) {
  let page = 0, scroll = 0, slide = 0, top = 0;
  const programs = () => [...new Set(navi.parts.map(p => programOf(p.id)).filter(P => P && !P.cross && !P.regUp).map(P => P.name))];

  function input(k) {
    if (k === 'left' && page === 1) page = 0;
    else if (k === 'right' && page === 0) page = 1;
    else if ((k === 'l' || k === 'r') && page === 1) top = Math.max(0, Math.min(Math.max(0, programs().length - 4), top + (k === 'r' ? 4 : -4)));
    else if (k === 'b') { page = 0; scroll = 0; onExit(); }
  }
  function tap(x, y) {
    if (y < 16) return onExit();
    if (x < 40) input('left'); else if (x > 200) input('right');
  }
  const tinted = new Map();
  function text(g, str, x, y, color) {
    const T = getBank()?.custom?.text;
    if (!T) { g.fillStyle = color || '#fff'; g.font = '8px monospace'; g.fillText(str, x, y + 11); return; }
    if (!color) { g.drawImage(T(str), x, y); return; }
    let c = tinted.get(color + str);
    if (!c) { // the chatbox prints dark text on white: the glyphs in one colour
      const src = T(str); c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const cg = c.getContext('2d'); cg.drawImage(src, 0, 0); cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = color; cg.fillRect(0, 0, c.width, c.height);
      tinted.set(color + str, c);
    }
    g.drawImage(c, x, y);
  }
  function draw(g) {
    const bank = getBank(), S = bank?.menus?.status;
    g.save(); g.imageSmoothingEnabled = false;
    if (!S) { g.fillStyle = '#000'; g.fillRect(0, 0, 240, 160); text(g, 'Import a BN6 ROM', 40, 70); g.restore(); return; }
    const s = stats(), want = page * 256;
    scroll += Math.sign(want - scroll) * Math.min(32, Math.abs(want - scroll)); // the pages slide (BG2 scroll)
    g.drawImage(S.frame, 0, 0);
    g.save(); g.translate(-scroll, 0);
    g.drawImage(S.pages, 0, 0);
    // MegaMan page
    const hpMax = 100 + s.hpPlus;
    g.drawImage(S.hpBox.left, 10, 16);
    for (let i = 1; i < 10; i++) g.drawImage(S.hpBox.fill, 10 + 8 * i, 16);
    g.save(); g.translate(10 + 8 * 11, 16); g.scale(-1, 1); g.drawImage(S.hpBox.left, 0, 0); g.restore();
    const num = (n, right) => String(n).split('').reverse().forEach((d, i) => g.drawImage(S.hpDigits[+d], right - 8 * (i + 1), 16));
    num(hpMax, 50); g.drawImage(S.hpDigits[10], 50, 16); num(hpMax, 90);
    const mm = bank.get?.('megaman'), idle = mm?.idle;
    if (idle) { const f = frameAt(idle, performance.now() / 16.7 | 0); g.drawImage(f.image, 56 - f.originX, 84 - f.originY); }
    [`${LINES.attack} ${s.attack + 1}`, `${LINES.speed} ${s.speed + 1}`, `${LINES.charge} ${s.charge + 1}`, LINES.shot].forEach((l, i) => text(g, l, 136, 24 + 16 * i));
    // Folder page
    const P = 256;
    [[LINES.reg, s.reg, true], [LINES.mega, s.mega], [LINES.giga, s.giga]].forEach(([l, n, mb], i) => {
      text(g, l.trim(), P + 24, 24 + 16 * i);
      const v = String(n), right = P + (mb ? 96 : 112);
      text(g, v, right - 8 * v.length, 24 + 16 * i);
      if (mb && bank.menus.regMB) g.drawImage(bank.menus.regMB, P + 98, 28 + 16 * i);
    });
    const names = programs();
    for (let i = 0; i < 4; i++) text(g, names[top + i] ?? LINES.none, P + 136, 24 + 16 * i);
    g.restore();
    // page arrow (sprite tiles 0x24E–0x250): right on the MegaMan page, left on the Folder page
    if (scroll === want) {
      const a = S.pageArrow[(performance.now() / 120 | 0) % 3];
      if (page === 0) g.drawImage(a, 230, 52);
      else { g.save(); g.translate(10, 52); g.scale(-1, 1); g.drawImage(a, 0, 0); g.restore(); }
    }
    // the chatbox (BG0 rows 12–19) with MegaMan's mugshot
    g.drawImage(S.chatbox, 0, 96);
    const face = bank.get?.('mugshotmegaman')?.face;
    if (face) { const f = face[0]; g.drawImage(f.image, 26 - f.originX, 130 - f.originY); }
    text(g, LINES.say, 52, 106, '#484048');
    g.restore();
  }
  return { input, tap, draw };
}
