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
    decision: v({ coilEvery: 4, bolt: [0, 4], storm: [4, 6], dash: [6, 8], move: [8, 16] }, 'rom-verified', 'decision routine 0x80F3A24: counter → attack 0xA every 4th decision; else RNG & 15'),
    attackWait: v([40, 30, 25, 20, 20], 'rom-verified', 'post-attack wait tables 0x80F3BAC/BD0/BF4 (bolt, storm, coil swap)'),
    dashWait: v([60, 60, 40, 30, 30], 'rom-verified', 'post-dash wait table 0x80F3C18'),
    moveWait: v(30, 'rom-verified', 'post-move wait table 0x80F3B88'),
    glideTicks: v(12, 'unverified', 'glide duration between panels (velocity helper 0x80F46A4 not decoded)'),
    // ThunderBolt row lightning (attack 0xB, object type3 0x1E)
    boltCharge: v(30, 'rom-verified', 'aura (type4 0x31 param 5) then strike after 0x1E frames'),
    boltActive: v(72, 'rom-verified', 'lightning object lifetime 0x48 (table 0x80C8068)'),
    boltDamage: v([40, 80, 110, 110, 110], 'rom-verified', 'damage table 0x80F3C68'),
    // Coils (controller type3 0x1A, coil type3 0x19)
    coilHp: v([15, 20, 40, 40, 40], 'rom-verified', 'coil HP table 0x80C7248'),
    coilColumns: v({ normal: [2, 2, 2, 2, 2, 1, 1, 1], lowHp: [2, 2, 2, 1, 1, 1, 1, 1] }, 'rom-verified', 'column table 0x80C7698 for the enemy side (game columns 3/2), low HP = ElecMan ≤ 25%'),
    coilSwapTicks: v([20, 10], 'rom-verified', 'attack 0xA: old coils explode after 0x14 frames, new coil after 0xA more'),
    coilDischarge: v(72, 'rom-verified', 'discharge lasts until ElecMan sends stop after 0x48 frames (table 0x80F40AC)'),
    // Panel storm (attack 0xC, object type3 0x1B)
    stormPeriod: v([24, 18, 12, 12, 12], 'rom-verified', 'round period table 0x80C7978'),
    stormStrikeEvery: v(18, 'rom-verified', 'strike interval 0x12 in object 0x1B'),
    stormRounds: v({ normal: 3, halfHp: 4 }, 'rom-verified', 'attack 0xC passes 3, or 4 at ≤ 50% HP'),
    stormGroup: v({ 3: [1, 2, 2, 2, 3, 3, 3, 3], 4: [2, 3, 3, 3, 3, 3, 4, 4] }, 'rom-verified', 'panels per round table 0x80C7B50 (RNG & 7)'),
    stormCharge: v(32, 'rom-verified', 'animation 0x12 with timers 12 + 20 before strikes'),
    stormDamage: v([40, 80, 110, 110, 110], 'rom-verified', 'damage table 0x80F3C70'),
    // Dash strike (attack 0xD)
    dashAura: v(30, 'rom-verified', 'animation 0xF with aura for 0x1E frames'),
    dashSpeed: v([10, 11, 12, 13, 13], 'rom-verified', 'pixels per frame, table 0x80F44D0 (16.16 fixed point)'),
    dashStrikeDelay: v(10, 'rom-verified', '0xA frames before animation 0x11 strike'),
    dashDamage: v([80, 160, 220, 220, 220], 'rom-verified', 'damage table 0x80F3C78'),
    rowStepTicks: v(8, 'unverified', 'vertical glide per row while lining up for the dash'),
  },
  HeatMan: {
    decision: v('counter rises on 12/16 of moves; at 3 → attack 0xA (fire column), EX+ alternate a repeat; then 0xB stomp (6/16) or 0xC wall nozzle (10/16)', 'rom-verified', 'decision routines 0x80F2B6C / 0x80F2BEE'),
    moveWait: v([40, 30, 24, 20, 20], 'rom-verified', 'table 0x80F2CE0'),
    attackWait: v([40, 30, 24, 20, 20], 'rom-verified', 'tables 0x80F2D28 / 0x80F2D4C (after stomp / nozzle)'),
    columnWait: v(60, 'rom-verified', 'table 0x80F2D04 (after fire column)'),
    warpTicks: v([4, 5], 'rom-verified', 'vanish 4 / appear 5 in attack routines'),
    aimTicks: v(30, 'rom-verified', 'animation 0xF for 0x1E frames'),
    fireTicks: v(18, 'rom-verified', 'animation 0x15 for 0x12 frames before the spawn'),
    columnDamage: v([20, 60, 110, 110, 110], 'rom-verified', 'attack 0xA, table 0x80F2E18'),
    columnBurn: v(30, 'unverified', 'fire pillar lifetime for attack 0xA (param not decoded)'),
    stompDamage: v([20, 60, 110, 110, 110], 'rom-verified', 'attack 0xB, table 0x80F2E20 (landing and pillars)'),
    stompCount: v({ normal: [1, 2, 3, 5, 5], lowHp: [1, 3, 4, 6, 6] }, 'rom-verified', 'table 0x80F2D80, second half when HP < 50%'),
    stompBurn: v([48, 36, 24, 24, 24], 'rom-verified', 'table 0x80F2D60 (pillar burn and pause between stomps)'),
    stompPhases: v({ close: 15, rise: 10, hang: 30, fall: 10 }, 'rom-verified', 'attack 0xB timers 0xF, 0xA, 0x1E, 0xA; rises 16 px per frame'),
    stompPillars: v([[-1, 0], [1, 0], [0, -1], [0, 1]], 'rom-verified', 'offsets table 0x80F3824'),
    nozzleDamage: v([40, 120, 220, 220, 220], 'rom-verified', 'attack 0xC, table 0x80F2E28'),
    nozzleCount: v({ normal: [2, 3, 4, 5, 5], lowHp: [4, 5, 6, 7, 7] }, 'rom-verified', 'table 0x80F2DA4'),
    nozzleBurn: v(30, 'unverified', 'flame duration (param table 0x80F2DBC not decoded)'),
    nozzleReach: v(2, 'unverified', 'panels covered from the back edge, from flame sprite length'),
    pillarRise: v(5, 'rom-verified', 'object 0x26 rise timer'),
    pillarFall: v(2, 'rom-verified', 'object 0x26 fall timer'),
  },
  SlashMan: {
    decision: v('5 moves, then: claw combo while counter < 2 (counter += 2 on 8/16, +1 otherwise), else rolling slash; every 5th attack the kunai volleys', 'rom-verified', 'decision 0x80F48E8, step table 0x80F494C'),
    moveWait: v({ first: [36, 30, 24, 24, 24], chained: [6, 3, 1, 1, 1] }, 'rom-verified', 'table 0x80F49CC: after 2+ moves in a row the wait drops'),
    warpTicks: v(3, 'rom-verified', 'vanish 3 / appear 3'),
    comboReady: v([30, 24, 24, 20, 20], 'rom-verified', 'ready pose table 0x80F4A14'),
    comboGap: v(10, 'rom-verified', 'pause between the two swipes (second byte of 0x80F4A14 set)'),
    comboSwipe: v(12, 'rom-verified', 'each swipe animation 0x10/0x11 for 0xC'),
    comboDamage: v([30, 70, 120, 120, 120], 'rom-verified', 'table 0x80F4BD4'),
    comboWait: v([30, 30, 24, 18, 18], 'rom-verified', 'table 0x80F49F4'),
    comboShapes: v({ down: [[-1, -1], [-1, 0], [-1, 1]], side: [[-1, 0], [-2, 0]] }, 'unverified', 'from the claw sprites (vertical / horizontal); hit-shape codes not decoded'),
    rollCrouch: v([42, 36, 30, 30, 30], 'rom-verified', 'crouch table 0x80F4A2C'),
    rollDamage: v([60, 140, 240, 240, 240], 'rom-verified', 'table 0x80F4BDC (body contact)'),
    rollSpeed: v(6, 'unverified', 'pixels per frame'),
    rollWait: v([30, 24, 18, 18, 18], 'rom-verified', 'table 0x80F4A50'),
    kunaiRounds: v(3, 'rom-verified', 'attack 0xC loops until counter 3'),
    kunaiRaise: v([30, 24, 18, 18, 18], 'rom-verified', 'claws-up time table 0x80F4A88'),
    kunaiPatterns: v([[[[3, 0], [5, 2]], [[4, 0], [3, 2]], [[3, 0], [3, 1]]], [[[3, 2], [4, 1]], [[3, 0], [4, 1]], [[3, 1], [3, 2]]], [[[3, 0], [5, 2]], [[3, 1], [5, 2]], [[4, 1], [4, 2]]]], 'rom-verified', 'table 0x80F56D4 by MegaMan row (mirrored for the enemy side); one of 3 at random'),
    kunaiSpin: v(16, 'unverified', 'spin before launch'),
    kunaiSpeed: v(5, 'unverified', 'pixels per frame'),
    kunaiDamage: v([30, 70, 120, 120, 120], 'rom-verified', 'table 0x80F4BE4'),
    kunaiWait: v([60, 40, 30, 16, 16], 'rom-verified', 'table 0x80F4A74'),
  },
  EraseMan: { // AI index 4, table 0x80F58F8 (released in 0.8.0 under ChargeMan by mistake)
    decision: v('moves 5/4/4/3 times (by version); then strike (0xA) 3 or 4 times in a row, then target-and-burst (0xB); after a strike, 0xB follows at once when attack var 0x1A is clear (read here as: the strike missed)', 'rom-verified', 'decision 0x80F594C / 0x80F59E8, move counts 0x80F59E4; meaning of var 0x1A inferred'),
    moveCount: v([5, 4, 4, 3, 3], 'rom-verified', 'table 0x80F59E4'),
    moveWait: v({ slow: [60, 50, 40, 30, 30], fast: [40, 30, 25, 20, 20] }, 'rom-verified', 'table 0x80F5A84, half picked by RNG & 1'),
    warpTicks: v(3, 'rom-verified', 'vanish 3 / appear 3'),
    strikeWindup: v(40, 'rom-verified', 'animation 0x13 (scythe wind-up) with counter 0x28'),
    strikeHold: v(10, 'rom-verified', 'animation 0x14 for 0xA before the hit'),
    strikeDamage: v([60, 90, 120, 120, 120], 'rom-verified', 'table 0x80F5B34'),
    strikeShape: v([[-1, 0], [-2, 0]], 'unverified', 'collision spawn 0x80F622A with front direction and 2; slash effect two panels ahead'),
    strikeWait: v([60, 50, 40, 30, 30], 'rom-verified', 'table 0x80F5A9C'),
    burstDamage: v([100, 170, 240, 240, 240], 'rom-verified', 'table 0x80F5B44'),
    burstSeek: v(96, 'recalled', 'attack var 0x34 = 0x60 set with the marker target; eye marker (type3 0x67) follows MegaMan until it locks'),
    markerStep: v(12, 'unverified', 'ticks per panel the marker moves; not decoded'),
    burstCharge: v(60, 'rom-verified', 'animation 0x12 for 0x3C before the burst'),
    burstShape: v('marked panel', 'unverified', 'beam object 0x68 (straight / up / down segments) fired toward the locked marker; simulated as a hit on the marked panel'),
    burstTicks: v(16, 'unverified', 'fire sprite runs 8 frames x 1-2 ticks'),
    burstWait: v(30, 'unverified'),
    startObjectDamage: v([30, 50, 70, 70, 70], 'rom-verified', 'type4 0x88 spawned at battle start (0x80F59FE); behaviour not decoded, not simulated'),
  },
  ChargeMan: { // AI index 5, table 0x80F6454
    decision: v('no idle moves: five attacks alternating 0xB / 0xC (the toggle is never reset, so cycles go B C B C B A C B C B C A …), then 0xA; 60-frame pause (0xD) after each; always returns to his starting panel', 'rom-verified', 'decision 0x80F64B0, pause 0x80F6704, home 0x80F64F4 / 0x80F650A'),
    pause: v(60, 'rom-verified', '0x80F6704'),
    warpTicks: v(3, 'rom-verified'),
    runWait: v(12, 'rom-verified', 'counter 0xC before each run'),
    dashCount: v(5, 'rom-verified', '0xB attack var 0x0E < 5'),
    dashSpeed: v([3, 3.5, 4, 4.5, 4.5], 'rom-verified', 'px/frame, table 0x80F6D7C (40 px per panel)'),
    dashDamage: v([50, 80, 160, 160, 160], 'rom-verified', 'table 0x80F66A4'),
    trainRounds: v(5, 'rom-verified', '0xC attack var 0x0D < 5; first pattern 0, then a random different one'),
    trainSpeed: v([3, 3.5, 4, 4.5, 4.5], 'rom-verified', 'px/frame, table 0x80F7130; 9 panels per round'),
    trainDamage: v([80, 130, 260, 260, 260], 'rom-verified', 'ChargeMan himself, table 0x80F66AC'),
    carDamage: v([30, 50, 100, 100, 100], 'rom-verified', 'cars, table 0x80F74D0'),
    trainPatterns: v([
      [[3, 2], [1, 1], [1, 3]], [[3, 1], [1, 2], [3, 3]], [[3, 3], [1, 1], [2, 2]], [[1, 2], [2, 3], [3, 1]],
      [[3, 2], [1, 1], [2, 3]], [[1, 3], [3, 1], [2, 2]], [[1, 3], [2, 1], [3, 2]], [[3, 2], [1, 1], [2, 3]],
    ], 'rom-verified', '[ChargeMan, car, car] as (lead, game row): ChargeMan table 0x80F70D0, cars 0x80F7478; larger lead = starts further ahead'),
    bigSpeeds: v({ out: [2.3125, 3, 3.3125, 4, 4], back: 2, rush: [8, 9, 10, 11, 11] }, 'rom-verified', 'px/frame, tables 0x80F685C, 0x80F6A38, 0x80F6B70'),
    bigTargets: v({ out: -1, back: 4, rush: -1 }, 'rom-verified', 'game columns 0 / 5 / 0 (tables 0x80F6870, 0x80F6A4C, 0x80F6B84)'),
    bigWhistle: v(60, 'rom-verified', 'attack var 0x18 = 0x3C (0x80F65A0)'),
    bigDamage: v([100, 150, 300, 300, 300], 'rom-verified', 'table 0x80F669C'),
    bigCars: v(3, 'rom-verified', 'loop in 0x80F73CA spawns three type3 0x87 cars behind him; their damage is not decoded, his is used'),
    bigOrder: v('run out, whistle, back up, rush', 'unverified', 'phase order read from 0xA; the five-step loop (var 0x0D) inside it is not decoded'),
    flinchThreshold: v(40, 'rom-verified', '0x80F651C: hits under 40 take the no-flinch path; not simulated'),
  },
  ProtoMan: {
    waitTicks: v([20, 16, 14, 12, 12], 'rom-verified', 'table 0x80FBD00 (wait after move / before attack)'),
    readyTicks: v([16, 14, 12, 10, 10], 'rom-verified', 'table 0x80FBD28 (ready pose before swing)'),
    warpTicks: v(3, 'rom-verified', 'vanish 3 / appear 3 in attack routines'),
    preReadyTicks: v(8, 'rom-verified', 'wait after appearing'),
    recoverTicks: v(30, 'rom-verified', 'hold after swing (0x1E)'),
    hitTick: v(10, 'unverified', 'frame of swing when the hit lands'),
    wideDamage: v([100, 150, 150, 220, 220], 'rom-verified', 'attack 0xA, table 0x80FBFFC'),
    guardDamage: v([70, 100, 100, 150, 150], 'rom-verified', 'attack 0xB counter, table 0x80FC004'),
    longDamage: v([90, 130, 130, 200, 200], 'rom-verified', 'attack 0xC, table 0x80FC00C'),
    bothDamage: v([150, 220, 220, 330, 330], 'rom-verified', 'attack 0xD, table 0x80FC014'),
    deltaDamage: v([80, 120, 120, 180, 180], 'rom-verified', 'attack 0xE, table 0x80FC01C'),
    dangerPanels: v([[1, 1], [2, 1], [3, 1]], 'rom-verified', 'table 0x80FBE40 (enemy side): MegaMan on the middle row in front builds toward attack 0xE'),
    targets: v("WideSword/LongSword: panel in front of MegaMan; both swords: ProtoMan's nearest panel in MegaMan's row; guard: random panel in MegaMan's row", 'rom-verified', 'helpers 0x80FCD70, 0x80FCDBA, 0x80FCDDE, 0x80FCD92'),
    shapes: v('WideSword = column in front (3 rows); LongSword = 2 panels ahead; 0xD = both; 0xE = repeated step-in slashes', 'unverified', 'inferred from sword effects 0x25/0x27 and hit-shape arguments'),
    guardTicks: v(60, 'unverified'),
  },
};
