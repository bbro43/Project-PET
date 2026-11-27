// Deterministic fixed-tick Battle Network battle simulation (BN6 ruleset).
// No rendering, DOM or timing here: the client feeds one input object per tick.
// Input: { dir: 'up'|'down'|'left'|'right'|null, a: held bool, b: pressed bool, l: pressed bool }
import { val, CHIPS, TEST_FOLDER, VIRUSES, METTAUR } from '../../data/rules.mjs';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SLOTS = [[4, 1], [5, 0], [5, 2], [3, 1], [4, 0], [4, 2]];

export const FORMATIONS = {
  'met1': { label: 'Mettaur', enemies: ['Mettaur'] },
  'met2': { label: 'Mettaur ×2', enemies: ['Mettaur', 'Mettaur'] },
  'met3': { label: 'Mettaur ×3', enemies: ['Mettaur', 'Mettaur', 'Mettaur'] },
  'met2x3': { label: 'Mettaur2 ×3', enemies: ['Mettaur2', 'Mettaur2', 'Mettaur2'] },
  'met3x3': { label: 'Mettaur3 ×3', enemies: ['Mettaur3', 'Mettaur3', 'Mettaur3'] },
};

function rng(state) {
  let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export function survivalWave(n) {
  const count = Math.min(3, 1 + Math.floor((n - 1) / 2));
  const type = n >= 7 ? 'Mettaur3' : n >= 4 ? 'Mettaur2' : 'Mettaur';
  return Array.from({ length: count }, () => type);
}

export function createBattle({ mode = 'virus', formation = 'met1', seed = 1, folder = TEST_FOLDER } = {}) {
  const s = {
    tick: 0, seed: seed >>> 0, mode, formation, wave: 1, deleted: 0,
    phase: 'custom', phaseT: 0, gauge: 0, events: [],
    player: {
      x: 1, y: 1, hp: val('megamanHp'), maxHp: val('megamanHp'),
      state: 'idle', stateT: 0, anim: 'idle', animT: 0, dest: null,
      holdT: 0, charge: 0, prevA: false, invuln: 0, chip: null,
    },
    enemies: [], hazards: [], effects: [], nextId: 1, turn: null,
    folder: folder.map(([name, code], i) => ({ id: i, name, code })),
    draw: [], hand: [], picked: [], queue: [],
  };
  s.draw = shuffle(s, s.folder.slice());
  spawn(s, mode === 'survival' ? survivalWave(1) : FORMATIONS[formation].enemies);
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

function spawn(s, types) {
  s.enemies = types.map((type, i) => {
    const def = VIRUSES[type];
    const [x, y] = SLOTS[i];
    return { id: s.nextId++, type, sprite: def.sprite, x, y, hp: def.hp, maxHp: def.hp, waveDamage: def.wave,
      state: 'idle', stateT: 0, anim: 'idle', animT: 0, think: 30 + i * 20, flash: 0 };
  });
  s.hazards = []; s.turn = null;
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
const at = (s, x, y) => s.enemies.find(e => e.hp > 0 && e.x === x && e.y === y);

function hitEnemy(s, e, damage, extra = {}) {
  if (!e || e.hp <= 0) return;
  e.hp = Math.max(0, e.hp - damage);
  e.flash = 4;
  s.effects.push({ kind: 'hit', x: e.x, y: e.y, t: 0, damage });
  s.events.push({ type: 'hit', target: e.id, damage });
  if (extra.push && e.hp > 0) {
    const nx = e.x + 1;
    if (nx <= 5 && !at(s, nx, e.y)) e.x = nx;
  }
  if (e.hp === 0) {
    s.deleted++;
    s.events.push({ type: 'delete', target: e.id });
    s.effects.push({ kind: 'delete', x: e.x, y: e.y, t: 0 });
    if (s.turn === e.id) s.turn = null;
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
  if (def.kind === 'shot') hitEnemy(s, rowTarget(s, p.x, p.y), def.damage, { push: def.push });
  else if (def.kind === 'slash') for (const [dx, dy] of def.area) hitEnemy(s, at(s, p.x + dx, p.y + dy), def.damage);
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
function stepEnemy(s, e) {
  e.animT++; e.stateT++;
  if (e.flash) e.flash--;
  const p = s.player;
  if (e.state === 'attack') {
    if (e.stateT === METTAUR.waveSpawnTick.value) {
      s.hazards.push({ kind: 'wave', owner: e.id, x: e.x - 1, y: e.y, dir: -1, next: s.tick + METTAUR.waveStepTicks.value, damage: e.waveDamage });
    }
    if (e.stateT >= METTAUR.attackTicks.value) { e.state = 'idle'; e.stateT = 0; setAnim(e, 'idle'); e.think = METTAUR.thinkTicks.value; }
    return;
  }
  if (--e.think > 0) return;
  if (e.y !== p.y) {
    const ny = e.y + Math.sign(p.y - e.y);
    if (!at(s, e.x, ny)) e.y = ny;
    e.think = METTAUR.thinkTicks.value;
    return;
  }
  const busy = s.turn !== null && s.turn !== e.id && s.enemies.some(o => o.id === s.turn && o.hp > 0);
  if (METTAUR.takeTurns.value && busy) { e.think = 10; return; }
  s.turn = e.id; e.state = 'attack'; e.stateT = 0; setAnim(e, 'attack');
}

function stepHazards(s) {
  const p = s.player;
  s.hazards = s.hazards.filter(h => {
    if (h.kind === 'wave') {
      if (p.x === h.x && p.y === h.y && p.state !== 'vanish') hitPlayer(s, h.damage);
      if (s.tick >= h.next) { h.x += h.dir; h.next = s.tick + METTAUR.waveStepTicks.value; }
      const alive = h.x >= 0;
      if (!alive && s.turn === h.owner) s.turn = null;
      return alive;
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

// ---------- main step ----------
export function step(s, input = {}) {
  s.events = [];
  if (s.phase === 'win' || s.phase === 'lose') return s;
  s.phaseT++;
  if (s.phase === 'custom') return s;
  if (s.phase === 'wave') {
    if (s.phaseT >= 90) { s.wave++; spawn(s, survivalWave(s.wave)); openCustom(s); }
    return s;
  }
  s.tick++;
  s.gauge = Math.min(val('customGaugeTicks'), s.gauge + 1);
  if (input.l && s.gauge >= val('customGaugeTicks') && s.player.state === 'idle') { openCustom(s); return s; }
  stepPlayer(s, input);
  for (const e of s.enemies) if (e.hp > 0) stepEnemy(s, e);
  stepHazards(s);
  s.effects = s.effects.filter(f => ++f.t < 24);
  if (s.player.hp <= 0) { s.phase = 'lose'; s.events.push({ type: 'lose' }); }
  else if (s.enemies.every(e => e.hp <= 0)) {
    if (s.mode === 'survival') { s.phase = 'wave'; s.phaseT = 0; s.events.push({ type: 'waveClear', wave: s.wave }); }
    else { s.phase = 'win'; s.events.push({ type: 'win' }); }
  }
  return s;
}
