import { createBattle, step, pick, unpick, confirmCustom, addCustom, DEFAULT_FOLDER, CHIP_DATA, chipBehaviour, canPick, formation, PLAYABLE_FAMILIES, virusName, PLAYABLE_NAVIS, naviVariants, naviBattle, shuffleHand, DELETE, BANNER } from '../battle/engine.mjs';
import BN6 from '../../data/bn6-viruses.mjs';
import { identify, extractRoms, sha1Hex } from '../rom/gba.mjs';
import { saveRom, loadRom, listRoms } from '../rom/store.mjs';
import { buildBank, pickSources, SOURCE_ORDER } from '../rom/bank.mjs';
import { render, preview } from './render.mjs';
import { createFolderUI, loadFolders, equippedFolder, equippedRegular, equippedTag } from './folder.mjs';
import { createNaviCustUI, loadNaviCust, naviStats } from './navicust.mjs';
import { createStatusUI } from './status.mjs';

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
      const picked = pickSources(registry, list.map(r => r.id)), need = new Set([...Object.values(picked), picked.$field, picked.$chipart, picked.$customscreen, picked.$menus].filter(Boolean));
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
  state = createBattle({ mode: mode === 'navi' ? 'virus' : mode, enemies, field: $('#field').value, seed: (Date.now() & 0x7fffffff), intro: true, folder: equippedFolder(folders), regular: regularThatFits(folders), tag: equippedTag(folders), navi: naviStats(navi) });
  $('#menu').hidden = true; $('#battle').hidden = false;
  showCustom();
  last = performance.now(); acc = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
// ---------- chip folder (CHIP FOLDER / FOLDER EDIT from the BN6 ROM) ----------
const folders = loadFolders(DEFAULT_FOLDER);
// ---------- Navi Customizer (NAVICUSTOMIZER from the BN6 ROM) ----------
const navi = loadNaviCust();
// The menu screens (chip folder, Navi Customizer) share the battle canvas and the pad.
let folderOpen = false, screenUI = null;
// The Regular only counts if it still fits the Regular memory (RegUP parts can be removed).
const regularThatFits = f => { const i = equippedRegular(f), c = equippedFolder(f)[i]; return i != null && c && (CHIP_DATA[c[0]]?.mb ?? 99) <= naviStats(navi).reg ? i : null; };
const folderUI = createFolderUI({ getBank: () => bank, folders, onExit: () => quit(), limits: () => naviStats(navi) });
const naviUI = createNaviCustUI({ getBank: () => bank, navi, onExit: () => quit() });
const statusUI = createStatusUI({ getBank: () => bank, navi, stats: () => naviStats(navi), onExit: () => quit() });
const menuButtons = on => document.querySelectorAll('.menu-only').forEach(b => { b.hidden = !on; });
function openScreen(ui) {
  folderOpen = true; screenUI = ui; state = null; menuButtons(true);
  $('#menu').hidden = true; $('#battle').hidden = false; $('#custom').hidden = true;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(folderFrame);
}
const openFolder = () => openScreen(folderUI);
function folderFrame() {
  for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'select', 'start']) if (pressed.has(k)) screenUI.input(k, held);
  pressed.clear();
  screenUI.draw(screen);
  raf = requestAnimationFrame(folderFrame);
}
$('#folder-btn').addEventListener('click', openFolder);
$('#navicust-btn').addEventListener('click', () => openScreen(naviUI));
$('#status-btn').addEventListener('click', () => openScreen(statusUI));
$('#screen').addEventListener('click', ev => {
  if (!folderOpen) return;
  const r = $('#screen').getBoundingClientRect();
  screenUI.tap((ev.clientX - r.left) * 240 / r.width, (ev.clientY - r.top) * 160 / r.height);
});
function quit() {
  folderOpen = false; menuButtons(false);
  cancelAnimationFrame(raf); state = null;
  $('#battle').hidden = true; $('#menu').hidden = false; $('#custom').hidden = true;
}
$('#start').addEventListener('click', start);
$('#quit').addEventListener('click', quit);

function inputForTick() {
  const order = ['up', 'down', 'left', 'right'];
  const dir = order.find(k => pressed.has(k)) || order.find(k => held.has(k)) || null;
  // As in the game: B fires the buster (hold to charge), A uses the chip. (The engine calls the buster input `a`.)
  const input = { dir, a: held.has('b') || pressed.has('b'), b: pressed.has('a'), l: pressed.has('l') || pressed.has('r') };
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
    if (wasCustom && romCustom()) { for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'r', 'l']) if (pressed.has(k)) customInput(k); pressed.clear(); }
    step(state, state.phase === 'custom' ? {} : inputForTick());
    if (!wasCustom && state.phase === 'custom') showCustom();
  }
  // Owner: 3 seconds after YOU WIN! (it shows once the deletions and ENEMY DELETED! are done) or "MegaMan deleted...", back to the menu.
  const shown = state.phase === 'win' ? DELETE.hold + DELETE.fade + BANNER.deleted : state.phase === 'lose' ? 0 : null;
  if (shown !== null && state.phaseT >= shown + 180) { quit(); return; }
  render(screen, state, bank);
  if (state.phase === 'custom' && romCustom()) drawCustom(screen);
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
// With a ROM: the game's own custom window, drawn over the left half of the battle screen like the game
// (frame, chip picture, code letter, element, damage, 10 slots, selected column, OK).
// Control: D-pad moves the cursor, A picks (or confirms on OK), B takes the last chip back, R = Add.
// Tapping works too: tap a chip to look at it, tap it again to pick it; tap OK.
const CLASS = { standard: 0, mega: 1, giga: 2 };
const CODE_INDEX = c => c === '*' ? 26 : c.charCodeAt(0) - 65;
const ELEMENT_INDEX = { fire: 0, aqua: 1, elec: 2, wood: 3, plus: 4, sword: 5, cursor: 6, obstacle: 7, wind: 8, break: 9, none: 10 };
const romCustom = () => !!(bank?.custom && bank?.chips);
const slotXY = i => { const S = bank.custom.layout.slots; return [S.icon[0] + (i % S.perRow) * S.dx, S.icon[1] + (i / S.perRow | 0) * S.dy]; };
function drawCustom(g) {
  const cu = bank.custom, L = cu.layout, S = L.slots;
  const shown = focus === 'ok' ? null : state.hand[Math.min(focus, state.hand.length - 1)], d = shown && CHIP_DATA[shown.name];
  const cls = Math.min(3, CLASS[d?.class] ?? 0);
  g.save(); g.imageSmoothingEnabled = false; g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#e8f0f8'; g.fillRect(0, 0, 120, 160);
  g.fillStyle = '#282828'; g.fillRect(7, 8, 74, 80);
  const box = (x, y) => { g.fillStyle = '#98a8b8'; g.fillRect(x, y, 16, 16); g.fillStyle = '#585868'; g.fillRect(x + 1, y + 1, 14, 14); g.fillStyle = '#282828'; g.fillRect(x + 2, y + 2, 12, 12); };
  for (let i = 0; i < Math.min(S.count, state.hand.length); i++) box(...slotXY(i));
  g.drawImage(cu.frame(cls), 0, 0);
  g.drawImage(cu.column(cls), L.column[0], L.column[1]);
  if (d) {
    const pic = bank.chips.picture(d.id); if (pic) g.drawImage(pic, L.picture[0], L.picture[1]);
    g.font = 'bold 11px "Courier New", monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
    const w = g.measureText(shown.name).width, sx = Math.min(1, 62 / w);
    g.save(); g.translate(L.name[0] + 1, L.name[1] + 3); g.scale(sx, 1);
    g.fillStyle = '#404040'; g.fillText(shown.name, 1, 1); g.fillStyle = '#f8f8f8'; g.fillText(shown.name, 0, 0); g.restore();
    g.drawImage(cu.letter(CODE_INDEX(shown.code), cls), L.code[0], L.code[1]);
    g.drawImage(cu.element(ELEMENT_INDEX[d.icon] ?? 10, cls), L.element[0], L.element[1]);
    const dmg = d.damage && chipBehaviour(shown.name)?.kind !== 'busterup' ? String(d.damage).slice(-L.damage[2]) : '';
    for (let k = 0; k < dmg.length; k++) g.drawImage(cu.digit(+dmg[k], cls), L.damage[0] + (L.damage[2] - dmg.length + k) * 8, L.damage[1]);
  }
  state.hand.forEach((c, i) => {
    if (i >= S.count) return;
    const [x, y] = slotXY(i), icon = bank.chips.icon(CHIP_DATA[c.name]?.id);
    if (icon) g.drawImage(icon, x, y);
    g.drawImage(cu.code(CODE_INDEX(c.code), 0), x, y + (S.code[1] - S.icon[1]));
    if (state.picked.includes(i)) { g.fillStyle = 'rgba(20,20,20,.65)'; g.fillRect(x, y, 16, 24); }
    else if (!canPick(state, i)) { g.fillStyle = 'rgba(40,40,40,.4)'; g.fillRect(x, y, 16, 24); }
  });
  state.picked.forEach((hi, k) => { const icon = bank.chips.icon(CHIP_DATA[state.hand[hi].name]?.id); if (icon) g.drawImage(icon, L.selected[0], L.selected[1] + k * L.selected[2]); });
  // cursor: corner brackets (app-drawn)
  const [cx, cy, cw, ch] = focus === 'ok' ? L.ok : [...slotXY(focus), 16, 24];
  const blink = (performance.now() >> 8) & 1, k = 4;
  g.fillStyle = blink ? '#f84020' : '#f8a828';
  for (const [px, py, sx2, sy2] of [[cx - 2, cy - 2, 1, 1], [cx + cw + 1, cy - 2, -1, 1], [cx - 2, cy + ch + 1, 1, -1], [cx + cw + 1, cy + ch + 1, -1, -1]]) {
    g.fillRect(Math.min(px, px + sx2 * k), py - (sy2 < 0 ? 1 : 0), k + 1, 2);
    g.fillRect(px - (sx2 < 0 ? 1 : 0), Math.min(py, py + sy2 * k), 2, k + 1);
  }
  g.restore();
}
// D-pad / A / B / R on the custom screen
function customInput(k) {
  const n = Math.min(state.hand.length, bank.custom.layout.slots.count), per = bank.custom.layout.slots.perRow;
  if (k === 'a') { if (focus === 'ok') { focus = 0; confirmCustom(state); } else pick(state, focus); }
  else if (k === 'b') unpick(state);
  else if (k === 'r') { focus = 0; addCustom(state); }
  else if (k === 'l') { if (shuffleHand(state)) focus = 0; } // ChpShufl: shuffle the chips once
  else if (focus === 'ok') { if (k === 'left') focus = Math.max(0, Math.min(n - 1, per - 1)); }
  else {
    const row = focus / per | 0, col = focus % per;
    if (k === 'right') focus = col === per - 1 || focus + 1 >= n ? 'ok' : focus + 1;
    else if (k === 'left') focus = col > 0 ? focus - 1 : focus;
    else if (k === 'down' && focus + per < n) focus += per;
    else if (k === 'down' && row === 0 && n > per) focus = n - 1;
    else if (k === 'up' && row > 0) focus -= per;
  }
  showCustom();
}
function custHit(ev) {
  if (state?.phase !== 'custom' || !romCustom()) return;
  const r = $('#screen').getBoundingClientRect(), x = (ev.clientX - r.left) * 240 / r.width, y = (ev.clientY - r.top) * 160 / r.height;
  const [ox, oy, ow, oh] = bank.custom.layout.ok;
  if (x >= ox && x < ox + ow && y >= oy && y < oy + oh) { if (focus === 'ok') { focus = 0; confirmCustom(state); } else focus = 'ok'; showCustom(); return; }
  for (let i = 0; i < Math.min(state.hand.length, bank.custom.layout.slots.count); i++) {
    const [sx, sy] = slotXY(i);
    if (x >= sx && x < sx + 16 && y >= sy && y < sy + 24) { if (focus === i) pick(state, i); focus = i; showCustom(); return; }
  }
}
$('#screen').addEventListener('click', custHit);
function showCustom() {
  $('#custom').hidden = state.phase !== 'custom';
  if (state.phase !== 'custom') return;
  if (romCustom()) { $('#custom').hidden = true; if (focus !== 'ok') focus = Math.max(0, Math.min(focus, state.hand.length - 1)); return; } // drawn on the battle screen each frame
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
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', x: 'a', X: 'a', z: 'b', Z: 'b', c: 'select', C: 'select', Shift: 'select', Enter: 'start', a: 'l', A: 'l', s: 'r', S: 'r' };
addEventListener('keydown', e => {
  if (folderOpen && KEYS[e.key]) { e.preventDefault(); press(KEYS[e.key]); return; } // repeats scroll the lists
  if (!state || !KEYS[e.key]) return;
  e.preventDefault();
  if (state.phase === 'custom' && !romCustom() && (e.key === 'Enter' || KEYS[e.key] === 'a')) return;
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
