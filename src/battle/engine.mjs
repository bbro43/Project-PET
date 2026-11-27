// Deterministic fixed-tick Battle Network battle simulation (BN6 ruleset).
// No rendering, DOM or timing here: the client feeds one input object per tick.
// Input: { dir: 'up'|'down'|'left'|'right'|null, a: held bool, b: pressed bool, l: pressed bool }
import { val, CHIPS, TEST_FOLDER, WEAKNESS, PANELS } from '../../data/rules.mjs';
import { createVirus, stepVirus, virusName, PLAYABLE_FAMILIES } from './viruses.mjs';
import { createNavi, stepNavi, stepCoil, naviVariants, PLAYABLE_NAVIS } from './navis.mjs';
import { createPanels, stepPanels, panelHit, standable, crackPanel, breakPanel, setPanel, panelType, FIELDS } from './panels.mjs';
export { FIELDS };
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

export function createBattle({ mode = 'virus', enemies = formation('Mettaur', 0, 1), seed = 1, folder = TEST_FOLDER, field = 'normal' } = {}) {
  const s = {
    tick: 0, seed: seed >>> 0, mode, wave: 1, deleted: 0,
    phase: 'custom', phaseT: 0, gauge: 0, events: [],
    player: {
      x: 1, y: 1, hp: val('megamanHp'), maxHp: val('megamanHp'),
      state: 'idle', stateT: 0, anim: 'idle', animT: 0, dest: null,
      holdT: 0, charge: 0, prevA: false, invuln: 0, chip: null,
    },
    enemies: [], hazards: [], effects: [], nextId: 1, turns: {},
    folder: folder.map(([name, code], i) => ({ id: i, name, code })),
    draw: [], hand: [], picked: [], queue: [],
  };
  s.panels = createPanels(field, () => rng(s));
  s.draw = shuffle(s, s.folder.slice());
  spawn(s, mode === 'survival' ? survivalWave(1, k => pickSurvival(s, k)) : enemies);
  refillHand(s);
  return s;
}

function shuffle(s, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickSurvival(s) { return PLAYABLE_FAMILIES[Math.floor(rng(s) * PLAYABLE_FAMILIES.length)]; }

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

function refillHand(s) {
  while (s.hand.length < val('handSize') && s.draw.length) s.hand.push(s.draw.shift());
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
export function confirmCustom(s) {
  if (s.phase !== 'custom') return;
  s.queue = s.picked.map(i => s.hand[i]);
  s.hand = s.hand.filter((_, i) => !s.picked.includes(i));
  s.picked = [];
  s.phase = 'battle'; s.phaseT = 0; s.gauge = 0;
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

function hitEnemy(s, e, damage, extra = {}) {
  if (!e || e.hp <= 0 || e.airborne || e.invuln > 0) return; // invuln: e.g. Trumpy's song
  if (e.guard) { e.guardHit = true; s.events.push({ type: 'guard', target: e.id }); s.effects.push({ kind: 'guard', x: e.x, y: e.y, t: 0 }); return; }
  damage *= elementMultiplier(extra.element, e.element);
  if (!e.cells) damage = panelHit(s, e.x, e.y, damage, extra.element).damage;
  e.hp = Math.max(e.sturdy ? 1 : 0, e.hp - damage);
  e.flash = 4;
  s.effects.push({ kind: 'hit', x: e.x, y: e.y, t: 0, damage });
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

function hitPlayer(s, damage, opts = {}) {
  const p = s.player;
  if (p.invuln > 0 || p.hp <= 0) return;
  const element = opts.element ?? s.attacker?.element;
  const ph = panelHit(s, p.x, p.y, damage, element);
  damage = ph.damage;
  if (ph.freeze && !opts.paralyze) opts = { ...opts, paralyze: ph.freeze, frozen: true }; // aqua on ice: frozen solid (0x3007460)
  p.hp = Math.max(0, p.hp - damage);
  if (opts.paralyze) { // paralysis: no flinch and no flashing; MegaMan just freezes (DarkMech waits for this)
    p.paralyzed = opts.paralyze; p.frozen = !!opts.frozen; p.state = 'paralyzed'; p.stateT = 0; setAnim(p, 'idle'); p.holdT = 0; p.charge = 0; p.dest = null;
    s.events.push({ type: 'playerHit', damage, paralyze: true });
    return;
  }
  p.paralyzed = 0; p.frozen = false;
  p.state = 'flinch'; p.stateT = 0; setAnim(p, 'flinch');
  p.invuln = val('invincibleTicks'); p.holdT = 0; p.charge = 0; p.dest = null;
  s.events.push({ type: 'playerHit', damage });
}

const setAnim = (a, anim) => { a.anim = anim; a.animT = 0; };
const frontX = (e, y) => e.cells ? Math.min(...e.cells.filter(c => c[1] === y).map(c => c[0])) : e.x;
const rowTarget = (s, x, y) => s.enemies.filter(e => e.hp > 0 && !e.airborne && (e.cells ? e.cells.some(c => c[1] === y) : e.y === y) && frontX(e, y) > x).sort((a, b) => frontX(a, y) - frontX(b, y))[0];

function useChip(s, chip) {
  const p = s.player, def = CHIPS[chip.name];
  p.state = 'chip'; p.stateT = 0; p.chip = { ...chip, lock: def.lock }; setAnim(p, def.anim);
  s.events.push({ type: 'chip', name: chip.name });
  if (def.kind === 'shot') hitEnemy(s, rowTarget(s, p.x, p.y), def.damage, { push: def.push, element: def.element });
  else if (def.kind === 'slash') for (const [dx, dy] of def.area) hitEnemy(s, at(s, p.x + dx, p.y + dy), def.damage, { element: def.element });
  else if (def.kind === 'throw') s.hazards.push({ kind: 'bomb', owner: 'player', x: p.x, y: p.y, tx: p.x + def.range, land: s.tick + def.flight, start: s.tick, damage: def.damage });
  else if (def.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + def.heal); s.events.push({ type: 'heal', amount: def.heal }); }
}

// ---------- player ----------
function stepPlayer(s, input) {
  const p = s.player;
  p.animT++; p.stateT++;
  if (p.invuln > 0) p.invuln--;
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
  if (p.state === 'vanish') {
    if (p.stateT >= val('moveVanishTicks')) {
      [p.x, p.y] = p.dest; p.dest = null; p.state = 'appear'; p.stateT = 0; setAnim(p, 'appear');
      if (panelType(s, p.x, p.y) === 'ice' && p.moveDir) p.slide = p.moveDir; // stepping onto ice: keep going
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
    if (x >= 0 && x < 3 && y >= 0 && y < 3 && !at(s, x, y) && standable(s, x, y)) { p.state = 'slide'; p.stateT = 0; setAnim(p, 'idle'); return; }
    p.slide = null;
  }
  // Charge accumulates while A is held in any non-flinch state.
  if (input.a) { p.holdT++; if (p.holdT > val('chargeDelay')) p.charge = Math.min(val('chargeTime'), p.charge + 1); }
  if (p.state === 'appear' && p.stateT >= val('moveAppearTicks')) { p.state = 'idle'; setAnim(p, 'idle'); }
  if ((p.state === 'buster' && p.stateT >= val('busterCooldown')) || (p.state === 'chip' && p.stateT >= p.chip.lock)) {
    p.state = 'idle'; p.chip = null; setAnim(p, 'idle');
  }
  if (p.state !== 'idle') { if (releasedA) { p.holdT = 0; p.charge = 0; } return; }

  if (releasedA) {
    const full = p.charge >= val('chargeTime');
    p.holdT = 0; p.charge = 0;
    if (full) {
      p.state = 'buster'; p.stateT = 0; setAnim(p, 'buster');
      hitEnemy(s, rowTarget(s, p.x, p.y), val('chargeShotDamage'));
      s.events.push({ type: 'chargeShot' });
      return;
    }
  }
  if (input.b && s.queue.length) { useChip(s, s.queue.shift()); return; }
  if (pressedA) {
    p.state = 'buster'; p.stateT = 0; setAnim(p, 'buster');
    hitEnemy(s, rowTarget(s, p.x, p.y), val('busterDamage'));
    return;
  }
  const d = DIRS[input.dir];
  if (d) {
    const x = p.x + d[0], y = p.y + d[1];
    if (x >= 0 && x < 3 && y >= 0 && y < 3 && !at(s, x, y) && standable(s, x, y)) {
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
    at: (x, y) => at(s, x, y) || (standable(s, x, y) ? undefined : HOLE), // a broken panel can't be moved onto
    crackPanel: (x, y) => crackPanel(s, x, y),
    breakPanel: (x, y) => breakPanel(s, x, y),
    setPanel: (x, y, type) => setPanel(s, x, y, type),
    panelType: (x, y) => panelType(s, x, y),
    hitPlayerAt(x, y, damage, opts) { if (p.x === x && p.y === y && p.state !== 'vanish') hitPlayer(s, damage, opts); },
    hitPlayerCells(cells, damage, opts) { if (p.state !== 'vanish' && cells.some(([x, y]) => p.x === x && p.y === y)) hitPlayer(s, damage, opts); },
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
  const p = s.player;
  s.hazards = s.hazards.filter(h => {
    s.attacker = h.owner !== undefined ? s.enemies.find(e => e.id === h.owner) : null;
    if (h.kind === 'lava') { // lava eruption (object type3 0x07): bubbles, then a flame column hits whoever stands there
      if (s.tick >= h.hit && s.tick < h.until && panelType(s, h.x, h.y) === 'lava') {
        if (p.x === h.x && p.y === h.y && p.state !== 'vanish' && !h.done.includes('p')) { h.done.push('p'); hitPlayer(s, h.damage, { element: 'none' }); }
        const e = at(s, h.x, h.y); if (e && !h.done.includes(e.id)) { h.done.push(e.id); hitEnemy(s, e, h.damage); }
      }
      return s.tick < h.until && (s.tick < h.hit || panelType(s, h.x, h.y) === 'lava');
    }
    if (h.kind === 'wave') {
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      if (s.tick >= h.next) { h.x += h.dir; h.next = s.tick + h.step; }
      const alive = h.x >= 0;
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
      if (t > h.spin && p.x === px && p.y === h.y && p.state !== 'vanish') { hitPlayer(s, h.damage); return false; }
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
      if (s.tick === h.hit && p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage, { element: h.elem });
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
      if (h.x === p.x && h.y === p.y && p.state !== 'vanish' && !h.hit) { h.hit = true; hitPlayer(s, h.damage); if (!h.keep) return false; }
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
      if (h.cells.some(([x, y]) => p.x === x && p.y === y) && p.state !== 'vanish') hitPlayer(s, h.damage);
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
      if (h.tx <= 5) hitEnemy(s, at(s, h.tx, h.y), h.damage);
      s.effects.push({ kind: 'blast', x: h.tx, y: h.y, t: 0 });
      return false;
    }
    return false;
  });
}

// Battle over: stop lingering attacks so nothing stays frozen on screen.
function endBattleEffects(s) {
  s.hazards = [];
  s.effects = s.effects.filter(f => f.kind === 'delete' || f.kind === 'blast');
  for (const e of s.enemies) { e.highlight = null; e.target = null; }
  s.player.trapped = 0;
}

// ---------- main step ----------
export function step(s, input = {}) {
  s.events = [];
  if (s.phase === 'win' || s.phase === 'lose') return s;
  s.phaseT++;
  if (s.phase === 'custom') return s;
  if (s.phase === 'wave') {
    if (s.phaseT >= 90) { s.wave++; spawn(s, survivalWave(s.wave, k => pickSurvival(s, k))); openCustom(s); }
    return s;
  }
  s.tick++;
  s.gauge = Math.min(val('customGaugeTicks'), s.gauge + 1);
  if (input.l && s.gauge >= val('customGaugeTicks') && s.player.state === 'idle') { openCustom(s); return s; }
  stepPlayer(s, input);
  const api = virusApi(s);
  for (const e of [...s.enemies]) if (e.hp > 0) { s.attacker = e; (e.kind === 'navi' ? stepNavi : e.kind === 'coil' ? stepCoil : stepVirus)(e, api); }
  s.attacker = null;
  s.enemies = s.enemies.filter(e => e.hp > 0 || e.kind !== 'coil');
  stepHazards(s);
  s.attacker = null;
  stepPanels(s, {
    hurtPlayer: d => { const p = s.player; if (p.hp > 0) p.hp = Math.max(0, p.hp - d); },
    hurtEnemy: (e, d) => { e.hp = Math.max(0, e.hp - d); if (e.hp === 0) { if (e.kind !== 'coil') s.deleted++; s.events.push({ type: 'delete', target: e.id }); s.effects.push({ kind: 'delete', x: e.x, y: e.y, t: 0 }); if (s.turns[e.family] === e.id) delete s.turns[e.family]; } },
  });
  s.effects = s.effects.filter(f => ++f.t < 24);
  if (s.player.hp <= 0) { s.phase = 'lose'; s.events.push({ type: 'lose' }); endBattleEffects(s); }
  else if (s.enemies.every(e => e.hp <= 0 || e.kind === 'coil')) {
    if (s.mode === 'survival') { s.phase = 'wave'; s.phaseT = 0; s.events.push({ type: 'waveClear', wave: s.wave }); }
    else { s.phase = 'win'; s.events.push({ type: 'win' }); endBattleEffects(s); }
  }
  return s;
}
