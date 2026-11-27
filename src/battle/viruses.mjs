// Virus definitions and AI. Stats are read from data/bn6-viruses.mjs (ROM tables);
// behaviour timings come from data/rules.mjs AI (each tagged with confidence).
import BN6 from '../../data/bn6-viruses.mjs';
import { AI } from '../../data/rules.mjs';

export const PLAYABLE_FAMILIES = ['Mettaur', 'Piranha', 'Heady', 'Swordy', 'KillerEye', 'Quaker', 'Champy', 'Gunner'];
const SPRITE = { Mettaur: 'mettaur', Piranha: 'piranha', Heady: 'heady', Swordy: 'swordy', KillerEye: 'killereye', Quaker: 'quaker', Champy: 'champy', Gunner: 'gunner' };
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
  BEHAVIOUR[e.family](e, api);
}
