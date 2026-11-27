// Draws a battle state onto a 240×160 canvas (GBA resolution).
// With a sprite bank (decoded from the player's ROM) original frames are used;
// otherwise neutral placeholder shapes are drawn.
// Panel geometry and sprite anchors are approximations pending an on-screen trace.
import { frameAt } from '../rom/bank.mjs';
import { val } from '../../data/rules.mjs';

export const PANEL_W = 40, PANEL_H = 24, FIELD_Y = 72;
const anchor = (x, y) => [x * PANEL_W + PANEL_W / 2, FIELD_Y + y * PANEL_H + 18];

// Panel surfaces are drawn (no ROM field tiles yet); each BN6 panel type gets its own look.
const SURFACE = { poison: '#9a48b8', holy: '#f2e2a0', grass: '#5cb24a', ice: '#cdefff', volcano: '#8a6a30' };
// ROM panel graphics (BG tiles + tilemaps + animated palettes): the type number is the game's panel type.
const TYPE_NUMBER = { none: 0, broken: 1, normal: 2, cracked: 3, poison: 4, holy: 5, grass: 6, ice: 7, volcano: 8, 'road-up': 9, 'road-down': 10, 'road-left': 11, 'road-right': 12 };
function panels(g, s, bank) {
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
    const red = x < 3, px = x * PANEL_W, py = FIELD_Y + y * PANEL_H, c = s.panels?.[y]?.[x], type = c?.type || 'normal';
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

export function render(g, s, bank) {
  g.imageSmoothingEnabled = false;
  const shake = s.effects.find(f => f.kind === 'shake' && f.t < 20);
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
        const speed = h.step >= 20 ? 'slow' : h.step >= 10 ? 'medium' : 'fast'; // type3 0x16 animation 0 / 1 / 2 (22 / 16-11 / 6 frames per panel)
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
  if (p.hp > 0 && !(p.invuln > 0 && p.state !== 'flinch' && (s.tick >> 1) & 1)) {
    const [ax, ay] = anchor(p.drawX ?? p.x, p.drawY ?? p.y);
    draw.push({ y: p.y, fn: () => {
      sprite(g, bank, 'megaman', p.anim, p.animT, ax, ay, placeholderNavi);
      if (p.frozen && p.paralyzed > 0) { g.fillStyle = 'rgba(180,230,255,.55)'; g.fillRect(ax - 12, ay - 34, 24, 34); } // frozen on ice
      else if (p.paralyzed > 0 && (s.tick >> 1) & 1) { // paralysis: flicker bright
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6;
        sprite(g, bank, 'megaman', p.anim, p.animT, ax, ay, () => {}); g.restore();
      }
    } });
  }
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.hidden) continue;
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
      if (e.family === 'Cragger' && !e.fist) sprite(g, bank, 'craggerarm', e.anim, e.animT, ax, ay, () => {}, e.palette, flip);
      if (e.kind === 'coil' && e.discharge > 0 && !bank?.has('eleccoil')) { g.strokeStyle = '#80f0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, FIELD_Y); g.lineTo(ax, FIELD_Y + 3 * PANEL_H); g.stroke(); }
      if (e.guard) { g.fillStyle = 'rgba(200,230,255,.7)'; g.fillRect(ax - 18, ay - 34, 3, 28); }
      if (e.flash) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(ax - 14, ay - 26, 28, 26); g.globalCompositeOperation = 'source-over'; }
      if (!e.noHp) text(g, String(e.hp), ax, ay + 6, '#fff', 'center');
    } });
  }
  draw.sort((a, b) => a.y - b.y).forEach(d => d.fn());

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
  for (const h of s.hazards) if (h.kind === 'bomb') {
    const k = Math.min(1, (s.tick - h.start) / (h.land - h.start));
    const [sx, sy] = anchor(h.x, h.y), [tx, ty] = anchor(h.tx, h.y);
    const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k - 40 * Math.sin(Math.PI * k) - 16;
    g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  // Volcano eruption (object type3 0x07, sprite 0x10/0x24): bubbles, then a flame column
  for (const h of s.hazards) if (h.kind === 'volcano') {
    const [lx, ly] = anchor(h.x, h.y), burning = s.tick >= h.hit;
    sprite(g, bank, 'lavaflame', burning ? (s.tick - h.hit < 2 ? 'rise' : 'flame') : 'bubble', s.tick - (burning ? h.hit : h.start), lx, ly - 4, (g, x, y) => {
      g.fillStyle = burning ? ((s.tick >> 1) & 1 ? '#ffd040' : '#ff7a20') : '#ffb060';
      if (burning) g.fillRect(x - 8, y - 40, 16, 40); else { g.beginPath(); g.ellipse(x, y - 4, 8, 3, 0, 0, 7); g.fill(); }
    });
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
    if (f.kind === 'note' || f.kind === 'heal') {
      if (f.t > 16) continue;
      const [ax, ay] = anchor(f.x, f.y);
      g.fillStyle = f.kind === 'heal' ? '#80ff90' : '#ffe070'; g.font = '10px monospace'; g.fillText(f.kind === 'heal' ? '+' : '\u266a', ax - 12 - f.t, ay - 30 - f.t);
      continue;
    }
    const [ax, ay] = anchor(f.x, f.y);
    if (f.kind === 'shot' && f.t > 6) continue;
    const r = f.kind === 'blast' ? 4 + f.t : f.kind === 'delete' ? f.t : f.kind === 'shot' ? 3 + f.t : 6 - f.t / 4;
    if (r <= 0) continue;
    g.strokeStyle = f.kind === 'delete' ? '#fff' : '#ffe070'; g.lineWidth = 2;
    g.beginPath(); g.arc(ax, ay - 14, r, 0, 7); g.stroke();
  }

  // HUD
  g.fillStyle = '#183058'; g.fillRect(2, 2, 34, 13);
  g.strokeStyle = '#a8c8f0'; g.lineWidth = 1; g.strokeRect(2.5, 2.5, 33, 12);
  text(g, String(p.hp), 33, 12, p.hp <= p.maxHp / 4 ? '#ff8080' : '#fff', 'right');
  const full = s.gauge >= val('customGaugeTicks');
  g.fillStyle = '#183058'; g.fillRect(56, 4, 128, 8);
  g.fillStyle = full ? ((s.tick >> 3) & 1 ? '#ffe070' : '#ff9040') : '#60b0ff';
  g.fillRect(57, 5, 126 * s.gauge / val('customGaugeTicks'), 6);
  text(g, full ? 'CUSTOM  L/R' : 'CUSTOM', 120, 22, '#cfe4ff', 'center');
  if (p.charge > 0) {
    g.fillStyle = p.charge >= val('chargeTime') ? ((s.tick >> 2) & 1 ? '#ff60c0' : '#60ffff') : '#3aa0ff';
    const [ax, ay] = anchor(p.x, p.y);
    g.fillRect(ax - 12, ay + 3, 24 * p.charge / val('chargeTime'), 2);
  }
  if (s.queue.length) {
    const c = s.queue[0];
    text(g, `${c.name} ${c.code}` + (s.queue.length > 1 ? `  +${s.queue.length - 1}` : ''), 3, 156, '#fff');
  }
  if (s.mode === 'survival') text(g, `WAVE ${s.wave}`, 237, 12, '#ffe070', 'right');
  // Enemy names, top right (BN style list)
  if (s.mode !== 'survival') s.enemies.filter(e => e.hp > 0 && e.kind !== 'coil').forEach((e, i) => text(g, e.name, 237, 12 + i * 9, '#fff', 'right'));
  const banner = { win: 'ENEMY DELETED!', lose: 'MegaMan deleted…', wave: `WAVE ${s.wave} CLEAR` }[s.phase];
  if (banner) {
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 50, 240, 22);
    g.font = '12px monospace'; text(g, banner, 120, 65, '#fff', 'center');
  }
}

// Draws a static preview of one sprite into a small canvas for the menu.
export function preview(g, bank, key) {
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.imageSmoothingEnabled = false;
  const f = bank?.get(key)?.idle?.[0];
  if (f) g.drawImage(f.image, Math.round(32 - f.originX), Math.round(56 - f.originY));
  else placeholderNavi(g, 32, 56);
}
