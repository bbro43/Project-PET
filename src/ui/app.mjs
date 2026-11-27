import { createBattle, step, pick, unpick, confirmCustom, addCustom, CHIP_DATA, chipBehaviour, canPick, formation, PLAYABLE_FAMILIES, virusName, PLAYABLE_NAVIS, naviVariants, naviBattle } from '../battle/engine.mjs';
import BN6 from '../../data/bn6-viruses.mjs';
import { identify, extractRoms, sha1Hex } from '../rom/gba.mjs';
import { saveRom, loadRom, listRoms } from '../rom/store.mjs';
import { buildBank, pickSources, SOURCE_ORDER } from '../rom/bank.mjs';
import { render, preview } from './render.mjs';

const $ = s => document.querySelector(s);
const release = self.PROJECT_PET_RELEASE;
const PREFS = 'project-pet:prefs';
const prefs = JSON.parse(localStorage.getItem(PREFS) || '{}');
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };

$('#version').textContent = `App ${release.app} · Asset pack ${release.assets}`;
for (const f of PLAYABLE_FAMILIES) $('#family').add(new Option(f, f));
function fillVariants() {
  const f = $('#family').value, keep = $('#variant').value;
  $('#variant').replaceChildren(...BN6.families[f].variants.map((v, i) => new Option(`${virusName(f, i)} · HP ${v.hp}`, i)));
  $('#variant').value = keep && keep < 6 ? keep : 0;
}
for (const n of PLAYABLE_NAVIS) $('#cpu-navi').add(new Option(n, n));
function fillNaviVariants() {
  const keep = $('#cpu-variant').value;
  $('#cpu-variant').replaceChildren(...naviVariants($('#cpu-navi').value).map(v => new Option(`${v.name} · HP ${v.hp}`, v.index)));
  if ([...$('#cpu-variant').options].some(o => o.value === keep)) $('#cpu-variant').value = keep;
}
if (prefs['cpu-navi']) $('#cpu-navi').value = prefs['cpu-navi'];
fillNaviVariants();
$('#cpu-navi').addEventListener('change', fillNaviVariants);
if (prefs.family) $('#family').value = prefs.family;
fillVariants();
$('#family').addEventListener('change', fillVariants);
for (const id of ['navi', 'mode', 'family', 'variant', 'count', 'cpu-navi', 'cpu-variant', 'field']) {
  if (prefs[id]) $('#' + id).value = prefs[id];
  $('#' + id).addEventListener('change', () => { prefs[id] = $('#' + id).value; savePrefs(); syncMenu(); });
}
function syncMenu() {
  $('#formation-wrap').hidden = $('#mode').value !== 'virus';
  $('#navi-wrap').hidden = $('#mode').value !== 'navi';
}
syncMenu();

// ---------- ROMs and sprites ----------
let registry, bank = null;
const registryReady = fetch('./data/registry.json').then(r => r.json()).then(r => (registry = r));

async function refreshRoms() {
  const rank = id => (i => i < 0 ? 99 : i)(SOURCE_ORDER.indexOf(id));
  const roms = (await listRoms().catch(() => [])).sort((a, b) => rank(a.id) - rank(b.id));
  const supported = Object.values((await registryReady).sprites).flatMap(s => Object.keys(s.sources));
  $('#roms').replaceChildren(...roms.map(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title}${r.known ? '' : ' (unrecognised build — offsets may differ)'}${supported.includes(r.id) ? '' : ' — sprites not mapped yet'}`;
    return li;
  }));
  const sel = $('#sprite-source');
  const usable = roms.some(r => supported.includes(r.id));
  sel.replaceChildren(new Option('Placeholder shapes', ''), ...(usable ? [new Option('All imported ROMs', 'all')] : []));
  if (prefs.source && prefs.source !== 'all') { prefs.source = 'all'; savePrefs(); } // 0.31 and earlier stored one ROM id
  sel.value = usable && prefs.source !== '' ? 'all' : '';
  await loadBank();
}

async function loadBank() {
  bank = null;
  const id = $('#sprite-source').value;
  $('#navi-note').textContent = id ? 'Loading sprites…' : 'Placeholder art — import a BN6 ROM for original sprites.';
  if (id) {
    try {
      // Every imported ROM is a source; each sprite comes from the first ROM in SOURCE_ORDER that has it.
      const list = await listRoms().catch(() => []);
      const picked = pickSources(registry, list.map(r => r.id)), need = new Set([...Object.values(picked), picked.$field, picked.$chipart].filter(Boolean));
      const roms = {};
      for (const r of list) if (need.has(r.id)) { const o = await loadRom(r.id); if (o) roms[r.id] = new Uint8Array(o.bytes); }
      bank = buildBank(roms, registry);
      const names = Object.fromEntries(list.map(r => [r.id, r.title.replace('Battle Network ', 'BN')]));
      $('#navi-note').textContent = `Sprites decoded from ${SOURCE_ORDER.filter(id => bank.sources.includes(id)).map(id => names[id]).join(', ')}.`;
    } catch (err) {
      console.error(err);
      $('#navi-note').textContent = 'Could not decode sprites from the imported ROMs.';
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
        if (prefs.source === undefined || prefs.source === null) { prefs.source = 'all'; savePrefs(); }
      }
    } catch (err) { console.error(err); skipped++; }
  }
  status.textContent = `Imported ${added} ROM${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} unrecognised file(s)` : ''}.`;
  event.target.value = '';
  refreshRoms();
});
// TEMP dev splash: hold at least 1.5 s, close once ROM sprites are ready (tap to skip).
const splashShown = performance.now();
function closeSplash() {
  const el = $('#splash');
  if (!el || el.classList.contains('done')) return;
  el.classList.add('done');
  setTimeout(() => el.remove(), 400);
}
$('#splash').addEventListener('click', closeSplash);
refreshRoms().catch(console.error).finally(() => {
  $('#splash-note').textContent = 'Ready';
  setTimeout(closeSplash, Math.max(0, 1500 - (performance.now() - splashShown)));
});

// ---------- battle loop ----------
let state = null, last = 0, acc = 0, raf = 0;
const held = new Set(), pressed = new Set();
const screen = $('#screen').getContext('2d');

function start() {
  const mode = $('#mode').value;
  const enemies = mode === 'navi' ? naviBattle($('#cpu-navi').value, +$('#cpu-variant').value)
    : formation($('#family').value, +$('#variant').value, +$('#count').value);
  state = createBattle({ mode: mode === 'navi' ? 'virus' : mode, enemies, field: $('#field').value, seed: (Date.now() & 0x7fffffff) });
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

// Development hook: open the app with #debug to inspect or adjust the running battle from the console.
if (location.hash === '#debug') self.__pet = { state: () => state };

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
// Chip icons and pictures are decoded from the ROM (bank.chips); without one, text only.
let focus = 0;
function chipCanvas(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  if (img) c.getContext('2d').drawImage(img, 0, 0);
  return c;
}
function showInfo(c) {
  const d = c && CHIP_DATA[c.name], pic = $('#chip-pic').getContext('2d');
  pic.clearRect(0, 0, 56, 48);
  if (!c) { $('#chip-name').textContent = ''; $('#chip-stats').textContent = ''; $('#chip-note').textContent = ''; return; }
  const img = bank?.chips?.picture(d?.id);
  if (img) pic.drawImage(img, 0, 0);
  $('#chip-name').textContent = `${c.name} ${c.code}`;
  const parts = [];
  if (d?.damage && chipBehaviour(c.name)?.kind !== 'busterup') parts.push(d.damage);
  if (d && d.element !== 'none') parts.push(d.element);
  if (d) parts.push(`${d.mb} MB`, d.class);
  $('#chip-stats').textContent = parts.join(' · ');
  $('#chip-note').textContent = chipBehaviour(c.name) ? '' : 'Effect not in yet';
}
function showCustom() {
  $('#custom').hidden = state.phase !== 'custom';
  if (state.phase !== 'custom') return;
  $('#hand').replaceChildren(...state.hand.map((c, i) => {
    const b = document.createElement('button');
    const icon = bank?.chips?.icon(CHIP_DATA[c.name]?.id);
    if (icon) b.append(chipCanvas(icon, 16, 16));
    else { const n = document.createElement('b'); n.textContent = c.name; b.append(n); }
    const code = document.createElement('span'); code.textContent = c.code; b.append(code);
    b.className = state.picked.includes(i) ? 'picked' : '';
    b.disabled = !state.picked.includes(i) && !canPick(state, i);
    b.title = c.name;
    b.addEventListener('click', () => { focus = i; pick(state, i); showCustom(); });
    b.addEventListener('pointerenter', () => showInfo(c));
    return b;
  }));
  showInfo(state.hand[Math.min(focus, state.hand.length - 1)]);
  $('#queue').textContent = state.picked.length ? 'Selected: ' + state.picked.map(i => `${state.hand[i].name} ${state.hand[i].code}`).join(', ') : 'Pick chips, press OK, or Add for 5 more next turn.';
}
$('#undo').addEventListener('click', () => { unpick(state); showCustom(); });
$('#ok').addEventListener('click', () => { focus = 0; confirmCustom(state); showCustom(); });
$('#add').addEventListener('click', () => { focus = 0; addCustom(state); showCustom(); });

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
