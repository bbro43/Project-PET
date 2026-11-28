// BN6 Navi Customizer rules, following the game's code (dism-exe/bn6f labels; data from data/bn6-navicust.mjs):
// placement sub_813BB00 / sub_813BB68, the RUN check sub_813BBD4 (command line sub_813BC1C, off the line
// sub_813BC98, same colours touching sub_813BD24, colour count sub_813BEA8, the frame sub_813C584), and the
// program effects applyNavicustPrograms_813C684 / navicust_jt_NCPs.
// The Cross parts are the app's own (owner decision): 1×1, colour-coded per Cross, picked like a program.
import NC from '../../data/bn6-navicust.mjs';

export const PROGRAMS = NC.parts;
export const LAYOUTS = NC.layouts;          // by Expand Memory count (0–2); the app uses the full board (2)
export const COMMAND_ROW = NC.commandLine;  // row 3 of the 7×7 grid
export const COLOR_NAMES = ['', 'White', 'Yellow', 'Pink', 'Red', 'Blue', 'Green'];
// Inner 5×5 (byte_813C640): only neighbours inside it count for the same-colour rule.
const INNER = (x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 5;

// Cross parts (app-made, owner decision): one per BN6 Cross, a 1×1 program in one of the game's six colours
// (1 white 2 yellow 3 pink 4 red 5 blue 6 green), so the colour rules apply to them like any program. Only the
// first one on the command line counts. `transformation` is the game's TF_ number.
const ONE = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
export const CROSSES = [
  ['HeatCross', 'HeatCros', 4, 1], ['ElecCross', 'ElecCros', 2, 2], ['SlashCross', 'SlshCros', 1, 3], ['EraseCross', 'ErasCros', 3, 4],
  ['ChargeCross', 'ChrgCros', 6, 5], ['SpoutCross', 'SpotCros', 5, 6], ['TomahawkCross', 'TmhkCros', 6, 7], ['TenguCross', 'TngCross', 4, 8],
  ['GroundCross', 'GrndCros', 2, 9], ['DustCross', 'DustCros', 1, 10],
].map(([name, short, color, tf]) => ({ id: `cross:${name}`, name, short, transformation: tf, cross: true, plus: false, group: 0, bug: 0,
  variants: [{ variant: 0, color }], shape: ONE, compressed: ONE, info: ['Fight as', name.replace('Cross', ''), 'Cross'] }));

const byId = new Map([...PROGRAMS.map(p => [p.id, p]), ...CROSSES.map(c => [c.id, c])]);
export const programOf = id => byId.get(id);

// The shape of an installed part: 7×7, compressed if its code was entered, turned 90° clockwise `rot` times
// (sub_813B7FC: input (r, c) → (c, 6 − r)).
export function shapeOf(part) {
  const P = byId.get(part.id);
  let s = (part.compressed ? P.compressed : P.shape).map(r => r.slice());
  for (let k = 0; k < (part.rot & 3); k++) s = s.map((_, r) => s.map((_, c) => s[6 - c][r]));
  return s;
}
// Cells a part covers on the 7×7 grid, its shape centred on (x, y).
export function cellsOf(part) {
  const s = shapeOf(part), out = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (s[r][c]) out.push([part.x + c - 3, part.y + r - 3]);
  return out;
}
export const colorOf = part => byId.get(part.id).variants.find(v => v.variant === part.variant)?.color ?? byId.get(part.id).variants[0].color;

// 7×7 grid of installed-part indexes + 1 (0 = empty).
export function gridOf(parts) {
  const g = Array.from({ length: 7 }, () => Array(7).fill(0));
  parts.forEach((p, i) => { for (const [x, y] of cellsOf(p)) if (x >= 0 && x < 7 && y >= 0 && y < 7) g[y][x] = i + 1; });
  return g;
}

// Can `part` go at its (x, y)? Every block on the board (layout ≠ 0), at least one on a usable cell (1),
// none on another part (sub_813BB00 / sub_813BB68).
export function canPlace(parts, part, layout = LAYOUTS[2], skip = -1) {
  const g = gridOf(parts.filter((_, i) => i !== skip));
  let inside = false;
  for (const [x, y] of cellsOf(part)) {
    if (x < 0 || x > 6 || y < 0 || y > 6 || !layout[y][x]) return false;
    if (layout[y][x] !== 3) inside = true;
    if (g[y][x]) return false;
  }
  return inside;
}

// The RUN check: which parts work and how many bugs of each type (0–15) the board has.
export function run(parts, layout = LAYOUTS[2]) {
  const bugs = Array(16).fill(0), g = gridOf(parts), P = i => byId.get(parts[i].id);
  const onLine = new Set(); for (let x = 0; x < 7; x++) if (g[COMMAND_ROW][x]) onLine.add(g[COMMAND_ROW][x] - 1);
  const programs = [], plus = [];
  // command line, right to left (sub_813BC1C): programs work; Plus Parts still apply but bug
  for (let x = 6; x >= 0; x--) {
    const i = g[COMMAND_ROW][x] - 1;
    if (i < 0 || programs.includes(i) || plus.includes(i)) continue;
    if (P(i).plus) { bugs[P(i).bug]++; plus.push(i); } else programs.push(i);
  }
  // off the line (sub_813BC98): Plus Parts work, programs bug
  parts.forEach((p, i) => { if (onLine.has(i)) return; if (P(i).plus) plus.push(i); else bugs[P(i).bug]++; });
  // same colour touching (sub_813BD24 → sub_813BE38): each neighbour of the same colour adds its bug type
  parts.forEach((p, i) => {
    const seen = new Set();
    for (const [x, y] of cellsOf(p)) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || X > 6 || Y < 0 || Y > 6 || !INNER(X, Y)) continue;
      const j = g[Y][X] - 1;
      if (j < 0 || j === i || seen.has(j)) continue;
      seen.add(j);
    }
    for (const j of seen) if (colorOf(parts[j]) === colorOf(p)) bugs[P(j).bug]++;
  });
  // more than 4 colours (sub_813BEA8): 5 → type 0xB + 1, 6 → type 0xC + 2
  const colors = new Set(parts.map(colorOf));
  if (colors.size === 5) bugs[0xB]++; else if (colors.size > 5) bugs[0xC] += 2;
  // parts on the frame (sub_813C584): each adds its bug type once
  const onFrame = new Set(); for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (layout[y][x] === 3 && g[y][x]) onFrame.add(g[y][x] - 1);
  for (const i of onFrame) bugs[P(i).bug]++;
  bugs[0] = 0; // type 0 has no effect (byte_813CC18)
  return { programs, plus, bugs, levels: bugs.map(n => Math.min(3, n)), colors: colors.size };
}

// Navi stats after the programs (applyNavicustPrograms_813C684). Starting values from
// initNaviStats_WithDefaultStatsMaybe_8013438: Custom 5, MegaChips 5, GigaChips 1, Regular memory 4 MB.
export function stats(parts, layout = LAYOUTS[2]) {
  const r = run(parts, layout), s = { attack: 0, speed: 0, charge: 0, custom: 5, mega: 5, giga: 1, reg: 4, hpPlus: 0, flags: new Set(), cross: null, bugs: r.levels, bugStop: false, run: r };
  const add = (k, n, max) => { s[k] = Math.min(max, s[k] + n); };
  const fx = {
    SuprArmr: () => s.flags.add('superArmor'), Custom1: () => add('custom', 1, 8), Custom2: () => add('custom', 2, 8),
    MegFldr1: () => add('mega', 1, 10), MegFldr2: () => add('mega', 2, 10), GigFldr1: () => add('giga', 1, 10),
    FstBarr: () => s.flags.add('firstBarrier'), Shield: () => (s.bLeft = 'Shield'), Reflect: () => (s.bLeft = 'Reflect'), AntiDmg: () => (s.bLeft = 'AntiDmg'),
    FlotShoe: () => s.flags.add('floatShoes'), AirShoes: () => s.flags.add('airShoes'), UnderSht: () => s.flags.add('underShirt'),
    ChpShufl: () => s.flags.add('chipShuffle'), NumbrOpn: () => s.flags.add('numberOpen'), SneakRun: () => s.flags.add('sneakRun'),
    OilBody: () => (s.body = 'OilBody'), Fish: () => (s.body = 'Fish'), Battery: () => (s.body = 'Battery'), Jungle: () => (s.body = 'Jungle'),
    Collect: () => s.flags.add('collect'), Millions: () => s.flags.add('millions'), Humor: () => s.flags.add('humor'), Poem: () => s.flags.add('poem'),
    SlipRunr: () => s.flags.add('slipRunner'), AutoHeal: () => s.flags.add('autoHeal'),
    BustPack: () => { add('attack', 3, 4); add('speed', 3, 4); add('charge', 3, 4); },
    BodyPack: () => ['superArmor', 'floatShoes', 'airShoes', 'underShirt'].forEach(f => s.flags.add(f)),
    FldrPak1: () => { add('mega', 1, 10); add('custom', 1, 8); }, FldrPak2: () => { add('mega', 2, 10); add('custom', 2, 8); },
    BugStop: () => { s.bugStop = true; }, Rush: () => s.flags.add('rush'), Beat: () => s.flags.add('beat'), Tango: () => s.flags.add('tango'),
    'Attack+1': () => add('attack', 1, 4), 'Speed+1': () => add('speed', 1, 4), 'Charge+1': () => add('charge', 1, 4),
    AttckMAX: () => (s.attack = 4), SpeedMAX: () => (s.speed = 4), ChargMAX: () => (s.charge = 4),
    'HP+50': () => (s.hpPlus += 50), 'HP+100': () => (s.hpPlus += 100), 'HP+200': () => (s.hpPlus += 200),
    'HP+300': () => (s.hpPlus += 300), 'HP+400': () => (s.hpPlus += 400), 'HP+500': () => (s.hpPlus += 500),
  };
  // programs on the line, right to left; of two in one nonzero group only the first applies (byte_2006DD8)
  const groups = new Set();
  for (const i of r.programs) {
    const P = byId.get(parts[i].id);
    if (P.cross) { if (!s.cross) s.cross = P.name; continue; }
    if (P.group) { if (groups.has(P.group)) continue; groups.add(P.group); }
    fx[P.name]?.();
  }
  for (const i of r.plus) fx[byId.get(parts[i].id).name]?.();
  if (s.bugStop) s.bugs = Array(16).fill(0); // BugStop: bug effects are skipped (sub_813CBCC → sub_813C490)
  return s;
}
