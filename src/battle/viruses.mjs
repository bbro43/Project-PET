// Virus definitions and AI. Stats are read from data/bn6-viruses.mjs (ROM tables);
// behaviour timings come from data/rules.mjs AI (each tagged with confidence).
import BN6 from '../../data/bn6-viruses.mjs';
import { AI } from '../../data/rules.mjs';

export const PLAYABLE_FAMILIES = ['Mettaur', 'Piranha', 'Heady', 'Swordy', 'KillerEye', 'Quaker', 'Catack', 'Champy', 'WindBox', 'Trumpy', 'OldStove', 'HauntedCandle', 'Kettle', 'Puffy', 'StarFish', 'Dragon', 'ScareCrow', 'PulseBulb', 'BigHat', 'BombCorn', 'Shrubby', 'HoneyBomber', 'Gunner', 'FighterPlane', 'DarkMech', 'SnakeArm', 'Armadillo', 'Cragger', 'Nightmare'];
const SPRITE = { Mettaur: 'mettaur', Piranha: 'piranha', Heady: 'heady', Swordy: 'swordy', KillerEye: 'killereye', Quaker: 'quaker', Catack: 'catack', Champy: 'champy', WindBox: 'windbox', Trumpy: 'trumpy', OldStove: 'oldstove', HauntedCandle: 'hauntedcandle', Kettle: 'kettle', Puffy: 'puffy', StarFish: 'starfish', Dragon: 'dragon', ScareCrow: 'scarecrow', PulseBulb: 'pulsebulb', BigHat: 'bighat', BombCorn: 'bombcorn', Shrubby: 'shrubby', HoneyBomber: 'honeybomber', FighterPlane: 'fighterplane', DarkMech: 'darkmech', SnakeArm: 'snakearm', Armadillo: 'armadillo', Cragger: 'cragger', Nightmare: 'nightmare', Gunner: 'gunner' };
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
// Counter window (object_setDefaultCounterTime, 16 frames): opened when an attack state starts (the app's reading).
const NOT_ATTACK = new Set(['idle', 'vanish', 'appear', 'wait', 'after', 'hop', 'run', 'slide', 'return', 'recover', 'step', 'swim', 'fly', 'under', 'surface', 'rise', 'dive', 'move', 'warp', 'dashalign']);
const go = (e, state, anim) => { e.state = state; e.stateT = 0; if (anim) setAnim(e, anim); if (!NOT_ATTACK.has(state) && state !== e.prevGo) e.counterT = 16; e.prevGo = state; };

// api: { s, at(x,y), hitPlayerAt(x,y,damage,element), spawnWave(e,x,y,stepTicks), turnFree(e), takeTurn(e), endTurn(e) }
const BEHAVIOUR = {

  // 0x81135CC: flies forward across the whole field (wrapping round), twice; then a bombing run over MegaMan's area.
  FighterPlane(e, api) {
    const P = AI.FighterPlane, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if ((e.flights || 0) < 2) { e.flights = (e.flights || 0) + 1; e.fx = e.x; e.wrapped = false; e.passHit = -1; return go(e, 'fly', 'idle'); }
        if (!api.turnFree(e)) { e.think = pv(P.wait, v); return; }
        e.flights = 0; api.takeTurn(e); return go(e, 'windup', 'bank');
      case 'fly': {
        e.fx -= pv(P.flySpeed, v) / 40;
        if (!e.wrapped && e.fx < -0.5) { // off MegaMan's edge, back in from the far side
          e.fx += 6; e.wrapped = true;
          if (v > 0 && e.flights === 1 && p.y !== e.y && !api.at(e.x, p.y)) e.y = p.y;
        }
        const x = Math.round(e.fx);
        if (x === p.x && e.y === p.y && e.passHit !== x) { e.passHit = x; api.hitPlayerAt(x, e.y, e.damage); }
        if (e.wrapped && e.fx <= e.x) { e.drawX = null; e.think = pv(P.wait, v); return go(e, 'idle', null); }
        e.drawX = e.fx;
        return;
      }
      case 'windup':
        if (e.stateT >= P.windup.value) { e.k = 0; e.bx = 2; e.by = 0; go(e, 'bombs', 'bomb'); BEHAVIOUR.FighterPlane(e, api); }
        return;
      case 'bombs': {
        const gap = pv(P.bombGap, v), path = P.path.value;
        if (e.stateT % gap === 0 && e.k <= path.length) {
          if (e.k > 0) { e.bx -= path[e.k - 1][0]; e.by += path[e.k - 1][1]; }
          s.hazards.push({ kind: 'planebomb', x: e.bx, y: e.by, burst: s.tick + gap, damage: pv(P.damage, v), owner: e.id });
          e.k++;
        }
        if (e.k > path.length && e.stateT % gap === 0) go(e, 'end', 'return');
        return;
      }
      case 'end':
        if (e.stateT >= 8) { setAnim(e, 'idle'); api.endTurn(e); e.think = pv(P.wait, v); go(e, 'idle', null); }
        return;
    }
  },

  // 0x8113D50: moves; every 3rd turn throws an elec ball that paralyzes; warps next to a paralyzed MegaMan and slashes.
  DarkMech(e, api) {
    const P = AI.DarkMech, s = api.s, p = s.player, v = e.variant;
    const front = () => e.x + (e.faceBack ? 1 : -1);
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        if (p.paralyzed > 0 && !(p.invuln > 0) && api.turnFree(e)) {
          const spot = [[p.x + 1, p.y], [p.x - 1, p.y]].find(([x, y]) => x >= 0 && x <= 5 && !api.at(x, y));
          if (spot) { api.takeTurn(e); e.home = [e.x, e.y]; e.dest = spot; return go(e, 'charge', 'dash'); }
        }
        e.turns = (e.turns || 0) + 1;
        if (e.turns >= 3) { e.turns = 0; return go(e, 'throw', 'ready'); }
        const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
        if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
        e.think = pv(P.moveWait, v); return;
      }
      case 'throw': {
        const rel = 4 + P.throwTicks.value;
        if (e.stateT === 4) setAnim(e, 'hold');
        if (e.stateT === rel) {
          setAnim(e, 'throw');
          s.hazards.push({ kind: 'elecball', fx: e.x - 1, fy: e.y, x: e.x - 1, y: e.y, speed: pv(P.ballSpeed, v), damage: P.throwDamage.value, paralyze: P.paralyzeTicks.value, owner: e.id });
        }
        if (e.stateT >= rel + P.throwAfter.value) { setAnim(e, 'idle'); e.think = pv(P.moveWait, v); go(e, 'idle', null); }
        return;
      }
      case 'charge': // the dash-ready animation runs, then it warps over two frames a panel
        if (e.stateT >= 3 + P.charge.value) { e.from = [e.x, e.y]; e.dashT = Math.max(1, Math.abs(e.dest[0] - e.x) * P.dashTicksPerPanel.value); go(e, 'dash', null); }
        return;
      case 'dash': {
        const k = Math.min(1, e.stateT / e.dashT);
        e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * k; e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * k;
        e.hidden = (e.stateT & 2) && k < 1;
        if (k >= 1) {
          e.hidden = false; e.drawX = e.drawY = null;
          if (!api.at(...e.dest)) [e.x, e.y] = e.dest;
          e.faceBack = e.x < p.x; e.highlight = [[[front(), e.y]]];
          go(e, 'warn', null);
        }
        return;
      }
      case 'warn':
        if (e.stateT >= P.slashWarn.value) { e.highlight = null; go(e, 'slash', 'slash'); }
        return;
      case 'slash':
        if (e.stateT === 3) { api.hitPlayerAt(front(), e.y, pv(P.slashDamage, v)); s.effects.push({ kind: 'slash', area: 'sword', x: e.x, y: e.y, t: 0, flip: e.faceBack }); }
        if (e.stateT >= 12 + pv(P.slashAfter, v)) {
          const [hx, hy] = e.home; if (!api.at(hx, hy)) { e.x = hx; e.y = hy; }
          e.faceBack = false; setAnim(e, 'idle'); api.endTurn(e); e.think = pv(P.moveWait, v); go(e, 'idle', null);
        }
        return;
    }
  },

  // 0x8114710: hops between holes; pops up two panels in front of MegaMan and leaps onto him.
  SnakeArm(e, api) {
    const P = AI.SnakeArm, s = api.s, p = s.player, v = e.variant;
    const leap = (T, next) => {
      const k = Math.min(1, e.stateT / T);
      e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * k; e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * k;
      e.z = Math.sin(Math.PI * k) * P.leapHeight.value;
      const q = Math.min(3, Math.floor(k * 4)); if (e.anim !== 'leap' + (q + 1)) setAnim(e, 'leap' + (q + 1));
      const x = Math.round(e.drawX);
      if (next === 'stay' && x !== e.lastX) { e.lastX = x; api.hitPlayerAt(x, e.dest[1], pv(P.damage, v)); }
      if (k >= 1) { e.z = 0; e.drawX = e.drawY = null; [e.x, e.y] = e.dest; e.airborne = false; setAnim(e, 'hole'); go(e, next, null); }
    };
    switch (e.state) {
      case 'idle': {
        if (e.anim !== 'hole') setAnim(e, 'hole');
        if (--e.think > 0) return;
        const tx = p.x + 2;
        if (api.turnFree(e) && tx <= 5 && (tx >= 3 || p.x === 0) && (!api.at(tx, p.y) || api.at(tx, p.y) === e)) {
          api.takeTurn(e); e.home = [e.x, e.y]; e.holes = [[e.x, e.y]];
          e.x = tx; e.y = p.y; e.dest = [tx - 2, p.y];
          e.highlight = [[[tx - 1, p.y], [tx - 2, p.y]].filter(([x]) => x <= 2)];
          return go(e, 'warn', null);
        }
        const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
        if (!free.length) { e.think = pv(P.hopWait, v); return; }
        e.from = [e.x, e.y]; e.dest = free[Math.floor(api.rng() * free.length)]; e.airborne = true;
        return go(e, 'hop', null);
      }
      case 'hop': return leap(pv(P.hopTicks, v), 'rest');
      case 'rest': e.think = pv(P.hopWait, v); return go(e, 'idle', null);
      case 'warn':
        if (e.stateT >= P.warn.value) { e.highlight = null; e.from = [e.x, e.y]; e.lastX = e.x; e.airborne = true; go(e, 'leap', null); }
        return;
      case 'leap': return leap(pv(P.leapTicks, v), 'stay');
      case 'stay':
        if (e.stateT >= pv(P.stay, v)) {
          const [hx, hy] = e.home; if (!api.at(hx, hy)) { e.x = hx; e.y = hy; }
          e.holes = null; go(e, 'after', null);
        }
        return;
      case 'after':
        if (e.stateT >= P.after.value) { api.endTurn(e); e.think = pv(P.hopWait, v); go(e, 'idle', null); }
        return;
    }
  },

  // 0x81154F0: lines up with MegaMan's row, curls up and rolls 3–5 panels forward, then hops home.
  Armadillo(e, api) {
    const P = AI.Armadillo, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        if (e.y !== p.y) {
          const ny = e.y + Math.sign(p.y - e.y);
          if (!api.at(e.x, ny)) { e.from = e.y; e.dest = ny; return go(e, 'slide', 'walk'); }
          e.think = 20; return;
        }
        if (s.enemies.some(o => o !== e && o.hp > 0 && o.family === 'Armadillo' && o.rolling && o.y === e.y)) { e.think = 20; return; }
        e.rolling = true; e.fx = e.x; e.left = pv(P.rolls, v); e.passHit = -1;
        return go(e, 'curl', 'curl');
      }
      case 'slide': {
        const T = Math.round(24 / pv(P.slideSpeed, v)), k = Math.min(1, e.stateT / T);
        e.drawY = e.from + (e.dest - e.from) * k;
        if (k >= 1) { if (!api.at(e.x, e.dest)) e.y = e.dest; e.drawY = null; e.think = 1; go(e, 'idle', 'idle'); }
        return;
      }
      case 'curl':
        if (e.stateT >= P.curl.value) { e.next = e.x - 1; go(e, 'roll', 'roll'); }
        return;
      case 'roll': {
        e.fx = Math.max(e.next, e.fx - pv(P.rollSpeed, v) / 40); e.drawX = e.fx;
        const x = Math.round(e.fx);
        if (x === p.x && e.y === p.y && e.passHit !== x) { e.passHit = x; api.hitPlayerAt(x, e.y, e.damage); }
        if (e.fx <= e.next) {
          if (--e.left <= 0 || e.next - 1 < 0) return go(e, 'wait', 'ball');
          e.next--;
        }
        return;
      }
      case 'wait':
        if (e.stateT >= P.after.value) { e.hopFrom = e.fx; go(e, 'hop', 'roll'); }
        return;
      case 'hop': {
        const T = P.hop.value, k = Math.min(1, e.stateT / T);
        e.drawX = e.hopFrom + (e.x - e.hopFrom) * k; e.z = Math.sin(Math.PI * k) * 70;
        if (e.stateT === T - 8) setAnim(e, 'uncurl');
        if (k >= 1) { e.drawX = null; e.z = 0; e.rolling = false; go(e, 'rest', null); }
        return;
      }
      case 'rest':
        if (e.stateT === 16) setAnim(e, 'idle');
        if (e.stateT >= 24) { e.think = 20; go(e, 'idle', null); }
        return;
    }
  },

  // 0x8115950: raises its rock fist while MegaMan's column flashes, punches it down onto him, then catches it.
  Cragger(e, api) {
    const P = AI.Cragger, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (!e.started) { e.started = true; e.think = P.firstWait.value; }
        if (--e.think > 0) return;
        if (v > 0 && !e.moved) {
          e.moved = true;
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
          if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
          e.think = P.moveWait.value; return;
        }
        e.moved = false;
        e.tgt = [p.x, p.y]; e.cells = [-1, 0, 1].map(dy => [p.x, p.y + dy]).filter(([, y]) => y >= 0 && y <= 2);
        e.highlight = [e.cells];
        return go(e, 'lift', 'lift');
      case 'lift':
        if (e.stateT >= P.lift.value) go(e, 'throw', 'throw');
        return;
      case 'throw': {
        if (e.stateT === P.release.value) e.fist = { x: e.tgt[0], y: e.tgt[1], start: s.tick, land: s.tick + P.slam.value };
        if (e.stateT === P.release.value + P.slam.value) {
          api.hitPlayerCells(e.cells, pv(P.damage, v));
          s.effects.push({ kind: 'shake', t: 0 });
          for (const [x, y] of e.cells) { s.effects.push({ kind: 'spark', x, y, t: 0 }); api.crackPanel(x, y); } // 0x80B8748: the three panels crack
        }
        if (e.stateT >= P.release.value + P.slam.value + P.stay.value) { e.highlight = null; go(e, 'catch', 'catch'); }
        else if (e.stateT >= P.release.value + P.slam.value + 3) e.highlight = null;
        return;
      }
      case 'catch':
        if (e.stateT === 8) setAnim(e, 'settle');
        if (e.stateT >= 11) { e.fist = null; setAnim(e, 'idle'); e.think = P.after.value; go(e, 'idle', null); }
        return;
    }
  },

  // 0x8115DE0: hidden at first, then rises; moves around and swings its scythe over the column in front.
  Nightmare(e, api) {
    const P = AI.Nightmare, s = api.s, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (!e.shown) { e.airborne = true; if (e.anim !== 'hidden') setAnim(e, 'hidden'); if (s.tick >= P.hiddenTicks.value) { e.shown = true; e.airborne = false; go(e, 'rise', 'appear'); } return; }
        if (--e.think > 0) return;
        e.moves = (e.moves || 0) + 1;
        if (e.moves <= pv(P.moves, v) || !api.turnFree(e)) {
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y) || api.at(x, y) === e) free.push([x, y]);
          const last = e.moves === pv(P.moves, v), py = s.player.y;
          const pick = (last && free.find(([x, y]) => x === 3 && y === py)) || free.filter(([, y]) => y === py)[Math.floor(api.rng() * 3)] || free[Math.floor(api.rng() * free.length)];
          if (pick) [e.x, e.y] = pick;
          e.think = pv(P.moveWait, v); return;
        }
        e.moves = 0; api.takeTurn(e);
        e.cells = [-1, 0, 1].map(dy => [e.x - 1, e.y + dy]).filter(([, y]) => y >= 0 && y <= 2);
        return go(e, 'mark', 'raise');
      case 'rise':
        if (e.stateT >= 35) { e.think = 20; go(e, 'idle', 'idle'); }
        return;
      case 'mark': // 16 frames with the scythe up, then the column flashes
        if (e.stateT === P.raise.value) e.highlight = [e.cells];
        if (e.stateT >= P.raise.value + P.mark.value) {
          e.highlight = null; setAnim(e, 'slash'); api.hitPlayerCells(e.cells, pv(P.damage, v));
          s.effects.push({ kind: 'slash', area: 'wide', x: e.x, y: e.y, t: 0 });
          go(e, 'after', null);
        }
        return;
      case 'after':
        if (e.stateT === 26) setAnim(e, 'idle');
        if (e.stateT >= 26 + pv(P.after, v)) { api.endTurn(e); e.think = 1; go(e, 'idle', null); }
        return;
    }
  },

  PulseBulb(e, api) {
    const P = AI.PulseBulb, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        e.guard = true;
        if (--e.think > 0) return;
        if (e.y !== p.y) { const ny = e.y + Math.sign(p.y - e.y); if (!api.at(e.x, ny)) e.y = ny; e.think = 20; return; }
        if (!api.turnFree(e)) { e.think = 30; return; }
        api.takeTurn(e); e.guard = false; return go(e, 'open', 'open');
      case 'open':
        if (e.stateT >= pv(P.openTicks, v)) {
          setAnim(e, 'pulse');
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -1 / P.pulseStep.value, damage: pv(P.damage, v), sprite: 'pulsebulb', seq: 'ring', owner: e.id });
          go(e, 'close', null);
        }
        return;
      case 'close':
        if (e.stateT >= pv(P.closeTicks, v)) { e.guard = true; api.endTurn(e); e.think = 60; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x8111330: three moves, then a hat thrown onto a marked panel.
  BigHat(e, api) {
    const P = AI.BigHat, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        e.moves = (e.moves || 0) + 1;
        if (e.moves <= 3 || !api.turnFree(e)) {
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
          if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
          e.think = pv(P.moveTicks, v) + 20; return;
        }
        e.moves = 0; api.takeTurn(e); e.target = [p.x, p.y]; e.highlight = [[e.target]]; return go(e, 'aim', 'aim');
      case 'aim':
        if (e.stateT >= P.mark.value) { e.highlight = null; setAnim(e, 'throw'); go(e, 'throw', null); }
        return;
      case 'throw':
        if (e.stateT === P.throwTicks.value) s.hazards.push({ kind: 'estrike', x: e.target[0], y: e.target[1], hit: s.tick + 1, damage: pv(P.damage, v), elem: 'none', look: 'hat', owner: e.id });
        if (e.stateT >= P.throwTicks.value + P.after.value) { api.endTurn(e); e.think = 30; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x8111DC0: from the front of its area, lob corn bombs onto MegaMan.
  BombCorn(e, api) {
    const P = AI.BombCorn, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (e.x > 3 && !api.at(e.x - 1, e.y)) { e.x--; e.think = 30; return; }
        if (s.enemies.filter(o => o.family === 'BombCorn' && o.state === 'fire').length >= 2) { e.think = 20; return; }
        return go(e, 'fire', 'aim');
      case 'fire': {
        const n = pv(P.count, v), t = e.stateT - P.windup.value;
        if (t >= 0 && t % P.gap.value === 0 && t / P.gap.value < n) {
          if (t === 0) setAnim(e, 'shoot');
          s.hazards.push({ kind: 'lob', x: e.x, tx: p.x, y: p.y, start: s.tick, land: s.tick + P.flight.value, damage: pv(P.damage, v), owner: e.id });
        }
        if (t >= P.gap.value * n + pv(P.after, v)) { e.think = 30; go(e, 'idle', 'idle'); }
        return;
      }
    }
  },

  // 0x81121F0: walk around; after standing a while, a thorn wave down the row.
  Shrubby(e, api) {
    const P = AI.Shrubby, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        e.steps = (e.steps || 0) + 1;
        if (e.steps <= 3 || !api.turnFree(e)) {
          const ny = e.y + Math.sign(p.y - e.y);
          if (ny !== e.y && !api.at(e.x, ny)) e.y = ny;
          else { const free = []; for (let x = 3; x < 6; x++) if (!api.at(x, e.y)) free.push(x); if (free.length) e.x = free[Math.floor(api.rng() * free.length)]; }
          e.think = pv(P.walkWait, v); return;
        }
        e.steps = 0; api.takeTurn(e);
        e.highlight = [[0, 1, 2, 3, 4, 5].filter(x => x < e.x).map(x => [x, e.y])];
        return go(e, 'aim', 'roll');
      case 'aim':
        if (e.stateT >= pv(P.mark, v)) {
          e.highlight = null; setAnim(e, 'attack');
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -1 / P.waveStep.value, damage: pv(P.damage, v), sprite: 'shrubby', seq: 'thorn', owner: e.id });
          go(e, 'after', null);
        }
        return;
      case 'after':
        if (e.stateT >= pv(P.after, v) + 20) { api.endTurn(e); e.think = 60; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x81129A0: hop around now and then; one hive at a time releases 3 homing bees.
  HoneyBomber(e, api) {
    const P = AI.HoneyBomber, s = api.s, v = e.variant;
    const every = pv(P.moveEvery, v);
    if (every && e.state === 'idle' && s.tick % every === 0) {
      const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
      if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
    }
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (s.hazards.some(h => h.kind === 'bee' && h.owner === e.id) || !api.turnFree(e)) { e.think = 20; return; }
        api.takeTurn(e); return go(e, 'open', 'open');
      case 'open': {
        const T = pv(P.open, v), t = e.stateT - T;
        if (t === 0) setAnim(e, 'release');
        if (t >= 0 && t % P.beeGap.value === 0 && t / P.beeGap.value < P.bees.value)
          s.hazards.push({ kind: 'bee', fx: e.x - 1, fy: e.y, x: e.x - 1, y: e.y, step: P.beeStep.value, next: s.tick + P.beeStep.value, until: s.tick + 240, damage: pv(P.damage, v), owner: e.id });
        if (t >= P.beeGap.value * P.bees.value + P.after.value) { setAnim(e, 'close'); api.endTurn(e); e.think = 60; go(e, 'idle', null); }
        return;
      }
    }
  },

  // 0x810E7B0: the base Kettle is harmless; others appear beside MegaMan and burst steam.
  Kettle(e, api) {
    const P = AI.Kettle, s = api.s, p = s.player, v = e.variant;
    const hop = () => { const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]); if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)]; };
    switch (e.state) {
      case 'idle': {
        if (v === 0) return;
        if (--e.think > 0) return;
        e.turns = (e.turns || 0) + 1;
        if (e.turns < 3 || !api.turnFree(e)) { hop(); e.think = pv(P.moveWait, v); return; }
        e.turns = 0;
        const spots = [[0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [p.x + dx, p.y + dy]).filter(([x, y]) => x >= 0 && x <= 5 && y >= 0 && y <= 2 && !api.at(x, y) && !(x === p.x && y === p.y));
        if (!spots.length) { e.think = 60; return; }
        api.takeTurn(e); e.home = [e.x, e.y]; [e.x, e.y] = spots[0];
        return go(e, 'boil', 'boil');
      }
      case 'boil':
        if (e.stateT === pv(P.boil, v)) setAnim(e, 'hiss');
        if (e.stateT === pv(P.boil, v) + P.hold.value) { setAnim(e, 'burst'); e.highlight = [[]]; }
        if (e.stateT === pv(P.boil, v) + P.hold.value + P.burst.value - 8) {
          const cells = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.push([e.x + dx, e.y + dy]);
          api.hitPlayerCells(cells, pv(P.damage, v));
          for (const [x, y] of cells) if (x >= 0 && x <= 5 && y >= 0 && y <= 2) s.effects.push({ kind: 'spark', x, y, t: 0 });
        }
        if (e.stateT >= pv(P.boil, v) + P.hold.value + P.burst.value) {
          e.highlight = null; if (e.home && !api.at(...e.home)) [e.x, e.y] = e.home; api.endTurn(e);
          e.think = pv(P.moveWait, v); go(e, 'idle', 'idle');
        }
        return;
    }
  },

  // 0x810F010: drift every 20 frames, every 4th time spit a bubble.
  Puffy(e, api) {
    const P = AI.Puffy, s = api.s, v = e.variant;
    if (e.state === 'spit') { if (e.stateT >= 20) go(e, 'idle', 'idle'); return; }
    if (--e.think > 0) return;
    e.think = P.moveWait.value; e.count = (e.count || 0) + 1;
    if (e.count >= 4) {
      e.count = 0;
      s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -1 / P.bubbleStep.value, damage: pv(P.damage, v), sprite: 'puffy', seq: 'bubble', owner: e.id });
      return go(e, 'spit', 'shoot');
    }
    const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
    if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
  },

  // 0x810F39C: three slow bubbles down its row, then a long wait.
  StarFish(e, api) {
    const P = AI.StarFish, s = api.s, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (s.hazards.some(h => h.owner === e.id)) { e.think = 10; return; }
        e.left = P.count.value; return go(e, 'release', 'open');
      case 'release':
        if ((e.stateT - 16) % P.gap.value === 0 && e.stateT >= 16 && e.left > 0) {
          e.left--; setAnim(e, 'shoot');
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -pv(P.speed, v) / 40, damage: pv(P.damage, v), sprite: 'starfish', seq: 'bubble', owner: e.id, bubble: true }); // traps MegaMan (BUBBLE.sources, unverified)
        }
        if (e.left === 0 && e.stateT >= 16 + P.gap.value * P.count.value) { e.think = P.after.value; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x810FCE0: dive under, then fly through MegaMan's column.
  Dragon(e, api) {
    const P = AI.Dragon, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        e.turns = (e.turns || 0) + 1;
        if (e.turns < 3 || !api.turnFree(e)) {
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
          if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
          e.think = pv(P.after, v); return;
        }
        e.turns = 0; api.takeTurn(e); e.home = [e.x, e.y]; e.passes = pv(P.passes, v);
        return go(e, 'rise', 'rise');
      }
      case 'rise':
        if (e.stateT >= P.rise.value) { e.hidden = true; e.airborne = true; go(e, 'under', null); }
        return;
      case 'under':
        if (e.stateT >= pv(P.under, v)) {
          e.col = p.x; e.dir = api.rng() < 0.5 ? 1 : -1; e.fy = e.dir > 0 ? -0.5 : 2.5;
          e.hidden = false; e.hitDone = false; e.drawX = e.col; go(e, 'fly', 'rise');
        }
        return;
      case 'fly': {
        e.fy += e.dir * P.speed.value / 24; e.drawY = e.fy;
        const y = Math.round(e.fy);
        e.highlight = y >= 0 && y <= 2 ? [[[e.col, y]]] : null;
        if (!e.hitDone && y === p.y && e.col === p.x && p.state !== 'vanish') { e.hitDone = true; api.hitPlayerAt(e.col, y, pv(P.damage, v)); }
        if (e.fy < -1 || e.fy > 3) {
          e.highlight = null;
          if (--e.passes > 0) { e.hidden = true; return go(e, 'under', null); }
          const [hx, hy] = e.home; if (!api.at(hx, hy)) { e.x = hx; e.y = hy; }
          e.drawX = e.x; e.drawY = e.y; e.airborne = false; api.endTurn(e); e.think = pv(P.after, v); go(e, 'idle', 'idle');
        }
        return;
      }
    }
  },

  // 0x81104D4: heals itself every 180 frames and attacks; being hit sets it off too.
  ScareCrow(e, api) {
    const P = AI.ScareCrow, s = api.s, v = e.variant;
    e.lastHp ??= e.hp;
    const hit = e.hp < e.lastHp; e.lastHp = e.hp;
    switch (e.state) {
      case 'idle':
        e.clock = (e.clock ?? P.cycle.value) - 1;
        e.highlight = e.clock <= 60 && (e.clock & 4) ? [[[e.x, e.y]]] : null;
        if (e.clock > 0 && !hit) return;
        e.highlight = null;
        if (e.clock <= 0) { e.hp = e.maxHp; e.lastHp = e.hp; s.effects.push({ kind: 'heal', x: e.x, y: e.y, t: 0 }); }
        e.clock = P.cycle.value; return go(e, 'raise', 'raise');
      case 'raise':
        if (e.stateT >= P.windup.value) { setAnim(e, 'lit'); e.beam = []; for (let x = e.x - 1; x >= 0; x--) e.beam.push([x, e.y]); go(e, 'thunder', null); }
        return;
      case 'thunder':
        api.hitPlayerCells(e.beam, pv(P.damage, v));
        if (e.stateT >= P.thunder.value) { e.beam = null; setAnim(e, 'end'); go(e, 'idle', null); }
        return;
    }
  },

  // 0x810C6F0: roll along the row, then fire the cannon (one Catack at a time).
  Catack(e, api) {
    const P = AI.Catack, s = api.s, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (e.think === 30 && !e.started) { e.started = true; e.think = pv(P.firstWait, v); }
        if (--e.think > 0) return;
        {
          const row = [3, 4, 5].filter(x => x !== e.x && !api.at(x, e.y));
          e.from = e.x; e.dest = row.length ? row[Math.floor(api.rng() * row.length)] : e.x;
        }
        return go(e, 'roll', 'roll');
      case 'roll': {
        const T = pv(P.rollTicks, v), k = Math.min(1, e.stateT / T);
        e.drawX = e.from + (e.dest - e.from) * k;
        if (k >= 1) { if (!api.at(e.dest, e.y) || api.at(e.dest, e.y) === e) e.x = e.dest; e.drawX = e.x; go(e, 'ready', 'idle'); }
        return;
      }
      case 'ready':
        if (!api.turnFree(e)) { e.think = P.waitAfter.value; return go(e, 'idle', 'idle'); }
        api.takeTurn(e); return go(e, 'aim', 'aim');
      case 'aim':
        if (e.stateT === 20) {
          setAnim(e, 'fire');
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -1 / P.shellStep.value, damage: pv(P.damage, v), sprite: 'catack', seq: 'shell', owner: e.id });
        }
        if (e.stateT === 40) setAnim(e, 'recover');
        if (e.stateT >= 60) { api.endTurn(e); e.think = P.waitAfter.value; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x810D0F4: a wind object pushes (WindBox) or pulls (VacuumFan) MegaMan, one row at a time.
  WindBox(e, api) {
    const P = AI.WindBox, s = api.s, p = s.player;
    e.gustRow ??= 3;
    if (s.tick % P.gustEvery.value !== 0) return;
    e.gustRow = e.gustRow <= 1 ? 3 : e.gustRow - 1;
    const y = e.gustRow - 1, dir = e.variant % 2 ? 1 : -1; // VacuumFan pulls toward the front column
    s.effects.push({ kind: 'gust', y, dir, t: 0 });
    if (p.y === y && p.state !== 'vanish' && !s.navi?.superArmor) { const nx = p.x + dir; if (nx >= 0 && nx <= 2) p.x = nx; } // SuperArmor: "Won't be pushed!"
  },

  // 0x810D554: hop around, then play a song (effect by version).
  Trumpy(e, api) {
    const P = AI.Trumpy, s = api.s, v = e.variant;
    const allies = () => s.enemies.filter(o => o !== e && o.hp > 0 && !o.kind);
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        e.hops = (e.hops || 0) + 1;
        {
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
          if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
        }
        if (e.hops <= 3) { e.think = pv(P.hopWait, v); setAnim(e, 'hop'); return; }
        e.hops = 0; return go(e, 'play', 'play');
      case 'play': {
        const T = pv(P.song, v), fx = v === 5 ? 0 : v;
        if (fx === 0) for (const o of allies()) o.invuln = Math.max(o.invuln || 0, 2);
        if (fx === 4 && e.stateT === T - 25) for (const o of allies()) { o.hp = o.maxHp; s.effects.push({ kind: 'heal', x: o.x, y: o.y, t: 0 }); }
        if (e.stateT % 16 === 0) s.effects.push({ kind: 'note', x: e.x, y: e.y, t: 0 });
        if (e.stateT >= T) { setAnim(e, 'idle'); e.think = P.afterSong.value; go(e, 'idle', null); }
        return;
      }
    }
  },

  // 0x810D910: slide to line up, then breathe fire ahead.
  OldStove(e, api) {
    const P = AI.OldStove, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (p.y === e.y && (e.x === 3 || api.at(e.x - 1, e.y))) return go(e, 'open', 'open');
        if (p.y === e.y) { e.from = [e.x, e.y]; e.dest = [e.x - 1, e.y]; e.span = 40; return go(e, 'slide', null); } // close in along the row
        { const ny = e.y + Math.sign(p.y - e.y); if (!api.at(e.x, ny)) { e.from = [e.x, e.y]; e.dest = [e.x, ny]; e.span = 24; return go(e, 'slide', null); } }
        e.think = 30; return;
      case 'slide': {
        const T = Math.round(e.span / pv(P.slideSpeed, v)), k = Math.min(1, e.stateT / T);
        e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * k; e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * k;
        if (k >= 1) { if (!api.at(...e.dest)) [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; e.think = 1; go(e, 'idle', null); }
        return;
      }
      case 'open':
        if (e.stateT >= P.windup.value) { e.flame = [[e.x - 1, e.y]]; go(e, 'breathe', 'breathe'); }
        return;
      case 'breathe':
        api.hitPlayerCells(e.flame, pv(P.damage, v));
        if (e.stateT >= pv(P.flameTicks, v)) { e.flame = null; setAnim(e, 'close'); e.think = pv(P.after, v); go(e, 'idle', null); }
        return;
    }
  },

  // 0x810E120: one candle at a time marks MegaMan's panel, then a flame strikes it.
  HauntedCandle(e, api) {
    const P = AI.HauntedCandle, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        if (!api.turnFree(e)) { e.think = 10; return; }
        api.takeTurn(e); e.target = [p.x, p.y]; e.highlight = [[e.target]]; return go(e, 'aim', 'aim');
      case 'aim':
        if (e.stateT >= pv(P.mark, v)) {
          e.highlight = null; setAnim(e, 'strike');
          s.hazards.push({ kind: 'estrike', x: e.target[0], y: e.target[1], hit: s.tick + 1, damage: pv(P.damage, v), elem: 'fire', owner: e.id });
          go(e, 'after', null);
        }
        return;
      case 'after':
        if (e.stateT === 20) setAnim(e, 'idle');
        if (e.stateT >= P.after.value) { api.endTurn(e); e.think = P.interval.value; go(e, 'idle', null); }
        return;
    }
  },

  // 0x810A550: swim to MegaMan's row, sonar mark down the row, hold, torpedo.
  Piranha(e, api) {
    const P = AI.Piranha, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        if (e.y !== p.y && !api.at(e.x, p.y)) { e.dest = p.y; return go(e, 'swim', 'aim'); }
        e.mark = { fx: e.x - 1 }; return go(e, 'sonar', 'aim');
      }
      case 'swim':
        e.drawY = e.y + (e.dest - e.y) * Math.min(1, e.stateT / P.moveTicks.value);
        if (e.stateT >= P.moveTicks.value) { e.y = e.dest; e.drawY = e.y; e.think = 10; go(e, 'idle', 'idle'); }
        return;
      case 'sonar': // the mark slides ahead; when it reaches MegaMan, hold then fire
        e.mark.fx -= pv(P.markSpeed, v) / 40;
        if (Math.round(e.mark.fx) === p.x && e.y === p.y) { e.mark = null; return go(e, 'hold', 'lock'); }
        if (e.mark.fx < -0.5) { e.mark = null; e.think = 30; return go(e, 'idle', 'idle'); }
        return;
      case 'hold':
        if (e.stateT === pv(P.hold, v)) setAnim(e, 'charge');
        if (e.stateT === pv(P.hold, v) + 20) {
          setAnim(e, 'fire');
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -P.torpedoSpeed.value / 40, damage: pv(P.damage, v), sprite: 'piranha', seq: 'torpedo', owner: e.id });
        }
        if (e.stateT >= pv(P.hold, v) * 2 + 20) { e.think = 20; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x810A9EC: four moves, then the head flies down the row.
  Heady(e, api) {
    const P = AI.Heady, s = api.s, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        e.moves = (e.moves || 0) + 1;
        if (e.moves < 5) {
          const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
          if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
          e.think = pv(P.moveWait, v); return;
        }
        e.moves = 0; e.highlight = [[[e.x - 1, e.y]]]; return go(e, 'warn', 'drop');
      case 'warn':
        if (e.stateT >= P.warn.value) {
          e.highlight = null; e.hidden = true;
          s.hazards.push({ kind: 'bolt', x: e.x - 1, fx: e.x - 1, y: e.y, dx: -pv(P.headSpeed, v) / 40, damage: pv(P.damage, v), sprite: 'heady', seq: 'head', owner: e.id, until: s.tick + P.headLife.value, keep: true });
          go(e, 'flying', null);
        }
        return;
      case 'flying':
        if (e.stateT >= P.headLife.value) { e.hidden = false; e.think = P.recover.value; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x810B2D0: three sword styles by version.
  Swordy(e, api) {
    const P = AI.Swordy, s = api.s, p = s.player, v = e.variant, kind = v % 3;
    const shapeCells = (type, x, y) => type === 'wide' ? [[x - 1, y - 1], [x - 1, y], [x - 1, y + 1]] : [[x - 1, y], [x - 2, y]];
    const inReach = () => p.y === e.y && (p.x === e.x - 1 || p.x === e.x - 2) ? (p.x === e.x - 1 ? 'wide' : 'long') : (p.x === e.x - 1 && Math.abs(p.y - e.y) === 1 ? 'wide' : null);
    const slash = type => { e.type = type; e.highlight = [shapeCells(type, e.x, e.y).filter(([x, y]) => y >= 0 && y <= 2 && x >= 0)]; go(e, 'windup', type === 'wide' ? 'ready' : 'ready2'); };
    switch (e.state) {
      case 'idle': {
        if (--e.think > 0) return;
        if (kind === 0) { // Swordy / SP: slash if MegaMan is in reach, else step toward his row
          const t = inReach(); if (t) return slash(t);
          const ny = e.y + Math.sign(p.y - e.y), nx = e.x - 1;
          if (ny !== e.y && !api.at(e.x, ny)) e.y = ny; else if (nx >= 3 && !api.at(nx, e.y)) e.x = nx;
          e.think = P.moveWait.value; return;
        }
        if (kind === 1) { // Swordy2 / Rare: slide along its row toward MegaMan, then slash
          if (p.y !== e.y) { e.think = 10; return; }
          if (e.x - 1 > p.x + 0 && e.x - 1 >= 3 && !api.at(e.x - 1, e.y) && e.x - 1 > p.x) { e.x--; e.think = 12; return; }
          return slash(p.x === e.x - 1 ? 'wide' : 'long');
        }
        e.turns = (e.turns || 0) + 1; // Swordy3 / Rare2: warp in front of MegaMan every 4th turn
        if (e.turns >= 4 && p.x + 1 <= 5 && !api.at(p.x + 1, p.y)) { e.turns = 0; e.home = [e.x, e.y]; e.x = p.x + 1; e.y = p.y; return slash(api.rng() < 0.5 ? 'wide' : 'long'); }
        const free = []; for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) if (!api.at(x, y)) free.push([x, y]);
        if (free.length) [e.x, e.y] = free[Math.floor(api.rng() * free.length)];
        e.think = 80; return;
      }
      case 'windup':
        if (e.stateT >= pv(P.windup, v)) {
          e.highlight = null; setAnim(e, 'slash');
          api.hitPlayerCells(shapeCells(e.type, e.x, e.y), pv(P.damage, v));
          s.effects.push({ kind: 'slash', area: e.type, x: e.x, y: e.y, t: 0 });
          go(e, 'after', null);
        }
        return;
      case 'after':
        if (e.stateT === 16) setAnim(e, 'idle');
        if (e.stateT >= pv(P.after, v)) { if (e.home) { [e.x, e.y] = e.home; e.home = null; } e.think = 1; go(e, 'idle', 'idle'); }
        return;
    }
  },

  // 0x810BB94: scan a line, then a long beam if MegaMan was caught.
  KillerEye(e, api) {
    const P = AI.KillerEye, s = api.s, p = s.player, v = e.variant;
    const line = dir => { const dy = dir - 1, cells = []; for (let k = 1; k <= 5; k++) { const x = e.x - k, y = e.y + dy * k; if (x < 0 || y < 0 || y > 2) break; cells.push([x, y]); } return cells; };
    switch (e.state) {
      case 'idle':
        if (--e.think > 0) return;
        { const seq = P.directions.value[e.y]; e.dirIdx = ((e.dirIdx ?? -1) + 1) % seq.length; e.cells = line(seq[e.dirIdx]); }
        return go(e, 'scan', 'open');
      case 'scan':
        e.scan = e.cells;
        if (e.cells.some(([x, y]) => x === p.x && y === p.y)) { e.scan = null; return go(e, 'aim', 'scan'); }
        if (e.stateT >= P.scan.value) { e.scan = null; e.think = P.interval.value; go(e, 'idle', 'idle'); }
        return;
      case 'aim':
        if (e.stateT >= pv(P.delay, v)) { setAnim(e, 'beam'); go(e, 'beam', null); }
        return;
      case 'beam':
        e.beam = e.cells; api.hitPlayerCells(e.cells, pv(P.damage, v));
        if (e.stateT >= P.beam.value) { e.beam = null; setAnim(e, 'close'); e.think = P.recover.value + P.interval.value; go(e, 'idle', null); }
        return;
    }
  },

  // 0x810C170: hop to MegaMan's row and slam out a shockwave.
  Quaker(e, api) {
    const P = AI.Quaker, s = api.s, p = s.player, v = e.variant;
    switch (e.state) {
      case 'idle':
        if (e.think === 30 && !e.started) { e.started = true; const [a, b] = P.firstWait.value; e.think = a + 10 * Math.floor(api.rng() * 8); }
        if (--e.think > 0) return;
        {
          const row = [3, 4, 5].filter(x => !api.at(x, p.y) || api.at(x, p.y) === e);
          e.from = [e.x, e.y]; e.dest = row.length ? [row[Math.floor(api.rng() * row.length)], p.y] : [e.x, e.y];
        }
        e.airborne = true; return go(e, 'hop', 'jump');
      case 'hop': {
        const T = pv(P.hop, v), k = Math.min(1, e.stateT / T);
        e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * k; e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * k; e.z = Math.round(40 * Math.sin(Math.PI * k));
        if (k >= 1) {
          const o = api.at(...e.dest); if (!o || o === e) [e.x, e.y] = e.dest;
          e.drawX = e.x; e.drawY = e.y; e.z = 0; e.airborne = false;
          s.effects.push({ kind: 'shake', t: 0 });
          api.spawnWave(e, e.x - 1, e.y, pv(P.waveStep, v), pv(P.damage, v));
          go(e, 'slam', 'slam');
        }
        return;
      }
      case 'slam':
        if (e.stateT === 20) setAnim(e, 'idle');
        if (e.stateT >= pv(P.after, v)) { e.think = 1; go(e, 'idle', 'idle'); }
        return;
    }
  },
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
  if (e.invuln > 0) e.invuln--;
  BEHAVIOUR[e.family](e, api);
}
