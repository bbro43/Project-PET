import { createBattle, step, pick, unpick, confirmCustom, canPick, FORMATIONS } from '../battle/engine.mjs';
import { CHIPS } from '../../data/rules.mjs';
import { identify, extractRoms, sha1Hex } from '../rom/gba.mjs';
import { saveRom, loadRom, listRoms } from '../rom/store.mjs';
import { buildBank } from '../rom/bank.mjs';
import { render, preview } from './render.mjs';

const $ = s => document.querySelector(s);
const release = self.PROJECT_PET_RELEASE;
const PREFS = 'project-pet:prefs';
const prefs = JSON.parse(localStorage.getItem(PREFS) || '{}');
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };

$('#version').textContent = `App ${release.app} · Asset pack ${release.assets}`;
for (const [id, f] of Object.entries(FORMATIONS)) $('#formation').add(new Option(f.label, id));
for (const id of ['navi', 'mode', 'formation']) {
  if (prefs[id]) $('#' + id).value = prefs[id];
  $('#' + id).addEventListener('change', () => { prefs[id] = $('#' + id).value; savePrefs(); syncMenu(); });
}
function syncMenu() { $('#formation-wrap').hidden = $('#mode').value === 'survival'; }
syncMenu();

// ---------- ROMs and sprites ----------
let registry, bank = null;
const registryReady = fetch('./data/registry.json').then(r => r.json()).then(r => (registry = r));

async function refreshRoms() {
  const roms = await listRoms().catch(() => []);
  const supported = Object.values((await registryReady).sprites).flatMap(s => Object.keys(s.sources));
  $('#roms').replaceChildren(...roms.map(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title}${r.known ? '' : ' (unrecognised build — offsets may differ)'}${supported.includes(r.id) ? '' : ' — sprites not mapped yet'}`;
    return li;
  }));
  const sel = $('#sprite-source');
  sel.replaceChildren(new Option('Placeholder shapes', ''), ...roms.filter(r => supported.includes(r.id)).map(r => new Option(r.title, r.id)));
  sel.value = roms.some(r => r.id === prefs.source) ? prefs.source : '';
  await loadBank();
}

async function loadBank() {
  bank = null;
  const id = $('#sprite-source').value;
  $('#navi-note').textContent = id ? 'Loading sprites…' : 'Placeholder art — import a BN6 ROM for original sprites.';
  if (id) {
    try {
      const rec = await loadRom(id);
      bank = await buildBank(new Uint8Array(rec.bytes), id, registry);
      $('#navi-note').textContent = `Sprites decoded from ${rec.title}.`;
    } catch (err) {
      console.error(err);
      $('#navi-note').textContent = 'Could not decode sprites from this ROM.';
    }
  }
  preview($('#navi-preview').getContext('2d'), bank, $('#navi').value);
}

$('#sprite-source').addEventListener('change', () => { prefs.source = $('#sprite-source').value; savePrefs(); loadBank(); });
$('#rom-input').addEventListener('change', async event => {
  const status = $('#rom-status');
  let added = 0, skipped = 0;
  for (const file of event.target.files) {
    status.textContent = `Reading ${file.name}…`;
    try {
      for (const rom of await extractRoms(new Uint8Array(await file.arrayBuffer()))) {
        const game = identify(rom);
        if (!game) { skipped++; continue; }
        const sha1 = await sha1Hex(rom);
        await saveRom({ id: game.id, code: game.code, title: game.title, sha1, known: sha1 === game.sha1, bytes: rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength) });
        added++;
        if (!prefs.source && game.series === 6) { prefs.source = game.id; savePrefs(); }
      }
    } catch (err) { console.error(err); skipped++; }
  }
  status.textContent = `Imported ${added} ROM${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} unrecognised file(s)` : ''}.`;
  event.target.value = '';
  refreshRoms();
});
refreshRoms();

// ---------- battle loop ----------
let state = null, last = 0, acc = 0, raf = 0;
const held = new Set(), pressed = new Set();
const screen = $('#screen').getContext('2d');

function start() {
  const mode = $('#mode').value;
  state = createBattle({ mode, formation: $('#formation').value, seed: (Date.now() & 0x7fffffff) });
  $('#menu').hidden = true; $('#battle').hidden = false;
  showCustom();
  last = performance.now(); acc = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
function quit() {
  cancelAnimationFrame(raf); state = null;
  $('#battle').hidden = true; $('#menu').hidden = false; $('#custom').hidden = true;
}
$('#start').addEventListener('click', start);
$('#quit').addEventListener('click', quit);

function inputForTick() {
  const order = ['up', 'down', 'left', 'right'];
  const dir = order.find(k => pressed.has(k)) || order.find(k => held.has(k)) || null;
  const input = { dir, a: held.has('a') || pressed.has('a'), b: pressed.has('b'), l: pressed.has('l') || pressed.has('r') };
  pressed.clear();
  return input;
}

function frame(now) {
  acc = Math.min(acc + now - last, 250); last = now;
  while (acc >= 1000 / 60) {
    acc -= 1000 / 60;
    const wasCustom = state.phase === 'custom';
    step(state, state.phase === 'custom' ? {} : inputForTick());
    if (!wasCustom && state.phase === 'custom') showCustom();
  }
  render(screen, state, bank);
  raf = requestAnimationFrame(frame);
}

// ---------- custom screen ----------
function showCustom() {
  $('#custom').hidden = state.phase !== 'custom';
  if (state.phase !== 'custom') return;
  $('#hand').replaceChildren(...state.hand.map((c, i) => {
    const b = document.createElement('button');
    const def = CHIPS[c.name];
    b.innerHTML = `<b>${c.name}</b><span>${def.damage ?? '+' + def.heal}</span><span>${c.code}</span>`;
    b.className = state.picked.includes(i) ? 'picked' : '';
    b.disabled = !state.picked.includes(i) && !canPick(state, i);
    b.addEventListener('click', () => { pick(state, i); showCustom(); });
    return b;
  }));
  $('#queue').textContent = state.picked.length ? 'Selected: ' + state.picked.map(i => `${state.hand[i].name} ${state.hand[i].code}`).join(', ') : 'Pick chips, or press OK with none.';
}
$('#undo').addEventListener('click', () => { unpick(state); showCustom(); });
$('#ok').addEventListener('click', () => { confirmCustom(state); showCustom(); });

// ---------- controls ----------
function press(k) { held.add(k); pressed.add(k); document.querySelectorAll(`[data-k="${k}"]`).forEach(b => b.classList.add('held')); }
function lift(k) { held.delete(k); document.querySelectorAll(`[data-k="${k}"]`).forEach(b => b.classList.remove('held')); }
for (const b of document.querySelectorAll('[data-k]')) {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(k); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => lift(k));
  b.addEventListener('contextmenu', e => e.preventDefault());
}
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', x: 'a', X: 'a', z: 'b', Z: 'b', a: 'l', A: 'l', s: 'r', S: 'r' };
addEventListener('keydown', e => {
  if (!state || !KEYS[e.key]) return;
  e.preventDefault();
  if (state.phase === 'custom' && (e.key === 'Enter' || KEYS[e.key] === 'a')) return;
  if (!e.repeat) press(KEYS[e.key]);
});
addEventListener('keyup', e => { if (KEYS[e.key]) lift(KEYS[e.key]); });
addEventListener('keydown', e => { if (state?.phase === 'custom' && e.key === 'Enter') { confirmCustom(state); showCustom(); } });
addEventListener('blur', () => held.clear());

// ---------- install & updates ----------
let installRequest;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installRequest = e; $('#install-app').hidden = false; });
$('#install-app').addEventListener('click', async () => { const r = installRequest; installRequest = null; $('#install-app').hidden = true; try { await r?.prompt(); } catch {} });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const offer = worker => { $('#banner').hidden = false; $('#reload').onclick = () => worker.postMessage('skipWaiting'); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(err => console.warn('Offline setup failed', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}
