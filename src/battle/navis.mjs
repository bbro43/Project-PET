// CPU Navis (BN6). HP/element/names from data/bn6-viruses.mjs (ROM tables);
// AI timings, damage and decision logic from data/rules.mjs NAVI_AI (each value tagged).
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
    x, y, homeX: x, homeY: y, hp: st.hp, maxHp: st.hp, element: st.element,
    state: 'idle', stateT: 0, anim: 'idle', animT: 0, think: 40, flash: 0,
    mem: { c4: 0, c5: 0, c6: 0, c7: 0, special: 0, attacks: 0 }, plan: null, guard: false, guardHit: false,
  };
}

const setAnim = (e, anim) => { e.anim = anim; e.animT = 0; };
const go = (e, state, anim) => { e.state = state; e.stateT = 0; if (anim) setAnim(e, anim); };

function randomPanel(e, api) {
  const free = [];
  for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if ((x !== e.x || y !== e.y) && !api.at(x, y)) free.push([x, y]);
  return free.length ? free[Math.floor(api.rng() * free.length)] : [e.x, e.y];
}

// ---------------- ElecMan ----------------
function elecman(e, api) {
  const P = NAVI_AI.ElecMan, s = api.s, p = s.player, v = e.variant;
  switch (e.state) {
    case 'idle': {
      if (--e.think > 0) return;
      e.mem.special++;
      if (e.mem.special >= P.specialEvery.value) { e.mem.special = 0; return startMove(e); }
      const r = Math.floor(api.rng() * 16), c = P.choice.value;
      if (r < c.thunderbolt[1]) {
        e.target = { x: p.x, y: p.y, kind: 'marker', t: 0 };
        return go(e, 'thunderbolt', 'summon');
      }
      if (r < c.beam[1]) return go(e, 'beam', 'charge');
      return startMove(e); // heavy attack 0xD and moves
    }
    case 'vanish':
      if (e.stateT >= P.moveTicks.value) { [e.x, e.y] = e.dest; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= P.moveTicks.value) { go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v); }
      return;
    case 'thunderbolt':
      if (e.target) e.target.t++;
      if (e.stateT === P.thunderboltDelay.value) {
        setAnim(e, 'point');
        api.hitPlayerAt(e.target.x, e.target.y, pv(P.thunderboltDamage, v));
        s.effects.push({ kind: 'bolt-v', x: e.target.x, y: e.target.y, t: 0 });
        e.target = null;
      }
      if (e.stateT >= P.thunderboltDelay.value + 20) { go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v); }
      return;
    case 'beam':
      if (e.stateT === P.beamChargeTicks.value) {
        setAnim(e, 'point');
        for (let x = e.x - 1; x >= 0; x--) api.hitPlayerAt(x, e.y, pv(P.beamDamage, v));
        s.effects.push({ kind: 'bolt-h', x: e.x - 1, y: e.y, t: 0 });
      }
      if (e.stateT >= P.beamChargeTicks.value + 20) { go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v); }
  }

  function startMove(n) {
    n.dest = randomPanel(n, api);
    go(n, 'vanish', 'vanish');
  }
}

// ---------------- ProtoMan ----------------
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
    case 'idle': {
      if (--e.think > 0) return;
      const phase2 = e.hp <= e.maxHp / 2;
      // EX and above raise a guard after a run of moves (counter 7 in decision routine 0x80FBB34).
      if (v >= 1 && m.c7 >= 4) { m.c7 = 0; e.guard = true; e.guardHit = false; return go(e, 'guard', 'guard'); }
      const need = phase2 ? 2 : 4;
      if (m.c4 < need) {
        const step = 1 + (api.rng() < 0.5 ? 0 : 1);
        m.c4 += step; if (v >= 1) m.c7 += api.rng() < 0.75 ? 2 : 1;
        return startMove(e);
      }
      m.c4 = 0; m.attacks++;
      if (phase2 && m.attacks % 3 === 0) return startSlash(e, 'sword', pv(P.deltaDamage, v), 3);
      if (m.c5 < 2) {
        m.c5++;
        if (m.c6 < 1) { if (api.rng() * 16 < 12) m.c6++; return startSlash(e, 'wide', pv(P.wideDamage, v)); }
        m.c6 = 0; return startSlash(e, 'long', pv(P.longDamage, v));
      }
      m.c5 = 0; return startSlash(e, 'both', pv(P.bothDamage, v));
    }
    case 'vanish':
      if (e.stateT >= W) { [e.x, e.y] = e.dest; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= W) {
        if (e.plan && e.plan.phase === 'in') { e.plan.phase = 'pre'; return go(e, 'pre', 'idle'); }
        if (e.plan && e.plan.phase === 'out') { e.plan = null; api.endTurn(e); }
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
        if (--e.plan.repeats > 0 && retarget(e)) return;
        e.plan.phase = 'out'; e.dest = [e.homeX, e.homeY];
        if (api.at(e.homeX, e.homeY)) e.dest = randomPanel(e, api);
        go(e, 'vanish', 'vanish');
      }
      return;
    case 'guard':
      if (e.guardHit) { e.guard = false; return startSlash(e, 'sword', pv(P.guardDamage, v)); }
      if (e.stateT >= P.guardTicks.value) { e.guard = false; go(e, 'idle', 'idle'); e.think = pv(P.waitTicks, v); }
  }

  function startMove(n) {
    n.dest = randomPanel(n, api); n.homeX = n.dest[0]; n.homeY = n.dest[1];
    go(n, 'vanish', 'vanish');
  }
  function retarget(n) {
    const t = [p.x + 1, p.y];
    if (t[0] > 5 || (api.at(...t) && api.at(...t) !== n)) return false;
    n.plan.phase = 'in'; n.dest = t; go(n, 'vanish', 'vanish');
    return true;
  }
  function startSlash(n, area, damage, repeats = 1) {
    n.plan = { area, damage, repeats, phase: 'in' };
    n.homeX = n.x; n.homeY = n.y;
    if (!retarget(n)) { n.plan = null; return startMove(n); }
  }
}

const BEHAVIOUR = { ElecMan: elecman, ProtoMan: protoman };

export function stepNavi(e, api) {
  e.animT++; e.stateT++;
  if (e.flash) e.flash--;
  BEHAVIOUR[e.family](e, api);
}
