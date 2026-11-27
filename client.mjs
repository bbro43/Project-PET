import { createBattle, pilots, step, TICK_MS } from './shared/combat.mjs';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const pilot = document.querySelector('#pilot');
const mode = document.querySelector('#mode');
const formation = document.querySelector('#formation');
const status = document.querySelector('#status');
const pause = document.querySelector('#pause');
const buttons = [...document.querySelectorAll('[data-action]')];
const keymap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', z: 'fire', x: 'heavy' };
const inputs = new Map();
let battle;
let paused = false;
let elapsed = 0;
let last = performance.now();

try {
  const saved = localStorage.getItem('signal-yard.pilot.v1');
  if (Object.hasOwn(pilots, saved)) pilot.value = saved;
} catch { /* Persistence is optional when browser storage is disabled. */ }

pilot.addEventListener('change', () => {
  try { localStorage.setItem('signal-yard.pilot.v1', pilot.value); }
  catch { /* The current selection still works in this session. */ }
});
mode.addEventListener('change', () => { formation.hidden = mode.value !== 'formation'; });
document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  battle = createBattle(pilot.value, mode.value, Number(document.querySelector('#count').value));
  setPause(false);
});
pause.addEventListener('click', () => {
  if (battle && !battle.outcome) setPause(!paused);
});

function updateButtons() {
  for (const button of buttons) button.toggleAttribute('data-held', [...inputs.values()].includes(button.dataset.action));
}
function setPause(value) {
  paused = value;
  inputs.clear();
  updateButtons();
  pause.textContent = paused ? 'Resume' : 'Pause';
}
window.addEventListener('blur', () => setPause(Boolean(battle && !battle.outcome)));
window.addEventListener('keydown', event => {
  const action = keymap[event.key];
  if (!action || !battle || event.target.closest?.('select, input')) return;
  event.preventDefault();
  if (!paused) inputs.set(event.code, action);
  updateButtons();
});
window.addEventListener('keyup', event => {
  inputs.delete(event.code);
  updateButtons();
});
for (const button of buttons) {
  button.addEventListener('pointerdown', event => {
    if (paused || !battle) return;
    button.setPointerCapture(event.pointerId);
    inputs.set(event.pointerId, button.dataset.action);
    updateButtons();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      inputs.delete(event.pointerId);
      updateButtons();
    });
  }
}
function rect(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}
function draw() {
  rect(0, 0, 576, 246, '#201c2a');
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 6; x++) {
      rect(18 + x * 91, 42 + y * 59, 85, 52, x < 3 ? '#275951' : '#6e453b');
      rect(18 + x * 91, 90 + y * 59, 85, 4, x < 3 ? '#69bfaa' : '#dd9069');
    }
  }
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  if (!battle) {
    ctx.fillStyle = pilots[pilot.value].color;
    ctx.fillText(pilots[pilot.value].name, 288, 26);
    return;
  }
  for (const actor of [battle.player, ...battle.enemies]) {
    if (!actor.hp) continue;
    const x = 60 + actor.x * 91;
    const y = 65 + actor.y * 59;
    rect(x - 13, y - 12, 26, 23, actor === battle.player ? actor.color : '#ffd293');
    rect(x - 11, y - 17, 22, 7, '#eee2ff');
    rect(x + actor.side * 10 - 3, y - 7, 7, 13, actor.shot ? '#fff' : '#201c2a');
    ctx.fillStyle = '#fff';
    ctx.fillText(actor.hp, x, y + 25);
  }
  for (const shot of battle.projectiles) {
    rect(49 + shot.x * 91, 62 + shot.y * 59, 22, 6, shot.side > 0 ? '#c1ffe9' : '#ffaf91');
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(battle.player.name + ' / ' + battle.player.hp + ' HP', 288, 25);
}
function frame(now) {
  elapsed += Math.min(100, now - last);
  last = now;
  while (elapsed >= TICK_MS) {
    if (battle && !paused) {
      const held = [...inputs.values()];
      step(battle, {
        direction: held.findLast(action => ['up', 'down', 'left', 'right'].includes(action)),
        fire: held.includes('fire'),
        heavy: held.includes('heavy'),
      });
    }
    elapsed -= TICK_MS;
  }
  draw();
  const message = !battle ? 'Choose a pilot and start a battle.' :
    battle.outcome || (paused ? 'Paused' : battle.mode === 'survival' ?
      'Wave ' + battle.wave + ' · Cleared ' + battle.cleared + ' · Defeated ' + battle.kills : 'Battle in progress');
  if (message !== status.textContent) status.textContent = message;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const installButton = document.querySelector('#install-app');
let installRequest;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installRequest = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installRequest) return;
  const request = installRequest;
  installRequest = undefined;
  installButton.hidden = true;
  try {
    await request.prompt();
  } catch {
    // Installation remains available from the browser menu where supported.
  }
});
window.addEventListener('appinstalled', () => {
  installRequest = undefined;
  installButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(error => {
    console.warn('Signal Yard offline setup failed', error);
  });
}
