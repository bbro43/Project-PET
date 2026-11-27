// CPU Navis (BN6). HP/element/names from data/bn6-viruses.mjs (ROM tables);
// AI timings, damage and decision logic from data/rules.mjs NAVI_AI (each value tagged).
// See documentation/audit/2026-11-27-bn6-navi-ai.md for the decoded routines.
import BN6 from '../../data/bn6-viruses.mjs';
import { NAVI_AI } from '../../data/rules.mjs';

export const PLAYABLE_NAVIS = ['HeatMan', 'ElecMan', 'SlashMan', 'EraseMan', 'ChargeMan', 'SpoutMan', 'TomahawkMan', 'TenguMan', 'ProtoMan'];
const SPRITE = { HeatMan: 'heatman', ElecMan: 'elecman', SlashMan: 'slashman', EraseMan: 'eraseman', ChargeMan: 'chargeman', SpoutMan: 'spoutman', TomahawkMan: 'tomahawkman', TenguMan: 'tenguman', ProtoMan: 'protoman' };
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

// ======================= HeatMan =======================
// Decision 0x80F2B6C / 0x80F2BEE → 9 move, 0xA fire column, 0xB lighter stomp, 0xC wall nozzle.
function heatman(e, api) {
  const P = NAVI_AI.HeatMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const [VAN, APP] = P.warpTicks.value;
  const lowHp = e.hp < e.maxHp / 2;
  const done = wait => { go(e, 'idle', 'idle'); e.think = wait; };
  const pillar = (x, y, burn, damage) => {
    if (x < 0 || x > 5 || y < 0 || y > 2) return;
    s.hazards.push({ kind: 'pillar', x, y, start: s.tick, rise: P.pillarRise.value, burn, fall: P.pillarFall.value, damage });
  };
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= VAN) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= APP) {
        if (e.after) { const a = e.after; e.after = null; return go(e, a, 'aim'); }
        done(pv(P.moveWait, v));
      }
      return;
    // ---- 0xA: aim, fire, three pillars in the column in front
    case 'column':
      if (e.stateT === P.aimTicks.value) setAnim(e, 'fire');
      if (e.stateT === P.aimTicks.value + P.fireTicks.value) {
        setAnim(e, 'arm');
        for (const dy of [-1, 0, 1]) pillar(e.x - 1, e.y + dy, P.columnBurn.value, pv(P.columnDamage, v));
      }
      if (e.stateT >= P.aimTicks.value + P.fireTicks.value + 20) returnHome('column');
      return;
    // ---- 0xB: lighter stomp, repeated
    case 'stomp': {
      const ph = P.stompPhases.value, t = e.stateT;
      const tRise = ph.close, tHang = tRise + ph.rise, tFall = tHang + ph.hang, tLand = tFall + ph.fall;
      if (t === 1 && e.anim !== 'box') setAnim(e, 'close');
      if (t > tRise && t <= tHang) { e.z = (t - tRise) * 16; e.airborne = true; }
      if (t === tHang) { e.x = p.x; e.y = p.y; e.drawX = e.x; e.drawY = e.y; setAnim(e, 'box'); }
      if (t > tFall && t <= tLand) e.z = (tLand - t) * 16;
      if (t === tLand) {
        e.z = 0; e.airborne = false; s.effects.push({ kind: 'shake', t: 0 });
        const burn = pv(P.stompBurn, v), dmg = pv(P.stompDamage, v);
        api.hitPlayerCells([[e.x, e.y]], dmg);
        for (const [dx, dy] of P.stompPillars.value) pillar(e.x + dx, e.y + dy, burn, dmg);
      }
      if (t >= tLand + pv(P.stompBurn, v)) {
        if (--e.stomps > 0) { e.stateT = ph.close; return; } // jump again from the box
        setAnim(e, 'open');
        returnHome('stomp');
      }
      return;
    }
    // ---- 0xC: wall nozzle at the back edge of MegaMan's row, repeated
    case 'nozzle':
      if (e.stateT === P.aimTicks.value) setAnim(e, 'fire');
      if (e.stateT === P.aimTicks.value + P.fireTicks.value) {
        setAnim(e, 'arm');
        const cells = []; for (let x = 0; x < P.nozzleReach.value; x++) cells.push([x, e.y]);
        s.hazards.push({ kind: 'nozzle', y: e.y, cells, start: s.tick, until: s.tick + P.nozzleBurn.value, damage: pv(P.nozzleDamage, v) });
      }
      if (e.stateT >= P.aimTicks.value + P.fireTicks.value + P.nozzleBurn.value) {
        if (--e.nozzles > 0) return warp(rowPanel(), 'nozzle');
        returnHome('nozzle');
      }
      return;
    case 'home':
      if (e.stateT >= APP) done(e.homeWait);
  }

  function decide() {
    if (e.mem.followUp) { // second step 0x80F2BEE
      e.mem.followUp = false; m.c4 = 0;
      if (rnd16(api) < 6) { e.stomps = (lowHp ? P.stompCount.value.lowHp : P.stompCount.value.normal)[Math.min(v, 4)]; e.homeX = e.x; e.homeY = e.y; return go(e, 'stomp', 'close'); }
      e.nozzles = (lowHp ? P.nozzleCount.value.lowHp : P.nozzleCount.value.normal)[Math.min(v, 4)];
      e.homeX = e.x; e.homeY = e.y;
      return warp(rowPanel(), 'nozzle');
    }
    if (m.c4 >= 3) {
      e.homeX = e.x; e.homeY = e.y;
      if (v > 0) { m.c5 ^= 1; if (m.c5 === 0) m.c4 = 0; else e.mem.followUp = true; } else e.mem.followUp = true;
      const t = [p.x + 1, p.y];
      return warp(api.at(...t) && api.at(...t) !== e ? rowPanel() : t, 'column');
    }
    if (rnd16(api) < 12) m.c4++;
    const free = freeEnemyPanels(e, api);
    return warp(pick(free, api) || [e.x, e.y], null);
  }
  function rowPanel() {
    for (const x of [3, 4, 5]) if (!api.at(x, p.y) || api.at(x, p.y) === e) return [x, p.y];
    return [e.x, e.y];
  }
  function warp(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
  function returnHome(kind) {
    const blocked = api.at(e.homeX, e.homeY) && api.at(e.homeX, e.homeY) !== e;
    const home = blocked || e.homeX < 3 ? (pick(freeEnemyPanels(e, api), api) || [e.homeX, e.homeY]) : [e.homeX, e.homeY];
    [e.x, e.y] = home; e.drawX = e.x; e.drawY = e.y; e.z = 0;
    e.homeWait = kind === 'column' ? P.columnWait.value : pv(P.attackWait, v);
    go(e, 'home', 'appear');
  }
}

// ======================= SlashMan =======================
// Decision 0x80F48E8 → 9 dart, 0xA claw combo, 0xB rolling slash, 0xC kunai volleys.
function slashman(e, api) {
  const P = NAVI_AI.SlashMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const W = P.warpTicks.value;
  const done = wait => { go(e, 'idle', 'idle'); e.think = wait; };
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= W) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= W) {
        const a = e.after; e.after = null;
        if (a === 'combo') return go(e, 'combo', 'ready');
        if (a === 'roll') return go(e, 'roll', 'crouch');
        if (a === 'kunai') return go(e, 'kunai', 'up');
        if (a === 'home') return done(e.homeWait);
        done(m.moves >= 2 ? pv({ value: P.moveWait.value.chained }, v) : pv({ value: P.moveWait.value.first }, v));
      }
      return;
    // ---- 0xA: down swipe (column in front), short gap, side swipe (two ahead)
    case 'combo': {
      const ready = pv(P.comboReady, v), sw = P.comboSwipe.value, gap = P.comboGap.value, t = e.stateT, dmg = pv(P.comboDamage, v);
      const swipe = (shape, anim) => {
        setAnim(e, anim);
        api.hitPlayerCells(P.comboShapes.value[shape].map(([dx, dy]) => [e.x + dx, e.y + dy]), dmg);
        s.effects.push({ kind: 'claw', shape, x: e.x - 1, y: e.y, t: 0 });
      };
      if (t === ready) swipe('down', 'down');
      if (t === ready + sw + gap) swipe('side', 'side');
      if (t >= ready + 2 * sw + gap) goHome(pv(P.comboWait, v));
      return;
    }
    // ---- 0xB: crouch, spin, roll along the row
    case 'roll':
      if (e.stateT === pv(P.rollCrouch, v)) { setAnim(e, 'spin'); e.rollFrom = e.x; e.rollT = 0; e.state = 'rolling'; e.stateT = 0; }
      return;
    case 'rolling': {
      e.drawX = e.rollFrom - (e.stateT * pv(P.rollSpeed, v)) / 40;
      const px = Math.round(e.drawX);
      if (px >= 0 && px <= 5) { e.x = px; api.hitPlayerCells([[px, e.y]], pv(P.rollDamage, v)); }
      if (e.drawX < -1) { setAnim(e, 'recover'); goHome(pv(P.rollWait, v)); }
      return;
    }
    // ---- 0xC: three rounds — warp, claws up, two kunai fly across their rows
    case 'kunai': {
      const raise = pv(P.kunaiRaise, v);
      if (e.stateT === raise) {
        setAnim(e, 'throw');
        const rowSet = P.kunaiPatterns.value[p.y];
        const pair = rowSet[Math.floor(api.rng() * 3)];
        for (const [kx, ky] of pair) s.hazards.push({ kind: 'kunai', x: kx, y: ky, fx: kx, start: s.tick, spin: P.kunaiSpin.value, speed: P.kunaiSpeed.value, damage: pv(P.kunaiDamage, v) });
      }
      if (e.stateT >= raise + 12) {
        if (++e.kunaiRound < P.kunaiRounds.value) return warpTo(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], 'kunai');
        goHome(pv(P.kunaiWait, v));
      }
      return;
    }
  }

  function decide() {
    if (m.c4 < 5) { m.c4++; m.moves = (m.moves || 0) + 1; return warpTo(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null); }
    m.c4 = 0; m.moves = 0; e.homeX = e.x; e.homeY = e.y;
    if (m.c5 < 4) {
      m.c5++;
      if (m.c6 < 2) { m.c6 += api.rng() < 0.5 ? 2 : 1; return warpTo(front(), 'combo'); }
      m.c6 = 0; return warpTo(backOfRow(), 'roll');
    }
    m.c5 = 0; e.kunaiRound = 0;
    return warpTo(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], 'kunai');
  }
  function front() {
    const t = [p.x + 1, p.y];
    return t[0] <= 5 && (!api.at(...t) || api.at(...t) === e) ? t : backOfRow();
  }
  function backOfRow() {
    for (const x of [5, 4, 3]) if (!api.at(x, p.y) || api.at(x, p.y) === e) return [x, p.y];
    return [e.x, e.y];
  }
  function warpTo(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
  function goHome(wait) {
    const free = freeEnemyPanels(e, api);
    const home = (!api.at(e.homeX, e.homeY) || api.at(e.homeX, e.homeY) === e) && e.homeX >= 3 ? [e.homeX, e.homeY] : pick(free, api) || [5, 1];
    e.homeWait = wait; e.drawX = e.x;
    warpTo(home, 'home');
  }
}

// ======================= ProtoMan =======================
// ======================= EraseMan =======================
// Decision 0x80F594C: move (9) N times, then scythe strike (0xA) 3-4 times, then eye marker + beam (0xB).
function eraseman(e, api) {
  const P = NAVI_AI.EraseMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const W = P.warpTicks.value;
  const done = wait => { go(e, 'idle', 'idle'); e.think = wait; };
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= W) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= W) {
        if (e.after) { const a = e.after; e.after = null; return go(e, a, a === 'strike' ? 'windup' : 'fire'); }
        const half = P.moveWait.value[api.rng() < 0.5 ? 'slow' : 'fast'];
        done(half[Math.min(v, half.length - 1)]);
      }
      return;
    // ---- 0xA: scythe wind-up, then a swing over the two panels ahead
    case 'strike': {
      const wind = P.strikeWindup.value, hold = P.strikeHold.value;
      if (e.stateT === wind) setAnim(e, 'strike');
      if (e.stateT === wind + hold) {
        const cells = P.strikeShape.value.map(([dx, dy]) => [e.x + dx, e.y + dy]);
        e.struck = cells.some(([x, y]) => p.x === x && p.y === y && p.state !== 'vanish');
        api.hitPlayerCells(cells, pv(P.strikeDamage, v));
        for (const [x, y] of cells) s.effects.push({ kind: 'spark', x, y, t: 0 });
        s.effects.push({ kind: 'shake', t: 0 });
      }
      if (e.stateT >= wind + hold + 4) {
        if (!e.struck) { m.c5 = 0; return burst(); } // state 4: var 0x1A clear → burst at once
        done(pv(P.strikeWait, v));
      }
      return;
    }
    // ---- 0xB: eye marker hunts MegaMan, EraseMan lines up and fires the beam
    case 'mark':
      if (s.hazards.includes(e.marker) && !e.marker.locked) return;
      return warp(frontPanel(e.marker.y), 'burstfire');
    case 'burstfire':
      if (e.stateT === P.burstCharge.value) {
        const mk = e.marker;
        s.hazards.push({ kind: 'burst', x: mk.x, y: mk.y, start: s.tick, until: s.tick + P.burstTicks.value, damage: pv(P.burstDamage, v) });
        s.hazards = s.hazards.filter(h => h !== mk);
      }
      if (e.stateT >= P.burstCharge.value + P.burstTicks.value) { e.marker = null; done(P.burstWait.value); }
      return;
  }

  function decide() {
    if (m.c4 < pv(P.moveCount, v)) { m.c4++; return warp(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null); }
    m.c4 = 0;
    m.target ??= 3 + (api.rng() < 0.5 ? 0 : 1);
    if (m.c5 < m.target) { m.c5++; return warp(strikePanel(), 'strike'); }
    m.c5 = 0; m.target = null;
    return burst();
  }
  function burst() {
    m.target = null;
    e.marker = { kind: 'mark', x: p.x, y: p.y, start: s.tick, until: s.tick + P.burstSeek.value, step: P.markerStep.value, next: s.tick + P.markerStep.value, locked: false, owner: e.id };
    s.hazards.push(e.marker);
    go(e, 'mark', 'mark');
  }
  function strikePanel() { // two panels ahead of MegaMan if that is EraseMan's side, else his row nearest the front
    const want = [p.x + 2, p.y];
    if (want[0] >= 3 && want[0] <= 5 && (!api.at(...want) || api.at(...want) === e)) return want;
    return frontPanel(p.y);
  }
  function frontPanel(y) {
    for (const x of [3, 4, 5]) if (!api.at(x, y) || api.at(x, y) === e) return [x, y];
    return [e.x, e.y];
  }
  function warp(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
}

// ======================= ChargeMan =======================
// Decision 0x80F64B0: 0xB, 0xC, 0xB, 0xC, 0xB, then 0xA, each followed by a 60-frame pause (0xD).
// Game columns 0 and 7 are off-screen; here column = game column - 1, so -1 and 6+ are off the field.
function chargeman(e, api) {
  const P = NAVI_AI.ChargeMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const W = P.warpTicks.value, vi = Math.min(v, 4);
  const pause = () => { go(e, 'idle', 'idle'); e.think = P.pause.value; };
  const row = () => Math.max(0, Math.min(2, p.y));
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= W) { place(...e.dest); go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= W) { const a = e.after; e.after = null; if (a) return a(); pause(); }
      return;
    case 'ready': // standing at the start line before a run
      if (e.stateT >= P.runWait.value) startRun();
      return;
    case 'run': {
      const r = e.run, step = r.speed / 40 * Math.sign(r.to - e.fx);
      e.fx = Math.abs(r.to - e.fx) <= Math.abs(step) ? r.to : e.fx + step;
      place(e.fx, e.y, true);
      for (const c of e.cars) c.fx = e.fx + c.off;
      if (e.x >= 0 && e.x <= 5) api.hitPlayerCells([[e.x, e.y]], r.damage);
      if (e.fx === r.to) { e.run = null; return r.then(); }
      return;
    }
    case 'whistle':
      if (e.stateT >= P.bigWhistle.value) { e.run = { to: P.bigTargets.value.back, speed: P.bigSpeeds.value.back, damage: pv(P.bigDamage, v), then: rush }; go(e, 'run', 'run'); }
      return;
  }

  function decide() {
    if (e.homeSet === undefined) { e.homeSet = [e.homeX, e.homeY]; e.cars = []; }
    if (m.c4 < 5) {
      m.c4++; const prev = m.c5; m.c5 ^= 1;
      if (prev === 0) { e.rounds = P.dashCount.value; return dash(); }
      e.rounds = P.trainRounds.value; e.pattern = 0; return train();
    }
    m.c4 = 0;
    return big();
  }
  // ---- 0xB: five runs along MegaMan's row from the right edge
  function dash() {
    warp([6, row()], () => { e.run = { to: -1, speed: pv(P.dashSpeed, v), damage: pv(P.dashDamage, v), then: () => (--e.rounds > 0 ? dash() : home()) }; go(e, 'ready', 'run'); });
  }
  // ---- 0xC: five rounds of ChargeMan plus two cars in the other rows
  function train() {
    const [[lead, gy], ...cars] = P.trainPatterns.value[e.pattern];
    warp([9 - lead, gy - 1], () => {
      clearCars();
      for (const [cl, cy] of cars) addCar(cy - 1, (9 - cl) - e.fx, 'coal', pv(P.carDamage, v));
      e.run = { to: e.fx - 9, speed: pv(P.trainSpeed, v), damage: pv(P.trainDamage, v), then: nextRound };
      go(e, 'ready', 'run');
    });
  }
  function nextRound() {
    clearCars();
    if (--e.rounds <= 0) return home();
    let n = Math.floor(api.rng() * 8); if (n === e.pattern) n = (n + 1) & 7;
    e.pattern = n; train();
  }
  // ---- 0xA: pulls three cars, runs out, whistles, backs up, then rushes
  function big() {
    warp([6, row()], () => {
      clearCars();
      ['skull', 'crate', 'red'].slice(0, P.bigCars.value).forEach((t, i) => addCar(e.y, i + 1, t, pv(P.bigDamage, v)));
      e.run = { to: P.bigTargets.value.out, speed: P.bigSpeeds.value.out[vi], damage: pv(P.bigDamage, v), then: () => go(e, 'whistle', 'whistle') };
      go(e, 'ready', 'run');
    });
  }
  function rush() {
    e.run = { to: P.bigTargets.value.rush, speed: P.bigSpeeds.value.rush[vi], damage: pv(P.bigDamage, v), then: () => { clearCars(); home(); } };
    go(e, 'run', 'rush');
  }
  function startRun() { go(e, 'run', e.anim === 'rush' ? 'rush' : 'run'); }
  function home() { clearCars(); warp(e.homeSet, null); }
  function place(x, y, keepFx) {
    if (!keepFx) e.fx = x;
    e.y = y; e.drawX = e.fx; e.drawY = y;
    e.x = Math.round(e.fx);
    e.airborne = e.x < 0 || e.x > 5; // off the field: cannot be hit
  }
  function addCar(y, off, type, damage) {
    const c = { kind: 'car', y, off, fx: e.fx + off, type, damage, owner: e.id };
    e.cars.push(c); s.hazards.push(c);
  }
  function clearCars() { s.hazards = s.hazards.filter(h => !e.cars.includes(h)); e.cars = []; }
  function warp(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
}

// ======================= SpoutMan =======================
// Decision 0x80F7690: moves and water bombs (0xA) until the counter fills, then hose (0xB) / sprinkler (0xC) in turn.
function spoutman(e, api) {
  const P = NAVI_AI.SpoutMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const [VAN, APP] = P.warpTicks.value;
  const wait = t => { go(e, 'idle', 'idle'); e.think = t; };
  const free = (x, y) => !api.at(x, y) || api.at(x, y) === e;
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= VAN) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= APP) { const a = e.after; e.after = null; if (a) return a(); wait(pv(P.moveWait, v)); }
      return;
    // ---- 0xA: aim, then lob a water bomb onto MegaMan's panel
    case 'bomb': {
      const [aim, hold] = P.bombAim.value;
      if (e.stateT === aim) setAnim(e, 'throw');
      if (e.stateT === aim + hold) {
        s.hazards.push({ kind: 'lob', x0: e.x, y: p.y, tx: p.x, start: s.tick, land: s.tick + P.bombFlight.value, damage: pv(P.bombDamage, v), owner: e.id });
      }
      if (e.stateT >= aim + hold + 8) wait(pv(P.attackWait, v));
      return;
    }
    // ---- 0xB: hose along his row, repeated from panels in the same column
    case 'hose': {
      const aim = P.hoseAim.value, spray = P.hoseSpray.value;
      if (e.stateT === 1) {
        const target = Math.min(p.x, e.x - 1);
        e.hoseCells = []; for (let x = e.x - 1; x >= target; x--) e.hoseCells.push([x, e.y]);
        e.highlight = [e.hoseCells];
      }
      if (e.stateT === aim) {
        e.highlight = null; setAnim(e, 'spray');
        s.hazards.push({ kind: 'stream', y: e.y, x0: e.x, cells: e.hoseCells, start: s.tick, until: s.tick + spray, damage: pv(P.hoseDamage, v), owner: e.id });
      }
      if (e.stateT === aim + spray) setAnim(e, 'hold');
      if (e.stateT >= aim + spray + pv(P.hoseGap, v)) {
        if (--e.rounds > 0) return warp(hoseRepeat(), () => go(e, 'hose', 'windup'));
        wait(pv(P.attackWait, v));
      }
      return;
    }
    // ---- 0xC: jump into MegaMan's area and spin the sprinkler
    case 'jump':
      e.z = Math.round(Math.sin(Math.PI * e.stateT / P.sprinklerJump.value) * 40);
      e.drawX = e.from[0] + (e.dest[0] - e.from[0]) * e.stateT / P.sprinklerJump.value;
      e.drawY = e.from[1] + (e.dest[1] - e.from[1]) * e.stateT / P.sprinklerJump.value;
      if (e.stateT === 1) e.airborne = true;
      if (e.stateT >= P.sprinklerJump.value) {
        e.z = 0; e.airborne = false; [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y;
        e.turns = pv(P.sprinklerTurns, v) * 4; go(e, 'spin', 'spin');
      }
      return;
    case 'spin': {
      const st = P.sprinklerStep.value;
      if (e.stateT % st === 1) {
        const dir = Math.floor(e.stateT / st) % 4; // horizontal, rising, vertical, falling
        const d = [[[-1, 0], [1, 0]], [[1, -1], [-1, 1]], [[0, -1], [0, 1]], [[-1, -1], [1, 1]]][dir];
        s.effects.push({ kind: 'sprinkle', x: e.x, y: e.y, dir, t: 0 });
        api.hitPlayerCells(d.map(([dx, dy]) => [e.x + dx, e.y + dy]), pv(P.sprinklerDamage, v));
      }
      if (e.stateT >= e.turns * st) warp(e.homeSet, null, pv(P.attackWait, v));
      return;
    }
  }

  function decide() {
    if (e.homeSet === undefined) e.homeSet = [e.homeX, e.homeY];
    if (m.c4 < 4) {
      if (rnd16(api) < 12) m.c4++;
      if (rnd16(api) < 8) return warp(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null);
      return bomb();
    }
    m.c4 = 0;
    if (m.c5 === 0) { m.c5 = 1; e.rounds = pv(P.hoseCount, v); return warp(hosePanel(), () => go(e, 'hose', 'windup')); }
    const jump = P.sprinklerPanels.value.find(([x, y]) => free(x, y) && !(p.x === x && p.y === y));
    if (!jump) { e.think = 1; return; } // 0x80F77E8 failed: nothing this frame
    m.c5 = 0;
    e.from = [e.x, e.y]; e.dest = jump; go(e, 'jump', 'jump');
  }
  function bomb() {
    const spots = P.bombPanels.value.map(d => [p.x + d, p.y]).filter(([x, y]) => x >= 3 && x <= 5 && free(x, y));
    if (!spots.length) return warp(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null);
    warp(pick(spots, api), () => go(e, 'bomb', 'aim'));
  }
  function hosePanel() {
    const [hx, hy] = P.hosePanel.value;
    if (free(hx, hy)) return [hx, hy];
    return hoseRepeat();
  }
  function hoseRepeat() {
    const col = P.hosePanel.value[0];
    const rows = [0, 1, 2].filter(y => y !== e.y && free(col, y));
    return rows.length ? [col, pick(rows, api)] : [e.x, e.y];
  }
  function warp(dest, after, thenWait) {
    e.dest = dest; e.after = after ?? (thenWait ? () => wait(thenWait) : null);
    go(e, 'vanish', 'vanish');
  }
}

// ======================= TomahawkMan =======================
// Decision 0x80F8448: moves (4, or 2 below half HP), then throw 0xA / swing 0xB by MegaMan's distance, every few attacks the row chop 0xC.
function tomahawkman(e, api) {
  const P = NAVI_AI.TomahawkMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const [VAN, APP] = P.warpTicks.value;
  const wait = t => { go(e, 'idle', 'rearm'); e.think = Math.max(1, t); };
  const free = (x, y) => x >= 3 && x <= 5 && y >= 0 && y <= 2 && (!api.at(x, y) || api.at(x, y) === e);
  switch (e.state) {
    case 'idle':
      if (e.anim === 'rearm' && e.animT > 12) setAnim(e, 'idle');
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= VAN) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= APP + 8) { const a = e.after; e.after = null; if (a) return a(); wait(pv(P.moveWait, v)); }
      return;
    // ---- 0xA: mark MegaMan's column, then throw the axe onto it
    case 'throw':
      if (e.stateT === 1) { e.mark = [0, 1, 2].map(y => [p.x, y]); e.highlight = [e.mark]; }
      if (e.stateT === P.throwMark.value) {
        e.highlight = null; setAnim(e, 'throw');
        s.hazards.push({ kind: 'axe', x0: e.x, y0: e.y, cells: e.mark, start: s.tick, land: s.tick + P.throwFlight.value, damage: pv(P.throwDamage, v), owner: e.id });
      }
      if (e.stateT >= P.throwMark.value + P.throwFlight.value + 6) wait(pv(P.throwWait, v));
      return;
    // ---- 0xB: wind up with the area lit, then a wide swing in front
    case 'swing': {
      const cells = P.swingShape.value.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => y >= 0 && y <= 2 && x >= 0);
      if (e.stateT === 1) e.highlight = [cells];
      if (e.stateT === P.swingWindup.value) { e.highlight = null; setAnim(e, 'swing'); }
      if (e.stateT === P.swingWindup.value + P.swingHit.value) {
        api.hitPlayerCells(cells, pv(P.swingDamage, v));
        s.effects.push({ kind: 'slash', x: e.x, y: e.y, area: 'wide', t: 0 });
      }
      if (e.stateT >= P.swingWindup.value + P.swingHit.value + 10) wait(pv(P.swingWait, v));
      return;
    }
    // ---- 0xC: raise the axe, chop, a wave runs down his row panel by panel
    case 'chop':
      if (e.stateT === P.chopRaise.value) setAnim(e, 'chop');
      if (e.stateT === P.chopRaise.value + P.chopHit.value) {
        s.effects.push({ kind: 'shake', t: 0 });
        for (let k = 1; e.x - k >= 0; k++) {
          const at = s.tick + P.chopStep.value * (k - 1);
          s.hazards.push({ kind: 'axewave', x: e.x - k, y: e.y, start: at, until: at + 8, damage: pv(P.chopDamage, v), owner: e.id });
        }
      }
      if (e.stateT >= P.chopRaise.value + P.chopHit.value + 30) wait(pv(P.chopWait, v));
      return;
  }

  function decide() {
    const limit = e.hp < e.maxHp / 2 ? P.moveCount.value.lowHp : P.moveCount.value.normal;
    if (m.c4 < limit) { m.c4++; return warp(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null); }
    m.c4 = 0;
    if (m.c5 < pv(P.attackCount, v)) {
      m.c5++;
      const dist = 3 - p.x; // 0x80F8610: MegaMan's distance from the border in his row
      if (dist < 3) {
        const spot = free(3, p.y) ? [3, p.y] : (pick([0, 1, 2].filter(y => free(3, y)).map(y => [3, y]), api) || [e.x, e.y]);
        return warp(spot, () => go(e, 'swing', 'windup'));
      }
      const row = [3, 4, 5].filter(x => free(x, p.y)).map(x => [x, p.y]);
      return warp(pick(row, api) || [e.x, e.y], () => go(e, 'throw', 'rearm'));
    }
    m.c5 = 0;
    const row = [3, 4, 5].filter(x => free(x, p.y) && !(x === e.x && p.y === e.y)).map(x => [x, p.y]);
    return warp(pick(row, api) || [e.x, e.y], () => go(e, 'chop', 'raise'));
  }
  function warp(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
}

// ======================= TenguMan =======================
// Decision 0x80F9000: moves, then nose spear 0xA / tornadoes 0xB, then the dash 0xC.
function tenguman(e, api) {
  const P = NAVI_AI.TenguMan, s = api.s, p = s.player, v = e.variant, m = e.mem;
  const [VAN, APP] = P.warpTicks.value;
  const wait = t => { go(e, 'idle', 'idle'); e.think = Math.max(1, t); };
  const free = (x, y) => x >= 3 && x <= 5 && y >= 0 && y <= 2 && (!api.at(x, y) || api.at(x, y) === e);
  const low = e.hp < e.maxHp / 2;
  switch (e.state) {
    case 'idle':
      if (--e.think > 0) return;
      return decide();
    case 'vanish':
      if (e.stateT >= VAN) { [e.x, e.y] = e.dest; e.drawX = e.x; e.drawY = e.y; go(e, 'appear', 'appear'); }
      return;
    case 'appear':
      if (e.stateT >= APP + 8) { const a = e.after; e.after = null; if (a) return a(); wait(e.moveWait); }
      return;
    // ---- 0xA: brace with 3 panels lit, then the nose shoots out over them
    case 'nose': {
      const brace = pv(P.noseBrace, v), cells = [1, 2, 3].map(k => [e.x - k, e.y]).filter(([x]) => x >= 0);
      if (e.stateT === 1) e.highlight = [cells];
      if (e.stateT === brace) { e.highlight = null; setAnim(e, 'nose'); }
      if (e.stateT === brace + P.noseHit.value) api.hitPlayerCells(cells, pv(P.noseDamage, v));
      if (e.stateT >= brace + 20) wait(pv(P.noseWait, v));
      return;
    }
    // ---- 0xB: fan wind-up, then three tornadoes in MegaMan's area
    case 'fan': {
      const wind = pv(P.tornadoWindup, v);
      if (e.stateT === wind) {
        setAnim(e, 'fan');
        for (const [gx, gy, kind] of P.tornadoPatterns.value[e.pattern]) {
          const [dx, dy] = P.tornadoDrift.value[kind];
          s.hazards.push({ kind: 'tornado', fx: gx - 1, fy: gy - 1, dx, dy, start: s.tick, until: s.tick + P.tornadoLife.value, step: P.tornadoStep.value, damage: pv(P.tornadoDamage, v), owner: e.id });
        }
      }
      if (e.stateT >= wind + 12) wait(pv(P.moveWait.value.normal, v));
      return;
    }
    // ---- 0xC: arms up, vanish, path lights up, then he flies across it
    case 'arms':
      if (e.stateT >= pv(P.dashArms, v)) { e.path = p.y; e.dest = [6, p.y]; go(e, 'dashvanish', 'vanish'); }
      return;
    case 'dashvanish':
      if (e.stateT >= VAN) {
        e.x = 6; e.y = e.path; e.fx = 6; e.drawX = 6; e.drawY = e.y; e.airborne = true;
        e.highlight = [[0, 1, 2, 3, 4, 5].map(x => [x, e.path])];
        go(e, 'dashmark', 'dash');
      }
      return;
    case 'dashmark':
      if (e.stateT >= P.dashMark.value) { e.highlight = null; go(e, 'dashfly', 'dash'); }
      return;
    case 'dashfly': {
      e.fx = 6 - 8 * e.stateT / P.dashTravel.value; e.drawX = e.fx; e.x = Math.round(e.fx);
      e.airborne = e.x < 0 || e.x > 5;
      if (e.x >= 0 && e.x <= 5) api.hitPlayerCells([[e.x, e.y]], pv(P.dashDamage, v));
      if (e.stateT >= P.dashTravel.value) {
        e.airborne = false;
        const home = free(e.homeX, e.homeY) ? [e.homeX, e.homeY] : (pick(freeEnemyPanels(e, api), api) || [5, 1]);
        [e.x, e.y] = home; e.drawX = e.x; e.drawY = e.y; e.moveWait = pv(P.moveWait.value.normal, v); go(e, 'appear', 'appear');
      }
      return;
    }
  }

  function decide() {
    if (m.c4 < (low ? P.moveCount.value.lowHp : P.moveCount.value.normal)) {
      if (rnd16(api) < 14) m.c4++;
      // 0x80F90BA: a chained move follows with a 1-frame pause
      if (m.c7 >= 1) { m.c7 = 0; e.moveWait = P.moveWait.value.chained; }
      else { if (rnd16(api) <= 8) m.c7++; e.moveWait = pv(P.moveWait.value.normal, v); }
      return warp(pick(freeEnemyPanels(e, api), api) || [e.x, e.y], null);
    }
    m.c4 = 0;
    if (m.c5 < (low ? P.attackCount.value.lowHp : P.attackCount.value.normal)) {
      m.c5++;
      if (m.c6 < 1) {
        if (rnd16(api) < 14) m.c6++;
        const front = [3, 4, 5].find(x => free(x, p.y)); // 0x80F9980: closest panel in MegaMan's row
        return warp(front !== undefined ? [front, p.y] : [e.x, e.y], () => go(e, 'nose', 'brace'));
      }
      m.c6 = 0;
      let n = Math.floor(api.rng() * 4); if (n === m.last) n = (n + 1) & 3; m.last = n;
      e.pattern = n + (v > 0 ? 4 : 0);
      const col = [0, 1, 2].filter(y => free(5, y)).map(y => [5, y]); // 0x80F9992: back column
      return warp(pick(col, api) || [e.x, e.y], () => go(e, 'fan', 'fanup'));
    }
    m.c5 = 0;
    e.homeX = e.x; e.homeY = e.y;
    go(e, 'arms', 'armsup');
  }
  function warp(dest, after) { e.dest = dest; e.after = after; go(e, 'vanish', 'vanish'); }
}

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

const BEHAVIOUR = { HeatMan: heatman, ElecMan: elecman, SlashMan: slashman, EraseMan: eraseman, ChargeMan: chargeman, SpoutMan: spoutman, TomahawkMan: tomahawkman, TenguMan: tenguman, ProtoMan: protoman };

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
