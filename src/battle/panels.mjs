// Panel types (BN6). The field is 6×3; x 0–2 is MegaMan's area, 3–5 the enemy area.
// Behaviour and timings: data/rules.mjs PANELS (each with confidence).
import { PANELS } from '../../data/rules.mjs';

const P = PANELS;
export const PANEL_TYPES = ['normal', 'cracked', 'broken', 'poison', 'holy', 'grass', 'ice', 'volcano'];
export const FIELDS = ['normal', 'cracked', 'grass', 'ice', 'holy', 'poison', 'volcano', 'mixed'];

// Field presets for the battle menu (not canonical stage layouts).
export function createPanels(field = 'normal', rng = Math.random) {
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => ({ type: 'normal', t: 0, occ: false })));
  const set = (x, y, type) => { grid[y][x].type = type; };
  if (['cracked', 'grass', 'ice', 'holy'].includes(field)) for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) set(x, y, field);
  if (field === 'poison' || field === 'volcano') for (let y = 0; y < 3; y++) { set(1, y, field); set(4, y, field); } // each side's middle column
  if (field === 'mixed') {
    const kinds = ['cracked', 'poison', 'holy', 'grass', 'ice', 'volcano'];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) if (!(x === 1 && y === 1) && rng() < 0.5) set(x, y, kinds[Math.floor(rng() * kinds.length)]);
  }
  return grid;
}

export const panelAt = (s, x, y) => s.panels?.[y]?.[x];
export const panelType = (s, x, y) => panelAt(s, x, y)?.type ?? 'normal';
export const standable = (s, x, y) => panelType(s, x, y) !== 'broken';

export function setPanel(s, x, y, type) {
  const c = panelAt(s, x, y);
  if (!c) return;
  c.type = type; c.t = 0;
}

const occupied = (s, x, y) => (s.player.x === x && s.player.y === y && s.player.hp > 0) || s.enemies.some(e => e.hp > 0 && !e.airborne && (e.cells ? e.cells.some(c => c[0] === x && c[1] === y) : e.x === x && e.y === y));

// object_crackPanel: a panel cracks; a cracked one with nobody on it breaks.
export function crackPanel(s, x, y) {
  const c = panelAt(s, x, y);
  if (!c || c.type === 'broken') return false;
  if (c.type !== 'cracked') { c.type = 'cracked'; c.t = 0; c.occ = occupied(s, x, y); return true; }
  if (occupied(s, x, y)) return false;
  c.type = 'broken'; c.t = 0; s.effects.push({ kind: 'panelbreak', x, y, t: 0 });
  return true;
}

// object_breakPanel: broken if empty, otherwise cracked.
export function breakPanel(s, x, y) {
  const c = panelAt(s, x, y);
  if (!c || c.type === 'broken') return false;
  if (occupied(s, x, y)) { c.type = 'cracked'; c.t = 0; c.occ = true; return true; }
  c.type = 'broken'; c.t = 0; s.effects.push({ kind: 'panelbreak', x, y, t: 0 });
  return true;
}

// Damage taken by someone standing on (x, y), after panel rules. Also applies the
// panel changes an elemental hit causes. Returns { damage, freeze }.
export function panelHit(s, x, y, damage, element) {
  const c = panelAt(s, x, y);
  let freeze = 0;
  if (!c) return { damage, freeze };
  if (c.type === 'grass' && element === 'fire') { damage *= 2; setPanel(s, x, y, 'normal'); }
  else if (c.type === 'ice' && element === 'aqua') { freeze = P.iceFreeze.value; setPanel(s, x, y, 'normal'); }
  else if (c.type === 'volcano' && element === 'aqua') setPanel(s, x, y, 'normal');
  if (c.type === 'holy') damage = (damage + 1) >> 1;
  return { damage, freeze };
}

// Per-frame panel update. hurt(target, damage) applies non-flinching damage (poison);
// erupt(x, y) is called when a volcano panel starts an eruption.
export function stepPanels(s, { hurtPlayer, hurtEnemy }) {
  if (!s.panels) return;
  const p = s.player;
  s.volcanoClock = (s.volcanoClock ?? P.volcanoCycle.value) - 1;
  if (s.volcanoClock <= 0) s.volcanoClock = P.volcanoCycle.value;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
    const c = s.panels[y][x], occ = occupied(s, x, y);
    c.t++;
    if (c.type === 'cracked') { if (c.occ && !occ) { c.type = 'broken'; c.t = 0; s.effects.push({ kind: 'panelbreak', x, y, t: 0 }); } }
    else if (c.type === 'broken') { if (c.t >= P.brokenRepair.value) { c.type = 'normal'; c.t = 0; } }
    else if (c.type === 'volcano') {
      const due = x <= 2 ? P.volcanoCycle.value : P.volcanoCycle.value / 2;
      if (s.volcanoClock === due) s.hazards.push({ kind: 'volcano', x, y, start: s.tick, hit: s.tick + P.volcanoEruption.value.warn, until: s.tick + P.volcanoEruption.value.warn + P.volcanoEruption.value.burn, damage: P.volcanoEruption.value.damage, done: [] });
    }
    c.occ = occ;
  }
  // poison: 1 HP every 7 frames while standing on it
  const poisoned = o => { o.poisonT = (o.poisonT ?? P.poisonTicks.value - 1) - 1; if (o.poisonT < 0) { o.poisonT = P.poisonTicks.value - 1; return true; } return false; };
  if (p.hp > 0 && p.state !== 'vanish' && panelType(s, p.x, p.y) === 'poison') { if (poisoned(p)) hurtPlayer(1); } else p.poisonT = undefined;
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.airborne || e.kind === 'coil') continue;
    const t = panelType(s, e.x, e.y);
    if (t === 'poison') { if (poisoned(e)) hurtEnemy(e, 1); } else e.poisonT = undefined;
    if (t === 'grass' && e.element === 'wood' && e.hp < e.maxHp) {
      const g = P.grassHeal.value;
      if (s.tick % (e.hp <= g.lowHp ? g.lowHpTicks : g.ticks) === 0) e.hp = Math.min(e.maxHp, e.hp + 1);
    }
  }
}
