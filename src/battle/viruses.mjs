// Virus definitions and AI. Stats are read from data/bn6-viruses.mjs (ROM tables);
// behaviour timings come from data/rules.mjs AI (each tagged with confidence).
import BN6 from '../../data/bn6-viruses.mjs';
import { AI } from '../../data/rules.mjs';

export const PLAYABLE_FAMILIES = ['Mettaur', 'Champy', 'Gunner'];
const SPRITE = { Mettaur: 'mettaur', Champy: 'champy', Gunner: 'gunner' };
const pv = (param, variant) => Array.isArray(param.value) ? param.value[variant] : param.value;

// In-game names, read from the ROM's enemy name strings.
export function virusName(family, variant) {
  return BN6.families[family].variants[variant].name;
}

export function createVirus(family, variant, x, y, id) {
  const st = BN6.families[family].variants[variant];
  return {
    id, family, variant, name: virusName(family, variant), sprite: SPRITE[family], palette: st.palette,
    x, y, homeX: x, homeY: y, hp: st.hp, maxHp: st.hp, element: st.element, damage: st.damage,
    state: 'idle', stateT: 0, anim: 'idle', animT: 0, think: 30, flash: 0,
  };
}

const setAnim = (e, anim) => { e.anim = anim; e.animT = 0; };
const go = (e, state, anim) => { e.state = state; e.stateT = 0; if (anim) setAnim(e, anim); };

// api: { s, at(x,y), hitPlayerAt(x,y,damage,element), spawnWave(e,x,y,stepTicks), turnFree(e), takeTurn(e), endTurn(e) }
const BEHAVIOUR = {
  // ForMettaur 0x8109EF4: one Mettaur at a time steps to MegaMan's row and swings; the rest wait (or hide).
  Mettaur(e, api) {
    const P = AI.Mettaur, s = api.s, p = s.player, v = e.variant;
    const done = () => { api.endTurn(e); go(e, 'idle', 'idle'); };
    switch (e.state) {
      case 'idle':
        if (!api.turnFree(e)) { if (v > 0) go(e, 'hide', 'hide'); return; }
        api.takeTurn(e);
        if (!e.waited) { e.waited = true; e.think = P.firstWait.value; return go(e, 'wait', 'idle'); }
        if (e.y !== p.y) {
          const ny = e.y + Math.sign(p.y - e.y);
          if (!api.at(e.x, ny)) { e.ny = ny; return go(e, 'step', null); }
        }
        return go(e, 'attack', 'attack');
      case 'wait':
        if (--e.think <= 0) go(e, 'idle', 'idle');
        return;
      case 'step': { // 0xA: vanish 3, move, appear 3, then wait
        const [a, b] = P.moveTicks.value;
        e.hidden = e.stateT < a;
        if (e.stateT === a) { if (!api.at(e.x, e.ny)) e.y = e.ny; }
        if (e.stateT >= a + b) { e.hidden = false; e.think = pv(P.moveWait, v); go(e, 'wait', 'idle'); }
        return;
      }
      case 'attack': // 0xB: pickaxe swing, shockwave from the panel ahead
        if (e.stateT === P.waveSpawnTick.value) api.spawnWave(e, e.x - 1, e.y, pv(P.waveStepTicks, v), pv(P.damage, v));
        if (e.stateT === P.attackTicks.value) setAnim(e, 'idle');
        if (e.stateT >= P.attackTicks.value + P.afterAttack.value) done();
        return;
      case 'hide': { // 0xC: helmet down and guarded until its turn
        const [down, up] = P.hideTicks.value;
        if (e.stateT === down) { setAnim(e, 'hidden'); e.guard = true; }
        if (e.stateT >= down && api.turnFree(e) && e.anim === 'hidden') { setAnim(e, 'unhide'); e.guard = false; e.upAt = e.stateT; }
        if (e.upAt !== undefined && e.stateT >= e.upAt + up) { e.upAt = undefined; go(e, 'idle', 'idle'); }
        return;
      }
    }
  },

  // 0x810CD60: only when MegaMan is in its row: warp in front of him and punch.
  Champy(e, api) {
    const P = AI.Champy, s = api.s, p = s.player, v = e.variant;
    const front = () => { const x = p.x + 1, y = p.y, o = api.at(x, y); return x <= 5 && (!o || o === e) ? [x, y] : null; };
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (e.y !== p.y || !front()) return;
        e.hidden = true; return go(e, 'vanish', null);
      case 'vanish':
        if (e.stateT >= pv(P.vanishWait, v)) {
          const d = front();
          if (!d) { e.hidden = false; return home(); }
          e.dest = d; go(e, 'appear', null);
        }
        return;
      case 'appear':
        if (e.stateT >= P.appearTicks.value) {
          const o = api.at(...e.dest);
          if (o && o !== e) { e.hidden = false; return home(); }
          [e.x, e.y] = e.dest; e.hidden = false; go(e, 'ready', 'idle');
        }
        return;
      case 'ready':
        if (e.stateT >= pv(P.readyTicks, v)) go(e, 'punch', 'uppercut');
        return;
      case 'punch':
        if (e.stateT === P.punchHitTick.value) api.hitPlayerAt(e.x - 1, e.y, pv(P.damage, v), e.element);
        if (e.stateT >= P.punchTicks.value) {
          if (v >= 2 && front()) { e.dest = front(); e.hidden = true; return go(e, 'reposition', null); }
          go(e, 'hold', 'idle');
        }
        return;
      case 'reposition': // SP and up: a second punch from MegaMan's new front panel
        if (e.stateT >= 3) { const o = api.at(...e.dest); if (!o || o === e) [e.x, e.y] = e.dest; e.hidden = false; go(e, 'punch2', 'punch'); }
        return;
      case 'punch2':
        if (e.stateT === P.secondHitTick.value) api.hitPlayerAt(e.x - 1, e.y, pv(P.damage, v), e.element);
        if (e.stateT >= P.punchTicks.value) go(e, 'hold', 'idle');
        return;
      case 'hold':
        if (e.stateT >= pv(P.holdTicks, v)) { e.hidden = true; go(e, 'return', null); }
        return;
      case 'return':
        if (e.stateT >= 3) {
          const o = api.at(e.homeX, e.homeY);
          if (!o || o === e) { e.x = e.homeX; e.y = e.homeY; }
          e.hidden = false; return home();
        }
        return;
    }
    function home() { go(e, 'idle', 'idle'); e.think = pv(P.holdTicks, v) + pv(P.postWait, v); }
  },

  // ForGunner 0x8113078: crosshair search (even versions) or sweep (odd versions), then a burst.
  Gunner(e, api) {
    const P = AI.Gunner, s = api.s, p = s.player, v = e.variant, sweep = v % 2 === 1;
    const per = 40 / pv(P.crossSpeed, v);
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (!sweep && e.y !== p.y) return;
        go(e, 'aim', 'aim');
        e.target = sweep ? { x: 2, y: e.y, fx: 2, locked: false, owner: e.id, t: 0 } : { x: e.x, y: e.y, fx: e.x, locked: false, owner: e.id, t: 0 };
        return;
      case 'aim': { // crosshair slides along the row; locks when it reaches MegaMan
        const T = e.target;
        T.t++;
        if (!sweep && !T.lockAt) {
          T.fx -= 1 / per; T.x = Math.round(T.fx);
          if (T.x < 0) { e.target = null; return go(e, 'recover', 'recover'); }
          if (T.x === p.x && T.y === p.y) T.lockAt = e.stateT;
        }
        if (sweep && !T.lockAt) T.lockAt = e.stateT;
        if (T.lockAt !== undefined && e.stateT >= T.lockAt + pv(P.lockTicks, v)) { T.locked = true; e.shots = pv(P.shots, v); e.dir = -1; go(e, 'fire', 'fire'); }
        return;
      }
      case 'fire': {
        const T = e.target;
        if (e.stateT % P.shotGap.value === 1) {
          api.hitPlayerAt(T.x, T.y, pv(P.damage, v), e.element);
          s.effects.push({ kind: 'shot', x: T.x, y: T.y, t: 0 });
          s.events.push({ type: 'shot', by: e.id });
          if (--e.shots <= 0) { e.target = null; return go(e, 'recover', 'recover'); }
          if (sweep) { if (T.x + e.dir < 0 || T.x + e.dir > 2) e.dir = -e.dir; T.x += e.dir; }
        }
        return;
      }
      case 'recover':
        if (e.stateT >= pv(P.recoverTicks, v)) { go(e, 'idle', 'idle'); e.think = 1; }
    }
  },
};

export function stepVirus(e, api) {
  e.animT++; e.stateT++;
  if (e.flash) e.flash--;
  BEHAVIOUR[e.family](e, api);
}
