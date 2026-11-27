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

// Viruses. HP/attack are recalled BN values; behaviour timings partly from animations.
export const VIRUSES = {
  Mettaur:  { sprite: 'mettaur', hp: 40,  wave: 10, confidence: 'recalled' },
  Mettaur2: { sprite: 'mettaur', hp: 80,  wave: 30, confidence: 'recalled', note: 'drawn with Mettaur palette until variant palettes are traced' },
  Mettaur3: { sprite: 'mettaur', hp: 120, wave: 50, confidence: 'recalled', note: 'drawn with Mettaur palette until variant palettes are traced' },
};

export const METTAUR = {
  attackTicks: v(38, 'rom-verified', 'candidate attack sequence 1 total'),
  waveSpawnTick: v(24, 'unverified', 'tick within attack when the shockwave leaves'),
  waveStepTicks: v(8, 'unverified', 'ticks per panel for ShockWave travel'),
  thinkTicks: v(40, 'unverified', 'pause between moves/attacks'),
  takeTurns: v(true, 'recalled', 'only one Mettaur attacks at a time'),
};
