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
  Mettaur(e, api) {
    const P = AI.Mettaur, p = api.s.player;
    if (e.state === 'attack') {
      if (e.stateT === P.waveSpawnTick.value) api.spawnWave(e, e.x - 1, e.y, pv(P.waveStepTicks, e.variant));
      if (e.stateT >= P.attackTicks.value) { go(e, 'idle', 'idle'); e.think = pv(P.thinkTicks, e.variant); }
      return;
    }
    if (--e.think > 0) return;
    if (e.y !== p.y) {
      const ny = e.y + Math.sign(p.y - e.y);
      if (!api.at(e.x, ny)) e.y = ny;
      e.think = pv(P.thinkTicks, e.variant);
      return;
    }
    if (P.takeTurns.value && !api.turnFree(e)) { e.think = 10; return; }
    api.takeTurn(e); go(e, 'attack', 'attack');
  },

  Champy(e, api) {
    const P = AI.Champy, p = api.s.player;
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        const tx = p.x + 1, ty = p.y;
        if (tx > 5 || (api.at(tx, ty) && api.at(tx, ty) !== e) || !api.turnFree(e)) { e.think = 15; return; }
        api.takeTurn(e); e.x = tx; e.y = ty; go(e, 'ready', 'ready');
        return;
      }
      case 'ready':
        if (e.stateT >= P.readyTicks.value) go(e, 'punch', 'punch');
        return;
      case 'punch':
        if (e.stateT === P.punchHitTick.value) api.hitPlayerAt(e.x - 1, e.y, e.damage, e.element);
        if (e.stateT >= P.punchTicks.value) go(e, 'wait', 'idle');
        return;
      case 'wait':
        if (e.stateT >= P.returnTicks.value) {
          const blocked = api.at(e.homeX, e.homeY);
          if (!blocked || blocked === e) { e.x = e.homeX; e.y = e.homeY; }
          api.endTurn(e); go(e, 'idle', 'idle'); e.think = P.thinkTicks.value;
        }
    }
  },

  Gunner(e, api) {
    const P = AI.Gunner, s = api.s, p = s.player;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (!api.turnFree(e)) { e.think = 10; return; }
        api.takeTurn(e);
        e.target = { x: p.x, y: p.y, locked: false, owner: e.id, t: 0 };
        go(e, 'aim', 'aim');
        return;
      case 'aim':
        if (e.stateT >= P.aimTicks.value) go(e, 'track', 'idle');
        return;
      case 'track':
        e.target.t++;
        if (e.stateT % P.trackStepTicks.value === 0) {
          if (e.target.x !== p.x) e.target.x += Math.sign(p.x - e.target.x);
          else if (e.target.y !== p.y) e.target.y += Math.sign(p.y - e.target.y);
        }
        if (e.stateT >= P.trackTicks.value) { e.target.locked = true; go(e, 'lock', 'idle'); }
        return;
      case 'lock':
        if (e.stateT >= P.lockTicks.value) go(e, 'fire', 'fire');
        return;
      case 'fire': {
        const k = (e.stateT - 1) / P.shotEveryTicks.value;
        if (Number.isInteger(k) && k < P.shots.value) {
          api.hitPlayerAt(e.target.x, e.target.y, e.damage, e.element);
          s.effects.push({ kind: 'shot', x: e.target.x, y: e.target.y, t: 0 });
          s.events.push({ type: 'shot', by: e.id });
        }
        if (e.stateT > P.shotEveryTicks.value * P.shots.value) { e.target = null; go(e, 'recover', 'recover'); }
        return;
      }
      case 'recover':
        if (e.stateT >= P.recoverTicks.value) { api.endTurn(e); go(e, 'idle', 'idle'); e.think = P.thinkTicks.value; }
    }
  },
};

export function stepVirus(e, api) {
  e.animT++; e.stateT++;
  if (e.flash) e.flash--;
  BEHAVIOUR[e.family](e, api);
}
