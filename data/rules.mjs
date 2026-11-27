// Battle rules for the BN6 ruleset. Every number carries a confidence tag:
//   rom-verified     measured from ROM data (e.g. animation tick counts)
//   recalled         well-known published value, not yet checked in the ROM
//   unverified       estimate/placeholder that must be traced in-game
// Animation-derived timings come from the decoded MegaMan/Mettaur sequences.
export const RULESET = 'bn6';

const v = (value, confidence, note = '') => ({ value, confidence, note });

export const RULES = {
  tickRate: v(60, 'recalled', 'GBA ~59.73 Hz; simulation uses 60'),
  field: v({ cols: 6, rows: 3, playerCols: 3 }, 'recalled'),
  megamanHp: v(100, 'recalled', 'BN6 starting HP'),
  busterDamage: v(1, 'recalled', 'Attack level 1'),
  busterCooldown: v(10, 'rom-verified', 'sum of candidate buster sequence 9 ticks (4+1+1+4)'),
  chargeShotDamage: v(10, 'recalled', '10 × Attack level'),
  chargeDelay: v(16, 'unverified', 'ticks A must be held before charging starts'),
  chargeTime: v(100, 'unverified', 'ticks to full charge at Charge level 1'),
  moveVanishTicks: v(4, 'rom-verified', 'candidate vanish sequence 4 = 1+1+1+1'),
  moveAppearTicks: v(4, 'rom-verified', 'candidate appear sequence 3 = 1+1+1+1'),
  flinchTicks: v(28, 'rom-verified', 'candidate flinch sequence 1 = 4+2+2+2+2+4+5+3 (fits observed hitstun feel; trace pending)'),
  invincibleTicks: v(120, 'unverified', 'post-hit invincibility'),
  customGaugeTicks: v(512, 'unverified', 'time for custom gauge to fill'),
  handSize: v(5, 'recalled', 'Custom 1 draws 5 chips'),
  maxSelect: v(5, 'recalled'),
  folderSize: v(30, 'recalled'),
};

export const val = key => RULES[key].value;

// Chips: damage values are the commonly published BN6 numbers (recalled).
export const CHIPS = {
  Cannon:    { damage: 40, kind: 'shot', element: 'none', anim: 'cannon', lock: 30, confidence: 'recalled' },
  HiCannon:  { damage: 60, kind: 'shot', element: 'none', anim: 'cannon', lock: 30, confidence: 'recalled' },
  MegCannon: { damage: 80, kind: 'shot', element: 'none', anim: 'cannon', lock: 30, confidence: 'recalled' },
  AirShot:   { damage: 20, kind: 'shot', element: 'wind', anim: 'buster', push: true, lock: 16, confidence: 'recalled' },
  Sword:     { damage: 80, kind: 'slash', area: [[1, 0]], element: 'sword', anim: 'slash', lock: 24, confidence: 'recalled' },
  WideSwrd:  { damage: 80, kind: 'slash', area: [[1, -1], [1, 0], [1, 1]], element: 'sword', anim: 'slash', lock: 24, confidence: 'recalled' },
  LongSwrd:  { damage: 100, kind: 'slash', area: [[1, 0], [2, 0]], element: 'sword', anim: 'slash', lock: 24, confidence: 'recalled' },
  MiniBomb:  { damage: 50, kind: 'throw', range: 3, element: 'none', anim: 'throw', lock: 22, flight: 30, confidence: 'recalled' },
  Recov30:   { heal: 30, kind: 'heal', element: 'none', anim: 'idle', lock: 10, confidence: 'recalled' },
  Recov50:   { heal: 50, kind: 'heal', element: 'none', anim: 'idle', lock: 10, confidence: 'recalled' },
};

// Starter folder for testing only — NOT the canonical BN6 default folder.
export const TEST_FOLDER = [
  ['Cannon', 'A'], ['Cannon', 'A'], ['Cannon', 'B'], ['Cannon', 'B'], ['Cannon', 'C'],
  ['HiCannon', 'C'], ['HiCannon', 'D'], ['MegCannon', 'E'],
  ['AirShot', '*'], ['AirShot', '*'], ['AirShot', '*'],
  ['Sword', 'S'], ['Sword', 'S'], ['Sword', 'L'], ['WideSwrd', 'L'], ['WideSwrd', 'S'], ['LongSwrd', 'L'], ['LongSwrd', 'E'],
  ['MiniBomb', 'B'], ['MiniBomb', 'B'], ['MiniBomb', 'L'], ['MiniBomb', 'E'], ['MiniBomb', '*'],
  ['Recov30', 'A'], ['Recov30', 'B'], ['Recov30', 'L'], ['Recov50', 'A'], ['Recov50', 'L'],
  ['Cannon', 'L'], ['HiCannon', 'L'],
];

// Element weakness (attacker element → element it deals double damage to).
export const WEAKNESS = { aqua: 'fire', elec: 'aqua', wood: 'elec', fire: 'wood' };
export const WEAKNESS_CONFIDENCE = 'recalled';

// Virus AI parameters. HP/element/damage come from data/bn6-viruses.mjs (rom-verified).
// Arrays are indexed by variant (0 base, 1 "2", 2 "3", 3 Ω, 4 Rare, 5 Rare2).
export const AI = {
  Mettaur: {
    thinkTicks: v([30, 24, 18, 12, 18, 12], 'rom-verified', 'per-variant byte table 0x109F46 read by the Mettaur AI; used here as the pause between actions (role inferred)'),
    attackTicks: v(38, 'rom-verified', 'attack sequence 1 total'),
    waveSpawnTick: v(30, 'unverified', 'inferred: pickaxe reaches the ground after frames 1+1+1+3+8+4+9+3'),
    waveStepTicks: v([26, 17, 12, 12, 17, 12], 'unverified', 'inferred: one loop of ShockWave sequence slow/medium/fast per panel'),
    takeTurns: v(true, 'recalled', 'only one Mettaur attacks at a time'),
  },
  Champy: {
    thinkTicks: v(70, 'unverified'),
    readyTicks: v(10, 'rom-verified', 'ready sequence 1 = 5+5'),
    punchTicks: v(15, 'rom-verified', 'punch sequence 4 = 3+2+2+5+3'),
    punchHitTick: v(7, 'unverified', 'fist extends on frame 3'),
    returnTicks: v(20, 'unverified'),
    behaviour: v('warps to the panel in front of MegaMan, punches, warps home', 'recalled'),
  },
  Gunner: {
    thinkTicks: v(60, 'unverified'),
    aimTicks: v(24, 'rom-verified', 'aim sequence 1 = 2+2+20'),
    trackTicks: v(90, 'unverified', 'crosshair follows MegaMan before locking'),
    trackStepTicks: v(14, 'unverified', 'crosshair panel step while tracking (search loop is 7+7)'),
    lockTicks: v(10, 'rom-verified', 'lock sequence 1 = 5+5'),
    shots: v(3, 'unverified'),
    shotEveryTicks: v(5, 'unverified', 'fire loop 1+1+1+2+2+1+1+1+2+2 = 14 ticks'),
    recoverTicks: v(8, 'rom-verified', 'recover sequence 3 = 4+4'),
    behaviour: v('crosshair tracks MegaMan, locks on, Gunner fires a burst at that panel', 'recalled'),
  },
};

// Navi AI parameters (BN6). Arrays indexed by variant: 0 base, 1 EX, 2 SP, 3 RV, 4 BX
// (the ROM tables have 4 entries; RV and BX share the last).
// Source: dism-exe/bn6f disassembly of the Navi AI routines, values read from the Falzar ROM.
export const NAVI_AI = {
  ElecMan: {
    waitTicks: v([40, 30, 25, 20, 20], 'rom-verified', 'table 0x80F3BAC used as wait before ThunderBolt/beam (role inferred)'),
    choice: v({ thunderbolt: [0, 4], beam: [4, 6], heavy: [6, 8], move: [8, 16] }, 'rom-verified', 'RNG & 15 thresholds in decision routine 0x80F3A24'),
    specialEvery: v(4, 'rom-verified', 'counter reaches 3 → attack 0xA (shape not decoded; treated as a move)'),
    thunderboltDamage: v([40, 80, 110, 110, 110], 'rom-verified', 'damage table 0x80F3C68'),
    thunderboltDelay: v(30, 'rom-verified', 'marker → strike wait 0x1E in attack 0xB'),
    beamDamage: v([40, 80, 110, 110, 110], 'rom-verified', 'damage table 0x80F3C70'),
    beamChargeTicks: v(32, 'rom-verified', 'attack uses anim 0x12 with timers 12 + 20'),
    heavyDamage: v([80, 160, 220, 220, 220], 'rom-verified', 'damage table 0x80F3C78; attack 0xD shape not decoded (treated as a move)'),
    moveTicks: v(4, 'unverified', 'vanish/appear frames'),
    shapes: v('ThunderBolt = marker then vertical bolt on MegaMan\'s panel; beam = horizontal bolt along ElecMan\'s row', 'unverified', 'inferred from animations and the bolt sprite'),
  },
  ProtoMan: {
    waitTicks: v([20, 16, 14, 12, 12], 'rom-verified', 'table 0x80FBD00 (wait between actions, role inferred)'),
    readyTicks: v([16, 14, 12, 10, 10], 'rom-verified', 'table 0x80FBD28 (ready pose before swing, role inferred)'),
    warpTicks: v(3, 'rom-verified', 'vanish 3 / appear 3 in attack routines'),
    preReadyTicks: v(8, 'rom-verified', 'wait after appearing'),
    recoverTicks: v(30, 'rom-verified', 'hold after swing (0x1E)'),
    hitTick: v(10, 'unverified', 'frame of swing when the hit lands'),
    wideDamage: v([100, 150, 150, 220, 220], 'rom-verified', 'attack 0xA, table 0x80FBFFC'),
    guardDamage: v([70, 100, 100, 150, 150], 'rom-verified', 'attack 0xB counter, table 0x80FC004'),
    longDamage: v([90, 130, 130, 200, 200], 'rom-verified', 'attack 0xC, table 0x80FC00C'),
    bothDamage: v([150, 220, 220, 330, 330], 'rom-verified', 'attack 0xD, table 0x80FC014'),
    deltaDamage: v([80, 120, 120, 180, 180], 'rom-verified', 'attack 0xE, table 0x80FC01C'),
    pattern: v('base: move 2–4 times (counter += 1–2 until ≥4), then WideSword (75% to repeat once) else LongSword; every 3rd cycle both swords. ≤50% HP: adds multi-warp slash. EX+ also guards.', 'rom-verified', 'decision routines 0x80FBA24/0x80FBA9A/0x80FBB34; phase-2 details simplified'),
    shapes: v('WideSword = column in front (3 rows); LongSword = 2 panels ahead; 0xD = both; 0xE = repeated step-in slashes', 'unverified', 'inferred from sword effects 0x25/0x27 and hit-shape arguments'),
    guardTicks: v(60, 'unverified'),
  },
};
