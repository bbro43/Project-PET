// CPU Navis (BN6). HP/element/names from data/bn6-viruses.mjs (ROM tables);
// AI timings, damage and decision logic from data/rules.mjs NAVI_AI (each value tagged).
// See documentation/audit/2026-11-27-bn6-navi-ai.md for the decoded routines.
import BN6 from '../../data/bn6-viruses.mjs';
import { NAVI_AI } from '../../data/rules.mjs';

export const PLAYABLE_NAVIS = ['ElecMan', 'ProtoMan'];
const SPRITE = { ElecMan: 'elecman', ProtoMan: 'protoman' };
const pv = (param, variant) => Array.isArray(param.value) ? param.value[Math.min(variant, param.value.length - 1)] : param.value;

// Variants whose in-game name decodes cleanly (one ProtoMan name uses a glyph not yet mapped).
export function naviVariants(navi) {
  return BN6.navis[navi].variants.map((v, i) => ({ ...v, index: i })).filter(v => !v.name.includes('?'));
}

export function createNavi(navi, variant, x, y, id) {
  const st = BN6.navis[navi].variants[variant];
  return {
    id, kind: 'navi', family: navi, variant, name: st.name, sprite: SPRITE[navi], palette: 0,
    x, y, drawX: x, drawY: y, homeX: x, homeY: y, hp: st.hp, maxHp: st.hp, element: st.element,
    state: 'idle', stateT: 0, anim: 'idle', animT: 0, think: 40, flash: 0,
    mem: { c4: 0, c5: 0, c6: 0, c7: 0, toggle: 0, special: 0 }, plan: null, guard: false, guardHit: false,
  };
}

const setAnim = (e, anim) => { e.anim = anim; e.animT = 0; };
const go = (e, state, anim) => { e.state = state; e.stateT = 0; if (anim) setAnim(e, anim); };
const rnd16 = api => Math.floor(api.rng() * 16);
const pick = (list, api) => list.length ? list[Math.floor(api.rng() * list.length)] : null;

function freeEnemyPanels(e, api) {
  const free = [];
  for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if ((x !== e.x || y !== e.y) && !api.at(x, y)) free.push([x, y]);
  return free;
}

// ======================= ElecMan =======================
// Decision 0x80F3A24 → 0xA coil swap, 0xB row lightning, 0xC panel storm, 0xD dash strike, 9 glide.
function elecman(e, api) {
  const P = NAVI_AI.ElecMan, s = api.s, p = s.player, v = e.variant, D = P.decision.value;
  const done = wait => { go(e, 'wait', 'idle'); e.think = wait; };
  switch (e.state) {
    case 'idle':
    case 'wait': {
      if (--e.think > 0) return;
      e.mem.special++;
      if (e.mem.special >= D.coilEvery) { e.mem.special = 0; return go(e, 'coilswap', 'charge'); }
      const r = rnd16(api);
      if (r < D.bolt[1]) {
        s.effects.push({ kind: 'aura', owner: e.id, t: 0, life: P.boltCharge.value });
        return go(e, 'bolt', 'summon');
      }
      if (r < D.storm[1]) return glideTo(e, pick(freeEnemyPanels(e, api), api) || [e.x, e.y], 'stormcharge', P.glideTicks.value);
      if (r < D.dash[1]) return go(e, 'dashalign', 'idle');
      return glideTo(e, pick(freeEnemyPanels(e, api), api) || [e.x, e.y], 'moved', P.glideTicks.value);
    }
    case 'glide': // position interpolation happens in stepNavi; this runs when it finishes
      [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y;
      if (e.after === 'moved') return done(P.moveWait.value);
      if (e.after === 'stormcharge') return startStorm(e);
      return go(e, 'dashalign', 'idle');
    // ---- 0xA: coils explode, a new one appears in MegaMan's area
    case 'coilswap': {
      const [explode, place] = P.coilSwapTicks.value;
      if (e.stateT === explode) for (const c of api.coils(e)) api.removeEnemy(c, 'explode');
      if (e.stateT === explode + place) { placeCoil(e); done(pv(P.attackWait, v)); }
      return;
    }
    // ---- 0xB: aura, then lightning along his row; coils in his row discharge down their column
    case 'bolt':
      if (e.stateT === P.boltCharge.value) {
        setAnim(e, 'point');
        s.hazards.push({ kind: 'rowbolt', owner: e.id, x: e.x, y: e.y, start: s.tick, until: s.tick + P.boltActive.value, damage: pv(P.boltDamage, v) });
        for (const c of api.coils(e)) if (c.y === e.y) {
          c.discharge = P.coilDischarge.value; setAnim(c, 'discharge');
          s.hazards.push({ kind: 'colbolt', owner: c.id, x: c.x, start: s.tick, until: s.tick + P.coilDischarge.value, damage: pv(P.boltDamage, v) });
        }
      }
      if (e.stateT >= P.boltCharge.value + P.boltActive.value) done(pv(P.attackWait, v));
      return;
    // ---- 0xC: panel storm — groups of panels light up, then are struck in order
    case 'storm': {
      const st = e.storm, period = pv(P.stormPeriod, v);
      if (st.picked < st.rounds && e.stateT >= st.picked * period) {
        const n = P.stormGroup.value[st.rounds][Math.floor(api.rng() * 8)];
        const panels = [];
        for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) panels.push([x, y]);
        for (let i = panels.length - 1; i > 0; i--) { const j = Math.floor(api.rng() * (i + 1)); [panels[i], panels[j]] = [panels[j], panels[i]]; }
        st.groups.push(panels.slice(0, n)); st.picked++;
      }
      if (e.stateT === P.stormCharge.value) setAnim(e, 'charged');
      const strikeStart = Math.max(st.rounds * period, P.stormCharge.value);
      const k = (e.stateT - strikeStart) / P.stormStrikeEvery.value;
      if (e.stateT >= strikeStart && Number.isInteger(k) && k < st.groups.length) {
        api.hitPlayerCells(st.groups[k], pv(P.stormDamage, v));
        for (const [x, y] of st.groups[k]) s.effects.push({ kind: 'bolt-v', x, y, t: 0 });
        st.struck = k + 1;
      }
      e.highlight = st.groups.slice(st.struck);
      if (st.struck >= st.rounds) { e.highlight = null; e.storm = null; done(pv(P.attackWait, v)); }
      return;
    }
    // ---- 0xD: line up with MegaMan's row, aura, dash, strike, warp back
    case 'dashalign': {
      if (e.y === p.y) {
        if (!e.dashHome) e.dashHome = [e.x, e.y];
        s.effects.push({ kind: 'aura', owner: e.id, t: 0, life: P.dashAura.value });
        return go(e, 'dashaura', 'ready');
      }
      if (!e.dashHome) e.dashHome = [e.x, e.y];
      const ny = e.y + Math.sign(p.y - e.y);
      if (api.at(e.x, ny)) { e.dashHome = null; return done(pv(P.attackWait, v)); }
      return glideTo(e, [e.x, ny], 'dashalign', P.rowStepTicks.value);
    }
    case 'dashaura':
      if (e.stateT >= P.dashAura.value) {
        e.dashFrom = e.x; e.dashTo = Math.min(e.x, p.x + 1);
        e.dashTicks = Math.max(1, Math.ceil(((e.dashFrom - e.dashTo) * 40) / pv(P.dashSpeed, v)));
        go(e, 'dash', 'dash');
      }
      return;
    case 'dash': {
      const k = Math.min(1, e.stateT / e.dashTicks);
      e.drawX = e.dashFrom + (e.dashTo - e.dashFrom) * k;
      const px = Math.round(e.drawX);
      if (px !== e.x && !api.at(px, e.y)) e.x = px;
      if (k >= 1) { e.drawX = e.x; go(e, 'dashstrike', 'dash'); }
      return;
    }
    case 'dashstrike':
      if (e.stateT === P.dashStrikeDelay.value) {
        setAnim(e, 'strike');
        api.hitPlayerCells([[e.x - 1, e.y]], pv(P.dashDamage, v));
        s.effects.push({ kind: 'spark', x: e.x - 1, y: e.y, t: 0 });
      }
      if (e.stateT >= P.dashStrikeDelay.value + 12) {
        const [hx, hy] = e.dashHome; e.dashHome = null;
        const blocked = api.at(hx, hy) && api.at(hx, hy) !== e;
        [e.x, e.y] = blocked ? (pick(freeEnemyPanels(e, api), api) || [hx, hy]) : [hx, hy];
        e.drawX = e.x; e.drawY = e.y;
        go(e, 'return', 'appear');
      }
      return;
    case 'return':
      if (e.stateT >= 3) done(pv(P.dashWait, v));
  }

  function glideTo(n, dest, after, ticks) {
    n.from = [n.x, n.y]; n.dest = dest; n.after = after; n.glideTicks = ticks;
    go(n, 'glide', 'idle');
  }
  function startStorm(n) {
    const rounds = n.hp <= n.maxHp / 2 ? P.stormRounds.value.halfHp : P.stormRounds.value.normal;
    n.storm = { rounds, picked: 0, groups: [], struck: 0 };
    go(n, 'storm', 'charge');
  }
  function placeCoil(n) {
    const cols = n.hp <= n.maxHp / 4 ? P.coilColumns.value.lowHp : P.coilColumns.value.normal;
    const col = cols[Math.floor(api.rng() * 8)];
    const rows = [0, 1, 2].filter(y => !api.at(col, y) && !(p.x === col && p.y === y));
    if (!rows.length) return;
    const y = rows.includes(p.y) ? p.y : pick(rows, api);
    const hp = pv(P.coilHp, v);
    api.addEnemy({ kind: 'coil', family: 'Coil', name: 'Coil', owner: n.id, sprite: 'eleccoil', palette: 0,
      x: col, y, drawX: col, drawY: y, hp, maxHp: hp, anim: 'appear', animT: 0, state: 'idle', stateT: 0, flash: 0, discharge: 0 });
  }
}

// ======================= ProtoMan =======================
const AREAS = {
  wide: [[-1, -1], [-1, 0], [-1, 1]],
  long: [[-1, 0], [-2, 0]],
  both: [[-1, -1], [-1, 0], [-1, 1], [-2, 0]],
  sword: [[-1, 0]],
};

function protoman(e, api) {
  const P = NAVI_AI.ProtoMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const W = P.warpTicks.value;
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide(e);
    case 'vanish':
      if (e.stateT >= W) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= W) {
        if (e.plan && e.plan.phase === 'in') { e.plan.phase = 'pre'; return go(e, 'pre', 'idle'); }
        if (e.plan && e.plan.phase === 'guard') { e.plan = null; e.guard = true; e.guardHit = false; return go(e, 'guard', 'guard'); }
        if (e.plan && e.plan.phase === 'out') e.plan = null;
        go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v);
      }
      return;
    case 'pre':
      if (e.stateT >= P.preReadyTicks.value) go(e, 'ready', 'ready');
      return;
    case 'ready':
      if (e.stateT >= pv(P.readyTicks, v)) go(e, 'swing', 'swing');
      return;
    case 'swing':
      if (e.stateT === P.hitTick.value) {
        const cells = AREAS[e.plan.area].map(([dx, dy]) => [e.x + dx, e.y + dy]);
        api.hitPlayerCells(cells, e.plan.damage);
        s.effects.push({ kind: 'slash', area: e.plan.area, x: e.x, y: e.y, t: 0 });
      }
      if (e.stateT >= P.recoverTicks.value) {
        if (--e.plan.repeats > 0 && retarget(e, 'front')) return;
        e.plan.phase = 'out'; e.dest = [e.homeX, e.homeY];
        if (api.at(e.homeX, e.homeY) && api.at(e.homeX, e.homeY) !== e) e.dest = pick(freeEnemyPanels(e, api), api) || [e.x, e.y];
        go(e, 'vanish', 'vanish');
      }
      return;
    case 'guard':
      if (e.guardHit) { e.guard = false; return startSlash(e, 'sword', pv(P.guardDamage, v), 'front'); }
      if (e.stateT >= P.guardTicks.value) { e.guard = false; go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v); }
  }

  // Decision routines: base 0x80FBA24 / 0x80FBA9A (≤ 50% HP), EX+ 0x80FBB34 / 0x80FBBCA.
  function decide(n) {
    const phase2 = n.hp <= n.maxHp / 2, ex = v >= 1, step = () => 1 + (api.rng() < 0.5 ? 0 : 1);
    if (!phase2) {
      if (m.c4 < (ex ? 3 : 4)) {
        if (ex) {
          m.c4++;
          if (m.c7 >= 4) { m.c7 = 0; return startGuard(n); }
          m.c7++; if (rnd16(api) < 12) m.c7++;
        } else m.c4 += step();
        return startMove(n);
      }
      m.c4 = 0;
      if (m.c5 < 2) {
        m.c5++;
        if (m.c6 < 1) { if (rnd16(api) < 12) m.c6++; return startSlash(n, 'wide', pv(P.wideDamage, v), 'front'); }
        m.c6 = 0; return startSlash(n, 'long', pv(P.longDamage, v), 'front');
      }
      m.c5 = 0; return startSlash(n, 'both', pv(P.bothDamage, v), 'row');
    }
    // Phase 2: MegaMan standing on the danger panels builds toward the multi-slash (attack 0xE).
    if (P.dangerPanels.value.some(([x, y]) => p.x === x && p.y === y)) {
      if (m.c4 >= 2) { m.c4 = 0; return startSlash(n, 'sword', pv(P.deltaDamage, v), 'front', 3); }
      if (rnd16(api) < 14) m.c4++;
    }
    if (ex && m.c7 >= 4) { m.c7 = 0; return startGuard(n); }
    if (m.c5 < 3) { m.c5 += step(); if (ex) m.c7++; return startMove(n); }
    m.c5 = 0;
    if (m.c6 < 2) {
      m.c6 += step(); const t = m.toggle; m.toggle ^= 1;
      return t === 0 ? startSlash(n, 'wide', pv(P.wideDamage, v), 'front') : startSlash(n, 'long', pv(P.longDamage, v), 'front');
    }
    m.c6 = 0; return startSlash(n, 'both', pv(P.bothDamage, v), 'row');
  }
  function startMove(n) {
    n.dest = pick(freeEnemyPanels(n, api), api) || [n.x, n.y]; n.homeX = n.dest[0]; n.homeY = n.dest[1];
    go(n, 'vanish', 'vanish');
  }
  function startGuard(n) { // guard target 0x80FCD92: random panel in MegaMan's row on his side
    const row = [3, 4, 5].filter(x => !api.at(x, p.y) || api.at(x, p.y) === n);
    if (!row.length) return startMove(n);
    n.plan = { phase: 'guard' }; n.dest = [pick(row, api), p.y]; n.homeX = n.dest[0]; n.homeY = n.dest[1];
    go(n, 'vanish', 'vanish');
  }
  function target(n, mode) {
    if (mode === 'row') { // nearest panel on his side in MegaMan's row (0x80FCDDE)
      for (const x of [3, 4, 5]) if (!api.at(x, p.y) || api.at(x, p.y) === n) return [x, p.y];
      return null;
    }
    const t = [p.x + 1, p.y]; // in front of MegaMan (0x80FCD70 / 0x80FCDBA)
    if (t[0] > 5 || (api.at(...t) && api.at(...t) !== n)) return null;
    return t;
  }
  function retarget(n, mode) {
    const t = target(n, mode);
    if (!t) return false;
    n.plan.phase = 'in'; n.dest = t; go(n, 'vanish', 'vanish');
    return true;
  }
  function startSlash(n, area, damage, mode, repeats = 1) {
    n.plan = { area, damage, repeats, phase: 'in' };
    n.homeX = n.x; n.homeY = n.y;
    if (!retarget(n, mode)) { n.plan = null; return startMove(n); }
  }
}

const BEHAVIOUR = { ElecMan: elecman, ProtoMan: protoman };

export function stepNavi(e, api) {
  e.animT++; e.stateT++;
  if (e.flash) e.flash--;
  if (e.state === 'glide') {
    const k = Math.min(1, e.stateT / e.glideTicks);
    e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * k; e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * k;
    if (k < 1) return;
  }
  BEHAVIOUR[e.family](e, api);
}

// Coils: idle until told to discharge; removed when their ElecMan is deleted.
export function stepCoil(c, api) {
  c.animT++; c.stateT++;
  if (c.flash) c.flash--;
  if (c.anim === 'appear' && c.animT > 9) { c.anim = 'idle'; c.animT = 0; }
  if (c.discharge > 0 && --c.discharge === 0) { c.anim = 'idle'; c.animT = 0; }
  const owner = api.s.enemies.find(e => e.id === c.owner);
  if (!owner || owner.hp <= 0) api.removeEnemy(c, 'explode');
}
