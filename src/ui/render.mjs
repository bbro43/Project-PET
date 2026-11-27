// Draws a battle state onto a 240×160 canvas (GBA resolution).
// With a sprite bank (decoded from the player's ROM) original frames are used;
// otherwise neutral placeholder shapes are drawn.
// Panel geometry and sprite anchors are approximations pending an on-screen trace.
import { frameAt } from '../rom/bank.mjs';
import { val } from '../../data/rules.mjs';

export const PANEL_W = 40, PANEL_H = 24, FIELD_Y = 72;
const anchor = (x, y) => [x * PANEL_W + PANEL_W / 2, FIELD_Y + y * PANEL_H + 18];

function panels(g) {
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
    const red = x < 3, px = x * PANEL_W, py = FIELD_Y + y * PANEL_H;
    g.fillStyle = red ? '#c8486a' : '#4870c8'; g.fillRect(px, py, PANEL_W, PANEL_H);
    g.fillStyle = red ? '#f0a8b8' : '#a8c4f0'; g.fillRect(px + 3, py + 3, PANEL_W - 6, PANEL_H - 9);
    g.fillStyle = red ? '#7a1f3a' : '#1f3a7a'; g.fillRect(px, py + PANEL_H - 4, PANEL_W, 4);
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
  panels(g);

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

  // Hazards under actors.
  const wave = bank?.get('shockwave');
  for (const h of s.hazards) {
    if (h.kind === 'wave') {
      const [ax, ay] = anchor(h.x, h.y);
      if (wave) {
        const speed = h.step >= 26 ? 'slow' : h.step >= 17 ? 'medium' : 'fast';
        const f = frameAt(wave[speed], s.tick - h.start);
        g.drawImage(f.image, Math.round(ax - f.originX), Math.round(ay - f.originY));
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
    const [ax, ay] = anchor(p.x, p.y);
    draw.push({ y: p.y, fn: () => sprite(g, bank, 'megaman', p.anim, p.animT, ax, ay, placeholderNavi) });
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const [ax, ay0] = anchor(e.drawX ?? e.x, e.drawY ?? e.y);
    const ay = ay0 - (e.z || 0);
    const fallback = e.kind === 'navi' ? placeholderEnemyNavi : e.kind === 'coil' ? placeholderCoil : placeholderVirus;
    if (e.z > 0) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ax, ay0 - 2, 10, 4, 0, 0, 7); g.fill(); }
    draw.push({ y: e.drawY ?? e.y, fn: () => {
      sprite(g, bank, e.sprite, e.anim, e.animT, ax, ay, fallback, e.palette, e.kind === 'navi');
      if (e.kind === 'coil' && e.discharge > 0 && !bank?.has('eleccoil')) { g.strokeStyle = '#80f0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, FIELD_Y); g.lineTo(ax, FIELD_Y + 3 * PANEL_H); g.stroke(); }
      if (e.guard) { g.fillStyle = 'rgba(200,230,255,.7)'; g.fillRect(ax - 18, ay - 34, 3, 28); }
      if (e.flash) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(ax - 14, ay - 26, 28, 26); g.globalCompositeOperation = 'source-over'; }
      text(g, String(e.hp), ax, ay + 6, '#fff', 'center');
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
        const [ax, ay] = anchor(f.x - 1, f.y);
        for (const k of seq) {
          const fr = frameAt(fx[k], f.t);
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
  for (const f of s.effects) {
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
