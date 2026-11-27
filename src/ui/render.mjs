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

function sprite(g, bank, key, anim, t, x, y, fallback, palette = 0) {
  const seqs = bank?.get(key, palette);
  const frames = seqs?.[anim] || seqs?.idle;
  if (frames) {
    const f = frameAt(frames, t);
    g.drawImage(f.image, Math.round(x - f.originX), Math.round(y - f.originY));
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
  const bg = g.createLinearGradient(0, 0, 0, FIELD_Y);
  bg.addColorStop(0, '#062048'); bg.addColorStop(1, '#0f4a7a');
  g.fillStyle = bg; g.fillRect(0, 0, 240, 160);
  panels(g);

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
    const [ax, ay] = anchor(e.x, e.y);
    draw.push({ y: e.y, fn: () => {
      sprite(g, bank, e.sprite, e.anim, e.animT, ax, ay, e.kind === 'navi' ? placeholderEnemyNavi : placeholderVirus, e.palette);
      if (e.guard) { g.fillStyle = 'rgba(200,230,255,.7)'; g.fillRect(ax - 18, ay - 34, 3, 28); }
      if (e.flash) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(ax - 14, ay - 26, 28, 26); g.globalCompositeOperation = 'source-over'; }
      text(g, String(e.hp), ax, ay + 6, '#fff', 'center');
    } });
  }
  draw.sort((a, b) => a.y - b.y).forEach(d => d.fn());

  // ElecMan ThunderBolt marker (drawn as a flashing panel outline; the game's marker sprite isn't mapped yet)
  for (const e of s.enemies) if (e.hp > 0 && e.target?.kind === 'marker') {
    const px = e.target.x * PANEL_W, py = FIELD_Y + e.target.y * PANEL_H;
    g.strokeStyle = (e.target.t >> 2) & 1 ? '#ffe040' : '#fff'; g.lineWidth = 2;
    g.strokeRect(px + 2, py + 2, PANEL_W - 4, PANEL_H - 6);
  }
  const bolt = bank?.get('elecbolt');
  for (const f of s.effects) {
    if ((f.kind === 'bolt-v' || f.kind === 'bolt-h') && f.t < 12) {
      const [ax, ay] = anchor(f.x, f.y);
      if (bolt) {
        const img = frameAt(bolt[f.kind === 'bolt-v' ? 'vertical' : 'horizontal'], f.t).image;
        if (f.kind === 'bolt-v') g.drawImage(img, Math.round(ax - img.width / 2), Math.round(ay - img.height));
        else g.drawImage(img, Math.round(ax + 20 - img.width), Math.round(ay - 16 - img.height / 2));
      } else {
        g.strokeStyle = '#ffe860'; g.lineWidth = 3; g.beginPath();
        if (f.kind === 'bolt-v') { g.moveTo(ax, 0); g.lineTo(ax - 5, ay - 30); g.lineTo(ax + 4, ay - 18); g.lineTo(ax, ay); }
        else { g.moveTo(ax + 20, ay - 14); for (let x = ax; x > -20; x -= 12) g.lineTo(x, ay - 14 + ((x / 12) & 1 ? -5 : 5)); }
        g.stroke();
      }
    }
    if (f.kind === 'slash' && f.t < 10) {
      const cells = { wide: [[-1, -1], [-1, 0], [-1, 1]], long: [[-1, 0], [-2, 0]], both: [[-1, -1], [-1, 0], [-1, 1], [-2, 0]], sword: [[-1, 0]] }[f.area];
      g.strokeStyle = 'rgba(255,140,230,.9)'; g.lineWidth = 3;
      for (const [dx, dy] of cells) {
        const [ax, ay] = anchor(f.x + dx, f.y + dy);
        if (f.y + dy < 0 || f.y + dy > 2) continue;
        g.beginPath(); g.arc(ax + 10, ay - 12, 14, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
      }
    }
    if (f.kind === 'guard' && f.t < 10) {
      const [ax, ay] = anchor(f.x, f.y);
      g.fillStyle = 'rgba(200,230,255,.8)'; g.fillRect(ax - 16, ay - 34, 4, 28);
    }
  }
  const target = bank?.get('target');
  for (const e of s.enemies) if (e.hp > 0 && e.target && e.target.kind !== 'marker') {
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
  if (s.mode !== 'survival') s.enemies.filter(e => e.hp > 0).forEach((e, i) => text(g, e.name, 237, 12 + i * 9, '#fff', 'right'));
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
