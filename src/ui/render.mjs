// Draws a battle state onto a 240×160 canvas (GBA resolution).
// With a sprite bank (decoded from the player's ROM) original frames are used;
// otherwise neutral placeholder shapes are drawn.
// Panel geometry and sprite anchors are approximations pending an on-screen trace.
import { frameAt } from '../rom/bank.mjs';
import { val } from '../../data/rules.mjs';
import { chipBehaviour, CHIP_DATA, DELETE, BANNER, emotionOf, dragonAt, cursorCells } from '../battle/engine.mjs';
import { EMOTION } from '../../data/rules.mjs';

// Deleted enemies: drawn into a scratch canvas, then pixelated (mosaic) and faded like the game.
let scratch, small;
function dissolveCtx() {
  if (!scratch) { scratch = document.createElement('canvas'); scratch.width = 128; scratch.height = 96; small = document.createElement('canvas'); small.width = 128; small.height = 96; }
  const c = scratch.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 128, 96); c.imageSmoothingEnabled = false; return c;
}
function blitDissolve(g, ax, ay, block, alpha) {
  let src = scratch;
  if (block > 1) {
    const w = Math.ceil(128 / block), h = Math.ceil(96 / block), c = small.getContext('2d');
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, 128, 96); c.drawImage(scratch, 0, 0, w, h); src = small;
    g.save(); g.globalAlpha = alpha; g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, w, h, Math.round(ax - 64), Math.round(ay - 80), w * block, h * block); g.restore();
    return;
  }
  g.save(); g.globalAlpha = alpha; g.drawImage(src, Math.round(ax - 64), Math.round(ay - 80)); g.restore();
}

export const PANEL_W = 40, PANEL_H = 24, FIELD_Y = 72;
const anchor = (x, y) => [x * PANEL_W + PANEL_W / 2, FIELD_Y + y * PANEL_H + 18];

// Panel surfaces are drawn (no ROM field tiles yet); each BN6 panel type gets its own look.
const SURFACE = { poison: '#9a48b8', holy: '#f2e2a0', grass: '#5cb24a', ice: '#cdefff', volcano: '#8a6a30' };
// ROM panel graphics (BG tiles + tilemaps + animated palettes): the type number is the game's panel type.
const TYPE_NUMBER = { none: 0, broken: 1, normal: 2, cracked: 3, poison: 4, holy: 5, grass: 6, ice: 7, volcano: 8, 'road-up': 9, 'road-down': 10, 'road-left': 11, 'road-right': 12 };
function panels(g, s, bank) {
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
    const c0 = s.panels?.[y]?.[x], red = (c0?.side ?? (x < 3 ? 'p' : 'e')) === 'p', px = x * PANEL_W, py = FIELD_Y + y * PANEL_H, c = s.panels?.[y]?.[x], type = c?.type || 'normal';
    if (bank?.field) {
      let n = TYPE_NUMBER[type] ?? 2;
      if (type === 'broken' && 600 - c.t <= 60 && ((600 - c.t) >> 2) & 1) n = 2; // blinks back in (0x800C3F2)
      g.drawImage(bank.field.panel(n, red ? 0 : 1, y + 1, s.tick), px, py);
      continue;
    }
    g.fillStyle = red ? '#c8486a' : '#4870c8'; g.fillRect(px, py, PANEL_W, PANEL_H);
    g.fillStyle = red ? '#7a1f3a' : '#1f3a7a'; g.fillRect(px, py + PANEL_H - 4, PANEL_W, 4);
    const ix = px + 3, iy = py + 3, iw = PANEL_W - 6, ih = PANEL_H - 9;
    if (type === 'broken') { // a hole; it blinks back in during its last second (0x800C3F2)
      const left = 600 - c.t, back = left <= 60 && (left >> 2) & 1;
      g.fillStyle = back ? (red ? '#f0a8b8' : '#a8c4f0') : '#0c0c18'; g.fillRect(ix, iy, iw, ih);
      if (!back) { g.fillStyle = '#26263a'; g.fillRect(ix, iy, iw, 3); }
      continue;
    }
    g.fillStyle = SURFACE[type] || (red ? '#f0a8b8' : '#a8c4f0'); g.fillRect(ix, iy, iw, ih);
    if (type === 'cracked') {
      g.strokeStyle = 'rgba(40,20,30,.8)'; g.lineWidth = 1; g.beginPath();
      g.moveTo(ix + 4, iy + 2); g.lineTo(ix + 12, iy + 7); g.lineTo(ix + 9, iy + 10); g.lineTo(ix + 20, iy + 12);
      g.moveTo(ix + 12, iy + 7); g.lineTo(ix + 22, iy + 3); g.lineTo(ix + 30, iy + 8); g.stroke();
    } else if (type === 'grass') {
      g.fillStyle = '#2f7a2a'; for (let k = 0; k < 6; k++) g.fillRect(ix + 3 + k * 5, iy + 3 + (k & 1) * 4, 1, 4);
    } else if (type === 'ice') {
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(ix + 4, iy + 2, 10, 2); g.fillRect(ix + 20, iy + 8, 8, 2);
    } else if (type === 'poison') {
      g.fillStyle = '#5e2072'; const t = (s.tick >> 3) & 3; g.fillRect(ix + 6 + t, iy + 3, 4, 3); g.fillRect(ix + 22 - t, iy + 7, 4, 3);
    } else if (type === 'holy') {
      g.fillStyle = '#fffbe0'; g.fillRect(ix + iw / 2 - 1, iy + 2, 2, 8); g.fillRect(ix + iw / 2 - 4, iy + 5, 8, 2);
    } else if (type === 'volcano') {
      g.fillStyle = (s.tick >> 3) & 1 ? '#ffb030' : '#ff8a20'; g.fillRect(ix + 5, iy + 3, 6, 3); g.fillRect(ix + 19, iy + 7, 8, 3);
    }
  }
}

// Navi sprites face right (player side); the game mirrors them for the enemy side.
function sprite(g, bank, key, anim, t, x, y, fallback, palette = 0, flip = false) {
  const seqs = bank?.get(key, palette);
  const frames = seqs?.[anim] || seqs?.idle;
  if (frames) {
    const f = frameAt(frames, t);
    if (flip) {
      g.save(); g.translate(Math.round(x), 0); g.scale(-1, 1);
      g.drawImage(f.image, -f.originX, Math.round(y - f.originY));
      g.restore();
    } else g.drawImage(f.image, Math.round(x - f.originX), Math.round(y - f.originY));
  } else fallback(g, x, y);
}

const placeholderNavi = (g, x, y) => {
  g.fillStyle = '#2a6fe0'; g.fillRect(x - 8, y - 34, 16, 30);
  g.fillStyle = '#8fd0ff'; g.fillRect(x - 5, y - 30, 10, 8);
  g.fillStyle = '#123'; g.fillRect(x - 10, y - 4, 20, 4);
};
const placeholderEnemyNavi = (g, x, y) => {
  g.fillStyle = '#c04040'; g.fillRect(x - 8, y - 36, 16, 32);
  g.fillStyle = '#ffd0d0'; g.fillRect(x - 5, y - 32, 10, 8);
};
const placeholderBeast = (g, x, y) => {
  g.fillStyle = '#2a7070'; g.fillRect(x - 40, y - 50, 80, 46);
  g.fillStyle = '#f0a030'; g.fillRect(x - 30, y - 58, 40, 12);
};
const placeholderCoil = (g, x, y) => {
  g.fillStyle = '#9aa'; g.fillRect(x - 4, y - 24, 8, 22); g.fillStyle = '#e44'; g.fillRect(x - 3, y - 27, 6, 4);
};
const placeholderVirus = (g, x, y) => {
  g.fillStyle = '#e0c020'; g.beginPath(); g.arc(x, y - 6, 10, Math.PI, 0); g.fill();
  g.fillStyle = '#333'; g.fillRect(x - 10, y - 6, 20, 6);
};

function text(g, s, x, y, color = '#fff', align = 'left') {
  g.font = '8px monospace'; g.textAlign = align;
  g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1);
  g.fillStyle = color; g.fillText(s, x, y);
}

// What MegaMan holds during an attack: t1 0x5 attachments (table 0x80B8BD4) drawn at his position,
// shifted by the arm-position table 0x80188C0 (entry → x forward, z up). Values read from the ROM.
const ARMS = {
  buster: [{ key: 'busterarm', seq: 'arm' }, { key: 'busterflash', seq: 'flash', dx: 40, dz: 26, from: 1 }],
  cannon: [{ key: 'cannonarm', seq: 'arm', dx: 16, dz: 24 }],
  vulcan: [{ key: 'vulcanarm', seq: 'arm', dx: 23, dz: 25 }],
  airshot: [{ key: 'airshotarm', seq: 'arm', dx: 18, dz: 24 }],
  throw: [{ key: 'throwball', seq: 'hand', until: 9 }],
  slash: [{ key: 'swordarm', seq: 'arm' }],
};
const CANNON_PAL = { Cannon: 0, HiCannon: 1, 'M-Cannon': 2, GigaCan1: 0, GigaCan2: 1, GigaCan3: 2, TankCan1: 0, TankCan2: 1, TankCan3: 2 }; // byte_80EBD2C
function armParts(p) {
  const list = (p.state === 'buster' || p.state === 'chip') && ARMS[p.anim];
  if (!list) return [];
  return list.filter(a => p.animT >= (a.from || 0) && p.animT < (a.until ?? 1e9))
    .map(a => ({ ...a, dx: a.dx || 0, dz: a.dz || 0, t: p.animT - (a.from || 0), pal: a.key === 'cannonarm' ? CANNON_PAL[p.chip?.name] || 0 : 0 }));
}

export function render(g, s, bank) {
  g.imageSmoothingEnabled = false;
  if (s.player.blind > 0) s = { ...s, hazards: s.hazards.filter(h => h.owner === 'player') }; // Blind: enemies' obstacles and shots are hidden too
  const shake = s.effects.find(f => f.kind === 'shake' && f.t < (f.life || 20));
  g.setTransform(1, 0, 0, 1, 0, shake ? ((shake.t >> 1) & 1 ? 2 : -2) : 0);
  const bg = g.createLinearGradient(0, 0, 0, FIELD_Y);
  bg.addColorStop(0, '#062048'); bg.addColorStop(1, '#0f4a7a');
  g.fillStyle = bg; g.fillRect(0, 0, 240, 160);
  panels(g, s, bank);

  // Virus overlays: Piranha's sonar mark, KillerEye's scan line and beam.
  for (const e of s.enemies) if (e.hp > 0) {
    if (e.flame) for (const [x, y] of e.flame) { const [ax, ay] = anchor(x, y), k = (s.tick >> 2) & 1; g.fillStyle = k ? '#ff7a20' : '#ffc040'; g.beginPath(); g.moveTo(ax - 14, ay); g.lineTo(ax, ay - 30 - 4 * k); g.lineTo(ax + 14, ay); g.fill(); }
    if (e.mark) { const [ax, ay] = anchor(e.mark.fx, e.y); sprite(g, bank, 'piranha', 'mark', s.tick, ax, ay, (g, x, y) => { g.strokeStyle = '#fff'; g.strokeRect(x - 6, y - 12, 12, 8); }, 0, true); }
    if (e.scan) for (const [x, y] of e.scan) { g.fillStyle = 'rgba(255,80,80,.25)'; g.fillRect(x * PANEL_W + 3, FIELD_Y + y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9); }
    if (e.beam && e.beam.length) {
      const [x0, y0] = anchor(e.x - 0.5, e.y), [x1, y1] = anchor(e.beam[e.beam.length - 1][0] - 0.5, e.beam[e.beam.length - 1][1]);
      g.strokeStyle = (s.tick >> 1) & 1 ? '#ff5050' : '#ffd0d0'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y0 - 18); g.lineTo(x1, y1 - 18); g.stroke();
    }
  }

  // ElecMan panel storm: chosen panels flash (the game uses object_highlightPanel, a panel colour flash).
  for (const e of s.enemies) if (e.hp > 0 && e.highlight) {
    const on = (s.tick >> 2) & 1;
    e.highlight.forEach((group, gi) => {
      for (const [x, y] of group) {
        g.fillStyle = gi === 0 ? (on ? 'rgba(255,240,80,.85)' : 'rgba(255,255,255,.55)') : 'rgba(255,230,90,.45)';
        g.fillRect(x * PANEL_W + 3, FIELD_Y + y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9);
      }
    });
  }

  // HeatMan fire: floor pillars and the wall nozzle
  const pil = bank?.get('firepillar'), noz = bank?.get('nozzle');
  for (const h of s.hazards) {
    if (h.kind === 'pillar') {
      const t = s.tick - h.start, [ax, ay] = anchor(h.x, h.y);
      const phase = t < h.rise ? 'rise' : t < h.rise + h.burn ? 'burn' : 'fall';
      const pt = phase === 'rise' ? t : phase === 'burn' ? t - h.rise : t - h.rise - h.burn;
      if (pil) { const f = frameAt(pil[phase], pt); g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - f.originY)); }
      else { g.fillStyle = phase === 'burn' ? '#ff8020' : '#ffc040'; g.beginPath(); g.ellipse(ax, ay - 10, 8, phase === 'burn' ? 14 : 6, 0, 0, 7); g.fill(); }
    }
    if (h.kind === 'nozzle') {
      const [ax, ay] = anchor(0, h.y), t = s.tick - h.start;
      if (noz) { // sprite fires to the left; mirror so the plate sits on the left edge and flame runs right
        const f = frameAt(noz.burn, t);
        g.save(); g.translate(4, 0); g.scale(-1, 1);
        g.drawImage(f.image, -f.originX, Math.round(ay - 12 - f.originY)); g.restore();
      } else { g.fillStyle = '#ff9030'; g.fillRect(0, ay - 20, PANEL_W * h.cells.length, 12); }
    }
  }

  // EraseMan: eye marker and beam
  const mark = bank?.get('erasemark'), fire = bank?.get('erasebeam');
  for (const h of s.hazards) {
    if (h.kind === 'mark') {
      const [ax, ay] = anchor(h.x, h.y), t = s.tick - h.start;
      if (mark) { const f = frameAt(mark[h.locked ? 'lock' : 'seek'], t); g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - 10 - f.originY)); }
      else { g.strokeStyle = '#ff40c0'; g.lineWidth = 2; g.strokeRect(ax - 10, ay - 18, 20, 14); }
    }
    if (h.kind === 'burst') {
      const [ax, ay] = anchor(h.x, h.y), t = s.tick - h.start;
      if (fire) { const f = frameAt(fire.straight, t); g.save(); g.translate(Math.round(ax), 0); g.scale(-1, 1); g.drawImage(f.image, -f.originX, Math.round(ay - 12 - f.originY)); g.restore(); }
      else { g.fillStyle = t & 2 ? '#ffe060' : '#ff8020'; g.beginPath(); g.arc(ax, ay - 12, 12, 0, 7); g.fill(); }
    }
  }

  // ChargeMan's train cars (drawn facing left like ChargeMan)
  const car = bank?.get('traincar');
  for (const h of s.hazards) if (h.kind === 'sunbeam' && s.tick >= h.start) { // GunDelSol sun (sprite 0x0C/0x3C)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'gundelfx', 'sun', s.tick - h.start, ax, ay, (g, x, y) => { g.fillStyle = 'rgba(255,230,90,.6)'; g.fillRect(x - 18, y - 120, 36, 120); }, h.pal, false);
  }
  for (const h of s.hazards) if (h.kind === 'dollthunder' && s.tick >= h.start) { // DollThunder (sprite 0x10/0x12)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'dollfx', 'zap', s.tick - h.start, ax + 96, ay + 4, (g, x, y) => { g.strokeStyle = '#fff070'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 90, y - 24); for (let i = 1; i < 12; i++) g.lineTo(x - 90 + i * 16, y - 24 + (i % 2 ? -6 : 6)); g.stroke(); }, 0, false); // 184 px wide, centred: MegaMan's arm to the row's end
  }
  for (const h of s.hazards) if (h.kind === 'hockey') { // AirHockey puck (sprite 0x10/0x06), sliding between panels
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'puckfx', 'puck', h.t, ax, ay, (g, x, y) => { g.fillStyle = '#303848'; g.beginPath(); g.ellipse(x, y - 4, 12, 6, 0, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'bees') { // RiskyHoney swarm (sprite 0x10/0x31)
    const [ax, ay] = anchor(h.fx, h.fy);
    sprite(g, bank, 'beesfx', 'swarm', h.t, ax, ay, (g, x, y) => { g.fillStyle = '#f0c020'; for (let i = 0; i < 5; i++) g.fillRect(x - 10 + (i * 7) % 20, y - 6 + (i * 5) % 12, 4, 3); }, h.pal, false);
  }
  for (const h of s.hazards) if (h.kind === 'log' && s.tick >= h.start) { // RollingLog (sprite 0x10/0x34), between its two rows
    const k = Math.min(1, (s.tick - h.start) / Math.max(1, h.land - h.start)), [ax, ay] = anchor(h.fx, h.rows[1]);
    sprite(g, bank, 'logfx', 'roll', s.tick - h.start, ax, ay - 40 * (1 - k) * (1 - k) * 2, (g, x, y) => { g.fillStyle = '#8a5a2a'; g.fillRect(x - 10, y - 40, 20, 40); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'airspin') { // AirSpin top (sprite 0x0C/0x41)
    const [ax, ay] = anchor(h.fx, h.y);
    sprite(g, bank, 'airspinfx', h.phase === 'glide' ? 'glide' : 'spin', h.t, ax, ay, (g, x, y) => { g.fillStyle = '#a0d0f0'; g.beginPath(); g.ellipse(x, y - 10, 14, 8, 0, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'yoyo' && h.x !== undefined) { // YoYo (sprite 0x0C/0x0B)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'yoyofx', 'spin', h.t, ax, ay - 16, (g, x, y) => { g.fillStyle = '#c0c8d8'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'thunder') { // Thunder ball (sprite 0x10/0x16)
    const [ax, ay] = anchor(h.fx, h.fy);
    sprite(g, bank, 'thunderfx', 'ball', h.t, ax, ay - 12, (g, x, y) => { g.fillStyle = '#ffe060'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'raidbomb' && !((h.hit - s.tick) & 4)) { // AirRaid's bomb: its panel flashes (object_highlightPanel)
    g.fillStyle = 'rgba(255,240,80,.85)'; g.fillRect(h.x * PANEL_W + 3, FIELD_Y + h.y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9);
  }
  for (const f of s.effects) if (f.kind === 'raidblast') { const [ax, ay] = anchor(f.x, f.y); sprite(g, bank, 'bombblast', 'burst', f.t, ax, ay, (g, x, y) => { g.fillStyle = `rgba(255,160,60,${1 - f.t / 24})`; g.beginPath(); g.arc(x, y - 10, 14, 0, 7); g.fill(); }, 0, false); }
  for (const e of s.enemies) if (e.sensor && e.dot && e.hp > 0) { const [ax, ay] = anchor(e.dot.x, e.dot.y); sprite(g, bank, 'sensordot', 'dot', s.tick, ax, ay, (g, x, y) => { g.fillStyle = '#ff4040'; g.fillRect(x - 2, y - 4, 4, 4); }, 0, false); } // Sensor's dot (sprite 0x10/0x50)
  for (const h of s.hazards) if (h.kind === 'sensorlaser') for (const [x, y] of h.cells) { // Sensor's laser (sprite 0x10/0x51)
    const [ax, ay] = anchor(x, y);
    sprite(g, bank, 'sensorlaser', 's' + [1, 0, 2][h.aim], s.tick - h.start, ax, ay - [0x10, 0x16, 0x14][h.aim], /* dword_80D9408 / byte_80D9410 */ (g, x, y) => { g.fillStyle = 'rgba(255,80,80,.8)'; g.fillRect(x - 20, y - 2, 40, 4); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'snowball') { const [ax, ay] = anchor(h.fx / 40, h.y); sprite(g, bank, 'snowballfx', h.size ? 's1' : 's0', s.tick, ax, ay - 8, (g, x, y) => { g.fillStyle = '#e8f4ff'; g.beginPath(); g.arc(x, y - 8, 8 + 3 * Math.min(h.size, 2), 0, 7); g.fill(); }, 0, false); } // BlzrdBal (sprite 0x10/0x47)
  for (const h of s.hazards) if (h.kind === 'sandworm') { const k = s.tick - h.start + 1; for (const hx of k < 20 ? [h.bx] : []) { const [bx, by] = anchor(hx, h.y); sprite(g, bank, 'snakearm', 'hole', s.tick, bx, by, () => {}, h.pal, true); } if (k > 0x10) { const [bx, by] = anchor(h.bx - 1, h.y); sprite(g, bank, 'snakearm', 'hole', s.tick, bx, by, () => {}, h.pal, true); continue; } const [ax, ay] = anchor(h.fx, h.y); sprite(g, bank, 'snakearm', 'leap' + Math.min(4, 1 + (k >> 2)), k, ax, ay - Math.sin(Math.PI * k / 0x10) * 0x16, (g, x, y) => { g.fillStyle = '#c0a060'; g.fillRect(x - 8, y - 16, 16, 16); }, h.pal, true); } // SandWrm: SnakeArm sprite, holes 20 frames
  for (const h of s.hazards) if (h.kind === 'golemhand') { const k = h.land - s.tick; if (k < 0 && (s.tick - h.land) & 4) continue; const d = Math.max(0, k) * 16; const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'golemhandfx', 'fall', s.tick - h.start, ax - d, ay - d, (g, x, y) => { g.fillStyle = '#a08060'; g.fillRect(x - 12, y - 24, 24, 24); }, 0, false); } // GolmHit: 0x100 px up and behind, 16 px a frame
  for (const h of s.hazards) if (h.kind === 'lance') { const k = s.tick - h.start; if (k >= 8 && k + 1 < h.until - h.start && (h.until - s.tick) & 4) continue; const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'lancefx', 'thrust', k, ax + 0x40 - 8 * Math.min(k + 1, 8), ay, (g, x, y) => { g.fillStyle = '#60c040'; g.fillRect(x - 20, y - 14, 30, 4); }, 0, true); } // Lance (sprite 0x0C/0x44): 0x40 px back, 8 px a frame, flickers at the end
  for (const h of s.hazards) if (h.kind === 'firefist') { if (s.tick < h.hit) { if ((h.hit - s.tick) & 4) { g.fillStyle = 'rgba(255,240,80,.6)'; g.fillRect(h.x * PANEL_W + 3, FIELD_Y + h.y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9); } continue; } const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'firehitfx', 'hit', s.tick - h.hit, ax, ay, (g, x, y) => { g.fillStyle = '#ff7030'; g.fillRect(x - 8, y - 20, 16, 16); }, 0, false); } // FireHit: panel flashes (timer bit 2), then the fist (sprite 0x14/0x1A)
  for (const h of s.hazards) if (h.kind === 'boomer') { const [ax, ay] = anchor(h.fx, h.fy); sprite(g, bank, 'boomerfx', 'fly', s.tick, ax, ay - 10, (g, x, y) => { g.fillStyle = '#80d040'; g.beginPath(); g.arc(x, y - 6, 7, 0, 7); g.fill(); }, 0, false); } // Boomer (sprite 0x10/0x07)
  for (const h of s.hazards) if (h.kind === 'numball') { // NumbrBl's ball (sprite 0x10/0x46)
    const [ax, ay] = anchor(h.fx / 40, h.y);
    sprite(g, bank, 'numballfx', h.t <= 0xE ? 'appear' : 'roll', h.t, ax, ay - 8, (g, x, y) => { g.fillStyle = '#f0f0f0'; g.beginPath(); g.arc(x, y - 6, 7, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'windgust') { // Wind / Fan gust (sprite 0x0C/0x2E, palette 0 / 2)
    const [ax, ay] = anchor(h.fx, h.y);
    sprite(g, bank, 'windgustfx', 'gust', s.tick, ax, ay - 12, (g, x, y) => { g.strokeStyle = 'rgba(220,240,255,.8)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 10, y - 6 * i); g.lineTo(x + 10, y - 6 * i); g.stroke(); } }, h.dir > 0 ? 0 : 2, h.dir < 0);
  }
  for (const h of s.hazards) if (h.kind === 'widewave' && s.tick >= h.start) { // WideShot wave (sprite 0x10/0x37): forming, then travelling; AntiSwrd's wave (0x0C/0x14)
    const [ax, ay] = anchor(h.fx, h.y), t = s.tick - h.start;
    if (h.sprite) { sprite(g, bank, h.sprite, 'wave', t, ax, ay - 16, (g, x, y) => { g.strokeStyle = '#e0f0ff'; g.lineWidth = 3; g.beginPath(); g.arc(x - 10, y, 30, -1, 1); g.stroke(); }, 0, false); continue; }
    sprite(g, bank, 'widefx', t < 9 ? 'form' : 'wave', t < 9 ? t : t - 9, ax, ay - 16, (g, x, y) => { g.fillStyle = 'rgba(120,190,255,.8)'; g.beginPath(); g.ellipse(x, y, 8, 40, 0, 0, 7); g.fill(); }, 0, false);
  }
  for (const h of s.hazards) if (h.kind === 'pulse') { // ElecPulse (sprite 0x10/0x40)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'pulsefx', 'pulse', s.tick - h.start, ax, ay - 16, (g, x, y) => { g.strokeStyle = '#e080ff'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 8, 14, 0, 0, 7); g.stroke(); }, h.pal, true);
  }
  for (const h of s.hazards) if (h.kind === 'shell' && (s.tick >= h.start || h.showWait)) { // IronShl: the Armadillo ball (t3 0x34); AuraHed: Heady's head (t3 0x92)
    const [ax, ay] = anchor(h.fx, h.y);
    sprite(g, bank, h.sprite || 'armadillo', h.seq || 'shell', Math.max(0, s.tick - h.start), ax, ay - (h.lift || 0), (g, x, y) => { g.fillStyle = '#b89030'; g.beginPath(); g.arc(x, y - 12, 12, 0, 7); g.fill(); }, h.pal, h.flip ?? true);
  }
  for (const h of s.hazards) if (h.kind === 'flame') { // burner flame (t3 0x4, sprite 0x0C/0x0E)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'burnerfx', 'flame', s.tick - h.born, ax, ay - 12, (g, x, y) => { g.fillStyle = 'rgba(255,140,40,.8)'; g.beginPath(); g.ellipse(x, y, 14, 9, 0, 0, 7); g.fill(); });
  }
  for (const h of s.hazards) if (h.kind === 'car') {
    const [ax, ay] = anchor(h.fx, h.y);
    if (car) { const f = frameAt(car[h.type] || car.coal, s.tick); g.save(); g.translate(Math.round(ax), 0); g.scale(-1, 1); g.drawImage(f.image, -f.originX, Math.round(ay - f.originY)); g.restore(); }
    else { g.fillStyle = '#556'; g.fillRect(ax - 16, ay - 20, 32, 16); g.fillStyle = '#a22'; g.fillRect(ax - 12, ay - 4, 24, 4); }
  }

  // SpoutMan: water bomb, hose stream, sprinkler, splashes
  const bub = bank?.get('bubblebomb'), hose = bank?.get('hosestream'), spr = bank?.get('sprinkler');
  for (const h of s.hazards) {
    if (h.kind === 'lob') {
      const k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
      const [x0, y0] = anchor(h.x0, h.y), [x1] = anchor(h.tx, h.y);
      const x = x0 + (x1 - x0) * k, y = y0 - 20 - Math.sin(Math.PI * k) * 40;
      if (bub) { const f = frameAt(bub.fly, s.tick); g.drawImage(f.image, Math.round(x - f.originX), Math.round(y - f.originY)); }
      else { g.fillStyle = '#9cf'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
    }
    if (h.kind === 'stream') {
      const t = s.tick - h.start;
      for (const [cx, cy] of h.cells) {
        const [ax, ay] = anchor(cx, cy);
        if (hose) { const f = frameAt(hose.stream, t); g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - 16 - f.originY)); }
        else { g.fillStyle = 'rgba(120,200,255,.85)'; g.fillRect(ax - PANEL_W / 2, ay - 22, PANEL_W, 10); }
      }
    }
  }
  for (const f of s.effects) {
    if (f.kind === 'splash' && f.t < 12) {
      const [ax, ay] = anchor(f.x, f.y);
      if (bub) { const fr = frameAt(bub.splash, f.t); g.drawImage(fr.image, Math.round(ax - fr.originX), Math.round(ay - 8 - fr.originY)); }
      else { g.strokeStyle = '#bdf'; g.lineWidth = 2; g.beginPath(); g.arc(ax, ay - 8, 4 + f.t, 0, 7); g.stroke(); }
    }
    if (f.kind === 'sprinkle' && f.t < 10) {
      const [ax, ay] = anchor(f.x, f.y);
      const key = ['horizontal', 'rising', 'vertical', 'falling'][f.dir];
      if (spr) { const fr = frameAt(spr[key], f.t); g.drawImage(fr.image, Math.round(ax - fr.originX), Math.round(ay - 16 - fr.originY)); }
      else { g.strokeStyle = '#8df'; g.lineWidth = 3; const d = [[1, 0], [1, -1], [0, 1], [1, 1]][f.dir]; g.beginPath(); g.moveTo(ax - d[0] * PANEL_W, ay - 16 - d[1] * 24); g.lineTo(ax + d[0] * PANEL_W, ay - 16 + d[1] * 24); g.stroke(); }
    }
  }

  // TomahawkMan: thrown axe and slash wave
  const axe = bank?.get('tomahawk'), awave = bank?.get('axewave');
  for (const h of s.hazards) {
    if (h.kind === 'axe') {
      const k = Math.min(1, (s.tick - h.start) / (h.land - h.start)), tgt = h.cells[1] || h.cells[0];
      const [x0, y0] = anchor(h.x0, h.y0), [x1, y1] = anchor(tgt[0], tgt[1]);
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - 20 - Math.sin(Math.PI * k) * 36;
      if (axe) { const f = frameAt(axe.spin, s.tick); g.drawImage(f.image, Math.round(x - f.originX), Math.round(y - f.originY)); }
      else { g.fillStyle = '#ccd'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    }
    if (h.kind === 'axewave' && s.tick >= h.start) {
      const [ax, ay] = anchor(h.x, h.y), t = s.tick - h.start;
      if (awave) { const f = frameAt(awave.wave, t); g.save(); g.translate(Math.round(ax), 0); g.scale(-1, 1); g.drawImage(f.image, -f.originX, Math.round(ay - 14 - f.originY)); g.restore(); }
      else { g.strokeStyle = '#9df'; g.lineWidth = 3; g.beginPath(); g.arc(ax + 6, ay - 14, 12, 2, 4.3); g.stroke(); }
    }
  }

  for (const h of s.hazards) if (h.kind === 'chiptwister') { // Tornado / Static chips (sprite 0x0C/0x17)
    const [ax, ay] = anchor(h.x, h.y);
    sprite(g, bank, 'twisterfx', 'spin', s.tick - h.start, ax, ay, (g, x, y) => { g.strokeStyle = '#cfe'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x, y - 6 - i * 8, 4 + i * 3, 3, 0, 0, 7); g.stroke(); } }, h.pal, false);
  }
  // TenguMan tornadoes
  const torn = bank?.get('tornado');
  for (const h of s.hazards) if ((h.kind === 'tornado' || h.kind === 'twister') && h.x !== undefined) {
    const [ax, ay] = h.kind === 'twister' ? anchor(h.fx, h.fy) : anchor(h.x, h.y);
    if (h.kind === 'twister' && (h.fy < -0.5 || h.fy > 2.5)) continue;
    if (torn) { const f = frameAt(torn.spin, s.tick - h.start); g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - f.originY)); }
    else { g.strokeStyle = '#aff'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(ax, ay - 6 - i * 8, 4 + i * 3, 3, 0, 0, 7); g.stroke(); } }
  }

  // GroundMan: drill clones and falling rocks
  const rock = bank?.get('rock');
  for (const h of s.hazards) {
    if (h.kind === 'missile') {
      const [ax, ay] = anchor(h.fx, h.y);
      sprite(g, bank, 'groundman', h.flying ? 'clonefly' : 'clone', s.tick - h.start, ax, ay, '#f90', 0, true);
    }
    if (h.kind === 'rock') {
      const [ax, ay] = anchor(h.x, h.y), k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(ax, ay - 2, 6 + 6 * k, 3, 0, 0, 7); g.fill();
      const y = ay - 8 - (1 - k) * 120;
      if (rock) { const f = frameAt(rock.fall, s.tick - h.start); g.drawImage(f.image, Math.round(ax - f.originX), Math.round(y - f.originY)); }
      else { g.fillStyle = '#987'; g.beginPath(); g.arc(ax, y, 8, 0, 7); g.fill(); }
    }
  }
  for (const f of s.effects) if (f.kind === 'rockbreak' && f.t < 10) {
    const [ax, ay] = anchor(f.x, f.y);
    if (rock) { const fr = frameAt(rock.break, f.t); g.drawImage(fr.image, Math.round(ax - fr.originX), Math.round(ay - 8 - fr.originY)); }
    else { g.fillStyle = '#a98'; for (let i = 0; i < 4; i++) g.fillRect(ax - 10 + i * 6, ay - 10 - f.t, 4, 4); }
  }

  // DustMan: junk cube, scrap shots, suction lines
  const scrap = bank?.get('scrapshot');
  for (const h of s.hazards) {
    if (h.kind === 'junk') {
      const k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
      const [x0, y0] = anchor(h.x0, h.y0), [x1, y1] = anchor(h.x, h.y);
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * 50;
      sprite(g, bank, 'dustman', 'junk', 0, x, y, '#a85', 0, true); // frame 0 is the cube; the next frame is blank
    }
    if (h.kind === 'scrap') {
      const [ax, ay] = anchor(h.fx, h.y);
      if (scrap) { const f = frameAt(scrap.fly, s.tick - h.start); g.save(); g.translate(Math.round(ax), 0); g.scale(-1, 1); g.drawImage(f.image, -f.originX, Math.round(ay - 16 - f.originY)); g.restore(); }
      else { g.fillStyle = '#c66'; g.fillRect(ax - 6, ay - 18, 12, 5); }
    }
  }
  for (const f of s.effects) if (f.kind === 'suction' && f.t < 2) {
    const [ax, ay] = anchor(f.x, f.y);
    g.strokeStyle = 'rgba(220,220,200,.5)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const off = ((s.tick * 3 + i * 25) % 70); g.beginPath(); g.moveTo(ax - 90 + off, ay - 24 + i * 8); g.lineTo(ax - 70 + off, ay - 24 + i * 8); g.stroke(); }
  }

  // BlastMan: blasts and fireballs (sequences of his own sprite)
  for (const h of s.hazards) {
    if (h.kind === 'blast') { const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'blastman', 'bigring', s.tick - h.start, ax, ay, '#f60', 0, true); }
    if (h.kind === 'fireball' && h.x !== undefined) {
      const t = Math.min(1, ((s.tick - h.start) % h.step) / h.step);
      const [ax, ay] = anchor(h.x + h.dx * t, h.cy + h.dy * t);
      sprite(g, bank, h.sprite || 'blastman', h.seq, s.tick - h.start, ax, ay, '#f60', 0, h.dx < 0);
    }
  }

  // DiveMan: torpedoes (sequence of his own sprite)
  for (const h of s.hazards) if (h.kind === 'torpedo') {
    const k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
    const [x0, y0] = anchor(h.x0, h.y0), [x1, y1] = anchor(h.x, h.y);
    sprite(g, bank, 'diveman', 'torpedo', s.tick - h.start, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - 12, '#9cf', 0, true);
  }

  // CircusMan: giant hands, hoop and lions (sequences of his own sprite)
  for (const h of s.hazards) {
    if (h.kind === 'clap' && s.tick <= h.hit + 6) {
      const [ax, ay] = anchor(h.cells[1][0], h.cells[1][1]), k = Math.min(1, (s.tick - h.start) / (h.hit - h.start));
      // the two hand sequences sit above and below the column; they close in on its middle
      sprite(g, bank, 'circusman', 'handl', 0, ax, ay + 30 * (1 - k), '#fff', 0, true);
      sprite(g, bank, 'circusman', 'handr', 0, ax, ay - 30 * (1 - k), '#fff', 0, true);
    }
    if (h.kind === 'hoop') { const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'circusman', 'hoop', s.tick - h.start, ax, ay, '#f84', 0, true); }
    if (h.kind === 'bee' && h.look === 'fist') { const [ax, ay] = anchor(h.fx, h.fy); sprite(g, bank, 'snakearm', 'fist', s.tick, ax, ay, (g, x, y) => { g.fillStyle = '#e0b040'; g.beginPath(); g.arc(x, y - 12, 7, 0, 7); g.fill(); }, 0, true); }
    else if (h.kind === 'bee') { const [ax, ay] = anchor(h.fx, h.fy); g.fillStyle = '#ffd030'; g.beginPath(); g.ellipse(ax, ay - 22, 5, 4, 0, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillRect(ax - 1, ay - 26, 2, 8); }
    if (h.kind === 'bolt') { const [ax, ay] = anchor(h.fx, h.y), own = bank?.get(h.sprite)?.[h.seq]; sprite(g, own ? bank : null, h.sprite, h.seq, s.tick, ax, ay, h.seq === 'bubble' ? (g, x, y) => { g.strokeStyle = '#bff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 14, 7, 0, 7); g.stroke(); } : (g, x, y) => { g.fillStyle = '#cde'; g.fillRect(x - 8, y - 12, 16, 6); }, 0, true); }
    if (h.kind === 'portal' && s.tick >= h.start) {
      const [ax, ay] = anchor(h.x, h.y), lunge = s.tick >= h.hit;
      if (s.tick < h.hit) { g.fillStyle = 'rgba(176,96,255,.35)'; g.fillRect(ax - PANEL_W / 2 + 2, ay - 14, PANEL_W - 4, 16); }
      sprite(g, bank, 'eraseportal', lunge ? 'lunge' : 'open', lunge ? s.tick - h.hit : s.tick - h.start, ax, ay, (g, x, y) => { g.fillStyle = '#7a3cc0'; g.beginPath(); g.ellipse(x, y - 14, 10, 14, 0, 0, 7); g.fill(); }, 0, true);
    }
    if (h.kind === 'mine') {
      const [ax, ay] = anchor(h.x, h.y), flying = s.tick >= h.launch;
      sprite(g, bank, 'diveman', flying ? 'torpedo' : 'mine', s.tick - (flying ? h.launch : h.start), ax, ay, (g, x, y) => { g.fillStyle = '#4060a0'; g.beginPath(); g.arc(x, y - 8, 7, 0, 7); g.fill(); }, 0, true);
    }
    if (h.kind === 'shock' && h.x !== undefined && h.style === 'wind') {
      const [ax, ay] = anchor(h.x, h.y);
      g.strokeStyle = '#d0f0ff'; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(ax, ay - 6 - i * 7, 6 + i * 3, 3, 0, 0, 7); g.stroke(); }
    } else if (h.kind === 'shock' && h.x !== undefined) {
      const [ax, ay] = anchor(h.x, h.y);
      g.fillStyle = '#c8a060'; g.beginPath(); g.moveTo(ax - 14, ay); g.lineTo(ax - 6, ay - 14); g.lineTo(ax, ay - 6); g.lineTo(ax + 6, ay - 16); g.lineTo(ax + 14, ay); g.fill();
    }
    if (h.kind === 'lion' && h.x !== undefined) {
      const f = ((s.tick - h.start) % h.step) / h.step, [ax, ay] = anchor(h.x - f, h.y);
      sprite(g, bank, 'circusman', 'lion', s.tick - h.start, ax, ay, '#da4', 0, true);
    }
  }

  // JudgeMan: whip lash and the book press
  for (const f of s.effects) {
    if (f.kind === 'lash' && f.t < 12) { const [ax, ay] = anchor(f.x - 2, f.y); sprite(g, bank, 'judgeman', 'lash', f.t, ax, ay - 14, '#ff0', 0, true); }
    if (f.kind === 'press' && f.t < 14) for (const y of [0, 2]) { const [ax, ay] = anchor(f.x, y); sprite(g, bank, 'judgeman', f.t < 6 ? 'press' : 'pressshut', f.t, ax, ay + (y === 0 ? 1 : -1) * f.t * 2, '#88f', 0, true); }
  }

  // ElementMan strikes: lit panel, then an element-coloured burst (tower sprite for the basic one)
  for (const h of s.hazards) if (h.kind === 'estrike') {
    const [ax, ay] = anchor(h.x, h.y);
    if (s.tick < h.hit) {
      g.fillStyle = 'rgba(255,240,120,.45)'; g.fillRect(ax - PANEL_W / 2 + 2, ay - 14, PANEL_W - 4, 16);
      if (h.look === 'meteor' && bank?.has('elmeteor')) { const k = (h.hit - s.tick) / Math.max(1, h.hit - (h.start ?? h.hit - 17)); sprite(g, bank, 'elmeteor', 'fall', 0, ax + 30 * k, ay - 4 - 90 * k, () => {}, 1, false); }
      continue;
    }
    const t = s.tick - h.hit;
    if (h.elem === 'none') { sprite(g, bank, 'elementman', 'tower', t, ax, ay, '#a7d', 0, false); continue; }
    if (h.look === 'tower') { sprite(g, bank, 'elementman', 'tower', t, ax, ay, () => {}, 2, true); if (bank?.has('elementman')) continue; }
    if (h.look === 'meteor' && bank?.has('elmeteor')) { sprite(g, bank, 'elmeteor', 'fall', t, ax, ay - 4, () => {}, 1, false); continue; }
    if (h.look === 'hat') { sprite(g, bank, 'bighat', 'hat', t, ax, ay - 4, () => { g.fillStyle = '#7040a0'; g.fillRect(ax - 8, ay - 14, 16, 8); }, 0, true); continue; }
    if (h.look === 'sparkle' && bank?.has('elsparkle')) { sprite(g, bank, 'elsparkle', 'burst', t, ax, ay - 8, () => {}, 0, false); continue; }
    const col = { fire: '#ff7030', aqua: '#80d8ff', elec: '#fff060', wood: '#70e060', dark: '#b060ff', beast: '#ff9a30', feather: '#ff5060' }[h.elem];
    g.fillStyle = col; g.globalAlpha = 1 - t / 12;
    if (h.elem === 'elec') g.fillRect(ax - PANEL_W / 2, ay - 18, PANEL_W, 6);
    else { g.beginPath(); g.moveTo(ax - 10, ay); g.lineTo(ax, ay - 26 - t); g.lineTo(ax + 10, ay); g.fill(); }
    g.globalAlpha = 1;
  }

  // Colonel's missiles
  for (const h of s.hazards) if (h.kind === 'cmissile') {
    const [ax, ay] = anchor(h.x, h.y), k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(ax, ay - 2, 4 + 6 * k, 3, 0, 0, 7); g.fill();
    sprite(g, bank, 'colonel', 'missile', 0, ax, ay - (1 - k) * 110, '#f84', 0, false);
  }

  // Hazards under actors.
  const wave = bank?.get('shockwave');
  for (const h of s.hazards) {
    if (h.kind === 'wave' && h.big) { const [ax, ay] = anchor(h.x, h.y); sprite(g, bank, 'diveman', 'wave', s.tick - h.start, ax, ay, '#46c', 0, true); continue; }
    if (h.kind === 'wave') {
      const [ax, ay] = anchor(h.x, h.y);
      if (wave) {
        const speed = h.anim || (h.step >= 20 ? 'slow' : h.step >= 10 ? 'medium' : 'fast'); // type3 0x16 animation 0 / 1 / 2 (22 / 16-11 / 6 frames per panel)
        sprite(g, bank, 'shockwave', speed, s.tick - h.start, ax, ay, () => {}, 0, !h.fromPlayer); // travels toward MegaMan
        continue;
      }
      g.fillStyle = '#d8f4ff';
      g.beginPath(); g.moveTo(ax - 12, ay); g.lineTo(ax - 2, ay - 16); g.lineTo(ax + 4, ay); g.fill();
      g.beginPath(); g.moveTo(ax + 2, ay); g.lineTo(ax + 9, ay - 10); g.lineTo(ax + 12, ay); g.fill();
    }
  }
  const draw = [];
  const p = s.player;
  if (p.hp > 0 && !((p.invuln > 0 || p.invis > 0) && p.state !== 'flinch' && (s.tick >> 1) & 1)) { // invisible (colour bug) flashes like invincibility
    const [ax, ay] = anchor(p.drawX ?? p.x, p.drawY ?? p.y);
    draw.push({ y: p.y, fn: () => {
      // Vulcan: raise (animation 0xA), then animation 0xD again for every shot (0x80EBF6E)
      const gap = p.anim === 'vulcan' && p.chip ? chipBehaviour(p.chip.name)?.gap : 0;
      const [an, at] = gap && p.animT >= 2 ? ['vulcanfire', (p.animT - 2) % gap] : [p.anim, p.animT];
      sprite(g, bank, 'megaman', an, at, ax, ay, placeholderNavi);
      for (const a of armParts(p)) sprite(g, bank, a.key, a.seq, a.t, ax + a.dx, ay - a.dz, () => {}, a.pal || 0);
      const mood = emotionOf(s); // Angry: red tint (colour shader 0xF, sub_80143E4); Full Synchro: flashing (sub_8016CA4); app-drawn tints
      if (mood === 'angry' || (mood === 'synchro' && (s.tick >> 2) & 1)) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = mood === 'angry' ? 0.35 : 0.45;
        const c = document.createElement('canvas'); c.width = c.height = 96; const cg = c.getContext('2d');
        sprite(cg, bank, 'megaman', an, at, 48, 80, () => {}); cg.globalCompositeOperation = 'source-in'; cg.fillStyle = mood === 'angry' ? '#ff3020' : '#80c8ff'; cg.fillRect(0, 0, 96, 96);
        g.drawImage(c, ax - 48, ay - 80); g.restore();
      }
      // Navi Customizer abilities: the game's barrier (t4 0x7) and guard (t3 0x2B) sprites; app-drawn without a ROM
      if (p.barrier > 0 && bank?.get('barrierfx')) { g.save(); g.globalAlpha = 0.5; sprite(g, bank, 'barrierfx', 'barrier', s.tick, ax, ay - 2, () => {}); g.restore(); } // on MegaMan's X / Y / Z, Y16 − 2 (sub_80E0B8C); see-through (blend level not traced)
      else if (p.barrier > 0) { g.strokeStyle = 'rgba(140,220,255,.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(ax, ay - 16, 15, 20, 0, 0, 7); g.stroke(); }
      if (p.state === 'guard' && bank?.get('guardfx')) sprite(g, bank, 'guardfx', p.guardReflect ? (p.guardHitT > 0 ? 'reflectHit' : 'reflect') : (p.guardHitT > 0 ? 'shieldHit' : 'shield'), p.stateT, ax + 16, ay - 16, () => {});
      else if (p.state === 'guard') { g.fillStyle = p.guardReflect ? 'rgba(255,240,120,.55)' : 'rgba(160,200,255,.55)'; g.fillRect(ax + 10, ay - 34, 6, 30); g.strokeStyle = '#fff'; g.strokeRect(ax + 10.5, ay - 33.5, 5, 29); }
      if (p.state === 'antidmg' && (s.tick >> 1) & 1) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(ax, ay - 16, 13, 18, 0, 0, 7); g.stroke(); }
      if (p.charge >= val('chargeDelay')) { // the charge aura (t4 0x8): charging from 10 held ticks, charged at full; palette 2, arm offset (2, 0)
        const full = p.charge >= (s.chargeTime ?? val('chargeTime'));
        sprite(g, bank, 'chargefx', full ? 'charged' : 'charging', p.holdT - (full ? (s.chargeTime ?? val('chargeTime')) : val('chargeDelay')), ax + 2, ay, () => {}, 2);
      }
      if (p.bubble > 0) sprite(g, bank, 'bubblefx', 'bubble', s.tick, ax, ay - 16, () => { g.strokeStyle = 'rgba(200,230,255,.8)'; g.beginPath(); g.arc(ax, ay - 16, 16, 0, 7); g.stroke(); }); // bubble (colour bug)
      if (p.frozen && p.paralyzed > 0) { g.fillStyle = 'rgba(180,230,255,.55)'; g.fillRect(ax - 12, ay - 34, 24, 34); } // frozen on ice
      else if (p.paralyzed > 0 && (s.tick >> 1) & 1) { // paralysis: flicker bright
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6;
        sprite(g, bank, 'megaman', p.anim, p.animT, ax, ay, () => {}); g.restore();
      }
    } });
  }
  for (const e of s.enemies) {
    if (e.hp <= 0 && e.deadT !== undefined && e.kind !== 'coil' && e.deadT < DELETE.hold + DELETE.fade && !e.hidden) { // deletion (0x801746E / 0x80174BE)
      const [ax, ay] = anchor(e.drawX ?? e.x, e.drawY ?? e.y), seqs = bank?.get(e.sprite, e.palette);
      const role = seqs?.flinch ? 'flinch' : e.anim, flip = (e.kind !== 'coil' || !!e.flip) && !e.faceBack;
      const t = e.deadT - DELETE.hold, fn = c => sprite(c, bank, e.sprite, role, e.deadT, 64, 80, () => {}, e.palette, flip);
      draw.push({ y: e.drawY ?? e.y, fn: () => t < 0 ? (fn(dissolveCtx()), blitDissolve(g, ax, ay, 1, 1)) : (fn(dissolveCtx()), blitDissolve(g, ax, ay, (t >> 1) + 1, Math.max(0, 16 - (t >> 1)) / 16)) });
      continue;
    }
    if (e.hp <= 0 || e.hidden || p.blind > 0) continue; // blind (colour bug): enemies are hidden
    const [ax, ay0] = anchor(e.drawX ?? e.x, e.drawY ?? e.y);
    const ay = ay0 - (e.z || 0);
    const fallback = e.big ? placeholderBeast : e.kind === 'navi' ? placeholderEnemyNavi : e.kind === 'coil' ? placeholderCoil : placeholderVirus;
    if (e.hover && bank?.get(e.sprite)?.shadow) sprite(g, bank, e.sprite, 'shadow', 0, ax + 30, ay0, () => {}, e.palette, true); // under his talons
    else if (e.z > 0) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ax, ay0 - 2, e.hover ? 30 : 10, e.hover ? 8 : 4, 0, 0, 7); g.fill(); }
    const flip = (e.kind !== 'coil' || !!e.flip) && !e.faceBack;
    if (e.holes) for (const [hx, hy] of e.holes) { // SnakeArm: its hole stays behind while it is out
      const [bx, by] = anchor(hx, hy);
      draw.push({ y: hy - 0.01, fn: () => sprite(g, bank, 'snakearm', 'hole', s.tick, bx, by, () => {}, e.palette, true) });
    }
    if (e.fist) { // Cragger's rock fist, punched down onto MegaMan's panel (object type1 0x02)
      const k = Math.min(1, (s.tick - e.fist.start) / Math.max(1, e.fist.land - e.fist.start)), [fx, fy] = anchor(e.fist.x, e.fist.y);
      draw.push({ y: e.fist.y + 0.01, fn: () => sprite(g, bank, 'craggerarm', 'catch', 0, fx + 20 * (1 - k), fy - 40 * (1 - k), (g, x, y) => { g.fillStyle = '#999'; g.beginPath(); g.arc(x, y - 12, 10, 0, 7); g.fill(); }, e.palette, true) });
    }
    draw.push({ y: e.drawY ?? e.y, fn: () => {
      sprite(g, bank, e.sprite, e.anim, e.animT, ax, ay, fallback, e.palette, flip); // ROM sprites face right; Navis and viruses face MegaMan
      if (e.bubble > 0) sprite(g, bank, 'bubblefx', 'bubble', s.tick, ax, ay - 16, () => { g.strokeStyle = 'rgba(200,230,255,.8)'; g.beginPath(); g.arc(ax, ay - 16, 16, 0, 7); g.stroke(); }); // bubbled (BubbleStar)
      else if (e.paralyzed > 0 && (s.tick >> 1) & 1) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; sprite(g, bank, e.sprite, e.anim, e.animT, ax, ay, () => {}, e.palette, flip); g.restore(); } // paralysed: flicker bright (app-drawn)
      if (e.family === 'Cragger' && !e.fist) sprite(g, bank, 'craggerarm', e.anim, e.animT, ax, ay, () => {}, e.palette, flip);
      if (e.kind === 'coil' && e.discharge > 0 && !bank?.has('eleccoil')) { g.strokeStyle = '#80f0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, FIELD_Y); g.lineTo(ax, FIELD_Y + 3 * PANEL_H); g.stroke(); }
      if (e.guard) { g.fillStyle = 'rgba(200,230,255,.7)'; g.fillRect(ax - 18, ay - 34, 3, 28); }
      if (e.flash) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(ax - 14, ay - 26, 28, 26); g.globalCompositeOperation = 'source-over'; }
      if (!e.noHp) text(g, String(e.hp), ax, ay + 6, '#fff', 'center');
    } });
  }
  draw.sort((a, b) => a.y - b.y).forEach(d => d.fn());
  // Queued chips above MegaMan (0x801C082): the next chip's icon, once per queued chip, each copy 2 px up and back.
  if (s.queue.length && s.phase === 'battle' && !s.timestop && !s.banner && p.hp > 0) {
    const [ax, ay] = anchor(p.drawX ?? p.x, p.drawY ?? p.y);
    const icon = bank?.chips?.icon(CHIP_DATA[s.queue[0].name]?.id);
    for (let k = s.queue.length - 1; k >= 0; k--) {
      const x = Math.round(ax) - 1 - 2 * k, y = Math.round(ay) - 57 - 2 * k;
      if (icon) g.drawImage(icon, x, y);
      else { g.fillStyle = '#c8c8c8'; g.fillRect(x, y, 16, 16); g.fillStyle = '#585868'; g.fillRect(x + 1, y + 1, 14, 14); }
    }
  }

  // ElecMan charge sparkle at his hand
  const aura = bank?.get('elecaura');
  for (const f of s.effects) if (f.kind === 'aura' && f.t < (f.life ?? 30)) {
    const e = s.enemies.find(o => o.id === f.owner);
    if (!e || e.hp <= 0) continue;
    const [ax, ay] = anchor(e.drawX ?? e.x, e.drawY ?? e.y);
    if (aura) { const fr = frameAt(aura.spark, f.t); g.drawImage(fr.image, Math.round(ax - 14 - fr.originX), Math.round(ay - 26 - fr.originY)); }
    else { g.fillStyle = (f.t >> 1) & 1 ? '#fff' : '#ffe040'; g.beginPath(); g.arc(ax - 14, ay - 26, 3, 0, 7); g.fill(); }
  }
  // ElecMan row lightning (object type3 0x1E), from his hand toward MegaMan
  for (const h of s.hazards) if (h.kind === 'rowbolt') {
    const [ax, ay] = anchor(h.x, h.y);
    const img = bank?.get('elecbolt') && frameAt(bank.get('elecbolt').horizontal, s.tick - h.start).image;
    if (img) { g.save(); g.translate(Math.round(ax - 12), 0); g.scale(-1, 1); g.drawImage(img, 0, Math.round(ay - 22 - img.height / 2)); g.restore(); }
    else { g.strokeStyle = '#ffd040'; g.lineWidth = 3; g.beginPath(); g.moveTo(ax - 12, ay - 22); for (let x = ax - 24; x > -10; x -= 10) g.lineTo(x, ay - 22 + (((x / 10) | 0) & 1 ? -5 : 5)); g.stroke(); }
  }
  // SlashMan claw swipes and kunai (sprites drawn for a right-facing user; mirrored for the enemy side)
  const claw = bank?.get('clawfx'), kun = bank?.get('kunai');
  const mirrored = (img, x, y, ox, oy) => { g.save(); g.translate(Math.round(x), 0); g.scale(-1, 1); g.drawImage(img, -ox, Math.round(y - oy)); g.restore(); };
  for (const f of s.effects) if (f.kind === 'claw' && f.t < 14) {
    const [ax, ay] = anchor(f.x, f.y);
    if (claw) { const fr = frameAt(claw[f.shape], f.t); mirrored(fr.image, ax, ay - 14, fr.originX, fr.originY); }
    else { g.strokeStyle = '#80ffe0'; g.lineWidth = 2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(ax + 8 + i * 5, ay - 36); g.lineTo(ax - 4 + i * 5, ay); g.stroke(); } }
  }
  for (const h of s.hazards) if (h.kind === 'kunai') {
    const t = s.tick - h.start, [ax, ay] = anchor(h.fx ?? h.x, h.y);
    if (kun) { const fr = frameAt(kun[t > h.spin ? 'fly' : 'spin'], t); mirrored(fr.image, ax, ay - 14, fr.originX, fr.originY); }
    else { g.fillStyle = '#ccd'; g.beginPath(); g.moveTo(ax - 8, ay - 14); g.lineTo(ax + 6, ay - 18); g.lineTo(ax + 6, ay - 10); g.fill(); }
  }
  for (const f of s.effects) if (f.kind === 'spark' && f.t < 8) {
    const [ax, ay] = anchor(f.x, f.y);
    g.fillStyle = f.t & 2 ? '#ffffff' : '#fff070'; g.beginPath(); g.arc(ax, ay - 16, 10 - f.t, 0, 7); g.fill();
  }
  const bolt = bank?.get('elecbolt');
  for (const f of s.effects) {
    if ((f.kind === 'bolt-v' || f.kind === 'bolt-h') && f.t < 12) {
      const [ax, ay] = anchor(f.x, f.y);
      if (bolt) {
        const img = frameAt(bolt[f.kind === 'bolt-v' ? 'vertical' : 'horizontal'], f.t).image;
        if (f.kind === 'bolt-v') g.drawImage(img, Math.round(ax - img.width / 2), Math.round(ay - img.height));
        else { // drawn for a right-facing caster; mirror so the hand end sits at ElecMan
          g.save(); g.translate(Math.round(ax + 20), 0); g.scale(-1, 1);
          g.drawImage(img, 0, Math.round(ay - 16 - img.height / 2)); g.restore();
        }
      } else {
        g.strokeStyle = '#ffe860'; g.lineWidth = 3; g.beginPath();
        if (f.kind === 'bolt-v') { g.moveTo(ax, 0); g.lineTo(ax - 5, ay - 30); g.lineTo(ax + 4, ay - 18); g.lineTo(ax, ay); }
        else { g.moveTo(ax + 20, ay - 14); for (let x = ax; x > -20; x -= 12) g.lineTo(x, ay - 14 + ((x / 12) & 1 ? -5 : 5)); }
        g.stroke();
      }
    }
    if (f.kind === 'slash' && f.t < 14) {
      const fx = bank?.get('swordfx');
      if (fx) { // game slash sprite, mirrored for an enemy swinging left
        const seq = { wide: ['wide'], long: ['long'], both: ['wide', 'long'], sword: ['sword'] }[f.area];
        const [ax, ay] = anchor(f.flip ? f.x + 1 : f.x - 1, f.y);
        for (const k of seq) {
          const fr = frameAt(fx[k], f.t);
          if (f.flip) { g.drawImage(fr.image, Math.round(ax - 20 - fr.originX), Math.round(ay - 12 - fr.originY)); continue; } // swinging right (DarkMech from behind)
          g.save(); g.translate(Math.round(ax + 20), 0); g.scale(-1, 1);
          g.drawImage(fr.image, -fr.originX, Math.round(ay - 12 - fr.originY)); g.restore();
        }
      } else if (f.t < 10) {
        const cells = { wide: [[-1, -1], [-1, 0], [-1, 1]], long: [[-1, 0], [-2, 0]], both: [[-1, -1], [-1, 0], [-1, 1], [-2, 0]], sword: [[-1, 0]] }[f.area];
        g.strokeStyle = 'rgba(255,140,230,.9)'; g.lineWidth = 3;
        for (const [dx, dy] of cells) {
          const [ax, ay] = anchor(f.x + dx, f.y + dy);
          if (f.y + dy < 0 || f.y + dy > 2) continue;
          g.beginPath(); g.arc(ax + 10, ay - 12, 14, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
        }
      }
    }
    if (f.kind === 'counter' && f.t < 20) { // counter hit: a pink ring (app-drawn; the game's ring object is not decoded)
      const [cx, cy] = anchor(f.x, f.y); g.strokeStyle = `rgba(255,120,200,${1 - f.t / 20})`; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy - 16, 6 + f.t, 0, 7); g.stroke();
    }
    if (f.kind === 'star' && bank?.get('shurikenfx')) { // AntiDmg's shuriken (t3 0xC2): falls onto the enemy, then lands
      const [sx, sy] = anchor(f.x, f.y);
      if (f.t < 12) sprite(g, bank, 'shurikenfx', 'fall', f.t, sx, sy - 16 - (12 - f.t) * 6, () => {});
      else if (f.t < 24) sprite(g, bank, 'shurikenfx', 'land', f.t - 12, sx, sy, () => {});
      continue;
    }
    if (f.kind === 'star' && f.t < 16) { // AntiDmg's star (app-drawn)
      const [sx, sy] = anchor(f.x, f.y), r = 8 - f.t / 4; g.fillStyle = '#e8e8f0'; g.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + f.t / 3, rr = k & 1 ? r / 3 : r; g.lineTo(sx + Math.cos(a) * rr, sy - 18 - (16 - f.t) * 2 + Math.sin(a) * rr); }
      g.fill();
    }
    if (f.kind === 'guard' && f.t < 10) {
      const [ax, ay] = anchor(f.x, f.y);
      g.fillStyle = 'rgba(200,230,255,.8)'; g.fillRect(ax - 16, ay - 34, 4, 28);
    }
  }
  const target = bank?.get('target');
  for (const e of s.enemies) if (e.hp > 0 && e.target) {
    const [ax, ay] = anchor(e.target.x, e.target.y);
    if (target) {
      const f = frameAt(target[e.target.locked ? 'lock' : 'search'], e.target.locked ? e.stateT : e.target.t);
      g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - 12 - f.originY));
    } else {
      g.strokeStyle = e.target.locked ? '#ff5050' : '#80ff40'; g.lineWidth = 1;
      g.beginPath(); g.arc(ax, ay - 12, 8, 0, 7); g.moveTo(ax - 10, ay - 12); g.lineTo(ax + 10, ay - 12); g.moveTo(ax, ay - 22); g.lineTo(ax, ay - 2); g.stroke();
    }
  }
  for (const h of s.hazards) if (h.kind === 'dragon' && h.pos) { // Dragon chips (sprite 4/0x10): four body pieces trail the head
    for (let k = 4; k >= 0; k--) {
      const q = k ? dragonAt(h.t - 3 * k, h.col) : h.pos; if (!q) continue;
      const [ax, ay] = anchor(q.x, q.y);
      sprite(g, bank, 'dragonchip', k ? 'body' : q.dir, h.t, ax, ay - 12, (g, x, y) => { g.fillStyle = k ? '#c04020' : '#e06030'; g.beginPath(); g.arc(x, y, k ? 7 : 10, 0, 7); g.fill(); }, h.pal, true); // flipped to face the enemy side (object_getFlip)
    }
  }
  for (const h of s.hazards) if (h.kind === 'bomb') {
    const k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
    const [sx, sy] = anchor(h.x, h.y), [tx, ty] = anchor(h.tx, h.y);
    const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k - 40 * Math.sin(Math.PI * k) - 16;
    if (s.tick < h.start) continue; // still in MegaMan's hand
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(Math.round(sx + (tx - sx) * k), Math.round(sy + (ty - sy) * k) - 2, 6, 2, 0, 0, 7); g.fill(); // shadow (app-drawn)
    if (h.sprite) sprite(g, bank, h.sprite, 'air', s.tick - h.start, x, y + 12, (g, x, y) => { g.fillStyle = '#303030'; g.beginPath(); g.arc(x, y - 6, 6, 0, 7); g.fill(); }, 0, false); // a placed bomb in the air (its own sprite)
    else sprite(g, bank, 'throwball', 'fly', s.tick - h.start, x, y, (g, x, y) => { g.fillStyle = '#3aa0e0'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }); // t3 0x8, sprite 0x0C/0x02 animation 1
  }
  // Volcano eruption (object type3 0x07, sprite 0x10/0x24): bubbles, then a flame column
  for (const h of s.hazards) if (h.kind === 'volcano') {
    const [lx, ly] = anchor(h.x, h.y), burning = s.tick >= h.hit;
    sprite(g, bank, 'lavaflame', burning ? (s.tick - h.hit < 2 ? 'rise' : 'flame') : 'bubble', s.tick - (burning ? h.hit : h.start), lx, ly - 4, (g, x, y) => {
      g.fillStyle = burning ? ((s.tick >> 1) & 1 ? '#ffd040' : '#ff7a20') : '#ffb060';
      if (burning) g.fillRect(x - 8, y - 40, 16, 40); else { g.beginPath(); g.ellipse(x, y - 4, 8, 3, 0, 0, 7); g.fill(); }
    });
  }
  // CrakShot: the lifted panel slides down the row
  for (const h of s.hazards) if (h.kind === 'crackshot') {
    const [cx, cy] = anchor(h.fx, h.y);
    if (bank?.field) g.drawImage(bank.field.panel(2, 0, h.y + 1, s.tick), Math.round(cx - 16), Math.round(cy - 26), 32, 19);
    else { g.fillStyle = '#e08a70'; g.fillRect(cx - 16, cy - 26, 32, 18); }
  }
  // DarkMech elec ball (sprite 0x10/0x16); FighterPlane bombs flash their panel, then burst (sprite 0x10/0x26)
  for (const h of s.hazards) {
    if (h.kind === 'elecball') {
      const [bx, by] = anchor(h.fx, h.fy);
      sprite(g, bank, 'elecball', 'fly', s.tick, bx, by - 14, (g, x, y) => { g.fillStyle = (s.tick >> 1) & 1 ? '#fff' : '#ffe040'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); });
    }
    if (h.kind === 'planebomb' && !((s.tick >> 2) & 1)) {
      g.fillStyle = 'rgba(255,240,80,.85)'; g.fillRect(h.x * PANEL_W + 3, FIELD_Y + h.y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9);
    }
  }
  for (const f of s.effects) {
    if (f.kind === 'bombblast' || f.kind === 'elechit') {
      if (f.t > 16) continue;
      const [bx, by] = anchor(f.x, f.y);
      if (f.kind === 'bombblast') sprite(g, bank, 'bombblast', 'burst', f.t, bx, by, (g, x, y) => { g.strokeStyle = '#ffe070'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 10, 4 + f.t, 0, 7); g.stroke(); });
      else sprite(g, bank, 'elecball', 'hit', f.t, bx, by - 14, () => {});
      continue;
    }
    if (f.kind === 'gust') { // WindBox / VacuumFan gust along a row
      if (f.t > 10) continue;
      const [x0, y0] = anchor(f.dir < 0 ? 5 : 0, f.y), [x1] = anchor(f.dir < 0 ? 0 : 5, f.y), k = f.t / 10;
      g.strokeStyle = 'rgba(220,240,255,.7)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const x = x0 + (x1 - x0) * k + i * 10 * f.dir; g.beginPath(); g.moveTo(x, y0 - 8 - i * 6); g.lineTo(x + 14 * f.dir, y0 - 8 - i * 6); g.stroke(); }
      continue;
    }
    if (f.kind === 'hit' && f.fx) { // t4 0x4 hit effects, sprite category 0x14 (0x80E0804)
      const [hx, hy] = anchor(f.x, f.y), key = { buster: 'hitfx', charge: 'chargehitfx', explosion: 'explosionfx' }[f.fx];
      sprite(g, bank, key, { hitfx: 'buster', chargehitfx: 'hit', explosionfx: 'burst' }[key], f.t, hx + f.jx, hy - 14 + f.jy, () => {});
      continue;
    }
    if (f.kind === 'heal' && bank?.has?.('healfx')) { const [hx, hy] = anchor(f.x, f.y); sprite(g, bank, 'healfx', 'heal', f.t, hx, hy, () => {}); continue; }
    if (f.kind === 'note' || f.kind === 'heal') {
      if (f.t > 16) continue;
      const [ax, ay] = anchor(f.x, f.y);
      g.fillStyle = f.kind === 'heal' ? '#80ff90' : '#ffe070'; g.font = '10px monospace'; g.fillText(f.kind === 'heal' ? '+' : '\u266a', ax - 12 - f.t, ay - 30 - f.t);
      continue;
    }
    const [ax, ay] = anchor(f.x, f.y);
    if (f.kind === 'shot' && bank?.has?.('vulcanhitfx')) { // Vulcan: the bullet is invisible (t3 0x12); a hit shows effect 0x20
      if (f.hit) sprite(g, bank, 'vulcanhitfx', 'hit', f.t, ax, ay - f.z, () => {});
      continue;
    }
    if (f.kind === 'capsule') { // 4 px ahead, 48 px up, rising 2 px a frame (0x8010488 / 0x80E1D54)
      if (f.t < (f.life ?? 16)) sprite(g, bank, 'capsulefx', 'puff', f.t, ax + 4, ay - 48 - 2 * f.t, (g, x, y) => { g.fillStyle = 'rgba(240,240,240,.8)'; g.beginPath(); g.arc(x, y, 3 + f.t / 2, 0, 7); g.fill(); });
      continue;
    }
    if (f.kind === 'deleteburst' && bank?.has?.('deletefx')) { if (f.t < (f.life ?? 22)) sprite(g, bank, 'deletefx', 'burst', f.t, ax, ay - 14, () => {}); continue; }
    if (f.kind === 'deleteburst') continue;
    if (f.kind === 'delete' && bank?.has?.('deletefx')) continue; // the ROM burst replaces the ring
    if (f.kind === 'shot' && f.t > 6) continue;
    const r = f.kind === 'blast' ? 4 + f.t : f.kind === 'delete' ? f.t : f.kind === 'shot' ? 3 + f.t : 6 - f.t / 4;
    if (r <= 0) continue;
    g.strokeStyle = f.kind === 'delete' ? '#fff' : '#ffe070'; g.lineWidth = 2;
    g.beginPath(); g.arc(ax, ay - 14, r, 0, 7); g.stroke();
  }

  // HUD
  if (bank?.custom) { // HP box (byte_801EDFC) and HP in the game's white 8×16 digits (dword_86E411C)
    if (bank.custom.hpBox) g.drawImage(bank.custom.hpBox(), 0, 0);
    else { g.fillStyle = '#e8f0f8'; g.fillRect(2, 1, 42, 18); g.fillStyle = '#304068'; g.fillRect(3, 2, 40, 16); }
    const face = EMOTION.faces.value[emotionOf(s)]; // emotion window (sub_801CDEC): 48×16 at (0, 18)
    if (bank.custom.emotion && s.emotion) g.drawImage(bank.custom.emotion(face), 0, 18);
    const hp = String(Math.max(0, p.hp));
    for (let k = 0; k < hp.length; k++) g.drawImage((bank.custom.hpDigit || bank.custom.digit)(+hp[k], 0), 41 - 8 * (hp.length - k), 0);
  } else {
    g.fillStyle = '#183058'; g.fillRect(2, 2, 34, 13);
    g.strokeStyle = '#a8c8f0'; g.lineWidth = 1; g.strokeRect(2.5, 2.5, 33, 12);
    text(g, String(p.hp), 33, 12, p.hp <= p.maxHp / 4 ? '#ff8080' : '#fff', 'right');
  }
  const full = s.gauge >= val('customGaugeTicks');
  if (s.phase !== 'custom' && bank?.custom?.gauge) { // the game's gauge (word_801ED6C at column 6), value 0–0x4000
    const v = Math.min(0x4000, Math.round(s.gauge * 0x4000 / val('customGaugeTicks')));
    const state = v >= 0x4000 ? 3 : v >= 0x2A00 ? 2 : v >= 0x1500 ? 1 : 0; // 0x801C5F4
    g.drawImage(bank.custom.gauge(v, state), 48, 0);
  } else if (s.phase !== 'custom') { // the game hides the gauge while the custom window is open
    g.fillStyle = '#183058'; g.fillRect(56, 4, 128, 8);
    g.fillStyle = full ? ((s.tick >> 3) & 1 ? '#ffe070' : '#ff9040') : '#60b0ff';
    g.fillRect(57, 5, 126 * s.gauge / val('customGaugeTicks'), 6);
    text(g, full ? 'CUSTOM  L/R' : 'CUSTOM', 120, 22, '#cfe4ff', 'center');
  }
  if (p.charge > 0 && !bank?.get('chargefx')) { // no ROM: a plain charge bar
    g.fillStyle = p.charge >= (s.chargeTime ?? val('chargeTime')) ? ((s.tick >> 2) & 1 ? '#ff60c0' : '#60ffff') : '#3aa0ff';
    const [ax, ay] = anchor(p.x, p.y);
    g.fillRect(ax - 12, ay + 3, 24 * p.charge / (s.chargeTime ?? val('chargeTime')), 2);
  }
  if (s.queue.length) { // the next chip's name on tile rows 18–19 at the left (0x801C6EE), with its power
    const c = s.queue[0], dmg = (CHIP_DATA[c.name]?.damage || 0) + (c.bonus || 0);
    if (!romText(g, bank, c.name + (dmg && chipBehaviour(c.name)?.kind !== 'busterup' ? ' ' + dmg : ''), 0, 144))
      text(g, `${c.name} ${c.code}` + (s.queue.length > 1 ? `  +${s.queue.length - 1}` : ''), 3, 156, '#fff');
  }
  if (s.mode === 'survival' && !romText(g, bank, `WAVE ${s.wave}`, 240, 0, 'right')) text(g, `WAVE ${s.wave}`, 237, 12, '#ffe070', 'right');
  // Enemy names, top right, in the game's battle text font
  if (s.mode !== 'survival') s.enemies.filter(e => e.hp > 0 && e.kind !== 'coil').forEach((e, i) => { if (!romText(g, bank, e.name, 240, i * 14, 'right')) text(g, e.name, 237, 12 + i * 9, '#fff', 'right'); });
  // Time freeze (AreaGrab / PanlGrab): the field dims, the chip name shows, the beams drop (sprite 0x0C/0x13).
  const ts = s.timestop;
  if (ts) {
    const dim = 16, a = Math.min(1, ts.t / dim) * 0.5;
    g.fillStyle = `rgba(0,0,24,${a})`; g.fillRect(0, 0, 240, 160);
    const sp = ts.special;
    if (sp?.cells.length && ts.t >= ts.start && ts.t < ts.start + sp.def.hold && ((ts.t - ts.start) >> 2) & 1) // panel chips: the panels blink (object_setPanelTypeBlink, every 4 frames)
      for (const [x, y] of sp.cells) { const [ax, ay] = anchor(x, y); g.fillStyle = sp.def.type === 'holy' ? 'rgba(255,240,160,.55)' : 'rgba(255,255,255,.45)'; g.fillRect(ax - 20, ay - 14, 40, 24); }
    if (sp?.def.cursor === 'circgun' && ts.t >= ts.start) { // CircGun: cursor and markers (sprite 0x10/0x45)
      for (const q of [sp.cursor, ...sp.cursor.shots]) { const [ax, ay] = anchor(q.x, q.y); sprite(g, bank, 'circgunfx', 'cursor', ts.t, ax, ay - 8, (g, x, y) => { g.strokeStyle = '#ff5050'; g.lineWidth = 2; g.strokeRect(x - 12, y - 10, 24, 18); }, 0, false); }
    }
    else     if (sp?.cursor && ts.t >= ts.start && sp.cursor.fireAt === undefined && !((ts.t - ts.start) & 4)) // BurnSqr / Magnum cursor: highlighted panels (highlightPanelIfSomeCondition_8109660, Timer2 & 4)
      for (const [x, y] of cursorCells(sp.cursor, sp.def.cursor)) if (x >= 0 && x <= 5 && y >= 0 && y <= 2) { g.fillStyle = 'rgba(255,240,80,.85)'; g.fillRect(x * PANEL_W + 3, FIELD_Y + y * PANEL_H + 3, PANEL_W - 6, PANEL_H - 9); }
    if (sp?.def.kind === 'meteors' && sp.order.length) for (let k = 0; k < 30; k++) { // meteors (sprite 0x0C/0x31): 0x1E up high, then 0x10 frames down from behind
      const f = ts.t - ts.start - 2 - 10 * k - 30; if (f < 0 || f >= 16) continue;
      const [x, y] = sp.order[k % sp.order.length], [ax, ay] = anchor(x, y), z = 256 - 16 * f;
      sprite(g, bank, 'meteorfx', 'fall', f, ax - z, ay - z, (g, x, y) => { g.fillStyle = '#ff9040'; g.beginPath(); g.arc(x, y - 8, 8, 0, 7); g.fill(); }, 0, false);
    }
    if (sp?.def.kind === 'lifesync' && sp.order.length && ts.t >= ts.start + 0x14) { // LifeSync: links from the target to the others
      const [x0, y0] = anchor(sp.order[0].x, sp.order[0].y); g.strokeStyle = 'rgba(120,255,160,.8)'; g.lineWidth = 2;
      for (const e of sp.order.slice(1)) { const [x1, y1] = anchor(e.x, e.y); g.beginPath(); g.moveTo(x0, y0 - 16); g.lineTo(x1, y1 - 16); g.stroke(); }
    }
    if (sp?.def.kind === 'sumnblk' && sp.order.length && ts.t >= ts.start) { // SumnBlk's creature (sprite 4/0x1D)
      const k = ts.t - ts.start, e1 = 0x18, e2 = e1 + 35, e3 = e2 + 0x1E, w = e3 + 2, a1 = w + 41, a2 = a1 + 0xA, a3 = a2 + 26 + 0x10;
      const there = sp.order[1] && k >= w && k < a3, [px, py] = there ? sp.order[1] : sp.order[0], [ax, ay] = anchor(px, py);
      const seq = k < e1 ? 's0' : k < e2 ? 's5' : k < e3 ? 's4' : !sp.order[1] ? 's4' : k < a1 ? 's1' : k < a2 ? 's1' : k < a3 ? 's2' : 's0';
      sprite(g, bank, 'sumnblkfx', seq, k, ax, ay, (g, x, y) => { g.fillStyle = '#302040'; g.fillRect(x - 8, y - 24, 16, 24); }, CHIP_DATA[ts.name] ? CHIP_DATA[ts.name].params[0] * 3 : 0, true);
    }
    if (sp?.def.kind === 'colorpoint') for (const q of sp.order) if (!q.done && ts.t >= ts.start) { // ColorPt's points (sprite 0x0C/0x13, palette params[0] × 4)
      const [ax, ay] = anchor(q.fx / 40, q.fy / 24);
      sprite(g, bank, 'grabbeam', 'land', q.t, ax, ay - q.z, (g, x, y) => { g.fillStyle = '#ffe060'; g.beginPath(); g.arc(x, y - 6, 6, 0, 7); g.fill(); }, (CHIP_DATA[ts.name]?.params?.[0] || 0) * 4, false);
    }
    if (sp?.def.kind === 'snake') for (const n of sp.snakes || []) { // Snake (sprite 0x0C/0x2C): rises from its hole, bites, flies
      const [ax, ay] = anchor(n.x / 40, n.y / 24);
      sprite(g, bank, 'snakefx', n.anim || 'rise', n.t, ax, ay - n.z, (g, x, y) => { g.fillStyle = '#60c040'; g.fillRect(x - 3, y - 14, 6, 14); }, 0, false);
    }
    if (sp?.def.kind === 'mine' && sp.order.length && ts.t >= ts.start && ts.t < ts.start + sp.def.hold) { // Mine hopping every 2 frames (sprite 0x0C/0x22)
      const [x, y] = sp.order[Math.min(59, (ts.t - ts.start) >> 1) % sp.order.length], [ax, ay] = anchor(x, y);
      sprite(g, bank, 'minefx', 'idle', ts.t, ax, ay - 4, (g, x, y) => { g.fillStyle = '#c03030'; g.fillRect(x - 6, y - 6, 12, 6); }, 0, false);
    }
    if (ts.t >= dim) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 18, 96, 14); g.font = '10px monospace'; text(g, ts.name, 6, 29, '#fff'); g.font = '8px monospace'; }
    for (const b of ts.beams) {
      const [bx, by] = anchor(b.x, b.y), z = Math.round(b.z * 256);
      if (z > 0) sprite(g, bank, 'grabbeam', 'fall', ts.t, bx, by - z, (g, x, y) => { g.fillStyle = '#fff8a0'; g.fillRect(x - 3, y - 40, 6, 40); });
    }
  }
  for (const f of s.effects) if (f.kind === 'flash' && f.t < 12) { g.fillStyle = `rgba(255,255,255,${0.8 * (1 - f.t / 12)})`; g.fillRect(0, 0, 240, 160); } // FlshBom's flash (app-drawn)
  for (const f of s.effects) if (f.kind === 'grabland') { const [bx, by] = anchor(f.x, f.y); sprite(g, bank, 'grabbeam', 'land', f.t, bx, by, (g, x, y) => { g.fillStyle = `rgba(255,250,180,${1 - f.t / 24})`; g.fillRect(x - 16, y - 12, 32, 16); }); }
  // Banners in the game's battle message font: BATTLE START! before the first turn; after the last deletion,
  // ENEMY DELETED! and then YOU WIN!
  const lastDeath = Math.max(0, ...s.enemies.filter(e => e.deadT !== undefined).map(e => DELETE.hold + DELETE.fade - e.deadT));
  if (s.banner?.kind === 'start') { drawBanner(g, bank, 'BATTLE START!', s.banner.t, BANNER.start); return; }
  if (s.phase === 'win' && bank?.custom?.glyph) {
    if (lastDeath > 0) return;
    const t = s.phaseT - (DELETE.hold + DELETE.fade);
    if (t >= 0 && t < BANNER.deleted) drawBanner(g, bank, 'ENEMY DELETED!', t, BANNER.deleted);
    else if (t >= BANNER.deleted) drawBanner(g, bank, 'YOU WIN!', t - BANNER.deleted, Infinity);
    return;
  }
  const banner = { win: 'ENEMY DELETED!', lose: 'MegaMan deleted...', wave: `WAVE ${s.wave} CLEAR` }[s.phase];
  if (banner && bank?.custom?.text) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 54, 240, 20); romText(g, bank, banner, 120, 56, 'center'); return; }
  if (banner) {
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 50, 240, 22);
    g.font = '12px monospace'; text(g, banner, 120, 65, '#fff', 'center');
  }
}

// Text in the game's battle font (8×16 cells, 8 px apart). Returns false without a ROM.
function romText(g, bank, str, x, y, align = 'left') {
  const T = bank?.custom?.text;
  if (!T) return false;
  const c = T(str), w = c.width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  g.drawImage(c, Math.round(x0), Math.round(y));
  return true;
}

// Banner: the blue bar (glyphs 28 / 26 / 29) opens from the middle, then the letters (8×16, 8 px apart) appear.
// Open / close lengths are estimated; the game's banner code was not traced.
const GLYPH = ch => ch === '!' ? 27 : ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 65 : -1;
function drawBanner(g, bank, msg, t, dur) {
  const cy = 64;
  if (!bank?.custom?.glyph) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, cy - 8, 240, 22); g.font = '12px monospace'; text(g, msg, 120, cy + 7, '#fff', 'center'); return; }
  const G = bank.custom.glyph, w = msg.length * 8, cells = Math.ceil(w / 8) + 2;
  const open = Math.min(1, (t + 1) / 8), close = dur === Infinity ? 1 : Math.min(1, (dur - t) / 8);
  const k = Math.min(open, close), n = Math.max(0, Math.round(cells * k)), x0 = 120 - n * 4;
  for (let i = 0; i < n; i++) g.drawImage(G(i === 0 ? 28 : i === n - 1 ? 29 : 26), x0 + i * 8, cy - 8);
  if (k < 1) return;
  let x = 120 - w / 2;
  for (const ch of msg) { const gi = GLYPH(ch); if (gi >= 0) g.drawImage(G(gi), x, cy - 8); x += 8; }
}

// Draws a static preview of one sprite into a small canvas for the menu.
export function preview(g, bank, key) {
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.imageSmoothingEnabled = false;
  const f = bank?.get(key)?.idle?.[0];
  if (f) g.drawImage(f.image, Math.round(32 - f.originX), Math.round(56 - f.originY));
  else placeholderNavi(g, 32, 56);
}
