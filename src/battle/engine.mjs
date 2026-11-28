// Deterministic fixed-tick Battle Network battle simulation (BN6 ruleset).
// No rendering, DOM or timing here: the client feeds one input object per tick.
// Input: { dir: 'up'|'down'|'left'|'right'|null, a: held bool, b: pressed bool, l: pressed bool }
import { STATUS_FRAMES, val, CHIP_BEHAVIOUR, WEAKNESS, PANELS, GRAB, BUGS, EMOTION, BUBBLE, REGIONS } from '../../data/rules.mjs';
import CHIPDATA from '../../data/bn6-chips.mjs';
import { createVirus, stepVirus, virusName, PLAYABLE_FAMILIES } from './viruses.mjs';
import { createNavi, stepNavi, stepCoil, naviVariants, PLAYABLE_NAVIS } from './navis.mjs';
import { createPanels, stepPanels, panelHit, standable, sideAt, crackPanel, breakPanel, setPanel, panelType, FIELDS } from './panels.mjs';
export { FIELDS };

// ROM chip data by name; the default folder is the game's starting folder (FolderTable entry 0).
export const CHIP_DATA = {};
for (const c of CHIPDATA.chips) if (c.name && !CHIP_DATA[c.name]) CHIP_DATA[c.name] = c;
export const DEFAULT_FOLDER = CHIPDATA.folders[0].map(([id, code]) => [CHIPDATA.chips[id].name, code]);
export const chipBehaviour = name => CHIP_BEHAVIOUR[name] || (/^Recov\d+$/.test(name) ? { ...CHIP_BEHAVIOUR.Recov, heal: +name.slice(5) } : null);
export { PLAYABLE_FAMILIES, virusName, PLAYABLE_NAVIS, naviVariants };

// Single CPU Navi battle (Navi starts on the middle panel of the enemy area).
export const naviBattle = (navi, variant) => [['navi:' + navi, variant]];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SLOTS = [[4, 1], [5, 0], [5, 2], [3, 1], [4, 0], [4, 2]];

// A formation is a list of [family, variant] pairs (up to 3 for now).
export function formation(family, variant, count) {
  return Array.from({ length: count }, () => [family, variant]);
}

function rng(state) {
  let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// Endless survival composition (non-canonical): more viruses, then stronger variants.
export function survivalWave(n, pickFamily = i => PLAYABLE_FAMILIES[i % PLAYABLE_FAMILIES.length]) {
  const count = Math.min(3, 1 + Math.floor((n - 1) / 2));
  const variant = Math.min(3, Math.floor((n - 1) / 3));
  return Array.from({ length: count }, (_, i) => [pickFamily(n + i), variant]);
}

// Navi Customizer results (src/battle/navicust.mjs stats): HP+, Attack / Speed / Charge levels, Custom, SuperArmor,
// UnderShirt. Charge times powerAttackChargeTimes_8020404 row 1; buster wait byte_80209CC [Speed][panels to target].
export const CHARGE_TIMES = [100, 90, 80, 70, 60];
const BUSTER_WAIT = [[4, 8, 12, 16, 20, 24], [3, 7, 10, 14, 17, 20], [3, 6, 9, 12, 15, 17], [2, 4, 6, 8, 10, 12], [2, 3, 4, 5, 6, 7]];
const NO_NAVI = { hpPlus: 0, attack: 0, speed: 0, charge: 0, custom: 5, flags: new Set() };

export function createBattle({ mode = 'virus', enemies = formation('Mettaur', 0, 1), seed = 1, folder = DEFAULT_FOLDER, regular = null, tag = null, field = 'normal', intro = false, navi = NO_NAVI } = {}) {
  const s = {
    intro, banner: null,
    tick: 0, seed: seed >>> 0, mode, wave: 1, deleted: 0,
    phase: 'custom', phaseT: 0, gauge: 0, events: [],
    player: {
      x: 1, y: 1, hp: val('megamanHp') + (navi.hpPlus || 0), maxHp: val('megamanHp') + (navi.hpPlus || 0),
      state: 'idle', stateT: 0, anim: 'idle', animT: 0, dest: null,
      holdT: 0, charge: 0, prevA: false, invuln: 0, chip: null,
    },
    enemies: [], hazards: [], effects: [], nextId: 1, turns: {},
    folder: folder.map(([name, code], i) => ({ id: i, chip: CHIP_DATA[name]?.id ?? 0, name, code })),
    draw: [], hand: [], picked: [], queue: [], handBonus: 0, busterUp: 0,
    navi: { attack: navi.attack || 0, speed: navi.speed || 0, charge: navi.charge || 0, custom: navi.custom ?? 5, bLeft: navi.bLeft || null, body: navi.body || null,
      ...Object.fromEntries(['superArmor', 'underShirt', 'firstBarrier', 'floatShoes', 'airShoes', 'chipShuffle', 'numberOpen', 'sneakRun', 'autoHeal'].map(f => [f, !!navi.flags?.has(f)])) },
  };
  s.emotion = { mood: 0x80, anger: 0, tired: 0, held: 0, pending: false, bugT: 0 }; // base MegaMan starts Normal
  s.bugs = (navi.bugs || []).slice(0, 16); // NaviCust bug levels by type (0 = none); BugStop already zeroed them
  if (bug(s, 9)) s.hpBug = { level: bug(s, 9), t: 0 }; // HP bug: stat 0x18 starts at the level
  const startBug = bug(s, 0xB) ? 0 : bug(s, 0xC) ? 1 : -1; // colour bugs: a random status at the start (sub_8013E58)
  if (startBug >= 0) {
    const kind = BUGS.startStatus.value[Math.floor(rng(s) * 4)], T = BUGS.startStatusFrames.value[startBug], p = s.player;
    if (kind === 'invisible') p.invis = T; else if (kind === 'invulnerable') p.invuln = T; else if (kind === 'blind') p.blind = T; else p.confused = T;
    s.startBug = kind;
  }
  if (s.navi.firstBarrier) s.player.barrier = val('firstBarrierHp'); // FstBarr: "Start with Barrier" (loc_80138D2 → sub_80E0D98)
  s.chargeTime = CHARGE_TIMES[s.navi.charge];
  s.panels = createPanels(field, () => rng(s));
  s.draw = deal(s, s.folder, regular, tag);
  spawn(s, mode === 'survival' ? survivalWave(1, k => pickSurvival(s, k)) : enemies);
  refillHand(s);
  return s;
}

// Battle folder order (sub_800A350 / sub_800A570): the Regular chip is swapped to the front and left out of the
// shuffle, so it is always in the first hand; GigaChips are shuffled apart and each inserted at index
// 10 + rnd % (count − 12) of the main list, so they never come in the first hand. Tag chips (sub_800A318):
// swapped to slots 28 / 29 and left out of the shuffle, then moved as a pair to k, k + 1 with k = 1 + rnd % 19.
export function deal(s, folder, regular = null, tag = null) {
  const list = folder.slice();
  let tg = tag?.length === 2 ? tag.slice() : null;
  if (regular != null && list[regular]) {
    [list[0], list[regular]] = [list[regular], list[0]];
    if (tg) tg = tg.map(i => i === 0 ? regular : i); // keep pointing at the same chips
  }
  if (tg && list.length >= 4) { // the game's two swaps into the last two slots
    const L = list.length - 2, [a, b] = tg;
    if (b === L) { [list[L + 1], list[a]] = [list[a], list[L + 1]]; }
    else { [list[L], list[a]] = [list[a], list[L]]; const bb = b === L ? a : b; [list[L + 1], list[bb]] = [list[bb], list[L + 1]]; }
  } else tg = null;
  const giga = c => CHIP_DATA[c.name]?.class === 'giga';
  const n = list.length, lead = regular != null && list[0] ? 1 : 0, trail = tg ? 2 : 0;
  const isFixed = i => i < lead || i >= n - trail;
  const main = list.filter((c, i) => isFixed(i) || !giga(c)), gigas = list.filter((c, i) => !isFixed(i) && giga(c));
  const middle = shuffle(s, main.slice(lead, main.length - trail));
  const out = [...main.slice(0, lead), ...middle, ...main.slice(main.length - trail)];
  for (const g of shuffle(s, gigas)) out.splice(10 + Math.floor(rng(s) * 0x7fffffff) % Math.max(1, out.length - 12), 0, g);
  if (tg) {
    const k = 1 + Math.floor(rng(s) * 0x7fffffff) % 19, e = out.length - 2;
    [out[e], out[k]] = [out[k], out[e]]; [out[e + 1], out[k + 1]] = [out[k + 1], out[e + 1]];
  }
  return out;
}

function shuffle(s, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Endless survival stands in for the game's random encounters, so the encounter programs act here (the app's
// reading): OilBody / Fish / Battery / Jungle ("Attracts … Viruses!") make half the picks that element, SneakRun
// ("No weak enemies") keeps waves above the base versions.
const FAMILY_ELEMENT = Object.fromEntries(PLAYABLE_FAMILIES.map(f => [f, createVirus(f, 0, 4, 1, 0).element]));
const BODY_ELEMENT = { OilBody: 'fire', Fish: 'aqua', Battery: 'elec', Jungle: 'wood' };
function pickSurvival(s) {
  const want = BODY_ELEMENT[s.navi?.body], pool = want && rng(s) < 0.5 ? PLAYABLE_FAMILIES.filter(f => FAMILY_ELEMENT[f] === want) : PLAYABLE_FAMILIES;
  const list = pool.length ? pool : PLAYABLE_FAMILIES;
  return list[Math.floor(rng(s) * list.length)];
}

function spawn(s, list) {
  s.enemies = list.map(([family, variant], i) => {
    const [x, y] = SLOTS[i];
    if (family.startsWith('navi:')) return createNavi(family.slice(5), variant, x, y, s.nextId++);
    const e = createVirus(family, variant, x, y, s.nextId++);
    e.think = 30 + i * 20;
    return e;
  });
  s.hazards = []; s.turns = {};
}

const bug = (s, type) => s.bugs?.[type] || 0;
// Custom bug (type 4): from turn stat 0x63 on, the custom screen shows turn − value + 1 fewer chips, at least 2.
function customBugLoss(s) {
  const at = BUGS.customTurn.value[bug(s, 4)];
  return at && s.customTurn >= at ? s.customTurn - at + 1 : 0;
}
function refillHand(s) {
  // Custom level (Navi stat 0xA, 5 at start); NumbrOpn: 10 chips (sub_802A40C → sub_802A5A0)
  s.customTurn = (s.customTurn || 0) + 1;
  let size = s.navi?.numberOpen ? 10 : Math.min(val('maxHand'), (s.navi?.custom ?? val('handSize')) + s.handBonus);
  const loss = customBugLoss(s);
  if (loss) size = Math.max(2, size - loss);
  while (s.hand.length < size && s.draw.length) s.hand.push(s.draw.shift());
  s.handBonus = 0;
}

// ---------- custom screen ----------
export function canPick(s, index) {
  const chip = s.hand[index];
  if (!chip || s.picked.includes(index) || s.picked.length >= val('maxSelect')) return false;
  const chosen = s.picked.map(i => s.hand[i]).concat(chip);
  const sameName = chosen.every(c => c.name === chosen[0].name);
  const codes = new Set(chosen.map(c => c.code).filter(c => c !== '*'));
  return sameName || codes.size <= 1;
}
export function pick(s, index) { if (s.phase === 'custom' && canPick(s, index)) s.picked.push(index); }
export function unpick(s) { if (s.phase === 'custom') s.picked.pop(); }
// ChpShufl ("CustmScr Shuffle chp once", sub_802A5DA): once per battle, the chips not picked go back and the
// hand is dealt again.
export function shuffleHand(s) {
  if (s.phase !== 'custom' || !s.navi?.chipShuffle || s.shuffled) return false;
  const keep = s.picked.map(i => s.hand[i]);
  const back = s.hand.filter((_, i) => !s.picked.includes(i));
  s.draw = shuffle(s, [...s.draw, ...back]);
  s.hand = keep; s.picked = keep.map((_, i) => i);
  const size = s.navi.numberOpen ? 10 : Math.min(val('maxHand'), s.navi.custom);
  while (s.hand.length < size && s.draw.length) s.hand.push(s.draw.shift());
  s.shuffled = true; s.events.push({ type: 'shuffle' });
  return true;
}

export function confirmCustom(s) {
  if (s.phase !== 'custom') return;
  // Atk+10 style chips add their damage to the attack chip picked before them.
  s.queue = [];
  for (const c of s.picked.map(i => ({ ...s.hand[i], bonus: 0 }))) {
    const b = chipBehaviour(c.name);
    if (b?.kind === 'plus') { // attaches to the attack chip before it; alone it is used as itself (a puff)
      const prev = s.queue[s.queue.length - 1], pk = prev && chipBehaviour(prev.name)?.kind;
      if (prev && ['shot', 'slash', 'throw', 'vulcan', 'crack'].includes(pk)) { prev.bonus += CHIP_DATA[c.name].damage; if (b.adds) prev.status = b.adds; continue; }
    }
    s.queue.push(c);
  }
  s.hand = s.hand.filter((_, i) => !s.picked.includes(i));
  s.picked = [];
  s.phase = 'battle'; s.phaseT = 0; s.gauge = 0;
  if (s.intro && !s.begun) { s.begun = true; s.banner = { kind: 'start', t: 0 }; } // "BATTLE START!" before the first turn
}
// ADD: no chips this turn; the next custom screen draws 5 more.
export function addCustom(s) {
  if (s.phase !== 'custom') return;
  s.picked = []; s.queue = [];
  if (s.intro && !s.begun) { s.begun = true; s.banner = { kind: 'start', t: 0 }; }
  s.handBonus = val('addBonus');
  s.phase = 'battle'; s.phaseT = 0; s.gauge = 0;
  if (s.intro && !s.begun) { s.begun = true; s.banner = { kind: 'start', t: 0 }; } // "BATTLE START!" before the first turn
}
function openCustom(s) {
  refillHand(s);
  s.phase = 'custom'; s.phaseT = 0;
}

// ---------- combat helpers ----------
// Big bosses (the Cybeasts) fill several panels: e.cells lists the ones they can be hit on.
const covers = (e, x, y) => e.cells ? e.cells.some(c => c[0] === x && c[1] === y) : e.x === x && e.y === y;
const at = (s, x, y) => s.enemies.find(e => e.hp > 0 && !e.airborne && covers(e, x, y));

export function elementMultiplier(attack, defend) {
  return attack && WEAKNESS[attack] === defend ? 2 : 1;
}

// Dragon path in panels (4 px a frame: 6 frames a row, 10 frames for the column step), t from the dragon's start; null once gone.
export function dragonAt(t, col) {
  if (t < 0) return { x: col, y: -2, dir: 'down' };
  if (t < 18) return { x: col, y: -1 + t / 6, dir: 'down' };
  if (t < 28) return { x: col + (t - 18) / 10, y: 2 + 0.3 * Math.sin(Math.PI * (t - 18) / 10), dir: 'down' };
  if (t < 62) return { x: col + 1, y: 2 - (t - 28) / 6, dir: 'up' };
  return null;
}
// MegaMan's placed bombs (BlkBomb, FlshBom, LilBolr, BugBomb): what a hit does to them, and how they go off.
function placedBombBurst(s, o) {
  o.hp = 0; s.effects.push({ kind: 'blast', x: o.x, y: o.y, t: 0 });
  // BlkBomb / FlshBom: hit area 0x82 / 0x81 (byte_80CD828, byte_80D9D24) = every panel of one side (byte_8019C34: 0x82 needs
  // panel flag 0x20, the enemy side; 0x81 lacks it). On the enemy side it hits the enemies standing on enemy panels; on
  // MegaMan's side it would hit MegaMan.
  const wide = (fn) => {
    if (sideAt(s, o.x, o.y) === 'e') { for (const e of s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil' && sideAt(s, e.x, e.y) === 'e')) fn(e); }
    else if (sideAt(s, s.player.x, s.player.y) === 'p') hitPlayer(s, o.damage, {});
  };
  if (o.family === 'BlackBomb') wide(e => hitEnemy(s, e, o.damage, { element: 'fire', chip: true }));
  else if (o.family === 'TimeBomb') wide(e => hitEnemy(s, e, o.damage, { element: o.element, chip: true }));
  else if (o.family === 'FlashBomb') { s.effects.push({ kind: 'flash', t: 0 }); wide(e => hitEnemy(s, e, o.damage, { element: o.element, paralyze: STATUS_FRAMES[o.statusCode] || val('chipParalyzeTicks'), chip: true })); }
  else for (const [dx, dy] of REGIONS[0x10]) { // Boiler / BugBomb: the 8 panels around it
    const e = at(s, o.x + dx, o.y + dy); if (!e || e.owner === 'player') continue;
    hitEnemy(s, e, o.family === 'Boiler' ? Math.min(999, o.damage + o.soaked) : 0, { element: o.element, chip: true }); // LilBolr: MaxHP 4000 − HP, HP starting at 4000 − the chip's damage, floor 3001
    s.effects.push({ kind: 'blast', x: o.x + dx, y: o.y + dy, t: 0 });
  }
}
function hitPlacedBomb(s, o, damage, extra) {
  o.flash = 4;
  if (o.family === 'Guardian') return guardianStrikes(s, o, 'enemies');
  if (o.family === 'BlackBomb' && extra.element === 'fire') return placedBombBurst(s, o);
  if (o.family === 'Boiler') { o.soaked += damage; if (--o.hitsLeft <= 0) placedBombBurst(s, o); return; }
  o.hp = Math.max(0, o.hp - damage);
  if (!o.hp) s.effects.push({ kind: 'blast', x: o.x, y: o.y, t: 0 });
}
// Guardian (t3 0x7D / t4 0x53): hit → time stops, it strikes the side opposite to whoever hit it, then crumbles.
function guardianStrikes(s, o, target) {
  if (o.struck || o.stateT < 3 || s.timestop) return;
  o.struck = true; o.anim = 'strike';
  startSpecial(s, 'Guardian', { kind: 'guardianstrike', hold: 0x3C, target, obj: o }, o.damage, o.element);
}
function stepPlacedBomb(o, api) {
  const s = api.s; o.animT++; o.stateT++; if (o.flash) o.flash--;
  if (o.music) { // the instrument box (t3 0x78): ready 0x1E frames, play, rest, again
    const c = o.cycle++ % (30 + o.play + o.rest), playing = c >= 30 && c < 30 + o.play;
    o.anim = playing ? 'play' : 'idle';
    if (playing && (c - 30) % 3 === 0) {
      const foes = s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil');
      if (o.music === 'fanfare') s.player.invuln = Math.max(s.player.invuln, 4);                     // object_setInvulnerableTime(4)
      else if (o.music === 'timpani') for (const e of foes) e.paralyzed = Math.max(e.paralyzed || 0, 4); // status 0x43: held still
    }
  }
  if (o.wind && o.stateT >= 1 && (o.stateT - 1) % 12 === 0) { // Wind / Fan: a gust down rows 2, 1, 3 (game) in turn
    const y = [1, 0, 2][o.cycle++ % 3];
    let x0 = o.x + 1; while (x0 <= 5 && sideAt(s, x0, y) !== 'e') x0++; // Wind: the first enemy panel in the row (sub_80CD26C); Fan: the back edge (sub_80CD236)
    if (x0 <= 5) s.hazards.push({ kind: 'windgust', owner: 'player', fx: o.wind > 0 ? x0 : 5, y, dir: o.wind, hit: [] });
  }
  if (o.raid) stepAirRaid(s, o);
  if (o.sensor) stepSensor(s, o);
  if (o.otenko && o.stateT >= 5) { // Otenko (t3 0xAD): +1 to the next chip's damage every 5 frames, 0x32 at most per chip
    o.anim = 'shine';
    const c = s.queue[0];
    if (c !== o.boosting) { o.boosting = c; o.boosted = 0; }
    if (c && (o.stateT - 5) % 5 === 0 && ((CHIP_DATA[c.name]?.flags || 0) & 2) && o.boosted < 0x32) { c.bonus = (c.bonus || 0) + 1; o.boosted++; }
  }
  if (o.anubis) { // Anubis (t3 0x55): drops 8 px a frame, then every 6 frames hits the whole enemy area (region 0x82)
    if (o.z > 0) { o.z = Math.max(0, o.z - 8); if (o.z === 0) s.effects.push({ kind: 'shake', t: 0 }); return; }
    if (o.stateT % 6 === 0) for (const e of s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil')) if (sideAt(s, e.x, e.y) === 'e') hitEnemy(s, e, o.damage, { element: o.element, chip: true, quiet: true });
  }
  if (--o.life > 0) return;
  if (o.family === 'BlackBomb' || o.family === 'Cube' || o.family === 'MusicBox' || o.family === 'WindBox' || o.family === 'AirRaid' || o.family === 'Sensor' || o.family === 'Guardian' || o.family === 'Anubis' || o.family === 'Otenko') { o.hp = 0; s.effects.push({ kind: 'puff', x: o.x, y: o.y, t: 0 }); } // left alone: it just goes away
  else placedBombBurst(s, o);
}
// AirRaid's plane (t3 0x75): rises 0x1E frames, then a bomb every 0xA frames.
function stepAirRaid(s, o) {
  const t = o.stateT;
  if (t <= 30) { o.anim = 'bank'; o.z = 0.625 * t; return; }
  o.anim = 'bomb';
  if ((t - 31) % 10 !== 0 || (t - 31) / 10 >= o.raid) return;
  const foes = [];
  for (let x = o.x + 1; x <= 5; x++) for (let y = 0; y < 3; y++) { const e = at(s, x, y); if (e && e.owner !== 'player') foes.push([x, y]); } // sub_80D37F4
  let target;
  if (!foes.length) target = [5, o.y];
  else {
    target = foes[(o.cycle = (o.cycle || 0) >= foes.length ? 0 : (o.cycle || 0))]; o.cycle++;
    const r = Math.floor(rng(s) * 8);
    if (r === 1 || r === 5) { const c = [3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => sideAt(s, x, y) === 'e'); target = c[Math.floor(rng(s) * c.length)] || target; }
  }
  s.hazards.push({ kind: 'raidbomb', owner: 'player', x: target[0], y: target[1], hit: s.tick + 6, damage: o.damage, element: o.element });
}
// Sensor (t3 0xA6): aims by its row, scans with a dot, fires a laser down the line when an enemy is on the dot.
function stepSensor(s, o) {
  const t = o.stateT, aim = [2, 1, 0][o.y], dy = [-1, 0, 1][aim];
  if (o.fired) return;
  if (t === 1) o.anim = 's10';
  if (t === 40) o.anim = 's0';
  if (t === 50) o.anim = ['s1', 's0', 's4'][aim];
  if (t === 64) { o.anim = ['s2', 's0', 's5'][aim]; o.dot = { x: o.x + 1, y: o.y + dy, t: 0 }; }
  if (!o.dot) return;
  const d = o.dot;
  if (++d.t >= 8) { d.t = 0; d.x++; d.y += dy; if (d.x > 5 || d.y < 0 || d.y > 2) { d.x = o.x + 1; d.y = o.y + dy; } } // sub_80D9298
  const e = d.x <= 5 && d.y >= 0 && d.y <= 2 && at(s, d.x, d.y);
  if (e && e.owner !== 'player') { // fire: a laser on every panel of the line (sub_80DA290)
    o.dot = null; o.fired = true; o.anim = ['s8', 's7', 's9'][aim]; o.life = 0x78;
    const cells = []; for (let x = o.x + 1, y = o.y + dy; x <= 5 && y >= 0 && y <= 2; x++, y += dy) cells.push([x, y]);
    for (const c of cells) s.hazards.push({ kind: 'sensorlaser', owner: 'player', cells: [c], start: s.tick, until: s.tick + 0x78, damage: o.damage, element: o.element, aim, hit: [] }); // one t3 0xA0 a panel; all go with the Sensor
  }
}
function hitEnemy(s, e, damage, extra = {}) {
  if (!e || e.hp <= 0 || e.airborne || e.invuln > 0) return; // invuln: e.g. Trumpy's song
  if (e.owner === 'player') return hitPlacedBomb(s, e, damage, extra);
  if (e.guard) { e.guardHit = true; s.events.push({ type: 'guard', target: e.id }); s.effects.push({ kind: 'guard', x: e.x, y: e.y, t: 0 }); return; }
  damage *= elementMultiplier(extra.element, e.element);
  if (e.bubble > 0) { if (extra.element === 'elec') damage *= 2; e.bubble = 0; e.paralyzed = 0; } // Bubbled: popped by the hit; Elec doubles
  if (!e.cells) damage = panelHit(s, e.x, e.y, damage, extra.element).damage;
  e.hp = Math.max(e.sturdy ? 1 : 0, e.hp - damage);
  e.flash = 4;
  if (extra.chip && e.counterT > 0) { // counter hit: Full Synchro (sub_801A200)
    e.counterT = 0; setMood(s, 0xFF);
    s.events.push({ type: 'counter', target: e.id }); s.effects.push({ kind: 'counter', x: e.x, y: e.y, t: 0 });
  }
  if (extra.paralyze && e.hp > 0 && e.kind !== 'coil') { e.paralyzed = extra.paralyze; s.events.push({ type: 'paralyze', target: e.id }); }
  if (extra.bubble && e.hp > 0 && e.kind !== 'coil' && !e.cells) { e.bubble = e.paralyzed = BUBBLE.frames.value; s.events.push({ type: 'bubble', target: e.id }); } // status 0x60
  if (!extra.quiet || s.tick % 8 === 0) s.effects.push({ kind: 'hit', x: e.x, y: e.y, t: 0, damage, fx: extra.fx, jx: (s.tick * 7) % 15 - 7, jy: (s.tick * 11) % 15 - 7 }); // jitter from the frame count so the battle RNG is untouched // hit effect: t4 0x4 near the target (0x801A0D8, ±7 px)
  s.events.push({ type: 'hit', target: e.id, damage });
  if (extra.push && e.hp > 0) {
    const nx = e.x + 1;
    if (nx <= 5 && !at(s, nx, e.y)) e.x = nx;
  }
  if (e.hp === 0) {
    if (e.kind !== 'coil') s.deleted++;
    s.events.push({ type: 'delete', target: e.id });
    s.effects.push({ kind: 'delete', x: e.x, y: e.y, t: 0 });
    if (s.turns[e.family] === e.id) delete s.turns[e.family];
  }
}

export function hitPlayer(s, damage, opts = {}) {
  const p = s.player;
  elemTrapSees(s, opts);
  if (p.invuln > 0 || p.invis > 0 || p.hp <= 0) return; // invisible (colour bug): attacks pass through
  const element = opts.element ?? s.attacker?.element;
  if (p.state === 'guard') { // Shield / Reflect (attack family 0x2B): the hit is blocked; Reflect answers with a 50-damage shot
    s.events.push({ type: 'guard' }); s.effects.push({ kind: 'guard', x: p.x, y: p.y, t: 0 }); p.guardHitT = 12; // the guard's hit animation
    if (p.guardReflect && !p.reflected) { p.reflected = true; hitEnemy(s, rowTarget(s, p.x, p.y), p.reflectDamage ?? 50, { fx: 'buster', chip: p.reflectDamage != null }); } // B+Left: sub_80C4FFE, 0x32; Rflectr: the chip's damage (sub_80C9CDA)
    return;
  }
  if (p.state === 'antidmg') { // AntiDmg (family 0x5A): hit inside the window → no damage, a 50-damage star at the attacker
    const t = s.attacker?.hp > 0 ? s.attacker : rowTarget(s, p.x, p.y) || s.enemies.find(e => e.hp > 0);
    s.events.push({ type: 'antiDamage' }); s.effects.push({ kind: 'star', x: t?.x ?? p.x, y: t?.y ?? p.y, t: 0 });
    if (t) hitEnemy(s, t, 50, { fx: 'buster' });
    p.state = 'idle'; setAnim(p, 'idle'); p.invuln = val('invincibleTicks');
    return;
  }
  if (s.trap && springTrap(s, damage, element, opts)) return; // AntiDmg / BodyGrd / AntiSwrd: the hit is cleared
  if (p.barrier > 0 && p.barrierMin && damage < p.barrierMin) { s.effects.push({ kind: 'guard', x: p.x, y: p.y, t: 0 }); s.events.push({ type: 'barrier' }); return; } // LifeAur: too small to touch it
  if (p.barrier > 0 && p.barrierWrap) { // BblWrap: pops, blocking the hit; grows back unless Elec popped it
    p.barrier = 0; p.wrapT = 0; if (element === 'elec') p.barrierWrap = 0;
    s.effects.push({ kind: 'guard', x: p.x, y: p.y, t: 0 }); s.events.push({ type: 'barrier' }); return;
  }
  if (p.barrier > 0) { // barrier (FstBarr, Barrier chips): the hit loses its HP, and the whole hit is stopped even when it breaks
    p.barrier = Math.max(0, p.barrier - damage);     // (sub_801A802: the hit's damage is cleared at loc_801A96E either way)
    s.effects.push({ kind: 'guard', x: p.x, y: p.y, t: 0 }); s.events.push({ type: 'barrier' }); return;
  }
  if (p.bubble > 0) { if (element === 'elec') damage *= 2; p.bubble = 0; s.events.push({ type: 'bubblePop' }); } // Bubbled: popped by the hit; Elec doubles
  const ph = s.navi?.floatShoes ? { damage, freeze: 0 } : panelHit(s, p.x, p.y, damage, element); // FlotShoe: no panel effects
  damage = ph.damage;
  if (ph.freeze && !opts.paralyze) opts = { ...opts, paralyze: ph.freeze, frozen: true }; // aqua on ice: frozen solid (0x3007460)
  const before = p.hp;
  p.hp = Math.max(0, p.hp - damage);
  if (s.emotion && damage > 0) {
    if (s.emotion.mood) s.emotion.mood = Math.max(1, s.emotion.mood - damage); // a hit lowers the mood: Full Synchro ends (sub_8015C12)
    if (damage >= EMOTION.angryAfter.value.bigHit) s.emotion.pending = true; // a huge hit makes MegaMan angry (sub_80142DC)
  }
  if (opts.bubble && p.hp > 0) { p.bubble = BUBBLE.frames.value; p.state = 'idle'; setAnim(p, 'idle'); p.dest = null; s.events.push({ type: 'playerHit', damage, bubble: true }); return; }
  if (s.hpBug && damage > 0) s.hpBug.level = Math.min(7, s.hpBug.level + 1); // HP bug drains faster after each hit (sub_8013F96)
  if (p.hp === 0 && before > 1 && s.navi?.underShirt) p.hp = 1; // UnderShirt: a hit from above 1 HP leaves 1 HP
  if (opts.paralyze) { // paralysis: no flinch and no flashing; MegaMan just freezes (DarkMech waits for this)
    p.paralyzed = opts.paralyze; p.frozen = !!opts.frozen; p.state = 'paralyzed'; p.stateT = 0; setAnim(p, 'idle'); p.holdT = 0; p.charge = 0; p.dest = null;
    s.events.push({ type: 'playerHit', damage, paralyze: true });
    return;
  }
  p.paralyzed = 0; p.frozen = false;
  if (s.navi?.superArmor) { p.invuln = val('invincibleTicks'); s.events.push({ type: 'playerHit', damage }); return; } // SuperArmor: no flinch
  p.state = 'flinch'; p.stateT = 0; setAnim(p, 'flinch');
  p.invuln = val('invincibleTicks'); p.holdT = 0; p.charge = 0; p.dest = null;
  s.events.push({ type: 'playerHit', damage });
}

// The nearest column ahead of x holding an enemy (sub_80ED040), or the back column.
function nearestEnemyColumn(s, x) {
  let best = 5;
  for (const e of s.enemies) if (e.hp > 0 && e.x > x && e.x < best) best = e.x;
  return best;
}
// Buster bug (type 7): each normal buster shot rolls one of 16 slots — stat 0x14 ones, then stat 0x15 twos, the rest 0 (sub_8013D5E).
function busterBugRoll(s) {
  const [ones, twos] = BUGS.busterTable.value[bug(s, 7)], r = Math.floor(rng(s) * 16);
  return r < ones ? 1 : r < ones + twos ? 2 : 0;
}
// ---------- emotions (base MegaMan) ----------
// Emotion code as possiblyGetBattleEmotion_8015B64 reads it: Anger timer → Angry, AIData 0x32 → Tired, mood 0xFF → Full Synchro.
export function emotionOf(s) {
  const E = s.emotion;
  if (!E) return 'normal';
  return E.anger > 0 ? 'angry' : E.tired > 0 ? 'tired' : E.mood === 0xFF ? 'synchro' : 'normal';
}
function setMood(s, m) { if (s.emotion && !(s.emotion.tired > 0)) s.emotion.mood = m; } // sub_8015BEC: not while Tired
function resetEmotion(s) { Object.assign(s.emotion, { mood: 0x80, anger: 0, pending: false }); } // sub_80143A6
function stepEmotion(s) {
  const E = s.emotion, p = s.player;
  if (!E || s.phase !== 'battle') return;
  E.held = p.paralyzed > 0 || p.bubble > 0 ? E.held + 1 : 0; // frames held by a status (flag 0xC00, AIData 0x4C)
  if (!(E.anger > 0) && E.held >= EMOTION.angryAfter.value.paralyzed) E.pending = true;
  if (E.anger > 0) { if (--E.anger <= 0) resetEmotion(s); } // Angry for 600 frames (sub_8014326)
  else if (E.pending) { E.pending = false; if (!(E.tired > 0)) { E.anger = EMOTION.angryFrames.value; E.mood = 0x80; } }
  if (bug(s, 2) && ++E.bugT >= EMOTION.bugEvery.value) { // emotion bug: every 60 frames a new emotion (sub_8013DA0)
    E.bugT = 0;
    const cur = { normal: 0, tired: 1, angry: 2, synchro: 3 }[emotionOf(s)];
    resetEmotion(s); E.tired = 0;
    const pool = EMOTION.bugTable.value.map(v => v === cur ? (cur === 0 ? 1 : 0) : v);
    const next = pool[Math.floor(rng(s) * pool.length)];
    if (next === 1) E.tired = 0xFFFF; else if (next === 2) E.pending = true; else E.mood = next === 3 ? 0xFF : 0x99;
  }
}

const setAnim = (a, anim) => { a.anim = anim; a.animT = 0; };
const frontX = (e, y) => e.cells ? Math.min(...e.cells.filter(c => c[1] === y).map(c => c[0])) : e.x;
// B+Left programs (sub_801216E / sub_8012586 / sub_80121BC → attack families 0x2B / 0x5A): Shield and Reflect guard for
// 0x14 ticks (Unk_0c low byte, sub_80ED154), AntiDmg's window is 0x1E ticks (Unk_10, sub_80EFEAC); `cool` is the
// Unk_05 value (0x28 / 0x46), read here as the wait before the next use (unverified).
const B_LEFT = {
  Shield: { state: 'guard', ticks: 20, cool: 40 }, Reflect: { state: 'guard', ticks: 20, cool: 40, reflect: true },
  AntiDmg: { state: 'antidmg', ticks: 30, cool: 70 },
};
// Buster recovery: 5 ticks, then byte_80209CC[Speed][empty panels before the target, max 5] (0x80EB502).
function busterWait(s, p) {
  const t = rowTarget(s, p.x, p.y), panels = Math.min(5, t ? frontX(t, p.y) - p.x - 1 : 5 - p.x);
  return 5 + BUSTER_WAIT[s.navi.speed][Math.max(0, panels)];
}
const rowTarget = (s, x, y) => s.enemies.filter(e => e.hp > 0 && !e.airborne && (e.cells ? e.cells.some(c => c[1] === y) : e.y === y) && frontX(e, y) > x).sort((a, b) => frontX(a, y) - frontX(b, y))[0];

function useChip(s, chip) {
  const p = s.player, def = chipBehaviour(chip.name), data = CHIP_DATA[chip.name] || { damage: 0, element: 'none' };
  s.events.push({ type: 'chip', name: chip.name, ready: !!def });
  if (!def) { s.effects.push({ kind: 'note', x: p.x, y: p.y, t: 0 }); return; } // effect not implemented yet
  if (def.kind === 'plus') { // used on its own: the capsule pops (t4 0x14 via 0x8010488)
    p.state = 'chip'; p.stateT = 0; p.chip = { ...chip, lock: def.lock }; setAnim(p, 'idle');
    s.effects.push({ kind: 'capsule', x: p.x, y: p.y, t: 0, life: 16 }); return;
  }
  let damage = (data.damage === 1021 ? p.hp % 100 : data.damage) + (chip.bonus || 0); // 1021: NumbrBl, sub_8010BF0 = HP mod 100
  const mood = emotionOf(s);
  if ((data.flags & 2) && damage > 0 && (mood === 'synchro' || mood === 'angry')) { // Full Synchro / Angry: double damage, then it's used up (sub_8012A38)
    damage *= 2; s.events.push({ type: 'emotionBoost', emotion: mood });
    if (mood === 'synchro') s.emotion.mood = 0x80; else resetEmotion(s);
  }
  const element = data.element === 'none' ? undefined : data.element;
  const paralyze = chip.status === 'paralyze' ? val('chipParalyzeTicks') : 0;
  p.state = 'chip'; p.stateT = 0; p.chip = { ...chip, lock: def.lock }; setAnim(p, def.anim);
  if (def.kind === 'shot') {
    const target = rowTarget(s, p.x, p.y);
    if (target && def.impact) for (const [dx, dy] of REGIONS[def.impact]) { // the impact area around the target panel
      const e = at(s, target.x + dx, target.y + dy);
      if (e && e !== target) hitEnemy(s, e, damage, { element, fx: def.fx, chip: true });
      if (target.y + dy >= 0 && target.y + dy < 3) s.effects.push({ kind: 'hit', x: target.x + dx, y: target.y + dy, t: 0, fx: def.fx, damage: 0, jx: 0, jy: 0 });
    }
    hitEnemy(s, target, damage, { push: def.push, element, fx: def.fx, paralyze, chip: true });
  }
  else if (def.kind === 'slash') {
    const home = [p.x, p.y];
    if (def.step) { // StepSwrd: step forward first (as far as `step` free panels), slash, then back
      let k = 0; while (k < def.step && p.x + k + 1 <= 5 && !at(s, p.x + k + 1, p.y) && standable(s, p.x + k + 1, p.y)) k++;
      p.x += k; p.home = home;
    }
    if (def.damageFromLostHp) damage = Math.min(500, p.maxHp - p.hp); // Muramasa: sub_8010BD0
    for (const [dx, dy] of def.area) hitEnemy(s, at(s, p.x + dx, p.y + dy), damage, { element, paralyze, chip: true });
    if (def.slashFx) s.effects.push({ kind: 'slash', x: p.x, y: p.y, t: 0, area: def.slashFx, flip: true }); // the game's slash, swinging right
  }
  else if (def.kind === 'dragon') { const col = s.enemies.some(e => e.hp > 0 && e.owner !== 'player' && e.x > p.x) ? nearestEnemyColumn(s, p.x) : p.x + 1; s.hazards.push({ kind: 'dragon', owner: 'player', col, t: -2, pal: def.pal, damage, element, last: null }); }
  else if (def.freeze) startSpecial(s, chip.name, def, damage, element); // family 0x15: time stops, the name shows, then the effect
  else if (def.kind === 'place') { const r = def.release || 0; s.hazards.push({ kind: 'bomb', owner: 'player', x: p.x, y: p.y, tx: p.x + 3, land: s.tick + r + def.flight, start: s.tick + r, damage, element, place: def, sprite: def.sprite }); }
  else if (def.kind === 'throw') { const r = def.release || 0; s.hazards.push({ kind: 'bomb', owner: 'player', x: p.x, y: p.y, tx: p.x + def.range, land: s.tick + r + def.flight, start: s.tick + r, damage, paralyze, element, region: def.region, hits: def.hits, seed: def.seed }); } // the ball leaves the hand on frame 9 (0x80EB69A)
  else if (def.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + def.heal); s.events.push({ type: 'heal', amount: def.heal }); s.effects.push({ kind: 'heal', x: p.x, y: p.y, t: 0 }); } // effect object 6 (0x800E2FC): sprite 0x0C/0x12
  else if (def.kind === 'vulcan') for (let k = 0; k < def.hits; k++) s.hazards.push({ kind: 'pvulcan', owner: 'player', y: p.y, from: p.x, at: s.tick + (def.lead || 0) + k * def.gap, damage, element, paralyze });
  else if (def.kind === 'grab') startGrab(s, def, damage, element);
  else if (def.kind === 'wavearm') for (const dy of def.rows) { // WaveArm / PwrWave (family 0x31): shockwaves (t3 0x16) from the panel ahead
    const x = p.x + 1, y = p.y + dy;
    if (y >= 0 && y < 3 && x <= 5) s.hazards.push({ kind: 'wave', fromPlayer: true, owner: 'player', x, y, dir: 1, step: def.step, next: s.tick + def.step, damage, start: s.tick, hit: [], anim: 'medium' }); // byte_80C6B00 kinds 12–15: animation 1
  }
  else if (def.kind === 'shell') for (const y of def.rows || [p.y]) for (let k = 0; k < (def.count || 1); k++) {
    const x = def.fromX === 'self' ? p.x : def.fromX ?? p.x + 1, start = s.tick + k * (def.gap || 0);
    if (x <= 5 && standable(s, x, y)) s.hazards.push({ kind: 'shell', owner: 'player', fx: x, x, y, speed: def.speed / 40, pal: def.pal, sprite: def.sprite, seq: def.seq, toX: def.range ? x + def.range : 5, damage, element, start, hit: [] });
  }
  else if (def.kind === 'pulse') s.hazards.push({ kind: 'pulse', owner: 'player', x: p.x + 1, y: p.y, start: s.tick, hold: def.hold, region: def.region, pal: def.pal, pull: def.pull, paralyze: def.status === 'paralyze' ? STATUS_FRAMES[def.statusCode] : paralyze, damage, element, hit: [] });
  else if (def.kind === 'widewave') s.hazards.push({ kind: 'widewave', owner: 'player', fx: p.x, x: p.x, y: p.y, speed: def.speed / 40, damage, element, start: s.tick, hit: [] });
  else if (def.kind === 'tankcan') {
    const target = rowTarget(s, p.x, p.y);
    if (target) hitEnemy(s, target, damage, { element, fx: 'explosion', chip: true });
    else for (const dy of [-1, 0, 1]) { // the back edge: the last column's three rows, cracked
      const y = p.y + dy; if (y < 0 || y > 2) continue;
      hitEnemy(s, at(s, 5, y), damage, { element, fx: 'explosion', chip: true });
      s.effects.push({ kind: 'blast', x: 5, y, t: 0 }); crackPanel(s, 5, y);
    }
  }
  else if (def.kind === 'machgun') s.hazards.push({ kind: 'machgun', owner: 'player', col: nearestEnemyColumn(s, p.x), row: 2, dir: -1, left: def.shots, every: def.every, next: s.tick + 10, damage, element });
  else if (def.kind === 'needles') {
    const foes = s.enemies.filter(e => e.hp > 0).slice(0, 3);
    if (foes.length === 2) foes.push(foes[0].hp < foes[1].hp ? foes[0] : foes[1].hp < foes[0].hp ? foes[1] : foes[Math.floor(rng(s) * 2)]);
    while (foes.length && foes.length < 3) foes.push(foes[0]);
    foes.forEach((e, k) => s.hazards.push({ kind: 'needle', owner: 'player', x: e.x, y: e.y, at: s.tick + def.delay + k * def.every, damage, element }));
  }
  else if (def.kind === 'tornado') {
    const bugsOn = [1, 2, 3, 7].filter(t => bug(s, t)).length + (bug(s, 9) ? 2 : 0); // stats set by the bug table, as sub_800FE52 counts them
    const spots = def.byBugs ? def.byBugs[Math.min(3, bugsOn)] : [[0, 0]];
    for (const [dx, dy] of spots) {
      const x = p.x + 2 + dx, y = p.y + dy;
      if (x > 5 || y < 0 || y > 2 || !standable(s, x, y)) continue;
      let el = element, dmg = damage, pal = def.byBugs ? 3 : 0; // palettes byte_80CA064: kind 1 → 0, Static → 3, fire 4, wood 1, aqua 5
      if (def.panelElement) { const k = { volcano: ['fire', 4], grass: ['wood', 1], ice: ['aqua', 5] }[panelType(s, x, y)]; if (k) { [el, pal] = k; dmg *= 2; setPanel(s, x, y, 'normal'); } }
      s.hazards.push({ kind: 'chiptwister', owner: 'player', x, y, start: s.tick, every: def.every, life: def.life, damage: dmg, element: el, pal });
    }
  }
  else if (def.kind === 'reflector') { // Rflectr (family 0x2B, subfamily 0–2): the guard for params[0] frames; the first hit blocked is sent back
    p.state = 'guard'; p.stateT = 0; p.abilityTicks = def.ticks; p.guardReflect = true; p.reflected = false; p.reflectDamage = damage; setAnim(p, 'idle');
    return;
  }
  else if (def.kind === 'bubblestar') s.hazards.push({ kind: 'shell', owner: 'player', fx: p.x + 1, x: p.x + 1, y: p.y, speed: def.speed / 40, pal: 0, sprite: 'starfish', seq: 'idle', toX: 5, stopOnHit: true, bubble: true, damage, element, start: s.tick, hit: [] });
  else if (def.kind === 'corn') {
    const target = rowTarget(s, p.x, p.y);
    if (target) {
      if (standable(s, target.x, target.y)) setPanel(s, target.x, target.y, 'grass');
      const blast = (x, y) => s.hazards.push({ kind: 'multihit', owner: 'player', x, y, left: def.hits, next: s.tick, gap: def.every, damage, element });
      blast(target.x, target.y);
      for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) // the other grass panels of the enemy area
        if ((x !== target.x || y !== target.y) && sideAt(s, x, y) === 'e' && panelType(s, x, y) === 'grass') blast(x, y);
    }
  }
  else if (def.kind === 'sunbeam') s.hazards.push({ kind: 'sunbeam', owner: 'player', x: p.x + 2, y: p.y, start: s.tick + def.delay, end: s.tick + def.delay + def.frames, area: REGIONS[def.region], per: def.per, pal: def.pal, element });
  else if (def.kind === 'bees') {
    const foes = s.enemies.filter(e => e.hp > 0 && e.x > p.x).sort((a, b) => a.x - b.x || Math.abs(a.y - p.y) - Math.abs(b.y - p.y));
    s.hazards.push({ kind: 'bees', owner: 'player', fx: p.x + 1, fy: p.y, tx: foes[0]?.x ?? 6, ty: foes[0]?.y ?? p.y, speed: def.speed / 40, vspeed: def.vspeed / 24, hits: def.hits, every: def.every, pal: def.pal, t: 0, damage, element });
  }
  else if (def.kind === 'dollthunder') s.hazards.push({ kind: 'dollthunder', owner: 'player', x: p.x, y: p.y, start: s.tick + def.delay, end: s.tick + def.delay + def.frames, hit: [], damage, element });
  else if (def.kind === 'hockey') {
    const h = { kind: 'hockey', owner: 'player', x: p.x + 1, y: p.y, dx: 1, dy: 1, left: def.moves, every: def.every, t: 0, damage, element };
    if (h.x <= 5 && standable(s, h.x, h.y)) { s.hazards.push(h); const e = at(s, h.x, h.y); if (e) hitEnemy(s, e, damage, { element, chip: true }); }
  }
  else if (def.kind === 'logs') def.rows[p.y].forEach((top, i) => s.hazards.push({ kind: 'log', owner: 'player', fx: p.x + 2, rows: [top, top + 1], speed: def.speed / 40, land: s.tick + def.air + i * def.gap, start: s.tick + i * def.gap, damage, element }));
  else if (def.kind === 'airspin') {
    const free = (x, y) => x <= 5 && standable(s, x, y) && !at(s, x, y);
    if (free(p.x + 1, p.y)) s.hazards.push({ kind: 'airspin', owner: 'player', fx: p.x + 1, x: p.x + 1, y: p.y, to: p.x + 1, max: def.maxPanels, speed: def.speed / 40, wait: def.wait, every: def.every, left: def.hits, phase: 'glide', t: 0, damage, element, free });
  }
  else if (def.kind === 'trainarrow') {
    const arrow = (x, wait) => s.hazards.push({ kind: 'shell', owner: 'player', fx: x, x, y: p.y, speed: def.speed / 40, sprite: 'arrowfx', seq: 'fly', flip: false, lift: 16, fly: true, showWait: true, toX: 5, stopOnHit: true, damage, element, start: s.tick + wait, hit: [] });
    for (let x = p.x + 1, wait = def.first; x <= 5 && sideAt(s, x, p.y) === 'p'; x++, wait -= def.gap) arrow(x, wait);
    arrow(p.x, def.last);
  }
  else if (def.kind === 'yoyo') {
    const x0 = p.x + 1, path = [];
    for (let i = 0; i <= def.out; i++) path.push(x0 + i);
    for (let i = 0; i < def.hold; i++) path.push(x0 + def.out);
    for (let i = def.out - 1; i >= 0; i--) path.push(x0 + i);
    s.hazards.push({ kind: 'yoyo', owner: 'player', y: p.y, path, step: def.step, t: 0, damage, element });
  }
  else if (def.kind === 'thunder') s.hazards.push({ kind: 'thunder', owner: 'player', fx: p.x + 1, fy: p.y, dx: 0, dy: 0, legs: def.legs, leg: def.leg, t: 0, start: s.tick, damage, element });
  else if (def.kind === 'burner') s.hazards.push({ kind: 'flame', owner: 'player', x: p.x + 1, y: p.y, born: s.tick, life: def.life, spread: def.spread, wide: def.wide, crack: def.crack, damage, element, hit: [] });
  else if (def.kind === 'busterup') { s.busterUp++; s.events.push({ type: 'busterUp', level: 1 + s.busterUp }); }
  else if (def.kind === 'crack') for (const [dx, dy] of REGIONS[def.region || 1]) { // the panels of the area are lifted and sent down their rows
    const x = p.x + 1 + dx, y = p.y + dy;
    if (x <= 5 && y >= 0 && y < 3 && standable(s, x, y) && !at(s, x, y)) {
      setPanel(s, x, y, 'broken'); s.effects.push({ kind: 'panelbreak', x, y, t: 0 });
      s.hazards.push({ kind: 'crackshot', owner: 'player', fx: x, x, y, speed: def.speed, damage, element, paralyze });
    }
  }
}

// Deletion (0x801746E → 0x80174BE): the enemy holds its hurt pose for 21 frames under two deletion bursts
// (effect object 3), then dissolves over 32 frames (mosaic t/2, alpha 16 − t/2).
export const DELETE = { hold: 21, fade: 32 };
// Banner lengths are estimated (the code that runs them was not traced).
export const BANNER = { start: 70, deleted: 90 };
function stepDying(s) {
  for (const e of s.enemies) {
    if (e.hp > 0 || e.kind === 'coil') continue;
    if (e.deadT === undefined) { e.deadT = 0; s.effects.push({ kind: 'deleteburst', x: e.x, y: e.y, t: 0, life: 22 }); }
    else if (e.deadT < DELETE.hold + DELETE.fade) e.deadT++;
  }
}

// ---------- area stealing (AreaGrab 0x80E0754, beam t3 0xF 0x80C6414) ----------
// Special chips (family 0x15 → t4 objects): object_timefreezeBegin, object_dimScreen, object_drawChipName, the chip's own step
// (`hold` frames), object_undimScreen, object_timefreezeEnd. The dim and name lengths are the AreaGrab estimates (GRAB).
function startSpecial(s, name, def, damage, element) {
  const p = s.player, start = GRAB.dim.value + GRAB.name.value;
  let cells = def.kind !== 'panels' ? [] : def.where === 'self' ? [[p.x, p.y]] : [0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => sideAt(s, x, y) === 'p');
  let hold = def.hold || 0, order = null;
  if (def.kind === 'geddon') { // every solid panel but MegaMan's (reserved), shuffled (ShuffleByteList_PrimaryRNG), one every 8 frames
    order = [0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => standable(s, x, y) && !(x === p.x && y === p.y));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng(s) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    hold = 8 * order.length + 8;
  }
  if (def.kind === 'snake') { // sub_80D2CBE: holes on MegaMan's side, back column first
    order = [];
    for (let x = 5; x >= 0; x--) for (let y = 0; y < 3; y++) if (sideAt(s, x, y) === 'p' && !standable(s, x, y)) order.push([x, y]);
    hold = 1e6;
  }
  if (def.kind === 'grabback') { // sub_80E2D98: MegaMan's panels the enemy holds go back
    order = [0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => x <= 2 && sideAt(s, x, y) === 'e');
    for (const [x, y] of order) { s.panels[y][x].side = 'p'; s.panels[y][x].stolenT = 0; s.effects.push({ kind: 'grabland', x, y, t: 0 }); }
    hold = order.length ? 0x1E + 0x1E * order.length + 0x3C : 0x1E;
  }
  if (def.kind === 'lifesync') { // sub_80E72C8
    const tgt = at(s, p.x + 2, p.y), others = tgt && !tgt.big && tgt.owner !== 'player' ? s.enemies.filter(e => e !== tgt && e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil' && !e.big) : [];
    order = others.length ? [tgt, ...others] : [];
    hold = order.length ? 0x14 + 0x3C + 0x1E : 0;
  }
  if (def.kind === 'meteors') { // sub_80E42AA: back column first, rows top to bottom, while the column has enemy panels
    order = [];
    for (let x = 5; x >= 0; x--) { const col = [0, 1, 2].filter(y => sideAt(s, x, y) === 'e'); if (!col.length) break; for (const y of col) order.push([x, y]); }
  }
  if (def.kind === 'mine') { // sub_80CDF18: free solid enemy panels, shuffled
    order = [0, 1, 2, 3, 4, 5].flatMap(x => [0, 1, 2].map(y => [x, y])).filter(([x, y]) => sideAt(s, x, y) === 'e' && standable(s, x, y) && !at(s, x, y));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng(s) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  }
  let cursor = null;
  if (def.kind === 'cursor') { // Magnum: from the front enemy column (sub_800D5F0)
    let fx = 5; while (fx > 0 && [0, 1, 2].some(y => sideAt(s, fx - 1, y) === 'e')) fx--;
    cursor = def.cursor === 'square' ? { x: 4, y: 0, phase: 0, front: 0 } : def.cursor === 'circgun' ? { x: 5, y: 0, vx: -1, vy: 1, phase: 0, wait: 2, shots: [], left: null, life: 0x168 } : { x: fx, y: 1, phase: 0, front: fx };
    hold = 1e6; // ends when it fires
  }
  s.timestop = { name, t: 0, start, special: { def, damage, element, cells, order, cursor }, end: start + hold + GRAB.dim.value, beams: [], cells: [] };
}
function applySpecial(s, sp) {
  const p = s.player, def = sp.def;
  if (def.kind === 'barrier') { p.barrier = def.hp; p.barrierMin = def.min || 0; p.barrierTime = def.time || 0; p.barrierWrap = def.wrap || 0; p.wrapT = 0; }
  else if (def.kind === 'invis') { p.invis = def.ticks; }
  else if (def.kind === 'panels') for (const [x, y] of sp.cells) setPanel(s, x, y, def.type);
  else if (def.kind === 'gauge') s.gaugeMod = { rate: def.rate, t: def.ticks };
  else if (def.kind === 'bugfix') { s.bugs = {}; s.hpBug = null; } // sub_80E49C4
  else if (def.kind === 'trap') s.trap = { kind: def.trap, damage: sp.damage, name: s.timestop?.name };
  else if (def.kind === 'place' && (def.ahead || def.inRow)) {
    let x = p.x + 1;
    if (def.inRow) while (x <= 5 && !(standable(s, x, p.y) && sideAt(s, x, p.y) === 'e' && !at(s, x, p.y))) x++; // sub_80E3264: the first free enemy panel ahead
    if (x <= 5 && standable(s, x, p.y) && !at(s, x, p.y)) s.enemies.push({ id: s.nextId++, kind: 'coil', family: def.obj, name: def.obj, owner: 'player', sprite: def.sprite, palette: def.pal || 0, flip: true, x, y: p.y, drawX: x, drawY: p.y, hp: def.hp, maxHp: def.hp, noHp: true, anim: def.seq, animT: 0, state: 'idle', stateT: 0, flash: 0, discharge: 0, life: def.life, damage: sp.damage, element: sp.element, music: def.music, play: def.play, rest: def.rest, wind: def.wind, raid: def.raid, sensor: def.sensor, anubis: def.anubis, otenko: def.otenko, z: def.anubis ? 160 : 0, cycle: 0 });
  }
  else if (def.apply) def.apply(s, sp);
}
// Traps (hiveBlockHappensHere_802CEF4): returns true when the hit is cleared.
function springTrap(s, damage, element, opts) {
  const tr = s.trap, p = s.player;
  const foes = () => s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil');
  if ((tr.kind === 'damage' || tr.kind === 'bodyguard') && damage >= 10) {
    s.trap = null; s.events.push({ type: 'trap', chip: tr.name });
    s.effects.push({ kind: 'puff', x: p.x, y: p.y, t: 0 }); p.invuln = Math.max(p.invuln, 40); // MegaMan hides (effect 2, the log)
    if (tr.kind === 'damage') { const t = s.attacker?.hp > 0 && s.attacker.owner !== 'player' ? s.attacker : foes()[0]; s.hazards.push({ kind: 'shuriken', owner: 'player', at: s.tick + 3, targets: t ? [t.id] : [], every: 0, damage: tr.damage }); }
    else s.hazards.push({ kind: 'shuriken', owner: 'player', at: s.tick + 3 + 20, cycle: 0, left: 10, every: 20, damage: tr.damage }); // t4 0x6E: 10 shurikens, 0x14 apart
    return true;
  }
  if (tr.kind === 'sword' && opts.sword) {
    s.trap = null; s.events.push({ type: 'trap', chip: tr.name }); p.invuln = Math.max(p.invuln, 3 * 22 + 10);
    for (let k = 0; k < 3; k++) s.hazards.push({ kind: 'widewave', owner: 'player', fx: p.x + 1, x: p.x + 1, y: p.y, speed: 8 / 40, damage: tr.damage, element: 'none', start: s.tick + 12 + 22 * k, hit: [], sprite: 'swordwavefx' });
    return true;
  }
  return false;
}
// ElemTrap (t3 0x4D, sub_80CDFA4): an invisible catcher on every panel (region 0x80, target type 0x18) that records the
// enemy attacks touching any panel; the first Fire / Aqua / Elec / Wood one (sub_80CE034) springs it. The hit on MegaMan,
// if any, still lands. Called for every enemy attack aimed at panels, whether MegaMan stands there or not.
function guardianHitAt(s, cells) { // an enemy attack on the Guardian's panel: it strikes MegaMan
  for (const o of s.enemies) if (o.family === 'Guardian' && o.hp > 0 && cells.some(([x, y]) => x === o.x && y === o.y)) guardianStrikes(s, o, 'player');
}
export function elemTrapSees(s, opts = {}) {
  const tr = s.trap, element = (typeof opts === 'object' ? opts.element : undefined) ?? s.attacker?.element;
  if (tr?.kind !== 'element' || !['fire', 'aqua', 'elec', 'wood'].includes(element)) return;
  s.trap = null; s.events.push({ type: 'trap', chip: tr.name });
  for (const e of s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil')) { hitEnemy(s, e, tr.damage, { element, chip: true }); s.effects.push({ kind: 'blast', x: e.x, y: e.y, t: 0 }); }
}
function startGrab(s, def, damage, element) {
  const p = s.player;
  let cells = [];
  if (def.column) {
    let x = p.x; while (x <= 5 && [0, 1, 2].every(y => sideAt(s, x, y) === 'p')) x++;
    if (x <= 5) cells = [0, 1, 2].map(y => [x, y]);
  } else {
    let x = p.x; while (x <= 5 && sideAt(s, x, p.y) === 'p') x++;
    if (x <= 5) cells = [[x, p.y]];
  }
  s.timestop = { name: p.chip.name, t: 0, start: GRAB.dim.value + GRAB.name.value, cells, damage, element, beams: [] };
}
function stepTimestop(s, input = {}) {
  const ts = s.timestop, t = ++ts.t, fall = GRAB.beamFall.value;
  if (ts.special?.cursor) { stepCursor(s, ts, t, input); s.effects = s.effects.filter(f => ++f.t < 24); if (t >= ts.end) s.timestop = null; return; }
  if (ts.special) { // a special chip: its step runs inside the freeze (panel chips: blink, then set at the end of `hold`)
    const sp = ts.special;
    if (sp.def.kind === 'panels') { if (t === ts.start + sp.def.hold) applySpecial(s, sp); }
    else if (sp.def.kind === 'snake') stepSnakes(s, ts, sp, t);
    else if (sp.def.kind === 'lifesync') { if (sp.order.length && t === ts.start + 0x14 + 0x3C) { const [tgt, ...others] = sp.order; for (const e of others) e.hp = Math.min(e.maxHp ?? tgt.hp, tgt.hp) || tgt.hp; } }
    else if (sp.def.kind === 'blizzard') { if (t === ts.start + 0x22) s.hazards.push({ kind: 'snowball', owner: 'player', fx: s.player.x * 40 + 10, y: s.player.y, x: s.player.x, damage: sp.damage, base: sp.damage, element: sp.element, size: 0 }); }
    else if (sp.def.kind === 'numberball') { // a ball every 0x12 frames from 0x14; each rolls after 0xE + 0xA
      const k = t - ts.start;
      if (k >= 0x14 && (k - 0x14) % 0x12 === 0 && (k - 0x14) / 0x12 < 4) s.hazards.push({ kind: 'numball', owner: 'player', x: s.player.x + 1, y: s.player.y, fx: (s.player.x + 1) * 40, roll: 0xE + 0xA, damage: sp.damage, element: sp.element, t: 0 });
      s.hazards = s.hazards.filter(h => h.kind !== 'numball' || stepNumberBall(s, h));
    }
    else if (sp.def.kind === 'guardianstrike') { // sub_80D4E64: region 0x85 / 0x84, shake 0x3C
      if (t === ts.start) {
        if (sp.def.target === 'player') hitPlayer(s, sp.damage, { element: sp.element });
        else for (const e of s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil')) { hitEnemy(s, e, sp.damage, { element: sp.element, chip: true }); s.effects.push({ kind: 'blast', x: e.x, y: e.y, t: 0 }); }
        s.effects.push({ kind: 'shake', t: 0 });
      }
      if (t === ts.end - 1) { sp.def.obj.hp = 0; s.effects.push({ kind: 'puff', x: sp.def.obj.x, y: sp.def.obj.y, t: 0 }); }
    }
    else if (sp.def.kind === 'grabback') { const k = t - ts.start; if (k > 0 && k % 0x1E === 0 && k / 0x1E <= sp.order.length) for (const e of s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil')) { hitEnemy(s, e, sp.damage, { element: sp.element, chip: true }); s.effects.push({ kind: 'grabland', x: e.x, y: e.y, t: 0 }); } }
    else if (sp.def.kind === 'meteors') { // a meteor every 0xA frames from start + 2; each lands 0x1E + 0x10 later
      const k = t - ts.start - 2 - 46;
      if (sp.order.length && k >= 0 && k % 10 === 0 && k / 10 < 30) {
        const [x, y] = sp.order[(k / 10) % sp.order.length];
        if (standable(s, x, y)) { const e = at(s, x, y); if (e && e.owner !== 'player') hitEnemy(s, e, sp.damage, { element: sp.element, chip: true }); s.effects.push({ kind: 'blast', x, y, t: 0 }, { kind: 'shake', t: 0 }); }
      }
    }
    else if (sp.def.kind === 'mine') { if (t === ts.start + sp.def.hold && sp.order.length) { const [x, y] = sp.order[59 % sp.order.length]; s.hazards.push({ kind: 'chipmine', owner: 'player', x, y, damage: sp.damage, element: sp.element }); } }
    else if (sp.def.kind === 'geddon') { const k = (t - ts.start) / 8 - 1; if (Number.isInteger(k) && k >= 0 && sp.order[k]) { const [x, y] = sp.order[k]; breakPanel(s, x, y); s.effects.push({ kind: 'puff', x, y, t: 0 }); } }
    else if (t === ts.start) applySpecial(s, sp);
    s.effects = s.effects.filter(f => ++f.t < 24);
    if (t >= ts.end) s.timestop = null;
    return;
  }
  if (t === ts.start) ts.beams = ts.cells.map(([x, y]) => ({ x, y, z: 1 }));
  if (t === ts.start + fall) for (const b of ts.beams) {
    const e = at(s, b.x, b.y), mm = s.player.x === b.x && s.player.y === b.y;
    if (e) hitEnemy(s, e, ts.damage, { element: ts.element });
    s.effects.push({ kind: 'grabland', x: b.x, y: b.y, t: 0 });
    const c = s.panels[b.y][b.x];
    if (!e && !mm && c.side === 'e' && sideAt(s, b.x - 1, b.y) === 'p') { c.side = 'p'; c.stolenT = GRAB.returnTicks.value; s.events.push({ type: 'grab', x: b.x, y: b.y }); }
  }
  if (t >= ts.start) for (const b of ts.beams) b.z = Math.max(0, 1 - (t - ts.start) / fall);
  s.effects = s.effects.filter(f => ++f.t < 24);
  if (t >= ts.start + fall + GRAB.hold.value + GRAB.dim.value) s.timestop = null;
}
// NumbrBl's ball (t3 0x91): shows, waits, then rolls 3 px a frame and bursts on the first thing it touches.
function stepNumberBall(s, h) {
  if (++h.t <= h.roll) return true;
  h.fx += 3; h.x = Math.round(h.fx / 40);
  if (h.x > 5) return false;
  const e = at(s, h.x, h.y);
  if (e) { hitEnemy(s, e, h.damage, { element: h.element, chip: true }); s.effects.push({ kind: 'hit', x: h.x, y: h.y, t: 0, damage: 0, jx: 0, jy: 0 }); return false; }
  return true;
}
// Snake (t3 0x72 / 0x73): one snake per hole, flying 16 px a frame at the nearest enemy (row first, then column).
function snakeTarget(s, hx, hy) { // sub_80D2D40
  let best = null;
  for (let x = hx + 1; x <= 5; x++) for (let y = 0; y < 3; y++) {
    const e = at(s, x, y); if (!e || e.owner === 'player') continue;
    if (!best) { best = [x, y]; continue; }
    const dr = Math.abs(y - hy) - Math.abs(best[1] - hy), dc = Math.abs(x - hx) - Math.abs(best[0] - hx);
    if (dr < 0 || (dr === 0 && (dc < 0 || (dc === 0 && x <= best[0])))) best = [x, y];
  }
  return best;
}
function stepSnakes(s, ts, sp, t) {
  const k = t - ts.start; if (k < 0) return;
  sp.snakes ??= []; sp.next ??= 1; sp.i ??= 0;
  if (sp.i < sp.order.length && --sp.next === 0) {
    const [hx, hy] = sp.order[sp.i++];
    sp.snakes.push({ hx, hy, x: hx * 40, y: hy * 24, z: 0, t: 0, target: snakeTarget(s, hx, hy) });
    sp.next = sp.i < sp.order.length && sp.order[sp.i][0] === hx ? 8 : 0x18;
  }
  for (const n of sp.snakes) {
    n.t++;
    if (n.z < 10) { n.z += 2; continue; }                // rise
    if (n.t <= 5 + 0x14) continue;                       // wait
    if (n.t <= 5 + 0x14 + 9) { n.anim = 'bite'; continue; } // bite (animation 1: 2 + 6 + 1 frames)
    const [tx, ty] = n.target ? [n.target[0] * 40, n.target[1] * 24] : [n.x + 1000, n.y];
    const d = Math.hypot(tx - n.x, ty - n.y), v = Math.min(16, d);
    if (d > 0) { n.x += (tx - n.x) / d * v; n.y += (ty - n.y) / d * v; }
    const px = Math.round(n.x / 40), py = Math.round(n.y / 24);
    if (n.target && px === n.target[0] && py === n.target[1]) { const e = at(s, px, py); if (e && e.owner !== 'player') hitEnemy(s, e, sp.damage, { element: sp.element, chip: true }); n.done = true; }
    if (px > 5) n.done = true;
  }
  sp.snakes = sp.snakes.filter(n => !n.done);
  if (sp.i >= sp.order.length && !sp.snakes.length && ts.end > ts.start + k + 0x28 + GRAB.dim.value) ts.end = ts.start + k + 0x28 + GRAB.dim.value;
}
// CircGun (t3 0x89): the cursor bounces round the enemy area; armed, it marks the next 4 panels it leaves (t3 0x8A).
function stepCircGun(s, ts, sp, c, k, input) {
  if (c.left === null && (input.b || --c.life < 0)) c.left = CHIP_DATA.CircGun?.params?.[1] ?? 4;
  if (c.left !== 0 && --c.wait < 0) {
    const ox = c.x, oy = c.y;
    if (c.phase === 0) { const y = c.y + c.vy; if (y >= 0 && y <= 2) { c.y = y; c.wait = 2; } else { c.vy = -c.vy; c.phase = 1; c.wait = 0; } } // sub_80D6694
    else { const x = c.x + c.vx; if (x >= 0 && x <= 5 && [0, 1, 2].some(y => sideAt(s, x, y) === 'e')) { c.x = x; c.wait = 2; } else { c.vx = -c.vx; c.phase = 0; c.wait = 0; } } // sub_80D66E2
    if ((c.x !== ox || c.y !== oy) && c.left > 0) { c.shots.push({ x: ox, y: oy, at: k + 0x14 + 4 * 2 }); c.left--; }
  }
  for (const m of c.shots) if (k === m.at) { // sub_80D688C
    if (standable(s, m.x, m.y)) { const e = at(s, m.x, m.y); if (e && e.owner !== 'player') hitEnemy(s, e, sp.damage, { element: sp.element, chip: true }); s.effects.push({ kind: 'blast', x: m.x, y: m.y, t: 0 }); }
    m.done = true;
  }
  c.shots = c.shots.filter(m => !m.done);
  if (c.left === 0 && !c.shots.length && !c.endAt) { c.endAt = k + 0x1E; ts.end = ts.start + c.endAt + GRAB.dim.value; }
}
// Cursor chips (BurnSqr t1 0x13, Magnum t1 0x14): the cursor steps on its own until the chip button or 0x12C frames.
export function cursorCells(c, kind) {
  if (kind === 'square') return [[c.x, c.y], [c.x + 1, c.y], [c.x + 1, c.y + 1], [c.x, c.y + 1]];
  return (c.fired ?? c.phase) === 0 ? [[c.x, c.y - 1], [c.x, c.y], [c.x, c.y + 1]] : [[c.x - 1, c.y], [c.x, c.y], [c.x + 1, c.y]]; // region 4 / 0x1D
}
function stepCursor(s, ts, t, input) {
  const sp = ts.special, c = sp.cursor, def = sp.def, k = t - ts.start;
  if (k < 0) return;
  if (def.cursor === 'circgun') return stepCircGun(s, ts, sp, c, k, input);
  if (c.fireAt === undefined) {
    if (k > 0 && k % def.every === 0) {
      if (def.cursor === 'square') { // ho_80BB170: y = row 2; x 5 → 1; y = row 1; x 1 → 5 (game)
        if (c.phase === 0) { c.y = 1; c.phase = 1; }
        else if (c.phase === 1) { if (--c.x === 0) c.phase = 2; }
        else if (c.phase === 2) { c.y = 0; c.phase = 3; }
        else if (++c.x === 4) c.phase = 0;
      } else { // sub_80BB4CE
        if (c.phase === 0) { if (c.x === 5) { c.x = 4; c.y = 0; c.phase = 1; } else c.x++; }
        else if (c.y >= 2) { c.x = c.front; c.y = 1; c.phase = 0; } else c.y++;
      }
    }
    if (input.b || k >= 0x12C) { c.fireAt = k + 16; c.fired = c.phase === 0 || def.cursor === 'square' ? 0 : 1; }
    return;
  }
  if (k === c.fireAt) {
    for (const [x, y] of cursorCells(c, def.cursor)) {
      if (x < 0 || x > 5 || y < 0 || y > 2) continue;
      if (def.cursor === 'square' && !standable(s, x, y)) continue; // sub_80BB228: solid panels only
      const e = at(s, x, y); if (e && e.owner !== 'player') hitEnemy(s, e, sp.damage, { element: sp.element, chip: true });
      s.effects.push({ kind: 'blast', x, y, t: 0 });
      if (def.cursor === 'magnum') breakPanel(s, x, y); // object_breakPanel: cracked where someone stands
    }
    if (def.cursor === 'magnum') s.effects.push({ kind: 'shake', t: 0 });
    ts.end = ts.start + c.fireAt + 0x3C + GRAB.dim.value;
  }
}
// Stolen panels go back after the return timer, once nobody stands on them (hand-back order partly decoded).
function stepArea(s) {
  for (let y = 0; y < 3; y++) for (let x = 3; x <= 5; x++) {
    const c = s.panels[y][x];
    if (c.side !== 'p' || !c.stolenT) continue;
    if (c.stolenT > 1) { c.stolenT--; continue; }
    if (!(s.player.x === x && s.player.y === y)) { c.side = 'e'; c.stolenT = 0; s.events.push({ type: 'areaReturn', x, y }); }
  }
}

// ---------- player ----------
function stepPlayer(s, input) {
  const p = s.player;
  p.animT++; p.stateT++;
  if (p.invuln > 0) p.invuln--;
  if (p.invis > 0) p.invis--;
  if (p.chipLockout > 0) p.chipLockout--; // sub_80107D4 (not during a time freeze)
  if (p.barrierTime > 0 && --p.barrierTime === 0) p.barrier = 0;        // LifeAur runs out (Unk_1a_1b)
  if (p.barrierWrap && p.barrier === 0 && ++p.wrapT >= p.barrierWrap) p.barrier = 1; // BblWrap grows back (sub_801A802)
  if (p.blind > 0) p.blind--;
  if (p.guardHitT > 0) p.guardHitT--;
  if (s.hpBug && p.hp > 1 && s.phase === 'battle') { // HP bug: 1 HP every byte_80102A4[level] frames, never below 1 (sub_8010230)
    const N = BUGS.hpDrainFrames.value[s.hpBug.level];
    if (N && ++s.hpBug.t >= N) { s.hpBug.t = 0; p.hp--; }
  }
  if (p.confused > 0) p.confused--;
  stepEmotion(s);
  if (p.bubble > 0) { // Bubbled: can't act until it wears off or a hit lands; mashing shortens it
    const keys = (input.a ? 'a' : '') + (input.b ? 'b' : '') + (input.dir || '');
    if (keys && keys !== p.trapKeys) p.bubble--;
    p.trapKeys = keys; p.bubble--; p.prevA = !!input.a; p.holdT = 0; p.charge = 0;
    if (p.bubble <= 0) { p.bubble = 0; s.events.push({ type: 'bubblePop' }); }
    return;
  }
  const pressedA = input.a && !p.prevA, releasedA = !input.a && p.prevA;
  p.prevA = !!input.a;

  if (p.trapped > 0) { // CircusMan's tent: mash buttons to get out sooner
    const keys = (input.a ? 'a' : '') + (input.b ? 'b' : '') + (input.dir || '');
    if (keys && keys !== p.trapKeys) p.trapped -= p.trapMash || 0;
    p.trapKeys = keys; p.trapped--; p.prevA = !!input.a;
    if (p.trapped <= 0) { p.trapped = 0; p.state = 'idle'; setAnim(p, 'idle'); }
    return;
  }
  if (p.paralyzed > 0) { // mashing shortens it (0x8017628)
    const keys = (input.a ? 'a' : '') + (input.b ? 'b' : '') + (input.dir || '');
    if (keys && keys !== p.trapKeys) p.paralyzed--;
    p.trapKeys = keys; p.paralyzed--; p.prevA = !!input.a; p.animT = 0;
    if (p.paralyzed <= 0) { p.paralyzed = 0; p.state = 'idle'; setAnim(p, 'idle'); }
    return;
  }
  if (p.state === 'flinch') {
    if (p.stateT >= val('flinchTicks')) { p.state = 'idle'; setAnim(p, 'idle'); }
    return;
  }
  if (p.bLeftCool > 0) p.bLeftCool--;
  if (p.state === 'guard' || p.state === 'antidmg') { // B+Left abilities run for their window
    if (p.stateT >= p.abilityTicks) { p.state = 'idle'; setAnim(p, 'idle'); }
    return;
  }
  if (p.state === 'vanish') {
    if (p.stateT >= val('moveVanishTicks')) {
      const lc = BUGS.panelChance.value[bug(s, 3)]; // panel bug: the panel MegaMan leaves may crack (sub_8013CC4)
      if (lc && Math.floor(rng(s) * 8) <= lc - 1) crackPanel(s, p.x, p.y);
      [p.x, p.y] = p.dest; p.dest = null; p.state = 'appear'; p.stateT = 0; setAnim(p, 'appear');
      if (panelType(s, p.x, p.y) === 'ice' && p.moveDir && !s.navi?.floatShoes) p.slide = p.moveDir; // stepping onto ice: keep going (not with FlotShoe)
    }
    return;
  }
  if (p.state === 'slide') { // ice: glide one panel at a time until off the ice or blocked
    const T = PANELS.iceSlideTicks.value, [dx, dy] = p.slide;
    p.drawX = p.x + dx * Math.min(1, p.stateT / T); p.drawY = p.y + dy * Math.min(1, p.stateT / T);
    if (p.stateT >= T) { p.x += dx; p.y += dy; p.drawX = p.drawY = null; p.state = 'idle'; p.stateT = 0; setAnim(p, 'idle'); if (panelType(s, p.x, p.y) !== 'ice') p.slide = null; }
    else return;
  }
  if (p.slide && (p.state === 'idle' || p.state === 'appear')) {
    const [dx, dy] = p.slide, x = p.x + dx, y = p.y + dy;
    if (x >= 0 && x <= 5 && y >= 0 && y < 3 && sideAt(s, x, y) === 'p' && !at(s, x, y) && standable(s, x, y)) { p.state = 'slide'; p.stateT = 0; setAnim(p, 'idle'); return; }
    p.slide = null;
  }
  // Charge accumulates while A is held in any non-flinch state.
  // Charge counts every held tick (sub_8012EBC): the aura shows from chargeDelay, full at chargeTime.
  if (input.a) { p.holdT++; p.charge = Math.min(s.chargeTime, p.charge + 1); }
  if (p.state === 'appear' && p.stateT >= val('moveAppearTicks')) { p.state = 'idle'; setAnim(p, 'idle'); }
  if ((p.state === 'buster' && p.stateT >= (p.busterWait ?? val('busterCooldown'))) || (p.state === 'chip' && p.stateT >= p.chip.lock)) {
    if (p.state === 'chip') p.chipLockout = CHIP_DATA[p.chip.name]?.lockout || 0; // sub_801171C: ChipData LockoutFrames → AIData ChipLockoutTimer when the chip's attack ends
    p.state = 'idle'; p.chip = null; setAnim(p, 'idle');
    if (p.home) { [p.x, p.y] = p.home; p.home = null; } // StepSwrd: back to where he stood
  }
  if (p.state !== 'idle') { if (releasedA) { p.holdT = 0; p.charge = 0; } return; }

  if (releasedA) {
    const full = p.charge >= s.chargeTime;
    p.holdT = 0; p.charge = 0;
    if (full) {
      p.state = 'buster'; p.stateT = 0; setAnim(p, 'buster');
      hitEnemy(s, rowTarget(s, p.x, p.y), 10 * (1 + s.navi.attack + s.busterUp), { fx: 'charge' }); // (Attack + 1) × 10 (0x8011A7E)
      p.busterWait = busterWait(s, p);
      s.events.push({ type: 'chargeShot' });
      return;
    }
  }
  if (input.b && s.queue.length && !(p.chipLockout > 0)) { useChip(s, s.queue.shift()); return; } // sub_800A772: no chip while ChipLockoutTimer runs
  if (pressedA) {
    p.state = 'buster'; p.stateT = 0; setAnim(p, 'buster');
    const roll = busterBugRoll(s); // buster bug: a normal shot may misfire (family 0x33) or come out charged (0x16)
    if (roll === 1) { p.busterWait = busterWait(s, p); s.events.push({ type: 'misfire' }); return; }
    if (roll === 2) { hitEnemy(s, rowTarget(s, p.x, p.y), 10 * (1 + s.navi.attack + s.busterUp), { fx: 'charge' }); p.busterWait = busterWait(s, p); s.events.push({ type: 'chargeShot' }); return; }
    hitEnemy(s, rowTarget(s, p.x, p.y), 1 + s.navi.attack + s.busterUp, { fx: 'buster' }); // Attack + 1 (sub_801265A)
    p.busterWait = busterWait(s, p);
    return;
  }
  // B+Left (BLeftAbility, power attacks 0x3B / 0x8B / 0x3D): with B held, Left uses the program instead of moving
  const leftNow = input.dir === 'left' && p.prevDir !== 'left';
  p.prevDir = input.dir;
  if (s.navi.bLeft && input.a && leftNow && !(p.bLeftCool > 0)) {
    const A = B_LEFT[s.navi.bLeft];
    p.state = A.state; p.stateT = 0; p.abilityTicks = A.ticks; p.guardReflect = !!A.reflect; p.reflected = false; p.reflectDamage = null; p.bLeftCool = A.ticks + A.cool;
    p.holdT = 0; p.charge = 0; setAnim(p, 'idle');
    s.events.push({ type: 'bLeft', ability: s.navi.bLeft });
    return;
  }
  const d0 = DIRS[input.dir], d = d0 && p.confused > 0 ? [-d0[0], -d0[1]] : d0; // Confused: the D-pad is reversed
  if (d) {
    const ok = (x, y) => x >= 0 && x <= 5 && y >= 0 && y < 3 && sideAt(s, x, y) === 'p' && !at(s, x, y)
      && (standable(s, x, y) || (s.navi.airShoes && panelType(s, x, y) === 'broken')); // AirShoes: "Move ovr hole"
    let x = p.x + d[0], y = p.y + d[1];
    if (bug(s, 1)) while (ok(x + d[0], y + d[1])) { x += d[0]; y += d[1]; } // processing bug: slide to the last free panel
    if (ok(x, y)) {
      p.dest = [x, y]; p.moveDir = d; p.state = 'vanish'; p.stateT = 0; setAnim(p, 'vanish');
    }
  }
}

// ---------- viruses ----------
const HOLE = { hole: true, hp: 0 };
function virusApi(s) {
  const p = s.player;
  return {
    s,
    at: (x, y) => at(s, x, y) || (standable(s, x, y) && !(x >= 3 && sideAt(s, x, y) === 'p') ? undefined : HOLE), // a broken or stolen panel can't be moved onto
    crackPanel: (x, y) => crackPanel(s, x, y),
    breakPanel: (x, y) => breakPanel(s, x, y),
    setPanel: (x, y, type) => setPanel(s, x, y, type),
    panelType: (x, y) => panelType(s, x, y),
    hitPlayerAt(x, y, damage, opts) { elemTrapSees(s, opts); guardianHitAt(s, [[x, y]]); if (p.x === x && p.y === y && p.state !== 'vanish') hitPlayer(s, damage, opts); },
    hitPlayerCells(cells, damage, opts) { elemTrapSees(s, opts); guardianHitAt(s, cells); if (p.state !== 'vanish' && cells.some(([x, y]) => p.x === x && p.y === y)) hitPlayer(s, damage, opts); },
    rng: () => rng(s),
    coils: owner => s.enemies.filter(c => c.kind === 'coil' && c.owner === owner.id && c.hp > 0),
    addEnemy(o) { o.id = s.nextId++; s.enemies.push(o); return o; },
    removeEnemy(o, how) { if (o.hp <= 0) return; o.hp = 0; s.effects.push({ kind: how === 'explode' ? 'blast' : 'delete', x: o.x, y: o.y, t: 0 }); },
    spawnWave(e, x, y, stepTicks, damage = e.damage) { s.hazards.push({ kind: 'wave', owner: e.id, family: e.family, x, y, dir: -1, step: stepTicks, next: s.tick + stepTicks, damage, start: s.tick }); },
    turnFree(e) { const t = s.turns[e.family]; return t === undefined || t === e.id || !s.enemies.some(o => o.id === t && o.hp > 0); },
    takeTurn(e) { s.turns[e.family] = e.id; },
    endTurn(e) { if (s.turns[e.family] === e.id) delete s.turns[e.family]; },
  };
}

function stepHazards(s) {
  const p = s.player, spawned = []; // hazards started this frame are added after the pass
  s.hazards = s.hazards.filter(h => {
    s.attacker = h.owner !== undefined ? s.enemies.find(e => e.id === h.owner) : null;
    if (s.trap?.kind === 'element' && s.attacker && h.owner !== 'player') { // ElemTrap sees an enemy hazard once it can hurt a panel
      const live = h.hit ?? h.land ?? h.arm ?? h.start;
      if (live === undefined || s.tick >= live) elemTrapSees(s, { element: h.elem ?? h.element ?? s.attacker.element });
    }
    if (h.kind === 'pvulcan') { // Vulcan: one shot per gap; each also hits the panel behind its target
      if (s.tick < h.at) return true;
      const t = rowTarget(s, h.from, h.y);
      if (t) { hitEnemy(s, t, h.damage, { element: h.element, paralyze: h.paralyze }); const b = at(s, t.x + 1, h.y); if (b && b !== t) hitEnemy(s, b, h.damage, { element: h.element, paralyze: h.paralyze }); }
      s.effects.push({ kind: 'shot', x: t ? t.x : 5, y: h.y, t: 0, z: t ? [8, 16, 24, 32][(s.tick * 5 + h.at) & 3] : 0, hit: !!t }); // effect object 0x20 at 8/16/24/32 px (dword_80EBFF0)
      return false;
    }
    if (h.kind === 'crackshot') { // CrakShot: the lifted panel slides down the row and hits the first enemy
      h.fx += h.speed; h.x = Math.round(h.fx);
      const e = at(s, h.x, h.y);
      if (e) { hitEnemy(s, e, h.damage, { element: h.element, paralyze: h.paralyze }); s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 }); return false; }
      return h.fx < 6;
    }
    if (h.kind === 'volcano') { // volcano eruption (object type3 0x07): bubbles, then a flame column hits whoever stands there
      if (s.tick >= h.hit && s.tick < h.until && panelType(s, h.x, h.y) === 'volcano') {
        if (p.x === h.x && p.y === h.y && p.state !== 'vanish' && !h.done.includes('p')) { h.done.push('p'); hitPlayer(s, h.damage, { element: 'none' }); }
        const e = at(s, h.x, h.y); if (e && !h.done.includes(e.id)) { h.done.push(e.id); hitEnemy(s, e, h.damage); }
      }
      return s.tick < h.until && (s.tick < h.hit || panelType(s, h.x, h.y) === 'volcano');
    }
    if (h.kind === 'wave') {
      // Shockwave type3 0x16 (0x80C6B64 / 0x80C6C14): each segment needs panel flag 0x10 under it, every frame.
      // Broken panels (flags 0x14000) lack it, so the wave dies at a hole; cracked panels (0x10050) carry it.
      const solid = () => h.big || standable(s, h.x, h.y);
      if (!solid()) { if (s.turns[h.family] === h.owner) delete s.turns[h.family]; return false; }
      if (h.fromPlayer) { const e = at(s, h.x, h.y); if (e && !h.hit.includes(e.id)) { h.hit.push(e.id); hitEnemy(s, e, h.damage, { chip: true }); } }
      else if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      if (s.tick >= h.next) { h.x += h.dir; h.next = s.tick + h.step; }
      const alive = h.x >= 0 && h.x <= 5 && solid();
      if (!alive && s.turns[h.family] === h.owner) delete s.turns[h.family];
      return alive;
    }
    if (h.kind === 'pillar') {
      const t = s.tick - h.start, active = t >= h.rise && t < h.rise + h.burn;
      if (active && p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return t < h.rise + h.burn + h.fall;
    }
    if (h.kind === 'kunai') {
      const t = s.tick - h.start;
      if (t > h.spin) { h.fx = h.x - ((t - h.spin) * h.speed) / 40; }
      const px = Math.round(h.fx);
      if (t > h.spin && p.x === px && p.y === h.y && p.state !== 'vanish') { hitPlayer(s, h.damage, { sword: h.sword }); return false; }
      return h.fx > -1;
    }
    if (h.kind === 'nozzle') {
      if (h.cells.some(([x, y]) => p.x === x && p.y === y) && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'mark') { // EraseMan target marker: follows MegaMan a panel at a time, then locks
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (!h.locked && s.tick >= h.next) {
        h.next = s.tick + h.step;
        h.x += Math.sign(p.x - h.x); if (h.x === p.x) h.y += Math.sign(p.y - h.y);
      }
      if (!h.locked && s.tick >= h.until) h.locked = true;
      return true;
    }
    if (h.kind === 'cmissile') { // Colonel's cannon missile
      if (s.tick < h.land) return true;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'estrike') { // ElementMan: a lit panel, then an elemental strike on it
      if (s.tick === h.hit && p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage, { element: h.elem, sword: h.sword });
      if (s.tick === h.hit && h.panel) setPanel(s, h.x, h.y, h.panel);
      return s.tick < h.hit + 12;
    }
    if (h.kind === 'portal') { // EraseMan's dark portal: opens, then a ghost lunges out for a few frames
      if (s.tick >= h.hit && s.tick < h.hit + h.hitFor && !h.done && p.x === h.x && p.y === h.y && p.state !== 'vanish') { h.done = true; hitPlayer(s, h.damage); }
      return s.tick < h.until && s.enemies.some(e => e.id === h.owner && e.hp > 0);
    }
    if (h.kind === 'mine') { // DiveMan's mine: surfaces, then shoots off down its row as a torpedo
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (s.tick >= h.launch) h.x = h.x0 - (s.tick - h.launch) / h.step;
      if (s.tick >= h.arm && !h.done && Math.round(h.x) === p.x && h.y === p.y && p.state !== 'vanish') { h.done = true; hitPlayer(s, h.damage); return false; }
      return h.x > -1;
    }
    if (h.kind === 'shock') { // Gregar's landing: a ground shock running down MegaMan's row
      const k = Math.floor((s.tick - h.start) / h.step);
      if (k < 0) return true;
      h.x = h.x0 - k;
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish' && !h.hit) { h.hit = true; hitPlayer(s, h.damage); }
      return h.x >= 0;
    }
    if (h.kind === 'hoop') return s.tick < h.until && s.enemies.some(e => e.id === h.owner && e.hp > 0);
    if (h.kind === 'lion') { // CircusMan's lion runs down the row through the hoop
      const k = Math.floor((s.tick - h.start) / h.step);
      if (k < 0) return true;
      h.x = h.x0 - k;
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return h.x >= -1;
    }
    if (h.kind === 'clap') {
      if (s.tick === h.hit && h.cells.some(([x, y]) => p.x === x && p.y === y) && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.hit + 10;
    }
    if (h.kind === 'torpedo') { // DiveMan's torpedo: flies to the panel MegaMan was on
      if (s.tick < h.land) return true;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'blast') { // BlastMan's lingering blast on a panel
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'fireball') { // moves a panel every h.step frames for h.left panels
      const k = Math.floor((s.tick - h.start) / h.step);
      h.x = Math.round(h.fx + h.dx * k); h.cy = h.y + h.dy * k;
      if (h.x === p.x && h.cy === p.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return k < h.left;
    }
    if (h.kind === 'junk') { // DustMan's junk cube lands on the marked panel
      if (s.tick < h.land) return true;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'scrap') {
      h.fx -= h.speed;
      if (Math.round(h.fx) === p.x && h.y === p.y && p.state !== 'vanish') { hitPlayer(s, h.damage); return false; }
      return h.fx > -1;
    }
    if (h.kind === 'missile') { // GroundMan's drill clones: wait, then fly down their row
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (h.flying) h.fx -= 0.2;
      const x = Math.round(h.fx);
      if (h.flying && x === p.x && h.y === p.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return h.fx > -1.5;
    }
    if (h.kind === 'rock') {
      if (s.tick < h.land) return true;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'rockbreak', x: h.x, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'bee') { // HoneyBomber's bee: steps a panel toward MegaMan at a time
      if (s.tick >= h.until || !s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (s.tick >= h.next) { h.next = s.tick + h.step; if (h.x !== p.x) h.x += Math.sign(p.x - h.x); else if (h.y !== p.y) h.y += Math.sign(p.y - h.y); }
      h.fx += (h.x - h.fx) * 0.3; h.fy += (h.y - h.fy) * 0.3;
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish') { hitPlayer(s, h.damage); return false; }
      return true;
    }
    if (h.kind === 'bolt') { // a projectile flying along a row (virus torpedoes, Heady's head)
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      h.fx += h.dx; h.x = Math.round(h.fx);
      if (h.until && s.tick >= h.until) return false;
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish' && !h.hit) { h.hit = true; hitPlayer(s, h.damage, { bubble: !!h.bubble }); if (!h.keep) return false; }
      return h.fx > -1.5;
    }
    if (h.kind === 'elecball') { // DarkMech (object type3 0xC0): along the row to MegaMan's column, then up or down it
      if (h.vy === undefined) {
        h.fx -= h.speed / 40;
        if (Math.abs(h.fx - p.x) * 40 <= 3) { h.fx = p.x; h.vy = p.y >= h.fy ? 1 : -1; }
      } else h.fy += h.vy * h.speed / 24;
      h.x = Math.round(h.fx); h.y = Math.round(h.fy);
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish' && !(p.invuln > 0)) { hitPlayer(s, h.damage, { paralyze: h.paralyze }); s.effects.push({ kind: 'elechit', x: h.fx, y: h.fy, t: 0 }); return false; }
      return h.fx > -0.5 && h.fy > -0.5 && h.fy < 2.5;
    }
    if (h.kind === 'planebomb') { // FighterPlane bomb (object type3 0xD3): the panel flashes, then it bursts
      if (s.tick < h.burst) return true;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'bombblast', x: h.x, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'twister') { // ElementMan's basic tornado: forward 5 panels, 2 rows across, back 6 panels
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      const d = Math.max(0, (s.tick - h.start) * h.speed), [l0, l1, l2] = h.legs;
      if (d < l0) { h.fx = h.x0 - d / 40; h.fy = h.y0; }
      else if (d < l0 + l1) { h.fx = h.x0 - l0 / 40; h.fy = h.y0 + h.dy * (d - l0) / 24; }
      else if (d < l0 + l1 + l2) { h.fx = h.x0 - l0 / 40 + (d - l0 - l1) / 40; h.fy = h.y0 + h.dy * l1 / 24; }
      else return false;
      h.x = Math.round(h.fx); h.y = Math.round(h.fy);
      if (s.tick >= h.start && p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return true;
    }
    if (h.kind === 'tornado') { // TenguMan's tornadoes drift a panel at a time
      if (s.tick >= h.until || !s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      const k = Math.floor((s.tick - h.start) / h.step);
      h.x = Math.round(h.fx + h.dx * k); h.y = Math.round(h.fy + h.dy * k);
      if (h.x < 0 || h.x > 5 || h.y < 0 || h.y > 2) return false;
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return true;
    }
    if (h.kind === 'axe') { // TomahawkMan's thrown axe: lands on the marked column
      if (s.tick < h.land) return true;
      if (h.cells.some(([x, y]) => p.x === x && p.y === y) && p.state !== 'vanish') hitPlayer(s, h.damage, { sword: h.sword });
      for (const [x, y] of h.cells) s.effects.push({ kind: 'spark', x, y, t: 0 });
      return false;
    }
    if (h.kind === 'axewave') {
      if (s.tick >= h.start && p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'lob') { // SpoutMan water bomb: lands on the panel MegaMan stood on
      if (s.tick < h.land) return true;
      if (p.x === h.tx && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      s.effects.push({ kind: 'splash', x: h.tx, y: h.y, t: 0 });
      return false;
    }
    if (h.kind === 'stream') {
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (h.cells.some(([x, y]) => p.x === x && p.y === y) && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'car') { // ChargeMan's train cars; moved by ChargeMan, hit like his body
      if (!s.enemies.some(e => e.id === h.owner && e.hp > 0)) return false;
      if (Math.round(h.fx) === p.x && h.y === p.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return true;
    }
    if (h.kind === 'burst') {
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'rowbolt' || h.kind === 'colbolt') {
      const hit = h.kind === 'rowbolt' ? p.y === h.y && p.x < h.x : p.x === h.x;
      if (hit && p.state !== 'vanish') hitPlayer(s, h.damage);
      return s.tick < h.until;
    }
    if (h.kind === 'bomb') {
      if (s.tick < h.land) return true;
      const solid = h.tx <= 5 && standable(s, h.tx, h.y);
      if (!solid) { s.effects.push({ kind: 'puff', x: h.tx, y: h.y, t: 0 }); return false; } // fell in a hole (t1 effect 1)
      const target = at(s, h.tx, h.y);
      if (h.place) { // a placed bomb: an object on the landing panel (MegaMan's side)
        if (target) { s.effects.push({ kind: 'puff', x: h.tx, y: h.y, t: 0 }); return false; }
        const d = h.place;
        s.enemies.push({ id: s.nextId++, kind: 'coil', family: d.obj, name: d.obj, owner: 'player', statusCode: d.statusCode, sprite: d.sprite, palette: 0, flip: true, x: h.tx, y: h.y, drawX: h.tx, drawY: h.y,
          hp: d.hp, maxHp: d.hp, noHp: true, anim: 'idle', animT: 0, state: 'idle', stateT: 0, flash: 0, discharge: 0, life: d.life, hitsLeft: d.hits, soaked: 0, damage: h.damage, element: h.element });
        return false;
      }
      if (h.seed) { // seeds (t3 0x4F): the panel type over 3×3, or only the panel hit if it hit someone (sub_80CE3C4)
        if (target) hitEnemy(s, target, h.damage, { element: h.element, chip: true });
        for (const [dx, dy] of REGIONS[target ? 1 : 0xF]) {
          const x = h.tx + dx, y = h.y + dy;
          if (x >= 0 && x <= 5 && y >= 0 && y < 3 && panelType(s, x, y) !== 'broken') setPanel(s, x, y, h.seed);
        }
        s.effects.push({ kind: 'blast', x: h.tx, y: h.y, t: 0 });
        return false;
      }
      if (h.hits) { // EnergBom (t3 0x11): the landing panel is hit 3 times, 7 frames apart (sub_80C6854)
        Object.assign(h, { kind: 'multihit', x: h.tx, left: h.hits, next: s.tick, gap: 7 });
        return true;
      }
      for (const [dx, dy] of REGIONS[h.region || 1]) { // the landing area (dword_80C5D7C)
        const x = h.tx + dx, y = h.y + dy;
        if (x < 0 || x > 5 || y < 0 || y > 2) continue;
        hitEnemy(s, at(s, x, y), h.damage, { paralyze: h.paralyze, element: h.element, chip: true });
        s.effects.push({ kind: 'blast', x, y, t: 0 });
      }
      return false;
    }
    if (h.kind === 'flame') { // a burner flame (t3 0x4): hits whoever stands in it once, spreads ahead after 4 frames
      if (h.x < 0 || h.x > 5 || h.y < 0 || h.y > 2 || !standable(s, h.x, h.y)) return false;
      const e = at(s, h.x, h.y);
      if (e && !h.hit.includes(e.id)) { h.hit.push(e.id); hitEnemy(s, e, h.damage, { element: h.element, chip: true }); }
      const age = s.tick - h.born;
      if (age === 4 && h.spread > 0) {
        const rows = h.wide ? [h.y - 1, h.y, h.y + 1] : [h.y];
        for (const y of rows) spawned.push({ ...h, x: h.x + 1, y, born: s.tick, spread: h.spread - 1, wide: false, hit: [] });
      }
      if (age >= h.life) { if (h.crack) crackPanel(s, h.x, h.y); return false; }
      return true;
    }
    if (h.kind === 'shell') { // rolling shell (t3 0x34): hits each enemy it passes, stops at a hole or the far edge
      if (s.tick < h.start) return true; // StreamHd: the later heads wait their turn
      if (h.x > h.toX || h.x > 5 || (!h.fly && !standable(s, h.x, h.y))) return false;
      const e = at(s, h.x, h.y);
      if (e && !h.hit.includes(e.id)) { h.hit.push(e.id); hitEnemy(s, e, h.damage, { element: h.element, chip: true, bubble: h.bubble }); if (h.stopOnHit) return false; }
      h.fx += h.speed; h.x = Math.round(h.fx);
      return true;
    }
    if (h.kind === 'pulse') { // ElecPulse (t3 0x8C): its area hits each enemy once while it is held out
      for (const [dx, dy] of REGIONS[h.region]) {
        const e = at(s, h.x + dx, h.y + dy);
        if (!e || h.hit.includes(e.id)) continue;
        h.hit.push(e.id); hitEnemy(s, e, h.damage, { element: h.element, paralyze: h.paralyze, chip: true });
        if (h.pull && e.hp > 0 && !e.cells) { const nx = e.x - 1; if (nx >= 3 && !at(s, nx, e.y) && standable(s, nx, e.y)) e.x = nx; }
      }
      return s.tick - h.start < h.hold;
    }
    if (h.kind === 'widewave') { // WideShot (t3 0x3B): its column, rows y−1..y+1, hits each enemy once
      if (s.tick < h.start) return true;
      if (h.x > 5) return false;
      for (const dy of [-1, 0, 1]) { const e = at(s, h.x, h.y + dy); if (e && !h.hit.includes(e.id)) { h.hit.push(e.id); hitEnemy(s, e, h.damage, { element: h.element, chip: true }); } }
      h.fx += h.speed; h.x = Math.round(h.fx);
      return true;
    }
    if (h.kind === 'machgun') { // MachGun: one shot per `every` frames, sweeping the nearest enemy column
      if (s.tick < h.next) return true;
      hitEnemy(s, at(s, h.col, h.row), h.damage, { element: h.element, chip: true });
      s.effects.push({ kind: 'hit', x: h.col, y: h.row, t: 0, fx: 'buster', damage: 0, jx: 0, jy: 0 });
      const r = h.row + h.dir;
      if (r < 0 || r > 2) { // the edge: turn round; step toward the nearest enemy column if it moved
        h.dir = -h.dir; const c = nearestEnemyColumn(s, p.x);
        if (c === h.col) h.row += h.dir; else h.col += c > h.col ? 1 : -1;
      } else h.row = r;
      h.next = s.tick + h.every;
      return --h.left > 0;
    }
    if (h.kind === 'needle') { // AquaNeedle: lands on the panel at its time
      if (s.tick < h.at) return true;
      hitEnemy(s, at(s, h.x, h.y), h.damage, { element: h.element, chip: true });
      s.effects.push({ kind: 'hit', x: h.x, y: h.y, t: 0, fx: 'buster', damage: 0, jx: 0, jy: 0 });
      return false;
    }
    if (h.kind === 'chiptwister') { // Tornado (t3 0x31): hits its panel every `every` frames
      const age = s.tick - h.start;
      if (age >= h.life) return false; // frames 0, 4, … 28: 8 hits
      if (age % h.every === 0) hitEnemy(s, at(s, h.x, h.y), h.damage, { element: h.element, chip: true });
      return true;
    }
    if (h.kind === 'sunbeam') { // GunDelSol: a hit area every frame while the sun shines
      if (s.tick < h.start) return true;
      if (s.tick >= h.end) return false;
      for (const e of new Set(h.area.map(([dx, dy]) => at(s, h.x + dx, h.y + dy)).filter(Boolean))) hitEnemy(s, e, h.per, { element: h.element, chip: true, quiet: true });
      return true;
    }
    if (h.kind === 'bees') { // RiskyHoney (t3 0x74): fly to the target, then cling and hit every 5 frames
      h.t++;
      if (h.on) {
        if (h.on.hp <= 0) return false;
        h.fx = h.on.x; h.fy = h.on.y;
        if ((h.t - h.from) % h.every) return true;
        hitEnemy(s, h.on, h.damage, { element: h.element, chip: true });
        return --h.hits > 0;
      }
      if (h.fx < h.tx) h.fx = Math.min(h.tx, h.fx + h.speed);
      else if (h.fy !== h.ty) h.fy += Math.sign(h.ty - h.fy) * Math.min(h.vspeed, Math.abs(h.ty - h.fy));
      else h.fx += h.speed;
      const x = Math.round(h.fx), y = Math.round(h.fy);
      if (x > 5) return false;
      const e = at(s, x, y);
      if (e) { h.on = e; h.from = h.t; hitEnemy(s, e, h.damage, { element: h.element, chip: true }); h.hits--; }
      return true;
    }
    if (h.kind === 'dollthunder') { // DollThunder: the row ahead, each enemy once while the doll shows
      if (s.tick < h.start) return true;
      if (s.tick >= h.end) return false;
      for (let x = h.x + 1; x <= 5; x++) { const e = at(s, x, h.y); if (e && !h.hit.includes(e.id)) { h.hit.push(e.id); hitEnemy(s, e, h.damage, { element: h.element, chip: true }); } }
      return true;
    }
    if (h.kind === 'hockey') { // AirHockey puck (t3 0x2E, sub_80C9AAA)
      if (++h.t % h.every) return true;
      if (h.left-- <= 0) return false;
      if (sideAt(s, h.x, h.y) === 'e') h.inside = true;
      if (h.y + h.dy < 0 || h.y + h.dy > 2) h.dy = -h.dy;
      if (h.x + h.dx < 0 || h.x + h.dx > 5) h.dx = -h.dx;
      if (h.inside && sideAt(s, h.x + h.dx, h.y + h.dy) !== 'e') {
        h.dx = -h.dx;
        if (sideAt(s, h.x + h.dx, h.y + h.dy) !== 'e') return false;
      }
      h.x += h.dx; h.y += h.dy;
      if (!standable(s, h.x, h.y)) return false;
      const e = at(s, h.x, h.y);
      if (e) hitEnemy(s, e, h.damage, { element: h.element, chip: true });
      return true;
    }
    if (h.kind === 'dragon') { // the dragon's head path: down the column, one column back, up and away (t3 0xC9)
      const at_ = dragonAt(++h.t, h.col); h.pos = at_;
      if (!at_) return false;
      const x = Math.round(at_.x), y = Math.round(at_.y), key = x + ',' + y;
      if (y >= 0 && y <= 2 && x >= 0 && x <= 5 && key !== h.last) { h.last = key; const e = at(s, x, y); if (e) hitEnemy(s, e, h.damage, { element: h.element, chip: true }); }
      return true;
    }
    if (h.kind === 'raidbomb') { // AirRaid's bomb (t3 9): the panel flashes 6 frames, then the blast
      if (s.tick < h.hit) return true;
      const e = at(s, h.x, h.y); if (e && e.owner !== 'player') hitEnemy(s, e, h.damage, { element: h.element, chip: true });
      s.effects.push({ kind: 'raidblast', x: h.x, y: h.y, t: 0 }); return false;
    }
    if (h.kind === 'sensorlaser') { // Sensor's laser (t3 0xA0, sub_80D9434): on its panel until it hits once (status 0x10 = paralysis, byte_80D941C) or the Sensor goes
      const [x, y] = h.cells[0], e = at(s, x, y);
      if (e && e.owner !== 'player') { hitEnemy(s, e, h.damage, { element: h.element, chip: true, paralyze: val('chipParalyzeTicks') }); return false; }
      return s.tick < h.until;
    }
    if (h.kind === 'numball') return stepNumberBall(s, h);
    if (h.kind === 'snowball') { // BlzrdBal (t3 0xB2 / 0xB7): 3 px a frame, hits each panel it enters, swallows field objects
      const ahead = Math.round((h.fx + 20) / 40), o = at(s, ahead, h.y);
      if (o && o.owner === 'player' && o.kind === 'coil') { o.hp = 0; s.effects.push({ kind: 'puff', x: o.x, y: o.y, t: 0 }); h.damage += h.base; h.size++; }
      h.fx += 3; const x = Math.round(h.fx / 40);
      if (x !== h.x) { h.x = x; if (x > 5 || !standable(s, x, h.y)) return false; const e = at(s, x, h.y); if (e && e.owner !== 'player') hitEnemy(s, e, h.damage, { element: h.element, chip: true }); }
      return true;
    }
    if (h.kind === 'chipmine') { // Mine (t3 0x4C), hidden: goes off when an enemy steps on its panel or the panel breaks
      const e = at(s, h.x, h.y);
      if ((e && e.owner !== 'player' && e.hp > 0) || !standable(s, h.x, h.y)) { if (e && e.owner !== 'player') hitEnemy(s, e, h.damage, { element: h.element, chip: true }); s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 }); return false; }
      return true;
    }
    if (h.kind === 'windgust') { // Wind / Fan gust (t3 0x49): 10 px a frame along the enemy side (byte_80CD478); hit modifier
      const x = Math.round(h.fx); // 8 (Wind) / 4 (Fan) → byte_800F604: slide away / toward MegaMan as far as it can (6)
      if (x < 0 || x > 5 || sideAt(s, x, h.y) !== 'e') return false;
      const e = at(s, x, h.y);
      if (e && e.owner !== 'player' && e.kind !== 'coil' && !e.cells && !h.hit.includes(e.id)) {
        h.hit.push(e.id);
        while (sideAt(s, e.x + h.dir, e.y) === 'e' && standable(s, e.x + h.dir, e.y) && !at(s, e.x + h.dir, e.y) && e.x + h.dir >= 0 && e.x + h.dir <= 5) e.x += h.dir;
        e.drawX = e.x;
      }
      h.fx += h.dir * 10 / 40; return true;
    }
    if (h.kind === 'shuriken') { // AntiDmg's / BodyGrd's shurikens (sub_80DD91A / sub_80D006E): straight onto an enemy
      if (s.tick < h.at) return true;
      const foes = s.enemies.filter(e => e.hp > 0 && e.owner !== 'player' && e.kind !== 'coil');
      const t = h.targets ? foes.find(e => h.targets.includes(e.id)) : foes[h.cycle++ % Math.max(1, foes.length)];
      if (t) { hitEnemy(s, t, h.damage, { fx: 'buster', chip: true }); s.effects.push({ kind: 'star', x: t.x, y: t.y, t: 0 }); }
      if (!h.every || --h.left <= 0 || !foes.length) return false;
      h.at = s.tick + h.every; return true;
    }
    if (h.kind === 'log') { // RollingLog (t3 0x66): lands, then rolls; both its rows hit at once and the log breaks
      if (s.tick < h.land) return true;
      const x = Math.round(h.fx);
      if (x > 5 || !standable(s, x, h.rows[1])) return false;
      const foes = h.rows.map(y => at(s, x, y)).filter(Boolean);
      if (foes.length) { for (const e of new Set(foes)) hitEnemy(s, e, h.damage, { element: h.element, chip: true }); s.effects.push({ kind: 'blast', x, y: h.rows[1], t: 0 }); return false; }
      h.fx += h.speed; return true;
    }
    if (h.kind === 'airspin') { // AirSpin (t3 0x9B): glide while the next panel is free, spin, then hit the 8 panels around it
      h.t++;
      if (h.phase === 'glide') {
        if (h.fx >= h.to) {
          h.x = h.to;
          if (h.max-- > 0 && h.free(h.x + 1, h.y)) h.to = h.x + 1;
          else { h.phase = 'spin'; h.t = 0; h.fx = h.x; return true; }
        }
        h.fx = Math.min(h.to, h.fx + h.speed); return true;
      }
      if (h.t < h.wait || (h.t - h.wait) % h.every) return true;
      for (const [dx, dy] of REGIONS[0x10]) { const e = at(s, h.x + dx, h.y + dy); if (e) hitEnemy(s, e, h.damage, { element: h.element, chip: true }); }
      return --h.left > 0;
    }
    if (h.kind === 'yoyo') { // YoYo (t3 0x52): one entry of the path every 8 frames, a hit check on each
      if (h.t % h.step === 0) {
        const x = h.path[h.t / h.step];
        if (x === undefined || x > 5) return false;
        h.x = x; const e = at(s, x, h.y);
        if (e) hitEnemy(s, e, h.damage, { element: h.element, chip: true });
      }
      h.t++; return true;
    }
    if (h.kind === 'thunder') { // Thunder ball (t3 0x2A): homes leg by leg; a hit paralyses and ends it
      if (h.t % h.leg === 0) {
        if (h.t / h.leg >= h.legs) return false;
        const x = Math.round(h.fx), y = Math.round(h.fy), foes = s.enemies.filter(e => e.hp > 0);
        const e = foes.sort((a, b) => Math.abs(a.x - x) + Math.abs(a.y - y) - Math.abs(b.x - x) - Math.abs(b.y - y))[0];
        if (!e) { h.dx = 1 / h.leg; h.dy = 0; }
        else if (e.x === x && e.y !== y) { h.dx = 0; h.dy = Math.sign(e.y - y) / h.leg; }
        else { h.dx = Math.sign(e.x - x || 1) / h.leg; h.dy = 0; }
      }
      h.t++; h.fx += h.dx; h.fy += h.dy;
      const x = Math.round(h.fx), y = Math.round(h.fy);
      if (x < 0 || x > 5 || y < 0 || y > 2) return false;
      const e = at(s, x, y);
      if (e) { hitEnemy(s, e, h.damage, { element: h.element, paralyze: val('chipParalyzeTicks'), chip: true }); return false; }
      return true;
    }
    if (h.kind === 'multihit') {
      if (s.tick < h.next) return true;
      hitEnemy(s, at(s, h.x, h.y), h.damage, { chip: true, element: h.element }); s.effects.push({ kind: 'blast', x: h.x, y: h.y, t: 0 });
      h.next = s.tick + h.gap;
      return --h.left > 0;
    }
    return false;
  });
  if (spawned.length) s.hazards.push(...spawned);
}

// Battle over: stop lingering attacks so nothing stays frozen on screen.
function endBattleEffects(s) {
  s.hazards = [];
  s.effects = s.effects.filter(f => f.kind === 'delete' || f.kind === 'blast' || f.kind === 'deleteburst' || f.kind === 'hit');
  for (const e of s.enemies) { e.highlight = null; e.target = null; }
  s.player.trapped = 0;
}

// AutoHeal ("HP recv after battle", sub_8014040): (max HP + 9) / 10 back, with the heal sparkle.
function autoHeal(s) {
  const p = s.player; if (p.hp <= 0) return;
  const n = Math.floor((p.maxHp + 9) / 10); p.hp = Math.min(p.maxHp, p.hp + n);
  s.events.push({ type: 'heal', amount: n }); s.effects.push({ kind: 'heal', x: p.x, y: p.y, t: 0 });
}

// ---------- main step ----------
export function step(s, input = {}) {
  s.events = [];
  if (s.phase === 'win' || s.phase === 'lose') {
    s.phaseT++;
    // MegaMan's attack plays to its end after the last enemy is deleted (no new input; hazards are already cleared).
    if (s.phase === 'win' && s.player.hp > 0 && s.player.state !== 'idle') stepPlayer(s, {});
    stepDying(s); s.effects = s.effects.filter(f => ++f.t < 24); return s;
  }
  s.phaseT++;
  if (s.phase === 'custom') return s;
  if (s.phase === 'wave') {
    if (s.phaseT >= 90) { s.wave++; spawn(s, survivalWave(s.wave, k => pickSurvival(s, k)).map(([f, v]) => [f, s.navi?.sneakRun ? Math.max(1, v) : v])); openCustom(s); }
    return s;
  }
  if (s.banner) { if (++s.banner.t >= BANNER.start) s.banner = null; return s; } // battle frozen under the banner
  if (s.timestop) { stepTimestop(s, input); return s; } // time freeze: nothing else moves, the gauge waits
  s.tick++;
  stepArea(s);
  const gm = s.gaugeMod; if (gm && --gm.t <= 0) s.gaugeMod = null; // SloGauge / FstGauge: 0x10 / 0x40 a frame instead of 0x20
  s.gauge = Math.min(val('customGaugeTicks'), s.gauge + (gm ? gm.rate / 0x20 : 1));
  if (input.l && s.gauge >= val('customGaugeTicks') && s.player.state === 'idle') { openCustom(s); return s; }
  stepPlayer(s, input);
  const api = virusApi(s);
  for (const e of [...s.enemies]) if (e.hp > 0) { if (e.counterT > 0) e.counterT--; if (e.paralyzed > 0) { e.paralyzed--; if (e.bubble > 0) e.bubble--; continue; } s.attacker = e; (e.kind === 'navi' ? stepNavi : e.owner === 'player' ? stepPlacedBomb : e.kind === 'coil' ? stepCoil : stepVirus)(e, api); }
  s.attacker = null;
  s.enemies = s.enemies.filter(e => e.hp > 0 || e.kind !== 'coil');
  stepHazards(s);
  s.attacker = null;
  stepPanels(s, {
    hurtPlayer: d => { const p = s.player; if (p.hp > 0) p.hp = Math.max(0, p.hp - d); },
    hurtEnemy: (e, d) => { e.hp = Math.max(0, e.hp - d); if (e.hp === 0) { if (e.kind !== 'coil') s.deleted++; s.events.push({ type: 'delete', target: e.id }); s.effects.push({ kind: 'delete', x: e.x, y: e.y, t: 0 }); if (s.turns[e.family] === e.id) delete s.turns[e.family]; } },
  });
  stepDying(s);
  s.effects = s.effects.filter(f => ++f.t < 24);
  if (s.player.hp <= 0) { s.phase = 'lose'; s.phaseT = 0; s.events.push({ type: 'lose' }); endBattleEffects(s); }
  else if (s.enemies.every(e => e.hp <= 0 || e.kind === 'coil')) {
    if (s.navi?.autoHeal) autoHeal(s);
    if (s.mode === 'survival') { s.phase = 'wave'; s.phaseT = 0; s.begun = false; s.events.push({ type: 'waveClear', wave: s.wave }); }
    else { s.phase = 'win'; s.phaseT = 0; s.events.push({ type: 'win' }); endBattleEffects(s); }
  }
  return s;
}
