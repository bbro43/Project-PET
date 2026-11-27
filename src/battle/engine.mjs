// Deterministic fixed-tick Battle Network battle simulation (BN6 ruleset).
// No rendering, DOM or timing here: the client feeds one input object per tick.
// Input: { dir: 'up'|'down'|'left'|'right'|null, a: held bool, b: pressed bool, l: pressed bool }
import { val, CHIPS, TEST_FOLDER, WEAKNESS } from '../../data/rules.mjs';
import { createVirus, stepVirus, virusName, PLAYABLE_FAMILIES } from './viruses.mjs';
import { createNavi, stepNavi, stepCoil, naviVariants, PLAYABLE_NAVIS } from './navis.mjs';
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

export function createBattle({ mode = 'virus', enemies = formation('Mettaur', 0, 1), seed = 1, folder = TEST_FOLDER } = {}) {
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
const at = (s, x, y) => s.enemies.find(e => e.hp > 0 && !e.airborne && e.x === x && e.y === y);

export function elementMultiplier(attack, defend) {
  return attack && WEAKNESS[attack] === defend ? 2 : 1;
}

function hitEnemy(s, e, damage, extra = {}) {
  if (!e || e.hp <= 0 || e.airborne) return;
  if (e.guard) { e.guardHit = true; s.events.push({ type: 'guard', target: e.id }); s.effects.push({ kind: 'guard', x: e.x, y: e.y, t: 0 }); return; }
  damage *= elementMultiplier(extra.element, e.element);
  e.hp = Math.max(0, e.hp - damage);
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

function hitPlayer(s, damage) {
  const p = s.player;
  if (p.invuln > 0 || p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - damage);
  p.state = 'flinch'; p.stateT = 0; setAnim(p, 'flinch');
  p.invuln = val('invincibleTicks'); p.holdT = 0; p.charge = 0; p.dest = null;
  s.events.push({ type: 'playerHit', damage });
}

const setAnim = (a, anim) => { a.anim = anim; a.animT = 0; };
const rowTarget = (s, x, y) => s.enemies.filter(e => e.hp > 0 && e.y === y && e.x > x).sort((a, b) => a.x - b.x)[0];

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

  if (p.state === 'flinch') {
    if (p.stateT >= val('flinchTicks')) { p.state = 'idle'; setAnim(p, 'idle'); }
    return;
  }
  if (p.state === 'vanish') {
    if (p.stateT >= val('moveVanishTicks')) { [p.x, p.y] = p.dest; p.dest = null; p.state = 'appear'; p.stateT = 0; setAnim(p, 'appear'); }
    return;
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
    if (x >= 0 && x < 3 && y >= 0 && y < 3 && !at(s, x, y)) {
      p.dest = [x, y]; p.state = 'vanish'; p.stateT = 0; setAnim(p, 'vanish');
    }
  }
}

// ---------- viruses ----------
function virusApi(s) {
  const p = s.player;
  return {
    s,
    at: (x, y) => at(s, x, y),
    hitPlayerAt(x, y, damage) { if (p.x === x && p.y === y && p.state !== 'vanish') hitPlayer(s, damage); },
    hitPlayerCells(cells, damage) { if (p.state !== 'vanish' && cells.some(([x, y]) => p.x === x && p.y === y)) hitPlayer(s, damage); },
    rng: () => rng(s),
    coils: owner => s.enemies.filter(c => c.kind === 'coil' && c.owner === owner.id && c.hp > 0),
    addEnemy(o) { o.id = s.nextId++; s.enemies.push(o); return o; },
    removeEnemy(o, how) { if (o.hp <= 0) return; o.hp = 0; s.effects.push({ kind: how === 'explode' ? 'blast' : 'delete', x: o.x, y: o.y, t: 0 }); },
    spawnWave(e, x, y, stepTicks) { s.hazards.push({ kind: 'wave', owner: e.id, family: e.family, x, y, dir: -1, step: stepTicks, next: s.tick + stepTicks, damage: e.damage, start: s.tick }); },
    turnFree(e) { const t = s.turns[e.family]; return t === undefined || t === e.id || !s.enemies.some(o => o.id === t && o.hp > 0); },
    takeTurn(e) { s.turns[e.family] = e.id; },
    endTurn(e) { if (s.turns[e.family] === e.id) delete s.turns[e.family]; },
  };
}

function stepHazards(s) {
  const p = s.player;
  s.hazards = s.hazards.filter(h => {
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
  for (const e of [...s.enemies]) if (e.hp > 0) (e.kind === 'navi' ? stepNavi : e.kind === 'coil' ? stepCoil : stepVirus)(e, api);
  s.enemies = s.enemies.filter(e => e.hp > 0 || e.kind !== 'coil');
  stepHazards(s);
  s.effects = s.effects.filter(f => ++f.t < 24);
  if (s.player.hp <= 0) { s.phase = 'lose'; s.events.push({ type: 'lose' }); endBattleEffects(s); }
  else if (s.enemies.every(e => e.hp <= 0 || e.kind === 'coil')) {
    if (s.mode === 'survival') { s.phase = 'wave'; s.phaseT = 0; s.events.push({ type: 'waveClear', wave: s.wave }); }
    else { s.phase = 'win'; s.events.push({ type: 'win' }); endBattleEffects(s); }
  }
  return s;
}
