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
  chargeDelay: v(10, 'rom-verified', 'sub_8012EBC: held ticks before the charge shows (PwrAtkState 1, the charging aura)'),
  chargeTime: v(100, 'rom-verified', 'DeterminePowerAttackChargeTime: powerAttackChargeTimes_8020404[BPwrAtk 1 (Navi stat +5 at start) × 10 + Charge 0 × 2] = 100 (then 90/80/70/60 for Charge 2–5)'),
  moveVanishTicks: v(4, 'rom-verified', 'candidate vanish sequence 4 = 1+1+1+1'),
  moveAppearTicks: v(4, 'rom-verified', 'candidate appear sequence 3 = 1+1+1+1'),
  flinchTicks: v(28, 'rom-verified', 'candidate flinch sequence 1 = 4+2+2+2+2+4+5+3 (fits observed hitstun feel; trace pending)'),
  invincibleTicks: v(120, 'unverified', 'post-hit invincibility'),
  customGaugeTicks: v(512, 'rom-verified', 'gauge 0x4000, +0x20 a frame (0x801BE70, 0x801DFB8); FastGauge 0x40 / SlowGauge 0x10 (0x80141A0)'),
  chipParalyzeTicks: v(90, 'rom-verified', 'status 0x10 (off_80209EC group 1: flag2 0x8, timer at collision +0x1C): WhiCapsl (sub_8019F44: damage bit 15 → status 0x10, hit modifier 1), Thunder / DarkThnd params[2] = 0x10, ElcPuls1, Sensor\'s laser'),
  addBonus: v(5, 'recalled', 'ADD: no chips this turn, 5 more next turn'),
  maxHand: v(10, 'recalled'),
  firstBarrierHp: v(10, 'rom-verified', 'FstBarr sets Navi stat 6 = 1 (navicust_NCP_FstBarr); the battle starts with barrier type 1 (loc_80138D2 → sub_801A7CC): byte_8020B2C[1] = 10 HP'),
  handSize: v(5, 'recalled', 'Custom 1 draws 5 chips'),
  maxSelect: v(5, 'recalled'),
  folderSize: v(30, 'recalled'),
};

export const val = key => RULES[key].value;

// Navi Customizer bugs in battle (bug table byte_813CC18 → Navi stats; levels 1–3 = min(bug count, 3); BugStop clears all).
// Emotions (base MegaMan). Mood = Navi stat 0x0E (0x80 normal, 0xFF Full Synchro); possiblyGetBattleEmotion_8015B64:
// Anger timer → Angry, AIData 0x32 → Tired, mood 0xFF → Full Synchro, else Normal. Window face byte_801E6F4.
export const EMOTION = {
  synchro: v('a counter hit (hitting an enemy during its counter window) gives Full Synchro: mood 0xFF', 'rom-verified', 'sub_801A200: collision flag 0x8000 on the hit → sub_8015BEC(attacker, 0xFF), base form or 0xB/0xC only'),
  counterWindow: v(16, 'rom-verified', 'object_setDefaultCounterTime: 0x10 frames, set by enemies as an attack starts'),
  counterStates: v('every enemy state that is not idle / moving / waiting opens the window', 'unverified', 'each AI sets its own counter time at its own moment; the app opens it when an attack state starts'),
  counterByChip: v('only chips counter (not the buster)', 'recalled', 'not traced'),
  hitLowersMood: v('each hit lowers the mood by its damage (at least 1 is left), so a hit ends Full Synchro', 'recalled', 'sub_8015C12 with collision 0x8E (read as the damage)'),
  boost: v('a chip with flag byte 9 bit 2 does double damage under Full Synchro or Angry; Full Synchro then drops to Normal (mood 0x80), Angry ends', 'rom-verified', 'sub_8012A38 marks the damage 0x8000 (r6 = 1 Full Synchro, 2 Angry); 0x8012866 sets mood 0x80 / calls sub_80143A6'),
  angryAfter: v({ paralyzed: 120, bigHit: 300 }, 'rom-verified', 'sub_80142DC (base MegaMan only): ≥ 0x78 frames held by status (flag 0xC00) or collision 0x80 / 2 ≥ 0x96 (read as the hit\'s damage ≥ 300, recalled) → Angry'),
  angryFrames: v(600, 'rom-verified', 'sub_8014326: Anger = 0x96 << 2'),
  tired: v('Tired: no Full Synchro or Angry while it lasts', 'rom-verified', 'sub_801445C blocks sub_8015BEC and sub_80143CE'),
  bugEvery: v(60, 'rom-verified', 'emotion bug (type 2, stat 0x24) sub_8013DA0: every 0x3C frames, base form, Beast Out counter (stat 0x21) above 0'),
  bugTable: v([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3], 'rom-verified', 'byte_8013E44: entries equal to the current emotion become Normal (or Tired from Normal); 0 Normal (mood 0x99), 1 Tired, 2 Angry, 3 Full Synchro (mood 0xFF) via dword_8013E54'),
  beastCounter: v('the app has no Beast Out yet, so the counter is taken as above 0', 'unverified', 'stat 0x21 BeastOutCounter'),
  faces: v({ normal: 0, angry: 1, tired: 2, synchro: 3 }, 'rom-verified', 'byte_801E6F4 = [0, 2, 3, 1, 5, 4] by emotion code'),
};

// Bubbled (N1GP wiki, Status effects): stuck until it wears off or an attack lands; Elec does double; mashing shortens it.
export const BUBBLE = {
  frames: v(150, 'recalled', 'N1GP wiki; the timer (CollisionData 0x2C, clears OBJECT_FLAGS_BUBBLED 0x80000000) is rom-verified, its start value is not traced'),
  sources: v('none yet', 'rom-verified', 'StarFish was linked in 0.56.0 because its bubble sets hit modifier 3; 0.61.0: 3 is the ordinary hit used by swords, burners and shells, so the link was dropped'),
};

export const BUGS = {
  processing: v('every move slides MegaMan as far as he can go in the pressed direction', 'rom-verified', 'type 1 → stat 0x31; sub_80103A8 passes mode 3 to the move (sub_80116AE) → sub_800FA20 walks panels in that direction until one is invalid (sub_800D120)'),
  panelChance: v([0, 2, 3, 4], 'rom-verified', 'type 3 → stat 0x13 = 2/3/4: when MegaMan leaves a panel, (rnd & 7) ≤ stat − 1 cracks it (sub_8013CC4, stat 0x12 = 3 → object_crackPanel)'),
  customTurn: v([0, 4, 3, 2], 'rom-verified', 'type 4 → stat 0x63 (TurnsUntilCustBugActivates) = 4/3/2 (sub_813CD5C/66/70)'),
  customLoss: v('from that turn on, the custom screen shows turn − value + 1 fewer chips (at least 2)', 'recalled', 'sub_802A40C; which turn counts as the first is not checked against the game'),
  busterTable: v([[0, 0], [6, 1], [10, 2], [13, 3]], 'rom-verified', 'type 7 → stats 0x14 / 0x15 (sub_813CDB4/C0/CC); each normal buster shot (power attack 0, megamanChargeShotBPwrAtk_init_8011A26) rolls one of 16 slots (sub_8013D5E): 1 → family 0x33, 2 → family 0x16 (the charge shot), else the normal shot'),
  busterEffect: v('slot 1: a misfire — buster pose, no shot; slot 2: a full charge shot, (Attack + 1) × 10', 'rom-verified', 'family 0x33 sub_80ED764: animation 0xE, sound 0xF8, no projectile, ends after 4 frames; family 0x16 megamanChargeShotAiAttack_80EBE00 with busterBugChargeShotDamageCalcHappensHere_8011A7E'),
  hpDrainFrames: v([0, 40, 35, 30, 25, 20, 15, 10], 'rom-verified', 'type 9 → stat 0x18 += level, stat 0x16 = 3; byte_80102A4[stat 0x18]: 1 HP lost every N frames, never below 1 (sub_8010230); each hit raises stat 0x18 by 1 up to 7 (sub_8013F96)'),
  startStatus: v(['invisible', 'invulnerable', 'blind', 'confused'], 'rom-verified', 'types B (5 colours) / C (6+): stat 0x1A = 9 / 10 → one of four at random (sub_8013E58): sub_8010474 flashing invisibility, object_setInvulnerableTime, BlindTimer + flag2 0x20, CollisionData 0x1E (the confusion timer: its countdown clears OBJECT_FLAGS_CONFUSED 0x8000, sub_800E730)'),
  startStatusFrames: v([300, 600], 'rom-verified', '0x12C for type B, 0x258 for type C (off_80141BC / off_80141C0)'),
  startStatusEffect: v('invisible: attacks pass through, MegaMan flashes; blind: enemies and the obstacles they own are hidden; confused: the D-pad is reversed', 'recalled', 'N1GP wiki, Bugs (BN6) / Status effects; the code that applies blind and confusion to the player is not traced'),
  noEffect: v('type 2 (emotion), 5 and 6 (encounters), 8 (VS-only helpers): no battle effect in the app', 'rom-verified', '5 → 0x28 and 6 → 0x26 (asm29 encounters), 8 → stat 0xD = 0xFF (Rush/Beat/Tango, sub_8010660); type A (stat 0x62) is used by no program'),
};

// Chips: names, codes, damage, element, class and MB come from the ROM (data/bn6-chips.mjs).
// CHIP_BEHAVIOUR says what each chip does in battle; chips not listed here can be picked but do nothing yet.
// Families share a behaviour; the number in a Recov name is its heal.
// The game's hit areas (PanelOffsetListsPointerTable 0x8019B78, all 0x2F lists, read from the ROM): (dx, dy) from the panel in front of
// the attacker. Chip actions pass the area number as the collision region's Param1 (CollisionData Region).
// Status effects (sub_801A554): status 0xGN → off_80209EC[G − 1][N] = flag2, frames, timer field (ROM, both versions).
export const STATUS_FRAMES = { 0x10: 90, 0x11: 120, 0x12: 150, 0x13: 4, 0x20: 480, 0x21: 720, 0x22: 960, 0x23: 4, 0x30: 480, 0x31: 720, 0x32: 1200, 0x33: 4, 0x40: 2, 0x41: 60, 0x42: 120, 0x43: 4, 0x50: 150, 0x51: 150, 0x52: 150, 0x53: 4, 0x60: 150, 0x61: 150, 0x62: 150, 0x63: 4 };
export const REGIONS = [[], [[0,0]],
   [[0,0], [1,0]],
   [[1,0]],
   [[0,0], [0,-1], [0,1]],
   [[0,-1], [0,1]],
   [[0,0], [1,0], [2,0]],
   [[0,0], [1,0], [2,0], [3,0]],
   [[0,0], [1,0], [2,0], [3,0], [4,0], [5,0]],
   [[0,0], [0,-1], [0,1], [1,0], [-1,0]],
   [[0,-1], [0,1], [1,0], [-1,0]],
   [[0,0], [1,-1], [-1,1], [1,1], [-1,-1]],
   [[1,-1], [-1,1], [1,1], [-1,-1]],
   [[0,0], [1,-1], [1,1]],
   [[1,-1], [1,1]],
   [[0,0], [0,-1], [0,1], [1,0], [-1,0], [1,-1], [-1,1], [1,1], [-1,-1]],
   [[0,-1], [0,1], [1,0], [-1,0], [1,-1], [-1,1], [1,1], [-1,-1]],
   [[0,0], [0,-1], [0,1], [1,0], [1,-1], [1,1]],
   [[0,0], [1,-1], [-1,1]],
   [[0,0], [-1,-1], [1,1]],
   [[0,0], [0,-1], [0,1], [1,0]],
   [[0,0], [1,-1], [1,1], [1,0]],
   [[0,0], [1,-1]],
   [[0,0], [1,1]],
   [[0,0], [0,-1]],
   [[0,0], [0,1]],
   [[0,0], [1,-1], [1,0], [1,1], [2,-1], [2,0], [2,1]],
   [[0,0], [1,-1], [1,0], [1,1], [2,-1], [2,0], [2,1], [3,-1], [3,0], [3,1]],
   [[0,0], [1,-1], [1,0], [1,1], [2,-1], [2,0], [2,1], [3,-1], [3,0], [3,1], [4,-1], [4,0], [4,1]],
   [[0,0], [1,0], [-1,0]],
   [[1,0], [-1,0]],
   [[0,0], [-1,-1], [-1,1]],
   [[0,0], [1,0], [2,0], [3,0], [4,0]],
   [[0,0], [0,-1], [0,1], [1,0], [1,-1], [1,1], [2,0], [2,-1], [2,1], [3,0], [3,-1], [3,1]],
   [[-1,-1], [0,-1], [1,-1], [0,0], [-1,1], [0,1], [1,1]],
   [[0,-1], [1,-1], [2,-1], [3,-1], [4,-1], [5,-1], [0,0], [1,0], [2,0], [3,0], [4,0], [5,0], [0,1], [1,1], [2,1], [3,1], [4,1], [5,1]],
   [[0,-1], [1,-1], [2,-1], [-1,0], [0,0], [1,0], [-2,1], [-1,1], [0,1]],
   [[-2,-1], [-1,-1], [0,-1], [-1,0], [0,0], [1,0], [0,1], [1,1], [2,1]],
   [[-2,-2], [-1,-2], [0,-2], [1,-2], [2,-2], [-2,-1], [-1,-1], [0,-1], [1,-1], [2,-1], [-2,0], [-1,0], [0,0], [1,0], [2,0], [-2,1], [-1,1], [0,1], [1,1], [2,1], [-2,2], [-1,2], [0,2], [1,2], [2,2]],
   [[0,-1], [1,-1], [2,-1], [3,-1], [4,-1], [5,-1], [5,0], [0,1], [1,1], [2,1], [3,1], [4,1], [5,1]],
   [[0,0], [1,0], [2,0], [2,-1], [2,1]],
   [[0,-1], [1,-1], [2,-1], [1,0], [0,1], [1,1], [2,1]],
   [[0,-1], [0,1], [0,0], [1,0], [2,0], [3,0], [4,0], [5,0]],
   [[0,0], [-1,0], [-2,0]],
   [[5,-2], [4,-2], [3,-2], [2,-2], [1,-2], [0,-2], [-1,-2], [-2,-2], [-3,-2], [-4,-2], [-5,-2], [5,2], [4,2], [3,2], [2,2], [1,2], [0,2], [-1,2], [-2,2], [-3,2], [-4,2], [-5,2], [5,-1], [4,-1], [3,-1], [2,-1], [-2,-1], [-3,-1], [-4,-1], [-5,-1], [5,1], [4,1], [3,1], [2,1], [-2,1], [-3,1], [-4,1], [-5,1], [5,0], [4,0], [3,0], [2,0], [-2,0], [-3,0], [-4,0], [-5,0]],
   [[0,0], [0,-2], [0,-1], [0,1], [0,2]],
   [[0,-2], [0,-1], [0,1], [0,2]]];
// Swords (chip family 0x13, sub_80EB776): byte_80EBA18[subfamily] byte 0 is the hit area; the swing hits at frame 12 (Unk_10 0x0C).
// Slash sprite: the game's sword effect, the sequence closest to the area (the per-element blades byte_80EBAD8 are not split out yet).
const SWORD_AREA = [1, 4, 2, 4, 2, 0x11, 0x11, 0x11, 2, 6, 0xB, 0x11, 4, 4, 4, 4];
const SWORD_FX = { 1: 'sword', 4: 'wide', 2: 'long', 6: 'long', 0x11: 'both', 0xB: 'both' };
const sword = (sub, extra = {}) => ({ kind: 'slash', region: SWORD_AREA[sub], area: REGIONS[SWORD_AREA[sub]].map(([dx, dy]) => [dx + 1, dy]),
  slashFx: SWORD_FX[SWORD_AREA[sub]], anim: 'slash', lock: 24, confidence: 'rom-verified', note: `area ${SWORD_AREA[sub]} from byte_80EBA18[${sub}]; lock 24 recalled`, ...extra });

// Chip lockout (rom-verified): `lock` is how long the chip's own action keeps MegaMan busy (its attack family's code). When the
// action ends, sub_801171C copies the chip's LockoutFrames (ChipData +0x14, via AIAttackVars +0x05, sub_80126F6) into
// AIData ChipLockoutTimer; sub_80107D4 counts it down outside time freezes and sub_800A772 refuses another chip until it
// is 0. Moving and the buster are not blocked. Nonzero in BN6: seeds / Lance 10; FireHit, Boomer, GolmHit, JustcOne,
// FullCust, BusterUp, plus chips, arms, SyncTrgr, FlmHook, CornFsta, ParaShl, DestPuls, StreamHd 20; TimeBom, Recov 30;
// AirHocky 50.
export const CHIP_BEHAVIOUR = {
  Cannon:   { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, confidence: 'recalled' },
  HiCannon: { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, confidence: 'recalled' },
  'M-Cannon': { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, confidence: 'recalled' },
  AirShot:  { kind: 'shot', push: true, fx: 'explosion', anim: 'airshot', lock: 16, confidence: 'recalled' },
  Vulcan1:  { kind: 'vulcan', hits: 3, gap: 11, lead: 2, anim: 'vulcan', lock: 35, confidence: 'rom-verified', note: '0x80EBF6E: a shot every 11 frames, count from dword_80EBFEC (3/4/5/10); t3 0x12 hitscan, region 2 (target + the panel behind); lock = lead + (hits − 1) × 11 + 11' },
  Vulcan2:  { kind: 'vulcan', hits: 4, gap: 11, lead: 2, anim: 'vulcan', lock: 46, confidence: 'rom-verified' },
  Vulcan3:  { kind: 'vulcan', hits: 5, gap: 11, lead: 2, anim: 'vulcan', lock: 57, confidence: 'rom-verified' },
  SuprVulc: { kind: 'vulcan', hits: 10, gap: 11, lead: 2, anim: 'vulcan', lock: 112, confidence: 'rom-verified', note: 'count 10 (dword_80EBFEC[3])' },
  Sword: sword(0), WideSwrd: sword(1), LongSwrd: sword(2), WideBlde: sword(3), LongBlde: sword(4), LifeSrd: sword(5), DrkSword: sword(6),
  FireSwrd: sword(12), AquaSwrd: sword(13), ElecSwrd: sword(14), BambSwrd: sword(15), FtrSword: sword(9), CrosSwrd: sword(10), DblDream: sword(11),
  StepSwrd: sword(1, { step: 2, note: 'area 4 from byte_80EBA18[1]; params[0] = 1: steps 2 panels forward first (sub_80EB79C), back after (recalled)' }),
  Muramasa: sword(8, { damageFromLostHp: true, note: 'area 2; damage code 1020 → sub_8010BD0: MaxHP − HP, at most 0x1F4 = 500' }),
  // GigaCannons (family 0x14, sub 4–6): the Cannon / HiCannon / M-Cannon arm (byte_80EBD2C) and impact area 0xC, the four
  // diagonal panels around the target (byte_80EBD34 → sub_80C4FFE).
  GigaCan1: { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, impact: 0xC, confidence: 'rom-verified', note: 'impact area from byte_80EBD34; lock recalled' },
  GigaCan2: { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, impact: 0xC, confidence: 'rom-verified' },
  GigaCan3: { kind: 'shot', fx: 'explosion', anim: 'cannon', lock: 30, impact: 0xC, confidence: 'rom-verified' },
  // Bombs (family 0x12, sub_80EB628): thrown on frame 9, 40 frames in the air (Timer 0x28), 3 panels ahead (velocity byte_80C5D58);
  // a hole swallows it. Landing area by params[0] (dword_80C5D7C): 0 → area 1, 3 → area 0xF; 2 → the EnergBom object.
  EnergBom: { kind: 'throw', range: 3, flight: 40, release: 9, hits: 3, anim: 'throw', lock: 22, confidence: 'rom-verified', note: 'params[0] = 2 → t3 0x11 (sub_80C68B0 / sub_80C6854): 3 hits on the landing panel, 7 frames apart; lock recalled' },
  MegEnBom: { kind: 'throw', range: 3, flight: 40, release: 9, hits: 3, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  BigBomb: { kind: 'throw', range: 3, flight: 40, release: 9, region: 0xF, anim: 'throw', lock: 22, confidence: 'rom-verified', note: 'params[0] = 3 → area 0xF (3×3) on landing' },
  // Seeds (subfamilies 9 / 12 / 13 → t3 0x4F): the panel type byte_80CE41E[params[0]] = poison / ice / grass over area 0xF, or
  // only the panel hit when it hits someone (sub_80CE3C4).
  PoisSeed: { kind: 'throw', range: 3, flight: 40, release: 9, seed: 'poison', anim: 'throw', lock: 22, confidence: 'rom-verified' },
  IceSeed: { kind: 'throw', range: 3, flight: 40, release: 9, seed: 'ice', anim: 'throw', lock: 22, confidence: 'rom-verified' },
  GrasSeed: { kind: 'throw', range: 3, flight: 40, release: 9, seed: 'grass', anim: 'throw', lock: 22, confidence: 'rom-verified' },
  // Panel shots (family 0x22, sub_80EC960): the area dword_80ECA08[subfamily] = 1 / 2 / 4 is lifted and shot.
  DublShot: { kind: 'crack', region: 2, anim: 'crack', lock: 24, speed: 0.25, confidence: 'rom-verified', note: 'area 2 (front panel + the next); speed and lock as CrakShot (recalled)' },
  TrplShot: { kind: 'crack', region: 4, anim: 'crack', lock: 24, speed: 0.25, confidence: 'rom-verified', note: 'area 4 (the front column)' },
  // Burners (family 0x27 → t3 0x4): params [life, spread (| 0x80 wide), crack, anim]. A flame on the panel in front lasts `life`
  // frames; after 4 frames it lights the next panel ahead (spread times); wide also lights above / below that next panel
  // (sub_80C552A → sub_80C5590); with crack the panel cracks when the flame ends (sub_80C53E4).
  FireBrn1: { kind: 'burner', life: 30, spread: 2, wide: false, crack: true, anim: 'idle', lock: 30, confidence: 'rom-verified', note: 'params 30, 2, 1; lock recalled' },
  FireBrn2: { kind: 'burner', life: 30, spread: 2, wide: false, crack: true, anim: 'idle', lock: 30, confidence: 'rom-verified' },
  FireBrn3: { kind: 'burner', life: 30, spread: 2, wide: false, crack: true, anim: 'idle', lock: 30, confidence: 'rom-verified' },
  WideBrn1: { kind: 'burner', life: 60, spread: 2, wide: true, crack: true, anim: 'idle', lock: 60, confidence: 'rom-verified', note: 'params 60, 0x82, 1' },
  WideBrn2: { kind: 'burner', life: 60, spread: 2, wide: true, crack: true, anim: 'idle', lock: 60, confidence: 'rom-verified' },
  WideBrn3: { kind: 'burner', life: 60, spread: 2, wide: true, crack: true, anim: 'idle', lock: 60, confidence: 'rom-verified' },
  // Wave arms (family 0x31, sub_80ED668): at frame 2 a shockwave (t3 0x16, kind params[0] = 12–15: 6 frames a panel, byte_80C6B00)
  // from the panel ahead; PwrWave (subfamily 1) adds one in the rows above and below.
  WaveArm1: { kind: 'wavearm', rows: [0], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified', note: 'attack ends after 0x0F frames (lock 16)' },
  WaveArm2: { kind: 'wavearm', rows: [0], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  WaveArm3: { kind: 'wavearm', rows: [0], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  PwrWave1: { kind: 'wavearm', rows: [-1, 0, 1], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  PwrWave2: { kind: 'wavearm', rows: [-1, 0, 1], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  PwrWave3: { kind: 'wavearm', rows: [-1, 0, 1], step: 6, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  // Shells (family 0x2C, sub_80ED278 → t3 0x34): the Armadillo ball (sprite 4/0x1B, animation 3, palette params[0]) rolls from
  // the panel ahead to the far edge at byte_80CA7A0[params[0]] = 6 / 7 / 8 px a frame, hitting everything it passes, and stops
  // at a hole. ParaShl (params[2] = 1) rolls three, one per row, from column 1 at 8 px.
  IronShl1: { kind: 'shell', speed: 6, pal: 0, anim: 'idle', lock: 16, confidence: 'rom-verified', note: 'attack 0x0F frames' },
  IronShl2: { kind: 'shell', speed: 7, pal: 1, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  IronShl3: { kind: 'shell', speed: 8, pal: 2, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  ParaShl: { kind: 'shell', speed: 8, pal: 0, rows: [0, 1, 2], fromX: 1, anim: 'idle', lock: 16, confidence: 'rom-verified' },
  // ElecPulses (family 0x42, sub_80EE57C → t3 0x8C): held out for params[2] = 60 frames over area 0x15 (the panel ahead and the
  // column after it). params[0] = hit modifier, params[1] = status (0x10 paralysis 90 frames for ElcPuls1; 0x12 paralysis 150 for DestPuls, STATUS_FRAMES);
  // ElcPuls2's 0x51 pulls the target in (its description: "Pul enemy in").
  ElcPuls1: { kind: 'pulse', region: 0x15, hold: 60, pal: 1, status: 'paralyze', statusCode: 0x10, anim: 'idle', lock: 66, confidence: 'rom-verified', note: 'hits once per enemy (recalled)' },
  ElcPuls2: { kind: 'pulse', region: 0x15, hold: 60, pal: 2, pull: true, anim: 'idle', lock: 66, confidence: 'rom-verified', note: 'hit modifier 0x51 → sub_800F598: bit 0x10 → byte_800F604 (−1, 0, 1): pulled 1 panel toward MegaMan' },
  ElcPuls3: { kind: 'pulse', region: 0x15, hold: 60, pal: 0, anim: 'idle', lock: 66, confidence: 'rom-verified' },
  DestPuls: { kind: 'pulse', region: 0x15, hold: 60, pal: 3, status: 'paralyze', statusCode: 0x12, anim: 'idle', lock: 66, confidence: 'rom-verified', note: 'status 0x12 = paralysis 150 frames (off_80209EC)' },
  // AuraHeads (family 0x43, sub_80EE66E → t3 0x92): Heady's head (sprite 4/3 animation 4, palette params[0]) flies from MegaMan's
  // panel at 12 px a frame (byte_80D74D4) for 3 panels, hitting what it passes; MegaMan recoils. StreamHd (subfamily 1,
  // params[3] = 1) sends 5, 15 frames apart, each to the far edge (sub_80EE6A4 counts params[0] up to 4).
  AuraHed1: { kind: 'shell', sprite: 'heady', seq: 'head', speed: 12, pal: 0, fromX: 'self', range: 3, anim: 'idle', lock: 30, confidence: 'rom-verified', note: 'attack 0x1E frames' },
  AuraHed2: { kind: 'shell', sprite: 'heady', seq: 'head', speed: 12, pal: 1, fromX: 'self', range: 3, anim: 'idle', lock: 30, confidence: 'rom-verified' },
  AuraHed3: { kind: 'shell', sprite: 'heady', seq: 'head', speed: 12, pal: 2, fromX: 'self', range: 3, anim: 'idle', lock: 30, confidence: 'rom-verified' },
  StreamHd: { kind: 'shell', sprite: 'heady', seq: 'head', speed: 12, pal: 0, fromX: 'self', count: 5, gap: 15, anim: 'idle', lock: 75, confidence: 'rom-verified', note: '5 heads 15 frames apart (0x0F), each to the far edge' },
  // Spreaders (family 0x25 → t3 0x12): an invisible shot, one panel a frame; on a hit it splashes over area
  // byte_80C68D4[params[0] · 6] = 0xF (3×3 round the panel hit) (sub_80C6A50).
  Spreadr1: { kind: 'shot', fx: 'buster', impact: 0xF, anim: 'buster', lock: 20, confidence: 'rom-verified', note: 'attack 0x14 frames' },
  Spreadr2: { kind: 'shot', fx: 'buster', impact: 0xF, anim: 'buster', lock: 20, confidence: 'rom-verified' },
  Spreadr3: { kind: 'shot', fx: 'buster', impact: 0xF, anim: 'buster', lock: 20, confidence: 'rom-verified' },
  // WideShot / SuprSpr (family 0x30 → t3 0x3B): a wave over area 4 (its row and the rows above and below) from MegaMan's
  // panel, X velocity byte_80CB58C[param] = 3 px (WideSht, param 0) / 6 px (SuprSpr, param 3) a frame; sprite 0x10/0x37.
  WideSht: { kind: 'widewave', speed: 3, anim: 'buster', lock: 34, confidence: 'rom-verified', note: 'params from dword_80ED618; attack ends 0x0E + 0x14 frames after the throw' },
  SuprSpr: { kind: 'widewave', speed: 6, anim: 'buster', lock: 34, confidence: 'rom-verified' },
  // TankCannons (family 0x24 → t3 0x3C): a shell one panel a frame down the row; it explodes on the first enemy, or, reaching
  // the back edge, over the last column's three rows (area 4, 0xA05FF04) and cracks those panels (params[1] = 1) (sub_80CB7BC).
  TankCan1: { kind: 'tankcan', anim: 'cannon', lock: 38, confidence: 'rom-verified', note: 'arm out 0x0F frames, fire, then 0x14 + 3 frames (lock approximate)' },
  TankCan2: { kind: 'tankcan', anim: 'cannon', lock: 38, confidence: 'rom-verified' },
  TankCan3: { kind: 'tankcan', anim: 'cannon', lock: 38, confidence: 'rom-verified' },
  // MachGuns (family 0x29, sub_80ECF48 / sub_80ECF8E): 9 shots, one every 9 frames (Unk_10 = 8), into the nearest column holding
  // an enemy (sub_80ED040), starting in the bottom row and stepping up; at an edge the direction turns and, if the nearest
  // enemy column has moved, the aim steps one column toward it instead of moving row. Each shot hits its panel (t3 sub_80C5F2C).
  MachGun1: { kind: 'machgun', shots: 9, every: 9, anim: 'vulcan', lock: 9 * 9 + 10, confidence: 'rom-verified' },
  MachGun2: { kind: 'machgun', shots: 9, every: 9, anim: 'vulcan', lock: 9 * 9 + 10, confidence: 'rom-verified' },
  MachGun3: { kind: 'machgun', shots: 9, every: 9, anim: 'vulcan', lock: 9 * 9 + 10, confidence: 'rom-verified' },
  // AquaNeedles (family 0x32 → t4 0x40): 3 needles, 8 frames apart from frame 0x0D, each onto an enemy's panel: the first three
  // enemies, or with two the one with less HP twice (a tie: random), or one enemy three times (sub_80E5174).
  AquaNdl1: { kind: 'needles', count: 3, every: 8, delay: 13, anim: 'throw', lock: 30, confidence: 'rom-verified', note: 'attack 0x0F + 0x0F frames' },
  AquaNdl2: { kind: 'needles', count: 3, every: 8, delay: 13, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  AquaNdl3: { kind: 'needles', count: 3, every: 8, delay: 13, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  // Tornado / Static (family 0x2F → t3 0x31): a twister 2 panels ahead, hitting every 4 frames for 32 frames (8 hits)
  // (byte_80CA064, sub_80CA0B0). Tornado (kind 1) on volcano / grass / ice turns fire / wood / aqua, sets the panel normal and does
  // double damage (byte_80CA25C, sub_80C9F98). Static places twisters by MegaMan's bug count (sub_800FE52, up to 3):
  // off_80CA160 = 1, 2, 4 or 6 panels round the panel 2 ahead.
  Tornado: { kind: 'tornado', every: 4, life: 32, panelElement: true, anim: 'buster', lock: 42, confidence: 'rom-verified', note: 'twister at Unk_10 0x20 of 0x2A' },
  Static: { kind: 'tornado', every: 4, life: 32, byBugs: [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [0, -1], [0, 1]], [[0, 0], [1, 0], [0, -1], [0, 1], [1, -1], [1, 1]]], anim: 'buster', lock: 42, confidence: 'rom-verified', note: 'bug count: stats 0x31, 0x13, 0x14, 0x16, 0x54, 0x24, 0x18, 0x19 each add 1; 0x54 and 0x19 are not modelled' },
  // Reflectors (family 0x2B, sub_80ED154): the guard (t3 0x2B) for params[0] = 60 frames (Unk_10 against Unk_0c); the first hit it
  // blocks sends a reflect wave (sub_80C9CDA) back down the row with the chip's damage.
  Rflectr1: { kind: 'reflector', ticks: 60, confidence: 'rom-verified' },
  Rflectr2: { kind: 'reflector', ticks: 60, confidence: 'rom-verified' },
  Rflectr3: { kind: 'reflector', ticks: 60, confidence: 'rom-verified' },
  // BubbleStars (family 0x2D → t3 0x42): a StarFish (sprite 4/0x0F, animation 0) glides from the panel ahead at
  // byte_80CC65C[params[0]] = 1.5 / 2.25 / 3 px a frame; the first enemy it hits is bubbled (status 0x60) and it stops.
  BblStar1: { kind: 'bubblestar', speed: 1.5, anim: 'throw', lock: 30, confidence: 'rom-verified', note: 'bubble length on enemies as on MegaMan (BUBBLE.frames, recalled)' },
  BblStar2: { kind: 'bubblestar', speed: 2.25, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  BblStar3: { kind: 'bubblestar', speed: 3, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  // CornShots (family 0x2A → t3 0x10): an invisible shot, one panel a frame; where it hits, the panel turns to grass (if solid)
  // and a corn blast hits there twice, 12 frames apart (Param2 = 2, sub_80C6698 / sub_80C66E4), and sets off corns on the other
  // grass panels of the enemy area (sub_80C6774, Param1 + 1; the app goes one level deep).
  CornSht1: { kind: 'corn', hits: 2, every: 12, anim: 'buster', lock: 34, confidence: 'rom-verified', note: 'attack 0x0A + 0x18 frames; one level of spreading (recalled)' },
  CornSht2: { kind: 'corn', hits: 2, every: 12, anim: 'buster', lock: 34, confidence: 'rom-verified' },
  CornSht3: { kind: 'corn', hits: 2, every: 12, anim: 'buster', lock: 34, confidence: 'rom-verified' },
  // Thunder (family 0x1F → t3 0x2A, battle_BDT_*): a ball from the panel ahead; every 60 frames it picks a direction toward an
  // enemy (along the row unless already in its column) and slides one panel (X 0xAAAB, Y 0x6666 a frame); after Param2 = 5
  // legs it vanishes. A hit paralyses (Param3 = 0x10) and ends it.
  Thunder: { kind: 'thunder', legs: 5, leg: 60, anim: 'buster', lock: 20, confidence: 'rom-verified', note: 'which enemy it follows (FindOpponentPanelXYForThunderObject) is taken as the nearest (recalled)' },
  // YoYo (family 0x18 → t3 0x52): from the panel ahead it moves out params[2] = 2 more panels (8 frames a panel), spins there
  // params[3] = 2 × 8 frames (the hit area is re-armed every 8 frames, sub_80CE9DC), then comes back the same way. Each panel
  // it enters, and each re-arm, can hit.
  YoYo: { kind: 'yoyo', out: 2, hold: 2, step: 8, anim: 'buster', lock: 30, confidence: 'rom-verified', note: 'attack held 0x1E frames after the spawn (Unk_10)' },
  // TrainArrows (family 0x28, sub_80ECE18 → t3 0xB kind 2): an arrow on every panel of MegaMan's own area in front of him,
  // waiting 16, 12, 8 … frames (the farthest waits least), and one from MegaMan's own panel at frame 0x18. Each flies at
  // 6 px a frame (byte_80C6038 row 2: aqua, sprite 0x0C/0x2A animation 3, 8 panels) and ends on its first hit.
  TrnArrw1: { kind: 'trainarrow', speed: 6, first: 16, gap: 4, last: 24, anim: 'buster', lock: 40, confidence: 'rom-verified' },
  TrnArrw2: { kind: 'trainarrow', speed: 6, first: 16, gap: 4, last: 24, anim: 'buster', lock: 40, confidence: 'rom-verified' },
  TrnArrw3: { kind: 'trainarrow', speed: 6, first: 16, gap: 4, last: 24, anim: 'buster', lock: 40, confidence: 'rom-verified' },
  // RollingLogs (family 0x36, sub_80EDA0E → t3 0x66): two logs, 10 frames apart, thrown 13 frames onto the panel two ahead;
  // each covers its panel and the one above (area 0x18), the rows from byte_80EDAB4 (top: 0-1 twice; middle: 0-1 then 1-2;
  // bottom: 1-2 twice). Then it rolls on at 3 px a frame and breaks on its first hit (both rows at once) or at a hole / the edge.
  RlngLog1: { kind: 'logs', rows: [[0, 0], [0, 1], [1, 1]], gap: 10, air: 13, speed: 3, anim: 'throw', lock: 30, confidence: 'rom-verified', note: 'the log has params[2] = 20 HP and stops params[1] = 60 frames when hit; not modelled' },
  RlngLog2: { kind: 'logs', rows: [[0, 0], [0, 1], [1, 1]], gap: 10, air: 13, speed: 3, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  RlngLog3: { kind: 'logs', rows: [[0, 0], [0, 1], [1, 1]], gap: 10, air: 13, speed: 3, anim: 'throw', lock: 30, confidence: 'rom-verified' },
  // AirSpins (family 0x38 → t3 0x9B): a top on the panel ahead glides forward (4 px a frame) while the next panel is solid and
  // empty, at most 4 panels; it spins for 15 frames, then hits the 8 panels around it (area 0x10) params[1] = 2 / 3 / 4 times,
  // 10 frames apart.
  AirSpin1: { kind: 'airspin', hits: 2, maxPanels: 4, speed: 4, wait: 15, every: 10, anim: 'throw', lock: 15, confidence: 'rom-verified', note: 'the top is a 400 HP field object; it is not hittable here' },
  AirSpin2: { kind: 'airspin', hits: 3, maxPanels: 4, speed: 4, wait: 15, every: 10, anim: 'throw', lock: 15, confidence: 'rom-verified' },
  AirSpin3: { kind: 'airspin', hits: 4, maxPanels: 4, speed: 4, wait: 15, every: 10, anim: 'throw', lock: 15, confidence: 'rom-verified' },
  // GunDelSols (family 0x37, sub_80EDB14 / sub_80EDBCC): after 6 frames, a sun two panels ahead (t4 0x48); every frame for
  // dword_80EDBC8 = 60 / 90 / 120 / 120 frames a hit area (t3 0x3) of 2 damage on area 4 (the column); GunDelEX area 0x11
  // (two columns). The chip's own damage is 0.
  GunDelS1: { kind: 'sunbeam', frames: 60, per: 2, region: 4, delay: 6, pal: 0, anim: 'buster', lock: 76, confidence: 'rom-verified', note: '4 a frame instead of 2 when Navi stat 0x22 is set (not modelled)' },
  GunDelS2: { kind: 'sunbeam', frames: 90, per: 2, region: 4, delay: 6, pal: 0, anim: 'buster', lock: 106, confidence: 'rom-verified' },
  GunDelS3: { kind: 'sunbeam', frames: 120, per: 2, region: 4, delay: 6, pal: 0, anim: 'buster', lock: 136, confidence: 'rom-verified' },
  GunDelEX: { kind: 'sunbeam', frames: 120, per: 2, region: 0x11, delay: 6, pal: 1, anim: 'buster', lock: 136, confidence: 'rom-verified' },
  // RiskyHoneys (family 0x39 → t3 0x74): a bee swarm from the panel ahead flies to the nearest enemy column (byte_80D3164:
  // 2.5 / 3 / 3.5 px a frame across, 1.5 / 1.8 / 2.1 down) and on the row; once it touches an enemy it stays on it and hits
  // 5 times, 5 frames apart. More swarms (up to 3) only follow when AIAttackVars 0x30 is set, which isn't traced.
  RskyHny1: { kind: 'bees', speed: 2.5, vspeed: 1.5, hits: 5, every: 5, pal: 0, anim: 'buster', lock: 20, confidence: 'rom-verified', note: 'one swarm; the path is simplified (across, then up or down)' },
  RskyHny2: { kind: 'bees', speed: 3, vspeed: 1.8, hits: 5, every: 5, pal: 1, anim: 'buster', lock: 20, confidence: 'rom-verified' },
  RskyHny3: { kind: 'bees', speed: 3.5, vspeed: 2.1, hits: 5, every: 5, pal: 2, anim: 'buster', lock: 20, confidence: 'rom-verified' },
  // DollThunders (family 0x3E, dollThunderAttack_*): after 10 frames the doll (t3 0x82) shows for params[1] = 15 frames, and
  // every panel of the row ahead gets a hit area (t3 0x8B, byte_80D6914 row 0: hit effect 3, no status) that lasts as long
  // and hits once.
  DolThdr1: { kind: 'dollthunder', delay: 10, frames: 15, anim: 'buster', lock: 31, confidence: 'rom-verified' },
  DolThdr2: { kind: 'dollthunder', delay: 10, frames: 15, anim: 'buster', lock: 31, confidence: 'rom-verified' },
  DolThdr3: { kind: 'dollthunder', delay: 10, frames: 15, anim: 'buster', lock: 31, confidence: 'rom-verified' },
  // AirHockey / PitHockey (family 0x26 → t3 0x2E): a puck from the panel ahead moves one panel diagonally (forward, down)
  // every 6 frames (byte_80C9818[params[0]]: 10 / 18 moves), bouncing off the field's edges; once in the enemy area it stays
  // there, turning back at its border. Its hit is re-armed on every new panel; a hole ends it.
  AirHocky: { kind: 'hockey', moves: 10, every: 6, anim: 'throw', lock: 15, confidence: 'rom-verified' },
  PitHocky: { kind: 'hockey', moves: 18, every: 6, anim: 'throw', lock: 15, confidence: 'rom-verified', note: 'its afterimages (spawnIllusionObject every 4 frames) are not drawn' },
  // Placed bombs (family 0x12, off_80EB6F8 by subfamily): thrown at 2.75 px a frame (0x2C000) to the panel 3 ahead; on a solid,
  // empty panel each becomes an object there (MegaMan's side's object, it blocks shots):
  //   BlkBomb (sub 6 → t3 0x4A): 100 HP for 6000 frames; a Fire hit (PanelDamage2) sets it off: a hit area 0x82 / 0x81 by
  //     side (sub_80CD7D0) with the chip's damage, as Fire. Areas ≥ 0x80 (sub_300777C, byte_8019C34) cover every panel of one
  //     side: 0x82 the panels with flag 0x20 (the enemy side), 0x81 the others.
  //   FlshBom (sub 14 → t3 0xA4, byte_80D9A20[params[0]]): HP 10 / 15 / 20; after 60 frames it flashes: a hit area 0x82 / 0x81
  //     with status byte_80D9A20 [2] = 0x10 / 0x12 / 0x12 (paralysis 90 / 150 / 150); FlshBom3 adds status 0x30 (blind 480, not modelled on enemies).
  //   LilBolr (sub 3 → t3 0x93): a boiler that soaks up hits; after 180 frames (0xB4) or its third hit it bursts over the 8
  //     panels around it (area 0x10) for MaxHP − HP (sub_80D7A2A): HP starts at 0xFA0 − the chip's damage (sub_80D761C) and
  //     never drops under 0xBB9, so the burst is the chip's damage plus what it took, at most 999.
  //   BugBomb (sub 7 → t3 0xA5): HP 40; after 60 frames area 0x10 around it, status 0x20 (a random bug on a Navi, sub_80D9FC2;
  //     the CPU Navis have no bugs here, so it does nothing to them).
  // The Dragons' body pieces (t3 0xC8) have no collision data: only the head hits.
  BlkBomb: { kind: 'place', obj: 'BlackBomb', sprite: 'blkbombfx', hp: 100, life: 6000, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  FlshBom1: { kind: 'place', obj: 'FlashBomb', sprite: 'flshbombfx', statusCode: 0x10, hp: 10, life: 60, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  FlshBom2: { kind: 'place', obj: 'FlashBomb', sprite: 'flshbombfx', statusCode: 0x12, hp: 15, life: 60, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  FlshBom3: { kind: 'place', obj: 'FlashBomb', sprite: 'flshbombfx', statusCode: 0x12, hp: 20, life: 60, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  LilBolr1: { kind: 'place', obj: 'Boiler', sprite: 'boilerfx', hp: 4000, life: 180, hits: 3, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  LilBolr2: { kind: 'place', obj: 'Boiler', sprite: 'boilerfx', hp: 4000, life: 180, hits: 3, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  LilBolr3: { kind: 'place', obj: 'Boiler', sprite: 'boilerfx', hp: 4000, life: 180, hits: 3, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  BugBomb: { kind: 'place', obj: 'BugBomb', sprite: 'bugbombfx', hp: 40, life: 60, flight: 44, release: 9, anim: 'throw', lock: 22, confidence: 'rom-verified' },
  // Dragons (family 0x51, sub_80EF4D0 → t3 0xC9): on frame 2 a dragon comes down the nearest enemy column (sub_80ED040; else the
  // panel ahead) from above the field at 4 px a frame (byte_80DE3DC), swings one column back over 10 frames (0x28 / 4,
  // sine bob), and goes up that column and away. Its head's hit area (area 1) is re-armed on every new panel (sub_80DE730);
  // four body pieces (t3 0xC8, no collision data) follow 3 / 6 / 9 / 12 frames behind.
  HeatDrgn: { kind: 'dragon', pal: 0, anim: 'buster', lock: 50, confidence: 'rom-verified', note: 'the body pieces (t3 0xC8) make no collision data, so only the head hits' },
  ElecDrgn: { kind: 'dragon', pal: 3, anim: 'buster', lock: 50, confidence: 'rom-verified' },
  AquaDrgn: { kind: 'dragon', pal: 6, anim: 'buster', lock: 50, confidence: 'rom-verified' },
  WoodDrgn: { kind: 'dragon', pal: 9, anim: 'buster', lock: 50, confidence: 'rom-verified' },
  // Special chips (family 0x15, sub_80EBD9C → off_802CCB4[subfamily], t4 objects; the game freezes time and shows the name).
  // Barriers (sub 4 → t4 0x2F): sub_801A7CC(params[0]) sets the barrier type; byte_8020B2C[type] = HP, the least damage that
  // touches it, and a timer: Barrier 1 → 10 HP, Barr100 5 → 100, Barr200 7 → 200, BblWrap 8 → 1 HP that grows back 0xF0
  // frames after it pops (an Elec hit pops it for good), LifeAur 9 → hits under 200 do nothing, a bigger one breaks it, 3000
  // frames (sub_801A802). A barrier stops the whole hit that reaches it, even one that breaks it (the hit's damage is cleared
  // at loc_801A96E). The chip waits 0x3C frames inside the freeze (sub_80E3AFC).
  Barrier: { kind: 'barrier', freeze: true, hold: 60, hp: 10, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Barr100: { kind: 'barrier', freeze: true, hold: 60, hp: 100, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Barr200: { kind: 'barrier', freeze: true, hold: 60, hp: 200, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  BblWrap: { kind: 'barrier', freeze: true, hold: 60, hp: 1, wrap: 240, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  LifeAur: { kind: 'barrier', freeze: true, hold: 60, hp: 1, min: 200, time: 3000, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Invisibl (sub 1 → t4 0x5D, sub_8010474): the flashing-invisible timer = params[0] | params[1] << 8 = 360 frames; 0x1E in the freeze.
  Invisibl: { kind: 'invis', freeze: true, hold: 30, ticks: 360, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Panel chips (sub 5 → t4 0x20 → t4 0x1F, byte_80E272C[params[0]], 0x14 bytes): panel type, which panels, blinking for
  // 0x40 frames, then set. PnlRetrn 0: type 2 (normal) on every panel of MegaMan's side; HolyPanl 4: type 5 (holy) under
  // MegaMan; Snctuary 5: holy on every panel of MegaMan's side (sub_80E29F8 / sub_80E2A9A).
  PnlRetrn: { kind: 'panels', freeze: true, hold: 64, type: 'normal', where: 'side', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // ComingRd / GoingRd (sub 5, byte_80E272C rows 17 / 18): every enemy-side panel (needs 0x20, not 0x80) turns to road type
  // 0xB (toward MegaMan) / 0xC (away), 0x40 frames of blinking first. On a road (types 9–12, byte_800E538: up, down, left,
  // right) anything without FlotShoe slides one panel (4 frames), waits 5, and goes again (sub_801A400, sub_80166D0).
  ComingRd: { kind: 'panels', freeze: true, hold: 64, type: 'road-left', where: 'enemy', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  GoingRd: { kind: 'panels', freeze: true, hold: 64, type: 'road-right', where: 'enemy', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  HolyPanl: { kind: 'panels', freeze: true, hold: 64, type: 'holy', where: 'self', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Snctuary: { kind: 'panels', freeze: true, hold: 64, type: 'holy', where: 'side', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Cubes (sub 6 → t4 0x37 → t3 0x59): on the panel ahead; byte_80CF934[params[0]]: RockCube 1 (animation 1, HP 0x64 · 2 = 200),
  // IceCube 3 (animation 2, HP 200, Aqua); 6000 frames.
  RockCube: { kind: 'place', freeze: true, hold: 60, obj: 'Cube', sprite: 'cubefx', seq: 'rock', hp: 200, life: 6000, ahead: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  IceCube: { kind: 'place', freeze: true, hold: 60, obj: 'Cube', sprite: 'cubefx', seq: 'ice', hp: 200, life: 6000, ahead: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Gauge chips (sub 25 → t4 0x1C, sub_80E23E8): the gauge fills at 0x10 (SloGauge) or 0x40 (FstGauge) a frame instead of
  // 0x20 (sub_801DF8C) for 0x1E0 frames on the user's side (the opponent's for 0x438 only in link battles); 0x46 in the freeze.
  SloGauge: { kind: 'gauge', freeze: true, hold: 70, rate: 0x10, ticks: 480, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'against the CPU only MegaMan\'s own gauge changes' },
  FstGauge: { kind: 'gauge', freeze: true, hold: 70, rate: 0x40, ticks: 480, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Time bombs (sub 10 → t4 0x27 → t3 0x4B, sub_80E3290): on the first panel ahead in MegaMan's row that is solid, on the enemy
  // side and free (sub_80E3264); byte_80CD8AC[params[0]]: HP 50 (TimeBom) / 200 (TimeBom+); it counts 3, 2, 1 (0x3C frames each)
  // and 0x1E more, then a hit area 0x82 / 0x81 by side (byte_80CDD30) with the chip's damage; destroyed first, it does nothing.
  TimeBom1: { kind: 'place', obj: 'TimeBomb', sprite: 'timebombfx', seq: 'idle', hp: 50, life: 210, freeze: true, hold: 30, inRow: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  TimeBom2: { kind: 'place', obj: 'TimeBomb', sprite: 'timebombfx', seq: 'idle', hp: 50, life: 210, freeze: true, hold: 30, inRow: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  TimeBom3: { kind: 'place', obj: 'TimeBomb', sprite: 'timebombfx', seq: 'idle', hp: 50, life: 210, freeze: true, hold: 30, inRow: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  'TimeBom+': { kind: 'place', obj: 'TimeBomb', sprite: 'timebombfx', seq: 'plus', hp: 200, life: 210, freeze: true, hold: 30, inRow: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Instruments (sub 9 → t4 0x4A → t3 0x78): a box on the panel ahead (solid, free), 60 HP, 0x960 frames; byte_80D4078[kind]
  // [play / 2, every, animation, sound]: it gets ready for 0x1E frames, plays for 2·play frames applying its effect every 3
  // frames, rests dword_80D42C8[kind] frames, and again. Fanfare 0x55: MegaMan's side invincible (object_setInvulnerableTime 4);
  // Discord 0x37: area 0x85 / 0x84 (the enemies' panels) status 0x23; Timpani 0x3C: area 0x83 status 0x43, the screen shakes;
  // Silence 0x78: area 0x80 status 0x33. Rests 0xAA / 0x3C / 0xAA / 0x1E.
  Fanfare: { kind: 'place', obj: 'MusicBox', sprite: 'musicboxfx', seq: 'idle', hp: 60, life: 2400, ahead: true, freeze: true, hold: 60, music: 'fanfare', play: 170, rest: 170, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Discord: { kind: 'place', obj: 'MusicBox', sprite: 'musicboxfx', seq: 'idle', hp: 60, life: 2400, ahead: true, freeze: true, hold: 60, music: 'discord', play: 110, rest: 60, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'status 0x23 (confusion) only acts on Navis, and the CPU Navis here have no confusion yet' },
  Timpani: { kind: 'place', obj: 'MusicBox', sprite: 'musicboxfx', seq: 'idle', hp: 60, life: 2400, ahead: true, freeze: true, hold: 60, music: 'timpani', play: 120, rest: 170, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'status 0x43 read as a hold-still' },
  Silence: { kind: 'place', obj: 'MusicBox', sprite: 'musicboxfx', seq: 'idle', hp: 60, life: 2400, ahead: true, freeze: true, hold: 60, music: 'silence', play: 240, rest: 30, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'status 0x33 stops chip use; the CPU enemies here use no chips' },
  // Geddon (sub 3 → t4 0x1D → t4 0x1E, byte_80E2588[params[0]]): every solid panel, in a shuffled order, one every 8 frames,
  // inside the freeze; params[0] 1 → object_breakPanel (0x800CAE8). MegaMan's panel is reserved meanwhile.
  Geddon: { kind: 'geddon', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Traps (sub 20 → t4 0x2A, sub_80E3504): in the freeze the chip is stored as MegaMan's side's trap (sub_802CE8A,
  // unk_2036720: chip, damage) and hidden; one trap a side, a new one replaces it. hiveBlockHappensHere_802CEF4 checks every
  // hit on MegaMan: AntiDmg (0xBB) and BodyGrd (0x157) spring on a hit of 10 or more, AntiSwrd (0xBC) on a sword hit
  // (collision flag 0x2000, not 0x20000); the hit is cleared. Responses (sub_801056A): AntiDmg → attack 0x47 (sub_80EE92C:
  // MegaMan hides, a shuriken sub_80DD91A at the target of sub_8016004, 0x1E frames), AntiSwrd → 0x48 (sub_80EEA78:
  // invincible, 3 sword waves t3 0x58, area 4, 8 px a frame, one every 0x16 frames), BodyGrd → 0x4B (sub_80EED74: hides;
  // t4 0x6E fires 10 shurikens, one every 0x14 frames). ElemTrap (0xC5 → t3 0x4D, sub_80CE034): an all-panel catcher;
  // the first Fire / Aqua / Elec / Wood attack that touches it makes t4 0x2B hit every panel with an enemy on it with that
  // element and the chip's damage (sub_80E362C). AntiNavi / AntiRecv answer the opponent's Navi / recovery chips; the CPU
  // enemies here use no chips, so they never spring.
  AntiDmg: { kind: 'trap', freeze: true, hold: 60, trap: 'damage', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  BodyGrd: { kind: 'trap', freeze: true, hold: 60, trap: 'bodyguard', anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'which enemy each shuriken picks (sub_80E8326) is taken as the next one in turn' },
  AntiSwrd: { kind: 'trap', freeze: true, hold: 60, trap: 'sword', anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'sword attacks = collision types whose flags (byte_8019C7C) have 0x2000 and not 0x20000: 7, 0x11, 0x1C, 0x28, 0x40, 0x42, 0x45, 0x50, 0x53, 0x54' },
  ElemTrap: { kind: 'trap', freeze: true, hold: 60, trap: 'element', anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'sprung by any enemy Fire / Aqua / Elec / Wood attack aimed at panels; hazards that only check MegaMan\'s own panel spring it only when they hit him' },
  AntiNavi: { kind: 'trap', freeze: true, hold: 60, trap: 'navi', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  AntiRecv: { kind: 'trap', freeze: true, hold: 60, trap: 'recovery', anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Wind / Fan (sub 8 → t4 0x25, sub_80E30E0): on the panel ahead (needs 0x10, not 0x0F880080) a box t3 0x48
  // (sub_80CCFFC: sprite 4/9 = the WindBox virus sprite, palette Param1, HP byte_80CCFD4 = 40, Timer 0x5A0). After
  // 1 frame it blows (sound 0x94 / 0xAD); every 0xC frames a gust t3 0x49 (sub_80CD488) goes down the next row in the order
  // game rows 2, 1, 3, …; mode byte_80CCFD4[1]: Wind 0 (from the nearest enemy panel, sub_80CD26C), Fan 1 (from the back
  // edge, sub_80CD236). The freeze holds 0x1E frames.
  Wind: { kind: 'place', obj: 'WindBox', sprite: 'windbox', seq: 'idle', pal: 0, hp: 40, life: 1440, ahead: true, freeze: true, hold: 30, wind: 1, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'gust t3 0x49: 10 px a frame from the first enemy panel, enemy side only; hit modifier 8 → byte_800F604 (+1, 0, 6): each enemy it passes slides back as far as it can' },
  Fan: { kind: 'place', obj: 'WindBox', sprite: 'windbox', seq: 'idle', pal: 1, hp: 40, life: 1440, ahead: true, freeze: true, hold: 30, wind: -1, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'gust t3 0x49 from the back edge toward MegaMan; hit modifier 4 → byte_800F604 (−1, 0, 6): each enemy it passes slides forward as far as the enemy side allows' },
  // Cursor chips: inside the freeze a copy of MegaMan (t1 0x13 / 0x14) steers a cursor that moves on its own; the chip
  // button fires (AIData Unk_2c bit 0), or it fires by itself after 0x12C frames. 0x10 frames later the hit, then 0x3C.
  // BurnSqr (sub 23 → t4 0x59 → t1 0x13): a 2 × 2 square, game x 5 → 1 along rows 2–3, then x 1 → 5 along rows 1–2,
  // one panel every 6 frames (ho_80BB170, dword_80BB094); fire (sub_80C8DE0, 0x1E04) on each solid (0x10) panel of it.
  BurnSqr1: { kind: 'cursor', cursor: 'square', every: 6, freeze: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  BurnSqr2: { kind: 'cursor', cursor: 'square', every: 6, freeze: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  BurnSqr3: { kind: 'cursor', cursor: 'square', every: 6, freeze: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Magnum (sub 24 → t4 0x5B → t1 0x14, sub_80BB398): the cursor runs along game row 2 from the front enemy column to the
  // back one, then down game column 5, rows 1–3, one step every 0xC frames (sub_80BB4CE). Fired while running along the
  // row it hits that column (region 4), while running down the column that row (region 0x1D); the panels break
  // (object_breakPanel_dup2, region type 0xA, 0x0A050601), the screen shakes 0x1E (sub_80BB52E).
  Magnum: { kind: 'cursor', cursor: 'magnum', every: 12, freeze: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Meteors (sub 16 → t4 0x34, sub_80E41CC): targets sub_80E42AA = the enemy panels column by column from the back edge
  // (rows 1–3 each), in that order; 2 frames, then one meteor every 0xA frames, 0x1E of them, cycling the list; then 0x5A.
  // Each meteor (sub_80CF5B2 → t3 0x56, Param1 1: byte_80CF3AC = sprite 0x0C/0x31, collision 0x0A / 5, shake, no crack)
  // waits 0x1E high up, falls 0x10 frames (16 px a frame, from 256 px behind and above) and hits its panel if it is there
  // (0x0F800010). All of it runs inside the freeze (object flag 0x10).
  Meteors: { kind: 'meteors', freeze: true, hold: 2 + 10 * 30 + 90, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Mine (sub 11 → t4 0x29, hold 0x78 → sub_80CDF60 → t3 0x4C): candidates = solid enemy panels with nobody on them
  // (byte_80CDF50: needs 0x30, not 0x0F8C0080), shuffled (ShuffleByteList_PrimaryRNG); it hops to the next one every 2
  // frames, 0x3C times, then hides on the last (region 1, collision 0x33 / 0x2A, HP 1). It goes off when an enemy steps on
  // it or its panel breaks: the chip's damage, explosion effect 0x47.
  Mine: { kind: 'mine', freeze: true, hold: 120, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // AirRaid (sub 13 → t4 0x4B, sub_80E5F10, hold 0x3C): on a free panel ahead (byte_80E5F68: not 0x0F880080) a fighter
  // plane t3 0x75 (sub_80D3500: sprite 4/0x18 = FighterPlane, byte_80D34C0[Param1] = [life / 2, bombs, palette, HP]:
  // [75, 10, 0, 30], [95, 14, 1, 40], [115, 18, 2, 50]). Animation 1, rises 0xA000 a frame for 0x1E frames, animation 2,
  // then a bomb every 0xA frames (sub_80D3770): the panels with enemies in the columns ahead in turn (sub_80D37F4), 2 / 8
  // of the time a random enemy panel instead, and the back column of its row when no enemy is there; each bomb (t3 9,
  // 0x20600) flashes its panel for 6 frames, then explodes (sprite 0x10/0x26, animation 2) with the chip's damage.
  AirRaid1: { kind: 'place', obj: 'AirRaid', sprite: 'fighterplane', seq: 'idle', pal: 0, hp: 30, life: 150, ahead: true, freeze: true, hold: 60, raid: 10, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  AirRaid2: { kind: 'place', obj: 'AirRaid', sprite: 'fighterplane', seq: 'idle', pal: 1, hp: 40, life: 190, ahead: true, freeze: true, hold: 60, raid: 14, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  AirRaid3: { kind: 'place', obj: 'AirRaid', sprite: 'fighterplane', seq: 'idle', pal: 2, hp: 50, life: 230, ahead: true, freeze: true, hold: 60, raid: 18, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Sensor (sub 28 → t4 0x65, sub_80E7C40, hold 0x3C): t3 0xA6 (sub_80DA07C) on a free panel ahead: sprite 4/5 (KillerEye),
  // palette Param1 (0 / 3 / 6), HP Param2 (20 / 30 / 40), Timer 0x2D0. Its row sets the aim (dword_80DA104: top → down,
  // middle → straight, bottom → up; dword_80DA3E8 −1 / 0 / +1). Animation 10, after 0x28 animation 0, after 0xA [1, 0, 4],
  // after 0xE [2, 0, 5] and a dot (t3 0x9F, sprite 0x10/0x50) that steps one panel along the line every 8 frames and
  // starts over at the field's edge (sub_80D9298). An enemy on the dot's panel (0x4000000) fires it: animation [8, 7, 9],
  // a laser (t3 0xA0, sprite 0x10/0x51, animation dword_80D9408 [1, 0, 2], height byte_80D9410 [0x10, 0x16, 0x14], collision 0x16,
  // status byte_80D941C[0] = 0x10 paralysis) on every panel of the line until it hits once; the Sensor goes 0x78 frames later.
  Sensor1: { kind: 'place', obj: 'Sensor', sprite: 'sensorfx', seq: 's10', pal: 0, hp: 20, life: 720, ahead: true, freeze: true, hold: 60, sensor: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Sensor2: { kind: 'place', obj: 'Sensor', sprite: 'sensorfx', seq: 's10', pal: 3, hp: 30, life: 720, ahead: true, freeze: true, hold: 60, sensor: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  Sensor3: { kind: 'place', obj: 'Sensor', sprite: 'sensorfx', seq: 's10', pal: 6, hp: 40, life: 720, ahead: true, freeze: true, hold: 60, sensor: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Snake (sub 12 → t4 0x45, sub_80E5988 → sub_80D2E94 → t3 0x72): inside the freeze it walks the holes on MegaMan's side
  // (byte_80D2D30: not 0x20, not solid 0x10, not 0x0F880080), back column first, rows top to bottom (sub_80D2CBE). Each hole
  // sends a snake (t3 0x73, sprite 0x0C/0x2C): rises 2 px a frame to 10 px, waits 0x14, bites (animation 1, 9 frames), then
  // flies at 16 px a frame at its target (sub_80D2D40: panels ahead with 0x05800000, nearest row, then nearest column) and
  // hits that panel (0x04050501); with no target it flies straight on. Next snake 8 frames later in the same column,
  // 0x18 otherwise; when the last one is gone, 0x28 more.
  Snake: { kind: 'snake', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // GrabBnsh / GrabRvng (sub 15 → t4 0x22, sub_80E2D08): every panel of MegaMan's the enemy holds (sub_800D618: original
  // alliance ≠ current, original = his) gets effect 0x3B and goes back soon (object_setPanelAllianceTimerShort); then, after
  // 0x1E, once per panel taken back and 0x1E apart, every enemy-occupied panel (byte_80E2E24: 0x200000) is struck (t3 0x46,
  // sprite 0x0C/0x13) with the chip's damage; 0x3C after. With no stolen panel it ends after 0x1E.
  GrabBnsh: { kind: 'grabback', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the CPU enemies here never steal MegaMan\'s panels, so in practice it only stops time' },
  GrabRvng: { kind: 'grabback', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the CPU enemies here never steal MegaMan\'s panels, so in practice it only stops time' },
  // Anubis (sub 17 → t4 0x33, sub_80E4130, hold 0x78 → sub_80CF374 → t3 0x55): a statue (byte_80CF0C0[0]: sprite 0x0C/0x30,
  // every 6 frames, animation 0, HP 100, Timer 0xBB8) drops on the panel ahead from Z 0xA0 at 8 px a frame (shake 0x1E; it
  // breaks if the panel is not solid and free), then every 6 frames hits the whole enemy area (byte_80CF31C: region 0x82,
  // collision 0x52) with the chip's damage (1), and every 0x10 frames shows an effect on a random enemy panel.
  Anubis: { kind: 'place', obj: 'Anubis', sprite: 'anubisfx', seq: 'idle', pal: 0, hp: 100, life: 3000 + 20, ahead: true, freeze: true, hold: 120, anubis: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Guardian (sub 14 → t4 0x52, sub_80E679C, hold 0x1E): on the panel ahead (needs 0x10, not 0x0F880080) a statue t3 0x7D
  // (sub_80D4CA4: sprite 0x0C/0x35, HP 1, Timer 0x1770, collision 0x0E / 0x0F from frame 3). When an attack hits it, it takes
  // the attacker's alliance (sub_80D4FF6: 0x55000000 = MegaMan's side, 0xAA000000 = the enemy's) and stops time (t4 0x53, its
  // name, 0x3C): it strikes every panel the other side occupies (byte_80D4EB4: 0x85 / 0x84) with the chip's damage, the
  // screen shakes 0x3C, then it crumbles. Hit by MegaMan it strikes the enemies; hit by an enemy it strikes MegaMan.
  Guardian: { kind: 'place', obj: 'Guardian', sprite: 'guardianfx', seq: 'idle', pal: 0, hp: 1, life: 6000, ahead: true, freeze: true, hold: 30, guardian: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // BugFix (sub 26 → t4 0x3B, sub_80E4954): sub_80E49C4 zeroes MegaMan's bug stats (navi stats 0x31, 0x13, 0x14, 0x16, 0x54,
  // 0x24, 0x19, 0x18, …) and the HP drain; a copy of him (t1 0x5D, sub_80C4958) flashes white, faster and faster, for 0x78
  // frames, then 0x1E; the freeze ends with it.
  BugFix: { kind: 'bugfix', freeze: true, hold: 0x78 + 0x1E, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // Otenko (sub 18 → t4 0x5F, sub_80E7668, hold 0x3C): on the panel ahead (byte_80E76C4: needs 0x10, not 0x0F880080) t3 0xAD
  // (sub_80DB108: sprite 0x0C/0x00, HP 100, Timer 0x708). 5 frames on, animation 1, then every 5 frames (sub_80DB1E0): if
  // MegaMan's next chip can take a bonus (ChipData flags bit 1), +1 to its damage; at most 0x32 for the same chip.
  Otenko: { kind: 'place', obj: 'Otenko', sprite: 'otenkofx', seq: 'idle', pal: 0, hp: 100, life: 1800, ahead: true, freeze: true, hold: 60, otenko: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // CircGun (sub 19 → t4 0x5E, sub_80E75AC → t3 0x89, sub_80D65FC): inside the freeze a cursor (sprite 0x10/0x45) starts on
  // the back enemy column, top row (dword_80E75FC), and runs down / up the column, then along the row while the next column
  // has enemy panels, bouncing at the edges; a step every params[0] + 1 = 3 frames (1 after a bounce). The chip button, or
  // 0x168 frames, arms it: the next params[1] = 4 panels it leaves each get a marker (t3 0x8A) that hits 0x14 + 4 × params[0]
  // = 28 frames later (0x0A050001, solid panels only). Then 0x1E.
  CircGun: { kind: 'cursor', cursor: 'circgun', every: 3, freeze: true, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // NumbrBl (sub 22 → t4 0x69, sub_80E7F80 → sub_80C31F0 → t1 0x45, a copy of MegaMan): damage code 1021 → sub_8010BF0 =
  // MegaMan's HP mod 100, taken when the chip is used. Inside the freeze: 0x14, then params[0] = 4 balls, 0x12 frames apart
  // (sub_80C314E → sub_80D73D6 → t3 0x91, sprite 0x10/0x46): each shows 0xE, waits Param2 = 0xA (animation 1), then rolls
  // from the panel ahead at 3 px a frame and bursts on the first thing it touches (collision 4 / 5). Then 0x3C.
  NumbrBl: { kind: 'numberball', freeze: true, hold: 0x14 + 4 * 0x12 + 0x3C, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // BlzrdBal (sub 21 → t4 0x58, sub_80E6FCC, hold 0x78 → sub_80B8BA0 → t1 0x4, a copy of MegaMan): after 0x22 frames
  // (animation 0xC at 4 left) a snowball t3 0xB2 (sprite 0x10/0x47) starts 10 px ahead of him and rolls 3 px a frame,
  // hitting each panel it enters (collision 4 / 5); a helper 20 px in front (t3 0xB7, sub_80DC310) swallows field objects
  // (name ids 0xCD–0xFF, sub_80DC3B2) and each one adds the chip's damage again (animation 1 from the first). It stops
  // off a solid panel.
  BlzrdBal: { kind: 'blizzard', freeze: true, hold: 0x78, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the snowball rolls once time runs again' },
  // LifeSync (sub 7 → t4 0x5C, sub_80E72C8): a cursor 2 panels ahead in MegaMan's row; if an enemy stands there, every
  // other enemy is linked to it (0x14, then 0x3C) and gets its HP (sub_80E73A2), then 0x1E. Cybeasts (0x49–0x4E) are left out.
  LifeSync: { kind: 'lifesync', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // SumnBlk (sub 36 → t4 0x7C, sub_80E9164): only when the panel ahead is a hole (no 0x0F800010). A creature (t1 0x32,
  // sprite 4/0x1D, palette level × 3) rises from it: 0x18, animation 5 to its end, animation 4 for 0x1E; then it picks an
  // enemy at least 2 columns from MegaMan with a free panel in front (sub_80C18B0: walked from the last slot, joining
  // while no farther than the nearest so far, then the top-most row, ties to the later), warps there (effects 0x15 /
  // 0x14, 2 frames), animation 1 to its end, 0xA, animation 2: a slash on the column in front (0x0705FF04, rows ±1, sword
  // type 7, effect 0x16), animation 2 to its end, 0x10, then back to the hole (0x10). Inside the freeze.
  SumnBlk1: { kind: 'sumnblk', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  SumnBlk2: { kind: 'sumnblk', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  SumnBlk3: { kind: 'sumnblk', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // ColorPt / DblPoint (sub 27 → t4 0x50, sub_80E64C4 / sub_80E650A): in each row, the enemy's front panel (sub_800D4D0)
  // if it is solid, free and his to take (sub_800D668) becomes MegaMan's (object_setPanelAllianceTimerLong, 0x708) under a
  // point (t4 0x51, sprite 0x0C/0x13, palette params[0] × 4): 0x13 frames, rises 4 px a frame to 16, 0x10, then flies at
  // MegaMan speeding up 0x4000 a frame; reaching him it adds params[1] (10 / 20) to his next chip's damage if that chip takes
  // bonuses (sub_80E667C). The freeze ends when the last point arrives.
  ColorPt: { kind: 'colorpoint', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  DblPoint: { kind: 'colorpoint', freeze: true, hold: 0, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  // HubBatc (sub 38, Param1 0 → t4 0x84, sub_80E95D8, 0x3C): buster Attack raised to 5 (sub_801265A), Speed 4, Charge 4,
  // CustomLevel 8, FloatShoes / AirShoes / UnderShirt (navi stats 0x1B–0x1D, object flags 0x40030), the custom bug pushed
  // back a turn, B+Left 0x3B if none. For the rest of the battle.
  HubBatc: { kind: 'hubbatch', freeze: true, hold: 0x3C, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'B+Left ability 0x3B is not mapped in the app' },
  // Family 0x1C (sub_80EC39C): the attack ends at once (exitAttackState); off_80EC3F0[subfamily] spawns the object.
  // FireHit (sub 8, sub_80CFE08 → sub_80CFE5C): looks ahead for the first column with an enemy (panel flag 0x4000000) and puts
  // a fist t3 0x5B (sprite 0x14/0x1A) on each enemy row, but the column it puts them in stops moving after two empty columns,
  // so the fists never land more than 3 columns ahead. The fist flashes the panel 10 frames, hits once (0x4050101), then
  // shows its animation 0x25 frames (sub_80CFD80 / sub_80CFDB0).
  // SandWrm (sub 12, sandwormAttack_80DEDE0): for each of the first 4 enemies, if the panel behind it is standable and empty
  // (0x10000 set, 0x05800000 clear), a worm (t3 0xCB, the SnakeArm sprite 0x04/0x1A, palette = params[0]) leaps from there
  // one panel forward onto the enemy over 0x10 frames, 0x16 px high (byte_80DEA50, byte_80DEE58), animations 1–4 by quarter;
  // it hits the panel it enters (region 1, 0xA / 5), then is gone; its holes stay 20 frames (byte_80DEA70). An enemy in the
  // back column, or with something behind it, is not attacked.
  SandWrm1: { kind: 'sandworm', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  SandWrm2: { kind: 'sandworm', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  SandWrm3: { kind: 'sandworm', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // Family 0x1C subfamily → off_80EC3F0 index: 17 sub_80C6330, 19 sub_80DB4B4 (JustcOne), 20 sub_80CD4AC, 21 sub_80E4FCA
  // (GolmHit), 22 sub_80C9ECE (ColArmy). (0.86.0 had JustcOne's hand under GolmHit.)
  // JustcOne (sub 19, sub_80DB4B4 → t3 0xAE): a hand (sprite 0x0C/0x62) drops on the enemies' middle panel of their second
  // column (ROM 5, 2) from 0x100 px up and behind, 16 px a frame for 16 frames. Only if that panel holds something
  // (0xF800010): it hits it (chip damage), hits the 8 panels round it for 100 (regions 0x405FF0A / 0x405FF0C = panel lists
  // 0xA and 0xC, damage (r6 & 0xFFFFF000) + 0x64), cracks the 3×3 (list 0xF), shakes 0x2D frames (sub_80DB3B4, sub_80DB4CE).
  // Then it stays 0x1E frames, blinking.
  JustcOne: { kind: 'justcone', anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'the 100 for the 8 round panels is read from the region\'s damage word' },
  // GolmHit (sub 21, sub_80E4FCA → t4 0x3F, sprite 0x10/0x30, palette params[0]): aims at the nearest enemy-side panel in
  // MegaMan's row (filter 0x10000 / not 0x20); flies in 0x5F px back and 0x28 up at 0x20.8 / 12.5 px a frame for 2 frames,
  // then 10 px back and 0x1E up at 5 / 15 px for 2 more (animation 4, then 3). On a standing panel (flag 0x10) it hits that
  // panel and the ones above and below that stand (0x1505FF01, sub_80E5050), shakes 0x1E, cracks only if params[2] (never for
  // the chips), and stays 0x2D frames; over a hole it hits that one panel and is gone.
  GolmHit1: { kind: 'golmhit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  GolmHit2: { kind: 'golmhit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  GolmHit3: { kind: 'golmhit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // ColArmy (sub 22, sub_80C9ECE): every field object (BattleState +0xA0 list, both sides; not NameID 0xDA or collision flags
  // 0x348000) is taken away (sub_800F898) and a soldier (t3 0x30, sprite 0x10/0x1D) stands on its panel. It faces an enemy
  // ahead in its row; with none ahead it turns round if one is behind or it is in the back column (sub_80C9F18). It shows at
  // frame 0x12, and from frame 0x30 fires 3 shots 10 frames apart (t3 0x12: one panel a frame, the first thing it meets,
  // chip damage), then leaves (animation 2).
  ColArmy: { kind: 'colarmy', anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'every placed object in the app counts as a field object' },
  // SyncTrgr (sub 13, sub_80EC44C): sub_8015BEC(alliance, 0xFF) = Full Synchro, unless Tired / Angry hold the emotion.
  SyncTrgr: { kind: 'synctrgr', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // FlmHook (sub 14, sub_80EA11C → t4 0x8C): two flames t3 0xCA (sprite 0x0C/0x45), the second 0x14 frames after the first.
  // Each swings on a circle of radius 0xA000 × cos/sin (160 px) about (−0x78 + (column − 4) × 0x28, 0x30) in field pixels
  // (panel x × 40 − 140, y × 24 − 20); flame 1: column = MegaMan's + 1, angle 0x16 turning −0x380 a frame; flame 2: column
  // = MegaMan's + 2, angle 0xF5 turning +0x380; 0x1E frames each (byte_80DE894, sub_80DE984). On each new field panel it
  // hits region 2 (that panel and the one in front, list byte_80198EC).
  FlmHook1: { kind: 'flmhook', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  FlmHook2: { kind: 'flmhook', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  FlmHook3: { kind: 'flmhook', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // ColForce (sub 15, sub_80E94DC → t4 0x80, sub_80E94F8): from the far side (ROM column 5) toward MegaMan, the first column
  // with any of MegaMan's own panels that stand (0x10) and are free (not 0x03800020) gets a soldier (t3 0xCF, the ColArmy
  // sprite) on each, 10 frames apart; 0x32 frames later the next column on, until none is left. A soldier drops in, stands
  // 0x14 frames, fires 3 shots 10 apart (t3 0x12, down its row), then animation 3 for 10 and 2 for 0xD frames.
  ColForce: { kind: 'colforce', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // Lance (sub 4, sub_80D2596 → t3 0x6F ×3): in the enemies' back column (ROM column 6), all three rows; each lance starts
  // 0x40 px further back, comes in 8 px a frame for 8 frames, hits its panel on frame 6 (0x4040401), then stays 0x14
  // frames, flickering (sub_80D2514 / sub_80D255A). Sprite 0x0C/0x44 turned to face MegaMan.
  Lance: { kind: 'lance', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // FullCust (sub 5, sub_800AF34): custom gauge set to full (SetCustGauge 0x4000).
  FullCust: { kind: 'fullcust', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  FireHit1: { kind: 'firehit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  FireHit2: { kind: 'firehit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  FireHit3: { kind: 'firehit', anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // Boomer (sub 1, sub_80CA4F6 → t3 0x32, sprite 0x10/0x07): from MegaMan's back corner of the bottom row it flies along the
  // bottom row to the far column's centre, up it to the top row, then back along the top row and off (sub_80CA408);
  // byte_80CA26C[params[0]]: X 8 / 9 / 10 px, Y 0x4CCCD / 0x56666 / 0x60000 a frame; each panel it enters is hit once.
  Boomer: { kind: 'boomer', speed: [8, 4.8], anim: 'idle', lock: 1, confidence: 'rom-verified' },
  HiBoomer: { kind: 'boomer', speed: [9, 5.4], anim: 'idle', lock: 1, confidence: 'rom-verified' },
  'M-Boomer': { kind: 'boomer', speed: [10, 6], anim: 'idle', lock: 1, confidence: 'rom-verified' },
  // Charge-shot chips (sub 38 → t4 0x84): set MegaMan's charge shot (navi stat 5 BPwrAtk) for the rest of the battle; the
  // charge shot then runs as a chip action (sub_80117BA): 0x21 BugRSwrd → sword 80 (200 with a bug frag); 0x22 BgDthThd →
  // Thunder 40, elec (200 with a bug frag); 0x23 PunchArm → FireHit 100 fire; 0x24 NeedlArm → AquaNdl 40 aqua; 0x25
  // PuzzlArm → ElcPuls 100 elec (status 0x10); 0x26 BoomrArm → Boomer 100 wood. 0x3C (BugRSwrd 0x3C, arms 0x3C).
  BugRSwrd: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'Sword', damage: 80, element: 'none' }, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the app has no bug frags, so the 200-damage version never happens' },
  BgDthThd: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'Thunder', damage: 40, element: 'elec' }, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the app has no bug frags, so the 200-damage version never happens' },
  PunchArm: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'FireHit1', damage: 100, element: 'fire' }, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  NeedlArm: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'AquaNdl1', damage: 40, element: 'aqua' }, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  PuzzlArm: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'ElcPuls1', damage: 100, element: 'elec' }, anim: 'idle', lock: 20, confidence: 'rom-verified' },
  BoomrArmSyncTrgr: { kind: 'chargeshot', freeze: true, hold: 0x3C, shot: { name: 'Boomer', damage: 100, element: 'wood' }, anim: 'idle', lock: 20, confidence: 'rom-verified', note: 'the chip is BoomrArm; the ROM name string runs into the next one' },
  MiniBomb: { kind: 'throw', range: 3, flight: 40, release: 9, region: 1, anim: 'throw', lock: 22, confidence: 'rom-verified', note: 'params[0] = 0 → area 1; 40 frames in the air (t3 0x8 Timer 0x28); lock recalled' },
  CrakShot: { kind: 'crack', region: 1, anim: 'crack', lock: 24, speed: 0.25, confidence: 'recalled', note: 'lifts the panel in front (it breaks) and sends it down the row' },
  Recov:    { kind: 'heal', anim: 'idle', lock: 10, confidence: 'recalled' },
  BusterUp: { kind: 'busterup', anim: 'idle', lock: 1, confidence: 'recalled', note: 'the 20-frame chip lockout (ChipData +0x14) follows; the action itself is not decoded' },
  AreaGrab: { kind: 'grab', column: true, anim: 'idle', lock: 1, confidence: 'rom-verified', note: 't4 0x3 0x80E0754: time freeze, a beam (t3 0xF 0x80C6414) on each panel of the first column ahead that is not all MegaMan\'s (0x800D58C)' },
  PanlGrab: { kind: 'grab', column: false, anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'same chip action with param 0: one beam on the edge panel of MegaMan\'s row (object_getEdgePanelMatchingRow)' },
  // Plus chips (family 0x1C sub 3, sub_8010488): joined to the chip before them in the custom screen (sub_8029224, chip IDs
  // 0xC0 / 0xC1 / 0xC3 / 0xB8 / 0xB9) when its effect flags (ChipData +9) allow; used alone, the capsule puff. DarkPlus (0x122)
  // isn't in that list, so it never joins a chip.
  'Atk+10': { kind: 'plus', join: { need: 2 }, anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'joins the chip before it if that chip has effect flag 2 (sub_8029224); used alone it only pops (0x8010488)' },
  'Atk+30': { kind: 'plus', join: { need: 2 }, anim: 'idle', lock: 1, confidence: 'rom-verified' },
  'Navi+20': { kind: 'plus', join: { need: 4 }, anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'only Navi chips have effect flag 4' },
  Uninstll: { kind: 'plus', join: { need: 2, not: 1 }, adds: 'uninstall', anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'the hit strips the target\'s programs (collision 0xF8, sub_80140EE: SuperArmor, shoes, barrier, B+Left); the app\'s enemies have none, so it only joins' },
  DarkPlus: { kind: 'plus', anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'not in sub_8029224\'s list: never joins a chip, used alone it pops' },
  WhiCapsl: { kind: 'plus', join: { need: 2 }, adds: 'paralyze', anim: 'idle', lock: 1, confidence: 'rom-verified', note: 'description "Add an effect: Paralyze" (TextScriptChipDescriptions0 #184); used alone: smoke puff t4 0x14 (sprite 0x14/0x02 animation 1) rising 2 px a frame from 48 px up, sound 0x90 (0x8010488 / 0x80E1CF8)' },
};

// Area stealing (AreaGrab / PanlGrab).
export const GRAB = {
  beamFall: v(32, 'rom-verified', 't3 0xF 0x80C6438: drops from Z 0x100 at 8 px a frame'),
  stealable: v('a panel is taken only if nothing stands on it (reserved flag 0x80) and it joins MegaMan\'s area (0x800D668); whoever stands there takes the beam damage', 'rom-verified', '0x80C64A0, byte_80C6514'),
  hold: v(60, 'rom-verified', '0x80E07B0: 0x3C frames after the beams before time resumes'),
  returnTicks: v(1800, 'rom-verified', 'object_setPanelAllianceTimerLong: 0x708 frames per column (counted down in 0x800C746)'),
  returnRule: v('the column goes back when its timer runs out and nobody stands on it', 'unverified', 'the hand-back order in 0x800C746 is not fully decoded'),
  dim: v(16, 'rom-verified', 'object_dimScreen: SetScreenFade(0x3C, 4) → sub_800647C adds 4 a frame up to 0x40 (FadeParams 0x8006130); undim 0x38 counts back down the same way'),
  name: v(59, 'rom-verified', 'object_drawChipName waits for sub_801E754: message 0x4C (pt_801EF84, type 3) slides in 5 frames, holds 0x30, slides out 5, then clears (sub_801CE28)'),
};

// Element weakness (attacker element → element it deals double damage to).
// Panel types (PanelData.Type, 0x800C380 per-panel update; flags table 0x3007924).
// 0 none, 1 broken, 2 normal, 3 cracked, 4 poison, 5 holy, 6 grass, 7 ice, 8 volcano (a crater that erupts; name from its look, sheet label unverified), 9-12 road.
export const PANELS = {
  types: v(['none', 'broken', 'normal', 'cracked', 'poison', 'holy', 'grass', 'ice', 'volcano', 'road-up', 'road-down', 'road-left', 'road-right'], 'rom-verified', 'type byte → behaviour (graphics for all 13 match the owner\'s panel sheet pixel for pixel): grass heals wood (0x801A186), ice slide (0x801A3DA), volcano eruption (0x800C438), holy halves damage (0x800E3BE)'),
  brokenRepair: v(600, 'rom-verified', '0x800C488: 0x258 frames (0x1E0 in mode 1), blinking for the last 60 (0x800C3F2)'),
  crack: v('a standable panel cracks; a cracked panel with nobody on it breaks; a cracked panel breaks when whoever stood on it steps off', 'rom-verified', 'object_crackPanel 0x800C944, 0x800C402'),
  poisonTicks: v(7, 'rom-verified', '0x801A186: 1 HP every 7 frames (timer 6 → −1); FloatShoe / poison immunity skip it'),
  holy: v('damage halved, rounded up', 'rom-verified', 'object_calculateFinalDamage1 0x800E3E2: (d + 1) >> 1'),
  grassHeal: v({ ticks: 20, lowHpTicks: 180, lowHp: 9 }, 'rom-verified', '0x801A186: wood-element objects +1 HP when battle counter 0x0E (mod 20) is 0, counter 0x16 (mod 180) when HP ≤ 9'),
  grassFire: v('fire attacks do double damage to whoever stands on grass and burn it back to normal', 'rom-verified', 'applyHeatOnGrassDamage 0x300766C, 0x3007708'),
  iceSlide: v('stepping onto ice keeps you sliding the same way (not aqua, not FloatShoe / AirShoe)', 'rom-verified', '0x801A3DA'),
  iceSlideTicks: v(4, 'rom-verified', 'sub_8016730: Unk_1e = 4 frames a panel, 0xA0000 x / 0x60000 y a frame'),
  roadRevert: v(1800, 'rom-verified', 'panel audit: roads revert after 1800 frames'),
  roadPause: v(5, 'rom-verified', 'sub_80166D0 / sub_8016730: AIData Unk_38 = 5 after a road push, counted down before the next (sub_801A36A)'),
  iceFreeze: v(80, 'rom-verified', '0x3007460: an aqua hit on someone standing on ice freezes them (0x50) and the panel turns normal'),
  volcanoCycle: v(140, 'rom-verified', '0x800C438: battle counter 0x8C; columns 1–3 erupt at 140, columns 4–6 at 70'),
  volcanoEruption: v({ warn: 40, burn: 40, damage: 50 }, 'rom-verified', 'object type3 0x07 (0x80C5A58): bubbles 40 frames, flame column 40 frames, 50 damage (sprite 0x10/0x24)'),
  volcanoAqua: v('an aqua attack on volcano turns it normal', 'rom-verified', '0x3007746'),
  roads: v('conveyor panels; revert after 1800 frames', 'rom-verified', '0x800C45C (0x708); movement not modelled yet'),
};

export const WEAKNESS = { aqua: 'fire', elec: 'aqua', wood: 'elec', fire: 'wood' };
export const WEAKNESS_CONFIDENCE = 'recalled';

// Virus AI parameters. HP/element/damage come from data/bn6-viruses.mjs (rom-verified).
// Arrays are indexed by variant (0 base, 1 "2", 2 "3", 3 Ω, 4 Rare, 5 Rare2).
export const AI = {
  // Virus AI table 0x8109050 (index = AI byte × 4). Per-version tables have 6 entries: base, 2, 3, SP, Rare, Rare2.
  Mettaur: { // ForMettaur 0x8109EF4, decision 0x8109FD6
    decision: v('one Mettaur acts at a time (turn token 0x800AA06); on its turn it waits 30 frames the first time, steps one row toward MegaMan until level with him, then swings; the others wait (versions above the base hide under their helmet, guarding)', 'rom-verified', 'states 0x810A004 / 0x810A080 / 0x810A126'),
    firstWait: v(30, 'rom-verified', 'Param4 = 0x1E, action 9'),
    moveWait: v([30, 24, 18, 12, 18, 12], 'rom-verified', 'table 0x8109F46 (wait after a row step)'),
    moveTicks: v([3, 3], 'rom-verified', 'vanish 3 / appear 3 (0x8109D08 / 0x8109D70)'),
    attackTicks: v(64, 'rom-verified', '0xB: animation 1 for 0x40'),
    waveSpawnTick: v(37, 'rom-verified', 'shockwave spawned when the timer reaches 0x1B'),
    afterAttack: v(40, 'rom-verified', '0xB state 4: 0x28 frames, then the turn passes on'),
    waveStepTicks: v([22, 16, 11, 6, 16, 6], 'rom-verified', 'type3 0x16 table 0x80C6B00: frames per panel by version'),
    damage: v([10, 30, 50, 70, 50, 100], 'rom-verified', 'table 0x8109F28'),
    hideTicks: v([34, 53], 'rom-verified', '0xC: helmet down (animation 2) 0x22, guarded (animation 3) until its turn, back up (animation 4) 0x35'),
  },
  Champy: { // table 0x810CD60, decision 0x810CE1A
    decision: v('only when MegaMan is in its row and the panel in front of him is free: vanish, reappear in front of him, punch, return home; versions SP and up follow with a second punch from a new spot', 'rom-verified', 'decision 0x810CE1A, attack 0xB 0x810C9B8'),
    postWait: v([30, 18, 18, 12, 18, 6], 'rom-verified', 'table 0x810CDA8 (action 9 after an attack)'),
    vanishWait: v([8, 1, 1, 1, 1, 1], 'rom-verified', 'table 0x810CDA2 minus 10 (min 1)'),
    appearTicks: v(13, 'rom-verified', '0xB state 4: 0x0D'),
    readyTicks: v([21, 18, 12, 6, 6, 6], 'rom-verified', 'table 0x810CD96, read as the pause before the punch'),
    punchTicks: v(15, 'rom-verified', 'punch animation length (sequence 2)'),
    punchHitTick: v(3, 'rom-verified', 'hit spawned on frame 3 of the punch (0x810CB2A)'),
    secondHitTick: v(5, 'rom-verified', 'second punch (animation 4) hits on frame 5 (0x810CC0A)'),
    holdTicks: v([42, 24, 12, 6, 6, 6], 'rom-verified', 'table 0x810CD9C: hold after punching, and again after returning'),
    damage: v([20, 30, 50, 80, 30, 90], 'rom-verified', 'table 0x810CDAE'),
  },
  Piranha: { // AI 2, table 0x810A550
    decision: v('swims to MegaMan\'s row, then a sonar mark runs ahead along the row; when it finds him, Piranha holds, then fires a torpedo down the row', 'rom-verified', 'decision 0x810A5EA, attack 0xB 0x810A3AC (sonar 0x80E558A, torpedo 0x80CE7EE)'),
    markSpeed: v([1.625, 1.688, 1.75, 1.812, 1.875, 1.938], 'rom-verified', 'table 0x810A580 (px per frame)'),
    hold: v([60, 54, 48, 42, 36, 30], 'rom-verified', 'table 0x810A5BC'),
    torpedoSpeed: v(7, 'rom-verified', 'table 0x810A598 (px per frame)'),
    damage: v([20, 40, 60, 80, 60, 100], 'rom-verified', 'table 0x810A5B0'),
    moveTicks: v(21, 'rom-verified', 'move params 0x14 / 0x15'),
  },
  Heady: { // AI 3, table 0x810A9EC
    decision: v('moves 4 times (wait 12/10/8/6 after each), then the panel ahead flashes for 20 frames and it fires its head straight down its row', 'rom-verified', 'decision 0x810AA72 (counter to 5, 0x810AC9A), attack 0xA 0x810A92C'),
    moveWait: v([12, 10, 8, 6, 12, 10], 'rom-verified', 'table 0x810AA6C'),
    warn: v(20, 'rom-verified', '0xA: 0x14 frames, panel ahead highlighted every 4'),
    headSpeed: v(6.667, 'rom-verified', 'head X speed 0x80BC4E4 (px per frame)'),
    headLife: v(75, 'rom-verified', 'head flight 0x80BC4EC (frames)'),
    recover: v(48, 'rom-verified', 'Unk_18 = 0x30 after the head returns'),
    damage: v([40, 70, 90, 110, 70, 120], 'rom-verified', 'table 0x810AA20'),
  },
  Swordy: { // AI 4, table 0x810B2D0
    decision: v('three kinds by version: Swordy / SP slash when MegaMan is right in front, otherwise step toward his row; Swordy2 / Rare slide along their row toward him and slash; Swordy3 / Rare2 wander and every 4th turn warp in front of him to slash', 'rom-verified', 'decision 0x810B36C, per-version deciders 0x810B3E4 / 0x810B436 / 0x810B49C'),
    windup: v([60, 20, 40, 40, 12, 20], 'rom-verified', 'table 0x810B74C'),
    after: v([100, 30, 60, 80, 16, 40], 'rom-verified', 'table 0x810B752'),
    damage: v([30, 60, 90, 120, 80, 150], 'rom-verified', 'tables 0x810B740 / 0x810B746'),
    shapes: v({ wide: 'front column, three rows', long: 'two panels ahead' }, 'unverified', 'type in Unk_03 from the range check 0x810B598 (or RNG); collision shape not decoded'),
    moveWait: v(30, 'unverified', 'step pace while closing in'),
  },
  KillerEye: { // AI 5, table 0x810BB94
    decision: v('every 120 frames the eye scans a line from the panel ahead (straight or diagonal, cycling by row); if MegaMan is caught, it fires a beam down that line for 120 frames', 'rom-verified', 'decision 0x810BC44, attack 0xA 0x810B878, direction tables 0x810BD7C / 0x810BDAC'),
    interval: v(120, 'rom-verified', 'table 0x810BBD8'),
    scan: v(80, 'rom-verified', 'table 0x810BBE0'),
    delay: v([18, 12, 12, 6, 6, 6], 'rom-verified', 'table 0x810BBE8'),
    beam: v(120, 'rom-verified', '0x810B964: 0x78 frames'),
    recover: v(80, 'rom-verified', 'table 0x810BBF0'),
    directions: v({ 0: [1, 2], 1: [0, 1, 2, 1], 2: [0, 1] }, 'rom-verified', 'per row: 0 = up-diagonal, 1 = straight, 2 = down-diagonal, used in turn'),
    damage: v([50, 100, 150, 200, 120, 250], 'rom-verified', 'table 0x810BBC8'),
  },
  Quaker: { // AI 6, table 0x810C170
    decision: v('first waits 30-100 frames, then keeps hopping to a panel in MegaMan\'s row and slamming down: a shockwave runs from the panel ahead', 'rom-verified', 'decision 0x810C1D8, attack 0xA 0x810BFB8'),
    firstWait: v([30, 100], 'rom-verified', '30 + 10 × (RNG & 7)'),
    hop: v([60, 54, 48, 42, 48, 36], 'rom-verified', 'table 0x810C1BA (frames in the air)'),
    after: v([60, 48, 36, 24, 36, 24], 'rom-verified', 'table 0x810C1C0'),
    waveStep: v([24, 16, 11, 6, 16, 6], 'rom-verified', 'shockwave kinds 6-11 of 0x80C6B00'),
    damage: v([20, 30, 100, 120, 50, 120], 'rom-verified', 'table 0x810C1B4'),
  },
  Catack: { // AI 7, table 0x810C6F0
    decision: v('waits 120 → 60 frames, then rolls to another panel in its row and fires a cannon shell down the row; only one Catack fires at a time (otherwise it waits 120)', 'rom-verified', 'decision 0x810C72E, move 0xA 0x810C524, cannon 0xB 0x810C448 (shell 0x80CB8DE)'),
    firstWait: v([120, 100, 80, 60, 60, 60], 'rom-verified', 'table 0x810C770'),
    rollTicks: v([180, 60, 60, 60, 30, 30], 'unverified', 'table 0x810C7B0 (Unk_30), read as the roll time'),
    waitAfter: v(120, 'rom-verified', 'table 0x810C814'),
    shellStep: v(8, 'unverified', 'shell 0x80CB8DE speed not decoded (frames per panel)'),
    damage: v([70, 100, 150, 200, 130, 200], 'rom-verified', 'table 0x810C81A'),
  },
  WindBox: { // AI 9, table 0x810D0F4
    decision: v('does nothing itself; its wind object sends a gust down one row every 12 frames, cycling bottom → middle → top. WindBox (even versions) blows MegaMan toward his back column, VacuumFan (odd versions) pulls him forward', 'rom-verified', 'decision 0x810D150 spawns type4 0x41 (0x80E5244) with version & 1; gusts 0x80CD488'),
    gustEvery: v(12, 'rom-verified', '0x80E52B0: Timer2 = 0x0C'),
    damage: v(0, 'rom-verified', 'gusts push only'),
  },
  Trumpy: { // AI 10, table 0x810D554
    decision: v('hops 3 times (24 / 18 frames apart), then warps and plays for 120 frames (240 for Rare2); the song\'s effect depends on the version', 'rom-verified', 'decision 0x810D61E, song 0x810D378 with per-version effects 0x810D3B8'),
    hopWait: v([24, 24, 24, 18, 18, 18], 'rom-verified', 'table 0x810D584'),
    song: v([120, 120, 120, 120, 120, 240], 'rom-verified', 'table 0x810D58A'),
    afterSong: v(40, 'rom-verified', '0x28 frames'),
    effects: v(['allies invincible while it plays', 'status region 0x23 on MegaMan\'s side', 'status region 0x43 + screen shake', 'status region 0x33', 'allies fully healed near the end', 'allies invincible while it plays'], 'rom-verified', 'by version: 0x810D3EA / 0x810D414 / 0x810D41E / 0x810D444 / 0x810D44E; statuses 0x23 / 0x43 / 0x33 not decoded (not simulated)'),
  },
  OldStove: { // AI 11, table 0x810D910
    decision: v('slides slowly to MegaMan\'s row and toward the front of its area (0x810DA4C keeps his column within reach), then opens up and breathes fire on the panel ahead for 90 → 180 frames', 'rom-verified', 'decision 0x810D998, slide 0xA 0x8109804, fire 0xB 0x810D7E4 (flame 0x80C5578)'),
    slideSpeed: v([0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125], 'rom-verified', 'table 0x810DC34 (px per frame)'),
    windup: v(38, 'rom-verified', '0xB: 0x26 frames'),
    flameTicks: v([90, 120, 150, 160, 120, 180], 'rom-verified', 'table 0x810DCC2'),
    after: v([120, 100, 80, 60, 80, 40], 'rom-verified', 'table 0x810DCC8'),
    flameLength: v(1, 'unverified', 'flame length from ExtraVars (not decoded); one panel ahead'),
    damage: v([20, 40, 80, 100, 60, 100], 'rom-verified', 'table 0x810DCBC'),
  },
  HauntedCandle: { // AI 12, table 0x810E120
    decision: v('one candle at a time: every 120 frames it marks MegaMan\'s panel (flashing), then a flame strikes it; aqua puts the candle out and fire relights it', 'rom-verified', 'decision 0x810E17A, attack 0xA 0x810DE00'),
    interval: v(120, 'rom-verified', 'table 0x810E174'),
    mark: v([36, 36, 30, 30, 30, 24], 'rom-verified', 'table 0x810E16C'),
    after: v(120, 'rom-verified', 'table 0x810E174'),
    damage: v([50, 80, 130, 150, 100, 150], 'rom-verified', 'table 0x810E154'),
    unlit: v('aqua hits put it out (no attacks), fire relights it', 'unverified', 'flags 0x64 / 0x65 (0x810E2EC); not simulated: no aqua or fire chips yet'),
  },
  Kettle: { // AI 13, table 0x810E7B0
    decision: v('the base Kettle never attacks. Stronger versions hop around (wait 60 → 30), and every 3rd turn, if no other Kettle is busy, appear next to MegaMan, boil and burst steam over the panels around them', 'rom-verified', 'decision 0x810EA4E (version 0 stays idle), attack 0xC 0x810E57C, target 0x810EBB8'),
    moveWait: v([60, 54, 48, 42, 36, 30], 'rom-verified', 'table 0x810E804'),
    boil: v([72, 66, 60, 54, 48, 42], 'rom-verified', 'table 0x810E810 (Unk_18)'),
    hold: v(20, 'rom-verified', 'table 0x810E7FC'),
    burst: v(24, 'rom-verified', 'table 0x810E80A'),
    area: v('its panel and the 8 around it', 'unverified', 'collision region type 2, size 3 (0x810E666); shape not decoded'),
    damage: v([100, 150, 200, 250, 100, 150], 'rom-verified', 'table 0x810E7E4'),
  },
  Puffy: { // AI 14, table 0x810F010
    decision: v('drifts to a new panel every 20 frames; every 4th time it spits a bubble from the panel ahead', 'rom-verified', 'decision 0x810F0D8, attack 0xA 0x810ED70 (bubble 0x80C59F6)'),
    moveWait: v(20, 'rom-verified', 'table 0x810F1A4'),
    bubbleStep: v(10, 'unverified', 'bubble 0x80C59F6 motion not decoded; read as a row shot, frames per panel'),
    growth: v('grows (bigger shots) when its counter is set', 'unverified', '0xB 0x810EE64 / sizes 0x810F192; trigger not decoded, not simulated'),
    damage: v([10, 30, 80, 100, 50, 100], 'rom-verified', 'table 0x810F18C'),
  },
  StarFish: { // AI 15, table 0x810F39C
    decision: v('when none of its bubbles are out, it releases 3 bubbles 24 frames apart that drift slowly down its row, then waits 120', 'rom-verified', 'decision 0x810F44C, attack 0xA 0x810F2EC (bubbles 0x80CBAB8)'),
    count: v(3, 'rom-verified', 'table 0x810F3EC'),
    gap: v(24, 'rom-verified', 'table 0x810F3F2'),
    speed: v([1.3125, 1.375, 1.4375, 1.5, 1.5625, 1.625], 'rom-verified', 'table 0x810F3C8 (px per frame)'),
    after: v(120, 'rom-verified', '0x78 (+60 under flag 0x2000)'),
    path: v('straight down the row', 'unverified', 'bubble pattern ExtraVars+4 (0-3) not decoded'),
    damage: v([20, 40, 100, 120, 60, 120], 'rom-verified', 'table 0x810F3E0'),
  },
  Dragon: { // AI 16, table 0x810FCE0
    decision: v('one Dragon at a time: moves twice, then dives under, reappears at the edge of MegaMan\'s column and flies through it (once; twice for the Rare versions)', 'rom-verified', 'decision 0x810FE18, attack 0xA 0x810F5D0'),
    rise: v(40, 'rom-verified', '0xA state 0: 0x28 frames'),
    under: v([60, 60, 60, 60, 30, 30], 'rom-verified', 'table 0x810FD28'),
    speed: v(4, 'rom-verified', 'table 0x810FD38 (px per frame; rows are 24 px)'),
    passes: v([1, 1, 1, 1, 2, 2], 'rom-verified', 'table 0x810FD50'),
    after: v([60, 60, 60, 60, 30, 30], 'rom-verified', 'table 0x810FD30'),
    column: v('MegaMan\'s column, from the top or bottom edge', 'unverified', 'chooser 0x810F9F6 not decoded'),
    damage: v([80, 80, 50, 50, 100, 200], 'rom-verified', 'table 0x810FD1A'),
  },
  ScareCrow: { // AI 17, table 0x81104D4
    decision: v('every 180 frames (its panel flashes for the last 60) it heals itself to full and attacks; being hit also sets it off. The attack: 60 frames, then a doll-thunder runs from the panel ahead for 120 frames', 'rom-verified', 'decision 0x8110574, attack 0xA 0x811037C (spawnDollThunderObject 0x80D5890)'),
    cycle: v(180, 'rom-verified', 'table 0x8110506'),
    windup: v(60, 'rom-verified', 'table 0x811050C'),
    thunder: v(120, 'rom-verified', 'table 0x8110512'),
    shape: v('MegaMan-ward along its row', 'unverified', 'doll thunder 0x80D5890 path not decoded'),
    damage: v([30, 60, 80, 100, 70, 110], 'rom-verified', 'table 0x8110500'),
  },
  PulseBulb: { // AI 18, table 0x8110DC0
    decision: v('guarded while closed; one bulb at a time slides to line up with MegaMan, opens (and can be hit) for 60 → 36 frames, fires a pulse down its row, then closes', 'rom-verified', 'decision 0x8110E90, move 0xC 0x81107A0 (0x8111030), attack 0xB 0x811088A (pulse type3 0x8C via 0x80D6B78)'),
    openTicks: v([60, 54, 48, 42, 48, 36], 'rom-verified', 'table 0x8110E60'),
    closeTicks: v([30, 27, 24, 21, 24, 18], 'rom-verified', 'table 0x8110E68'),
    pulseStep: v(4, 'unverified', 'pulse object type3 0x8C speed not decoded (frames per panel)'),
    damage: v([40, 80, 130, 150, 100, 150], 'rom-verified', 'table 0x8110E30'),
  },
  BigHat: { // AI 19, table 0x8111330
    decision: v('moves 3 times, then (one BigHat at a time) marks a target panel for 12 frames and throws its hat onto it', 'rom-verified', 'decision 0x8111384, attack 0xA 0x811121C (target 0x81116D2)'),
    moveTicks: v([18, 14, 10, 6, 12, 10], 'rom-verified', 'table 0x8111364'),
    mark: v(12, 'rom-verified', '0xA: 0x0C frames, target flashing every 4'),
    throwTicks: v(11, 'rom-verified', '0xA state 4: 0x0B frames'),
    after: v(24, 'rom-verified', 'Unk_18 = 0x18'),
    target: v('MegaMan\'s panel', 'unverified', 'chooser 0x811170C / 0x8111726 not decoded'),
    damage: v([30, 50, 80, 100, 50, 120], 'rom-verified', 'table 0x8111374'),
  },
  BombCorn: { // AI 20, table 0x8111DC0
    decision: v('moves to the front of its area; from there (at most two at a time) it fires 2 corn bombs (3 from version 3 up) that land on MegaMan\'s panel', 'rom-verified', 'decision 0x8111E14 (front check 0x8111F70), attack 0xB 0x8111B4A'),
    windup: v(30, 'rom-verified', '0xB: 0x1E frames'),
    flight: v(25, 'rom-verified', 'table 0x8111EF6'),
    after: v([40, 35, 30, 25, 30, 20], 'rom-verified', 'table 0x8111EFC'),
    count: v([2, 2, 3, 3, 3, 3], 'rom-verified', 'Unk_03 = 2, 3 from version 2'),
    gap: v(8, 'unverified', 'spacing of the bombs not decoded'),
    damage: v([30, 60, 100, 120, 70, 130], 'rom-verified', 'table 0x8111F02'),
  },
  Shrubby: { // AI 21, table 0x81121F0
    decision: v('walks around; after standing 60 frames (one Shrubby at a time) it lines up, lights the panels ahead and sends a thorn wave down the row', 'rom-verified', 'decision 0x8112278, attack 0xA 0x81120E4 (wave 0x80D1442)'),
    walkWait: v([48, 42, 36, 30, 30, 24], 'rom-verified', 'table 0x8112260'),
    mark: v([24, 24, 18, 18, 24, 18], 'rom-verified', 'table 0x8112266'),
    after: v([18, 12, 6, 6, 12, 6], 'rom-verified', 'table 0x811226C'),
    waveStep: v(4, 'unverified', 'wave 0x80D1442 speed not decoded (frames per panel)'),
    damage: v([20, 70, 100, 120, 90, 140], 'rom-verified', 'table 0x8112254'),
  },
  HoneyBomber: { // AI 22, table 0x81129A0
    decision: v('hops to a new panel every 120 → 44 frames (the base one stays put); one hive at a time opens and releases 3 bees, 30 frames apart, that chase MegaMan', 'rom-verified', 'decision 0x8112A64, move 0xA 0x81127C8, bees 0xB 0x81128B2 (0x80D1EB8)'),
    moveEvery: v([0, 120, 92, 68, 92, 44], 'rom-verified', 'table 0x81129D6 (255 = never)'),
    open: v([60, 48, 36, 24, 36, 18], 'rom-verified', 'table 0x81129DC'),
    beeGap: v(30, 'rom-verified', 'table 0x81129E2'),
    after: v(30, 'rom-verified', 'table 0x81129E8'),
    bees: v(3, 'rom-verified', 'Unk_0f = 3'),
    beeStep: v(12, 'unverified', 'bee 0x80D1EB8 homing speed not decoded (frames per panel)'),
    damage: v([5, 10, 20, 25, 15, 25], 'rom-verified', 'table 0x81129D0'),
  },
  FighterPlane: { // AI 24, table 0x81135CC
    decision: v('waits 60 → 36 frames, then flies forward across the whole field (through MegaMan\'s area), off the edge and back round to its own panel; after two flights, one plane at a time makes a bombing run', 'rom-verified', 'decision 0x8113674 / 0x811368A (flight count Unk_04), fly 0xA 0x8113330, bombs 0xB 0x811348E'),
    wait: v([60, 54, 48, 42, 48, 36], 'rom-verified', 'table 0x8113620'),
    flySpeed: v([2.312, 2.375, 2.438, 2.5, 2.562, 3], 'rom-verified', 'table 0x81135FC (px per frame); 40 / speed frames per panel'),
    flyRow: v('on its first flight the stronger versions come back round in MegaMan\'s row', 'rom-verified', '0x811343C: version > 0 and first flight → target PanelY'),
    flyDamage: v('body contact during the flight (stats damage)', 'rom-verified', 'collision region set while flying (0x81133BC)'),
    windup: v(30, 'rom-verified', '0xB: 0x1E frames, anim 1'),
    bombGap: v([12, 10, 10, 8, 8, 8], 'rom-verified', 'table 0x811361A: one bomb every n frames; each bomb flashes its panel for n frames, then bursts (object type3 0xD3, 0x80DFEE8)'),
    path: v([[0, 1], [0, 1], [1, 0], [0, -1], [0, -1], [1, 0], [0, 1], [0, 1]], 'rom-verified', '0x8113594 (dx toward MegaMan\'s back, dy), starting at the front column of his area, top row'),
    damage: v([20, 40, 80, 100, 60, 120], 'rom-verified', 'table 0x8113614'),
  },
  DarkMech: { // AI 25, table 0x8113D50
    decision: v('moves (wait 30 → 12); every 3rd turn throws an elec ball; when MegaMan is paralyzed (and not flashing), one DarkMech warps next to him and slashes', 'rom-verified', 'decision 0x8113DFC, paralysis check 0x8114316 (flags PARALYZED 0x800, not FLASHING 0x200), attack 0xA 0x8113840'),
    moveWait: v([30, 24, 18, 18, 24, 12], 'rom-verified', 'table 0x8113D84'),
    throwDamage: v(10, 'rom-verified', 'table 0x8113D8A'),
    throwTicks: v(12, 'rom-verified', 'table 0x8113DA8: hold before release'),
    throwAfter: v(25, 'rom-verified', 'table 0x8113DB0'),
    ballSpeed: v([1.312, 1.375, 1.438, 1.5, 1.562, 2], 'rom-verified', 'table 0x8113DC0 (px per frame); object type3 0xC0 runs along the row to MegaMan\'s column, then turns up or down it (0x80DD1AC)'),
    ballStatus: v('paralyzes', 'rom-verified', 'byte_80DD144 = 0x10 for every kind: status group 1 = paralysis (off_80209EC: flag2 0x8, timer +0x1C)'),
    paralyzeTicks: v(90, 'rom-verified', 'status 0x10 → off_80209EC: 90 frames; mashing buttons shortens it for MegaMan (0x8017628)'),
    dashTicksPerPanel: v(2, 'rom-verified', '0x8113CC8: 0x14 px per frame, 2 frames per panel'),
    charge: v(20, 'rom-verified', '0x8113984: 20 loops of the dash-ready animation before warping'),
    slashWarn: v(16, 'unverified', 'front panel flashes before the slash (Unk_10 start value not traced)'),
    slashDamage: v([100, 120, 150, 180, 140, 200], 'rom-verified', 'table 0x8113D90'),
    slashAfter: v([60, 54, 48, 42, 36, 30], 'rom-verified', 'table 0x8113DB8'),
    reach: v('the panel in front of MegaMan (toward DarkMech), else the one behind him', 'rom-verified', '0x8113B20'),
  },
  SnakeArm: { // AI 26, table 0x8114710
    decision: v('hops between holes in its area; when the coast is clear (one at a time) it pops up two panels in front of MegaMan in his row, flashes, and leaps onto his panel, stays in a hole there, then goes home', 'rom-verified', 'decision 0x8114824, hop 0xC (0x8114856), attack 0xA 0x81144B4 (target 0x8114AF0, landing = its panel ± 2 0x8114D8E)'),
    hopTicks: v([28, 26, 24, 22, 22, 22], 'rom-verified', 'table 0x8114744 (frames per hop)'),
    hopWait: v([40, 35, 30, 30, 30, 30], 'rom-verified', 'table 0x81147C4'),
    warn: v(20, 'rom-verified', '0x8114910: Unk_10 = 0x14 (panels flash)'),
    leapTicks: v([24, 22, 20, 18, 18, 18], 'rom-verified', 'table 0x8114760 (frames for the leap)'),
    leapHeight: v(22, 'rom-verified', '0x160000 × sine'),
    stay: v([42, 35, 28, 28, 28, 28], 'rom-verified', 'table 0x81147DC (in the hole on MegaMan\'s side)'),
    after: v(30, 'rom-verified', '0x8114612: Unk_10 = 0x1E'),
    damage: v([60, 90, 120, 150, 120, 180], 'rom-verified', 'table 0x8114750'),
  },
  Armadillo: { // AI 27, table 0x81154F0
    decision: v('slides to MegaMan\'s row; when he is in its row (and no other Armadillo is rolling in it) it curls up and rolls 3 → 5 panels forward, waits, then hops back home', 'rom-verified', 'decision 0x8115598, roll 0xB 0x81151A0, slide 0xA 0x8109804'),
    curl: v(12, 'rom-verified', '0x81151CC: Unk_10 = 0xC, anim 2'),
    rolls: v([3, 4, 4, 4, 4, 5], 'rom-verified', 'table 0x8115556 (panels rolled; stops early at the field edge)'),
    rollSpeed: v([8, 8.312, 9, 10.312, 11, 11.312], 'rom-verified', 'table 0x8115538 (px per frame)'),
    after: v(30, 'rom-verified', 'table 0x8115550'),
    hop: v(30, 'rom-verified', '0x8115340: 0x1E-frame hop home, uncurls (anim 5) 8 frames before landing, then 24 frames'),
    slideSpeed: v([0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75], 'rom-verified', 'table 0x8115520 (px per frame)'),
    damage: v('body contact, from the stats record (20 / 50 / 120 / 150 / 70 / 180)', 'rom-verified', 'roll uses the object\'s own collision damage'),
  },
  Cragger: { // AI 28, table 0x8115950
    decision: v('waits 240 frames at first; raises its rock fist (60 frames) while MegaMan\'s column flashes, then punches it down onto him; the fist stays 63 frames, comes back, then Cragger rests 180; the stronger versions also move between punches', 'rom-verified', 'decision 0x8115A2C / 0x8115A5C / 0x8115A96, punch 0xA 0x81157F0, fist object type1 0x02 (0x80B86F8)'),
    firstWait: v(240, 'rom-verified', 'Unk_10 = 0xF0'),
    lift: v(60, 'rom-verified', 'table 0x811599E'),
    release: v(6, 'rom-verified', 'table 0x81159A4: frames into the throw animation'),
    slam: v(3, 'rom-verified', 'fist starts 20 px short and 40 px up, lands in 3 frames (0x80B87AC)'),
    stay: v(63, 'rom-verified', '0x8115876: 0x3F'),
    after: v(180, 'rom-verified', 'table 0x81159AA'),
    moveWait: v(100, 'rom-verified', 'table 0x8115998'),
    area: v('MegaMan\'s panel and the ones above and below it; all three crack', 'recalled', 'highlight type 4 and the three cracked panels (0x80B8748) both cover that column'),
    damage: v([50, 120, 200, 220, 150, 220], 'rom-verified', 'table 0x8115980 (low half)'),
  },
  Nightmare: { // AI 29, table 0x8115DE0
    decision: v('starts hidden (no hit box) for 60 frames, then rises; moves 5 → 3 times (wait 60 → 24), then (one at a time) raises its scythe, the column in front flashes, and it swings', 'rom-verified', 'decision 0x8115E4C, slash 0xA 0x8115CD8, move 0xB'),
    hiddenTicks: v(60, 'rom-verified', '0x3C frames'),
    moves: v([5, 4, 4, 3, 3, 3], 'rom-verified', 'table 0x8115E34'),
    moveWait: v([60, 48, 36, 24, 24, 24], 'rom-verified', 'table 0x8115E2C'),
    move: v('moves toward MegaMan: his row, and the front column on the move before a swing', 'unverified', 'destination picker 0x8115FCE (0x8116044 / 0x811606A / 0x8116090) only partly decoded'),
    raise: v(16, 'rom-verified', '0x8115F2E: Unk_12 = 0x10 with the scythe raised (anim 1)'),
    mark: v(30, 'rom-verified', 'table 0x8115E3C'),
    after: v([60, 48, 36, 24, 24, 24], 'rom-verified', 'table 0x8115E44'),
    shape: v('the column in front (three rows)', 'recalled', 'highlight type 4 and hit region 0x705FF04 at the panel in front; type 4 read as a column (same code Cragger uses for its three-panel column)'),
    damage: v([40, 60, 100, 120, 80, 120], 'rom-verified', 'table 0x8115E14'),
  },
  Gunner: { // ForGunner 0x8113078, decision 0x8113124
    decision: v('even versions (Gunner, Sniper, Rare): when MegaMan is in its row, a crosshair slides down the row from Gunner; on reaching MegaMan it locks, then Gunner fires at that panel. Odd versions (Shooter, SP, Rare2): the crosshair starts on the first panel of MegaMan\'s area and sweeps one panel per shot, bouncing at the edges', 'rom-verified', 'decision 0x8113154 (version & 1), attacks 0xA 0x8112F4E / 0xB 0x8112D9C'),
    crossSpeed: v([3, 1.3125, 4, 2.3125, 4.3125, 3], 'rom-verified', 'table 0x81130A8 (px per frame, 40 px panels)'),
    lockTicks: v([24, 24, 12, 12, 12, 12], 'rom-verified', 'table 0x81130C6'),
    shots: v([3, 5, 3, 7, 3, 7], 'rom-verified', 'table 0x81130D8'),
    shotGap: v(10, 'rom-verified', '0x8113002: one shot every 0x0A frames'),
    recoverTicks: v([24, 24, 12, 12, 24, 6], 'rom-verified', 'table 0x81130D2'),
    damage: v([10, 30, 50, 70, 40, 90], 'rom-verified', 'table 0x81130C0'),
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
    portalInterval: v([180, 160, 140, 120], 'rom-verified', 'battle-start object type4 0x88 (spawn hook 0x80F59FE): first after 40 frames, then table 0x80E9A0C'),
    portalStagger: v(20, 'rom-verified', 'rows shuffled (0x80E9AE0), delay = slot × 0x14 (0x80E9A38)'),
    portalOpen: v(18, 'rom-verified', 'portal open animation (sprite 0x10/0x4B sequence 0)'),
    portalHit: v(10, 'rom-verified', 'collision active 10 frames (type3 0x65, 0x80D10B8)'),
    portalDamage: v([30, 50, 70, 70, 70], 'rom-verified', 'damage kind 1 of EraseMan\'s table'),
    portalTarget: v('one panel in each row of MegaMan\'s area', 'unverified', 'panel filter 0x80E9ACC not decoded'),
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
  SpoutMan: { // AI index 6, table 0x80F763C (BN6's AquaMan)
    decision: v('counter < 4: counter +1 on 12/16, then move (8/16) or water bomb 0xA; counter = 4: reset, then hose 0xB and sprinkler 0xC take turns (0xC only when a jump panel in MegaMan\'s area is free)', 'rom-verified', 'decision 0x80F7690'),
    warpTicks: v([6, 8], 'rom-verified', 'vanish 6 / appear 8'),
    moveWait: v([30, 24, 18, 18, 18], 'rom-verified', 'table 0x80F7740'),
    attackWait: v([30, 24, 20, 16, 16], 'rom-verified', 'tables 0x80F7764 / 0x80F7788 / 0x80F77D0 (+60 with object flag 0xA000; not simulated)'),
    bombDamage: v([20, 60, 110, 110, 110], 'rom-verified', 'table 0x80F7934'),
    bombAim: v([12, 20], 'rom-verified', 'animation 0x13 for 0xC, then 0x14 after 0x14'),
    bombFlight: v(30, 'unverified', 'type3 0x22 arcs over (0x28 - n) frames; n not decoded'),
    bombPanels: v([2, 3], 'rom-verified', 'chooser 0x80F81C0: 2 or 3 panels in front of MegaMan in his row'),
    hoseDamage: v([40, 120, 220, 220, 220], 'rom-verified', 'table 0x80F793C'),
    hoseCount: v([2, 3, 5, 5, 5], 'rom-verified', 'table 0x80F77A8'),
    hoseGap: v([24, 18, 12, 12, 12], 'rom-verified', 'table 0x80F77AC'),
    hoseAim: v(36, 'rom-verified', 'counter 0x24 while the row highlights (0x80F82B0)'),
    hoseSpray: v(18, 'rom-verified', 'animation 0x15 with counter 0x12'),
    hosePanel: v([4, 1], 'rom-verified', 'preferred panel 0x80F82AC (game 5,2); otherwise a random panel in that column'),
    sprinklerDamage: v([20, 60, 110, 110, 110], 'rom-verified', 'table 0x80F7944'),
    sprinklerTurns: v([2, 3, 3, 3, 3], 'rom-verified', 'table 0x80F77E4'),
    sprinklerJump: v(35, 'rom-verified', 'animation 0x11 for 0x23'),
    sprinklerPanels: v([[1, 1], [0, 1]], 'rom-verified', 'jump targets 0x80F7828 (game 2,2 then 1,2)'),
    sprinklerStep: v(10, 'unverified', 'each spray direction shows 2 frames x 5 frames'),
  },
  TomahawkMan: { // AI index 7, table 0x80F83F4
    eaglePerch: v([5, 1], 'rom-verified', 'spawn hook 0x80F8540, panel bytes 0x80F8578 (game 6,2); totem pole type3 0x41 under it'),
    eagleWait: v(120, 'rom-verified', 'type3 0x40 action 0'),
    eagleWarn: v(20, 'rom-verified', 'row highlight phase 0'),
    eagleLead: v(5, 'rom-verified', 'phase 1 timer'),
    eagleStep: v([5.7, 5, 4.4, 4], 'rom-verified', 'X speed 0x80CC310 (7 / 8 / 9 / 10 px per frame)'),
    eagleDamage: v([20, 40, 60, 60], 'rom-verified', 'table 0x80CC0D8'),
    eagleHp: v(5, 'rom-verified', 'table 0x80CC0D0; any hit sends it back to the perch'),
    eagleReturn: v(30, 'rom-verified', 'phase 3 timer'),
    decision: v('moves until the move counter reaches 4 (2 below half HP); then, until the attack counter reaches 6/3/3/3, axe throw 0xA if MegaMan is 3+ panels from the border, otherwise swing 0xB; then the row chop 0xC', 'rom-verified', 'decision 0x80F8448, distance 0x80F8610, counts 0x80F853C'),
    moveCount: v({ normal: 4, lowHp: 2 }, 'rom-verified'),
    moveWait: v([40, 30, 20, 10, 10], 'rom-verified', 'table 0x80F85D0 (+60 with flag 0xA000; not simulated)'),
    attackCount: v([6, 3, 3, 3, 3], 'rom-verified', 'table 0x80F853C'),
    warpTicks: v([3, 3], 'rom-verified'),
    throwDamage: v([40, 80, 120, 120, 120], 'rom-verified', 'table 0x80F86BC'),
    throwMark: v(60, 'rom-verified', 'highlight for 0x3C (0x80F87FE)'),
    throwShape: v('MegaMan\'s column', 'unverified', 'highlight region (target, 2, 4); read as the 3 panels of MegaMan\'s column'),
    throwFlight: v(18, 'recalled', 'animation 0xC with counter 0x12; axe object type3 0x3A arcs to the target'),
    throwWait: v([20, 16, 8, 0, 0], 'rom-verified', 'table 0x80F85F8'),
    swingDamage: v([40, 80, 120, 120, 120], 'rom-verified', 'table 0x80F86C4'),
    swingWindup: v(24, 'rom-verified', 'animation 0xF for 0x18 with the area highlighted (0x80F8EAA)'),
    swingHit: v(10, 'rom-verified', 'animation 0x10, collision when the 0x1E counter reaches 0x14'),
    swingShape: v([[-1, -1], [-1, 0], [-1, 1], [-2, -1], [-2, 0], [-2, 1]], 'unverified', 'highlight region code 0x11 in front; read as 2 columns x 3 rows'),
    swingWait: v([38, 30, 24, 16, 16], 'rom-verified', 'table 0x80F85E4'),
    chopDamage: v([80, 160, 240, 240, 240], 'rom-verified', 'table 0x80F86CC'),
    chopRaise: v(30, 'rom-verified', 'animation 0x11 for 0x1E (eagle object type4 0x32)'),
    chopHit: v(10, 'rom-verified', 'animation 0x12, wave spawned when the 0x1E counter reaches 0x14'),
    chopStep: v(5, 'rom-verified', '0x80F8E48: one wave object per panel along his row, 5 frames apart'),
    chopWait: v([60, 50, 30, 16, 16], 'rom-verified', 'table 0x80F860C'),
    eagle: v('type3 0x40 eagle with HP placed at battle start (0x80F8540); 0xC calls it in', 'rom-verified', 'not simulated'),
  },
  TenguMan: { // AI index 8, table 0x80F8FAC
    decision: v('moves until the move counter reaches 5 (3 below half HP; +1 on 14/16); then up to 7 attacks (4 below half HP): nose spear 0xA, and tornadoes 0xB every 2nd one or so; then the dash 0xC', 'rom-verified', 'decision 0x80F9000'),
    moveCount: v({ normal: 5, lowHp: 3 }, 'rom-verified'),
    attackCount: v({ normal: 7, lowHp: 4 }, 'rom-verified'),
    moveWait: v({ normal: [48, 36, 24, 24, 24], chained: 1 }, 'rom-verified', 'table 0x80F90FC; after a move that bumped the chain counter (RNG & 15 <= 8) the next pause is 1 frame (+30 with flag 0xA000; not simulated)'),
    warpTicks: v([3, 3], 'rom-verified'),
    noseDamage: v([30, 70, 130, 130, 130], 'rom-verified', 'table 0x80F9284'),
    noseBrace: v([24, 18, 18, 12, 12], 'rom-verified', 'table 0x80F9114; animation 0x15 with the 3 panels ahead lit (0x80F99FC)'),
    noseHit: v(3, 'recalled', 'animation 0x16, collision on the 3 panels ahead (0x80F99CA) when the 0x14 counter reaches 0x11'),
    noseWait: v([0, 111, 0, 66, 66], 'rom-verified', 'read through pointer 0x80C1014 (code bytes, an original-game quirk)'),
    tornadoDamage: v([30, 70, 130, 130, 130], 'rom-verified', 'table 0x80F928C'),
    tornadoWindup: v([30, 26, 22, 18, 18], 'rom-verified', 'table 0x80F913C, animation 0xF'),
    tornadoLife: v(40, 'rom-verified', 'attack var 0x0E = 0x28'),
    tornadoPatterns: v([
      [[1, 3, 0], [2, 1, 1], [3, 1, 1]], [[1, 3, 0], [2, 1, 1], [3, 3, 0]], [[1, 3, 0], [2, 3, 0], [3, 1, 1]], [[1, 1, 1], [2, 3, 0], [3, 1, 1]],
      [[1, 3, 0], [2, 1, 1], [3, 1, 1]], [[1, 3, 0], [2, 3, 0], [3, 1, 1]], [[1, 1, 2], [1, 2, 2], [3, 3, 3]], [[1, 2, 2], [1, 3, 2], [3, 1, 3]],
    ], 'rom-verified', 'table 0x80F9A94: (game column, game row, kind) in MegaMan\'s area; pattern = RNG & 3 (not the last one), +4 above the base version'),
    tornadoDrift: v({ 0: [0, -1], 1: [0, 1], 2: [1, 0], 3: [-1, 0] }, 'unverified', 'type3 0x47 sets X/Y velocity from the kind byte; directions and speed guessed'),
    tornadoStep: v(20, 'unverified', 'frames per panel'),
    dashDamage: v([60, 140, 260, 260, 260], 'rom-verified', 'table 0x80F9294'),
    dashArms: v([20, 16, 16, 12, 12], 'rom-verified', 'table 0x80F9150, animation 0x11'),
    dashMark: v(20, 'rom-verified', 'path highlighted for 0x14 (0x80F9BDC)'),
    dashSpeed: v([10, 12, 12, 12, 12], 'rom-verified', 'X speed table 0x80F9884 by version (px per frame over 40 px panels); Y speed 6 / 7.2 = one row per column'),
    dashPaths: v({ starts: [[6, 0, 0, 7], [4, 3, -1, 5], [4, -1, 1, 5], [6, 2, 0, 7]], pick: { base: 'top row (kind 0), bottom row (kind 3) if MegaMan is in the bottom row', ex: 'MegaMan at back middle → kind 0; at back top or middle top → kind 1; elsewhere kind 2' } }, 'rom-verified', '0x80F9B4C: position table 0x80F9BB8, starts 0x80F9BD4 (x mirrored for the enemy side), dy 0x80F98A8 (0, -1, +1, 0), columns 0x80F98AC (7, 5, 5, 7); [x, y, dy, columns] in app coordinates'),
  },
  GroundMan: { // AI index 9, table 0x80F9D40
    decision: v('2 moves, then attack; attacks run drill pop-up 0xA, 0xA, then alternate drill missiles 0xB / drill tank 0xC', 'rom-verified', 'decision 0x80F9D94'),
    moveWait: v([30, 25, 20, 15, 15], 'rom-verified', 'table 0x80F9E54 (+60 with flag 0xA000; not simulated)'),
    warpTicks: v([4, 9], 'rom-verified'),
    popDamage: v([60, 100, 150, 150, 150], 'rom-verified', 'table 0x80FA050'),
    popMark: v([24, 20, 18, 16, 16], 'rom-verified', 'table 0x80F9E68: MegaMan\'s panel highlighted'),
    popHold: v(30, 'rom-verified', 'animation 0x13 with counter 0x1E, then 0x14 for 0x14'),
    popWait: v([30, 25, 20, 15, 15], 'rom-verified', 'table 0x80F9E8C'),
    missileDamage: v([90, 150, 230, 230, 230], 'rom-verified', 'table 0x80FA058'),
    missileAim: v([24, 20, 18, 16, 16], 'rom-verified', 'table 0x80F9EA0'),
    missilePatterns: v([[[1, 2], [1, 1], [3, 3]], [[1, 1], [1, 3], [3, 2]], [[1, 2], [1, 3], [3, 1]], [[1, 2], [3, 1], [3, 3]]], 'rom-verified', 'table 0x80FABD4: [GroundMan, clone, clone] as (game column from the back edge, game row); RNG & 3'),
    missileFlight: v(40, 'rom-verified', 'counter 0x28 while flying'),
    missileWait: v([60, 50, 40, 30, 30], 'rom-verified', 'table 0x80F9EC4'),
    tankDamage: v([120, 200, 300, 300, 300], 'rom-verified', 'table 0x80FA060'),
    tankCharge: v([12, 60], 'rom-verified', 'animation 0x11 for 0xC, then 0x12 for 0x3C'),
    tankRun: v(40, 'rom-verified', 'counter 0x28 while driving'),
    rockDamage: v([60, 100, 150, 150, 150], 'rom-verified', 'table 0x80FA068'),
    rockRounds: v([3, 3, 4, 5, 5], 'rom-verified', 'table 0x80F9EF8'),
    rockCount: v([2, 3, 3, 3, 3], 'rom-verified', 'table 0x80F9EFC: first rock on MegaMan\'s panel, the rest shuffled around him (0x80FAC34)'),
    rockGap: v(10, 'rom-verified', 'counter 0x0A between rounds'),
    rockFall: v(25, 'recalled', 'type3 0x80 rock falls with Z velocity; landing time estimated'),
    tankWait: v([60, 50, 40, 30, 30], 'rom-verified', 'table 0x80F9F20'),
  },
  DustMan: { // AI index 10, table 0x80FAD9C
    decision: v('1 move between attacks; junk throw 0xB (then 0xC every so often: counter +1 on 12/16), up to 7 attacks (5 below half HP), then the vacuum 0xA', 'rom-verified', 'decision 0x80FADF0'),
    moveWait: v([30, 24, 18, 18, 18], 'rom-verified', 'table 0x80FAEC0 (+60 with flag 0xA000; not simulated)'),
    attackCount: v({ normal: 7, lowHp: 5 }, 'rom-verified'),
    warpTicks: v([4, 10], 'rom-verified'),
    vacuumDamage: v([100, 150, 200, 200, 200], 'rom-verified', 'table 0x80FB0C4'),
    vacuumOpen: v(2, 'rom-verified', 'table 0x80FAEE0, animation 0x10'),
    vacuumPull: v(48, 'rom-verified', 'table 0x80FAEE4: suction (type4 0x41) runs for 0x30'),
    vacuumStep: v(12, 'unverified', 'frames per panel MegaMan is pulled toward the front of his row'),
    vacuumHit: v(12, 'recalled', 'animation 0x14, front collision (0x80FB81E) when the 0x16 counter reaches 0x0C'),
    vacuumWait: v([30, 24, 18, 12, 12], 'rom-verified', 'table 0x80FAF08'),
    junkDamage: v([50, 80, 110, 110, 110], 'rom-verified', 'table 0x80FB0CC'),
    junkWindup: v(25, 'rom-verified', 'animation 0xF for 0x19'),
    junkMark: v([18, 18, 12, 12, 12], 'rom-verified', 'table 0x80FAF40: target panel lit'),
    junkFlight: v(18, 'recalled', 'animation 0x17 with counter 0x12; type3 0x83 junk flies to the target'),
    junkWait: v([24, 24, 18, 18, 18], 'rom-verified', 'table 0x80FAF2C'),
    shotDamage: v([30, 50, 70, 70, 70], 'rom-verified', 'table 0x80FB0D4'),
    shotLead: v(18, 'rom-verified', 'table 0x80FAF70'),
    shotCount: v(3, 'rom-verified', 'table 0x80FAF74'),
    shotGap: v(12, 'rom-verified', 'table 0x80FAF78'),
    shotSpeed: v(0.25, 'unverified', 'panels per frame for type3 0x84'),
    shotWait: v([30, 30, 24, 24, 24], 'rom-verified', 'table 0x80FAF9C'),
  },
  BlastMan: { // AI index 12, table 0x80FD104
    decision: v('3 moves, then: fireball 0xB at once if one of his blasts sits right in front of MegaMan; otherwise fire punch 0xA twice, then 0xB or the fire storm 0xC (8/16 each)', 'rom-verified', 'decision 0x80FD158, blast check 0x80FD31C'),
    moveWait: v([60, 24, 18, 12, 12], 'rom-verified', 'table 0x80FD298 (+60 with flag 0xA000; not simulated)'),
    warpTicks: v([3, 4], 'rom-verified'),
    punchDamage: v([10, 50, 90, 140, 140], 'rom-verified', 'table 0x80FD408'),
    punchWindup: v(30, 'rom-verified', 'idle 0x1E after appearing'),
    punchHit: v(18, 'rom-verified', 'animation 5 with counter 0x12, then type3 0x1F blast on the panel in front'),
    blastLife: v(24, 'recalled', 'type3 0x1F lifetime (counter 0x18 in the attack)'),
    punchWait: v([30, 24, 16, 12, 12], 'rom-verified', 'table 0x80FD2BC'),
    fireballDamage: v([10, 50, 90, 140, 140], 'rom-verified', 'table 0x80FD410'),
    fireballRange: v([3, 4, 4, 5, 5], 'rom-verified', 'table 0x80FD2F4: panels lit in front (0x80FDCA4)'),
    fireballMark: v(40, 'rom-verified', 'idle 0x0A, then animation 7 for 0x1E with the panels lit'),
    fireballStep: v(4, 'unverified', 'frames per panel for type3 0x20'),
    fireballWait: v([80, 70, 60, 50, 50], 'rom-verified', 'table 0x80FD2E0'),
    stormDamage: v([20, 80, 150, 270, 270], 'rom-verified', 'table 0x80FD418'),
    stormCharge: v(120, 'rom-verified', 'animation 0xA with type4 0x1A for attack var 0x0D = 0x78'),
    stormPatterns: v('0: from the right edge along all 3 rows; 1: from the left edge; 2: from the bottom along all 6 columns; 3: from the top', 'rom-verified', '0x80FDC2A; the base version always uses 0, others pick from table 0x80FD3B4 (6/16, 4/16, 3/16, 3/16)'),
    stormStep: v(6, 'unverified', 'frames per panel for type3 0x21'),
    stormWait: v([60, 50, 40, 30, 30], 'rom-verified', 'table 0x80FD318'),
  },
  DiveMan: { // AI index 13, table 0x80FDDB0
    mineInterval: v([80, 60, 48, 48], 'rom-verified', 'battle-start object type3 0x36: 0x80CABFC'),
    mineSecond: v([12, 12, 6, 6], 'rom-verified', 'second mine delay 0x80CAC40'),
    mineDamage: v([10, 20, 50, 90], 'rom-verified', 'damage kind 2 (0x80FDFE4 table)'),
    mineArm: v(6, 'rom-verified', 'type3 0x37: harmful from timer 0x24 of 0x2A'),
    mineLaunch: v(42, 'rom-verified', 'type3 0x37 timer 0x2A, then animation 0x18 and flight'),
    mineStep: v([7.1, 6, 5.5, 4.4], 'rom-verified', 'X speed 0x80CADCC (5.6 / 6.6 / 7.3 / 9 px per frame over 40 px panels)'),
    minePause: v('paused while DiveMan uses torpedoes or the big wave', 'rom-verified', '0x80CAB90 checks owner action 0xA / 0xB'),
    mineTarget: v('first in MegaMan\'s row, second anywhere in his area', 'unverified', 'filters 0x80CAD04 read as MegaMan\'s area'),
    decision: v('swims 2 times (never back to the panel he just left), then: torpedoes 0xA on 6/16 or surfacing pause 0xC on 10/16, three times; then the big wave 0xB', 'rom-verified', 'decision 0x80FDE04'),
    moveWait: v(0, 'rom-verified', 'table 0x80FDF5C is all zero: he keeps swimming'),
    swimTicks: v([14, 12], 'rom-verified', 'animation 8 (dive) for 0x0E, then glides submerged for 0x0C (0x80FE0D4)'),
    surface: v(19, 'rom-verified', 'animation 7 + sound 0xE1 for 0x13'),
    pauseWait: v([42, 36, 30, 24, 24], 'rom-verified', 'table 0x80FDFA8 (0xC does nothing else)'),
    torpedoDamage: v([20, 40, 100, 180, 180], 'rom-verified', 'table 0x80FE020'),
    torpedoCount: v(2, 'rom-verified', 'table 0x80FDF94'),
    torpedoAim: v([30, 26], 'rom-verified', 'idle 0x1E, then animation 6 with counter 0x12 for 0x1A per torpedo'),
    torpedoFlight: v(20, 'unverified', 'type3 0x38 flies from him to the target panel'),
    torpedoWait: v([19, 224, 0, 240, 240], 'rom-verified', 'read through pointer 0x810141E (code bytes, an original-game quirk)'),
    waveDamage: v([30, 60, 150, 270, 270], 'rom-verified', 'table 0x80FE028'),
    waveLift: v([34, 20], 'rom-verified', 'surface 0x22, then animation 4 for 0x14 while the rows light up (0x80FE72C)'),
    waveHit: v(10, 'rom-verified', 'animation 5 with counter 0x12; waves spawn (0x80FE6C8) and the screen shakes'),
    waveRows: v('every row whose front enemy panel is normal (so normally all 3)', 'rom-verified', '0x80FE6C8 / spawnDivemanWaveObject_80CB1E2'),
    waveStep: v(8, 'unverified', 'frames per panel'),
    waveWait: v(20, 'rom-verified', 'table 0x80FDFCC'),
    startObjectDamage: v([10, 20, 50, 90, 90], 'rom-verified', 'type3 0x36 spawned at battle start (0x80FDEC4); behaviour not decoded, not simulated'),
  },
  CircusMan: { // AI index 14, table 0x80FE890
    decision: v('no separate moves (each attack starts with a hop); clap 0xA, every 2nd or so the lion hoop 0xB (counter +1 on 8/16); after 5 counted attacks (+1 on 14/16) the tent 0xC', 'rom-verified', 'decision 0x80FE8E4'),
    hop: v(30, 'rom-verified', 'animation 4 jump arc for 0x1E to chooser 0x80FF614'),
    clapDamage: v([20, 50, 100, 130, 130], 'rom-verified', 'table 0x80FEC44'),
    clapMark: v([20, 16, 12, 6, 6], 'rom-verified', 'table 0x80FEA00, animation 7 with the region lit'),
    clapCount: v([1, 3, 3, 5, 5], 'rom-verified', 'table 0x80FEA04'),
    clapShape: v('MegaMan\'s column', 'unverified', 'highlight region (target, 2, 4); giant hands (type3 0x5D x2, sequences 60/61)'),
    clapHit: v(16, 'unverified', 'frames from the clap animation to the hit'),
    attackWait: v(14, 'rom-verified', 'tables 0x80FE9DC / 0x80FEA34'),
    lionDamage: v([20, 50, 100, 130, 130], 'rom-verified', 'table 0x80FEC4C'),
    lionLead: v(10, 'rom-verified', 'table 0x80FEA68'),
    lionGap: v([30, 30, 20, 20, 20], 'rom-verified', 'table 0x80FEA6C'),
    lionCount: v([3, 3, 3, 5, 5], 'rom-verified', 'table 0x80FEA70'),
    lionStep: v(6, 'unverified', 'frames per panel for the lion (type3 0x5F) through the hoop (0x5E)'),
    tentDamage: v([3, 5, 5, 5, 5], 'rom-verified', 'table 0x80FEC54, per hit while trapped'),
    tentHold: v([180, 240, 300, 360, 360], 'rom-verified', 'table 0x80FEAD0: how long MegaMan stays trapped (type4 0x8B)'),
    tentTries: v([1, 3, 3, 3, 3], 'rom-verified', 'code bytes at 0x80FEAF4 read as data'),
    tentGap: v([16, 12, 8, 8, 8], 'rom-verified', 'code bytes at 0x80FEAF8 read as data'),
    tentMark: v(6, 'rom-verified', 'animation 0xC, target panel lit for attack var 0x0C = 6'),
    tentLeap: v([19, 10], 'rom-verified', 'animation 0xD for 0x13, animation 0xE drop for 0x0A'),
    tentTick: v(10, 'unverified', 'frames between trap hits'),
    tentMash: v(10, 'unverified', 'frames cut from the trap per fresh button press'),
    tentWait: v({ base: [22, 16, 10, 8, 8], alternate: 16 }, 'rom-verified', 'table 0x80FEAA0; every other tent adds 16'),
  },
  JudgeMan: { // AI index 15, table 0x80FF8B0
    decision: v('2 moves, then attack: with his law book out he whips (14/16) or moves; without it, whips then the book press 0xB every 3rd or so; every 5th attack alternates book press 0xB and summoning the law book 0xC', 'rom-verified', 'decision 0x80FF904'),
    moveWait: v([36, 30, 24, 18, 18], 'rom-verified', 'table 0x80FFA74 (+60 with flag 0xA000; not simulated)'),
    warpTicks: v([2, 2], 'rom-verified'),
    whipDamage: v([30, 50, 80, 100, 100], 'rom-verified', 'table 0x80FFB54'),
    whipMark: v([22, 18, 16, 12, 12], 'rom-verified', 'table 0x80FFA88: the row ahead lit'),
    whipWind: v([30, 28, 26, 20, 20], 'rom-verified', 'read through pointer 0x80FFA9C (code bytes); collision when it drops to 0x10'),
    whipReach: v(3, 'rom-verified', '0x810007C: collision 1, 2 and 3 panels ahead'),
    pressDamage: v([30, 50, 80, 100, 100], 'rom-verified', 'table 0x80FFB5C'),
    pressMark: v([36, 30, 24, 18, 18], 'rom-verified', 'table 0x80FFAD4: MegaMan\'s front column lit (0x81000F6)'),
    pressWait: v([36, 30, 24, 18, 18], 'rom-verified', 'table 0x80FFAC0'),
    pressShape: v('MegaMan\'s front column', 'unverified', 'column from 0x81000E0; type3 0x6D books spawn at the top and bottom rows (0x8100106); read as hitting the whole column'),
    bookHp: v([8, 12, 16, 24, 24], 'rom-verified', 'table 0x80D25CC (type3 0x70 HP by version)'),
    bookMark: v([24, 20, 18, 16, 16], 'rom-verified', 'table 0x80FFAE8; placed at the front of his area in MegaMan\'s row (0x8100144)'),
  },
  ElementMan: { // AI index 16, table 0x81002A8
    decision: v('3 moves (2 above the base version), then attacks: a basic tower 0xF and his current element\'s attack take turns (the tower sometimes skips the moves before the next attack); after 3 attacks he changes element 0xA', 'rom-verified', 'decision 0x8100308, move counts 0x810039C'),
    moveCount: v([3, 2, 2, 2, 2], 'rom-verified', 'table 0x810039C'),
    moveWait: v([30, 24, 18, 12, 12], 'rom-verified', 'table 0x8100408 (+60 with flag 0xA000; not simulated)'),
    warpTicks: v([3, 3], 'recalled'),
    elementOrder: v(['none', 'aqua', 'wood', 'elec', 'fire'], 'rom-verified', '0xA (0x81008C2): index = (index + 1) mod 5 over byte_810090C (0, 4, 1, 3, 2); names from the element each attack sets (Unk_02, 0x81005A6–0x810064C)'),
    elementPalette: v({ none: 0, aqua: 6, wood: 2, elec: 8, fire: 4 }, 'rom-verified', 'palette bytes after byte_810090C (0, 6, 2, 8, 4); odd palettes are the lighter flash'),
    changeTicks: v([19, 20, 10, 10], 'rom-verified', '0xA: animation 5 for 0x13, animation 6 + sound for 0x14, white flash 0x0A, animation 0 for 0x0A'),
    twisterSpeed: v([4, 4.5, 5, 5.5, 5.5], 'rom-verified', 'type3 0x90 speed 0x80D7248 (px per frame)'),
    twisterLegs: v([200, 48, 240], 'rom-verified', 'leg lengths 0x80D725C in px: forward 5 panels, 2 rows across, back 6 panels; directions 0x80D726C'),
    twisterStart: v('back column, random row; turns down from the top half, up from the bottom row', 'unverified', 'start 0x810112C (column 6, random row); direction set choice not decoded'),
    elementIds: v({ fire: 1, aqua: 2, elec: 3, wood: 4 }, 'rom-verified', 'element enum ELEM_HEAT 1 … ELEM_WOOD 4; ExtraVars 2 → 0xB (sets element 1, fire), 4 → 0xC (2, aqua), 1 → 0xD (4, wood), 3 → 0xE (3, elec), anything else → 0xF'),
    towerDamage: v([60, 100, 140, 240, 240], 'rom-verified', 'table 0x8100708 (0xF basic attack: type3 0x90, a tornado on sprite 0x10/0x42)'),
    towerMark: v(10, 'rom-verified', 'table 0x8100534'),
    towerWait: v([1, 1, 1, 1, 1], 'rom-verified', 'read via 0x8100558 (code bytes)'),
    fireDamage: v([60, 90, 120, 200, 200], 'rom-verified', 'table 0x81006E8 (0xB fire: falling meteors, type3 0x8D sprite 0xC/0x31)'),
    fireCount: v({ normal: [4, 4, 5, 6, 6], lowHp: [6, 6, 8, 10, 10] }, 'rom-verified', 'table 0x8100464'),
    fireMark: v(10, 'rom-verified', 'table 0x810041C: each target panel lit first'),
    fireWait: v([20, 16, 14, 12, 12], 'rom-verified', 'table 0x8100440'),
    aquaDamage: v([30, 50, 70, 120, 120], 'rom-verified', 'table 0x81006F0 (0xC aqua: type3 0x8E, sparkle 0x10/0x0F; turns its panel to ice, 0x80D6E70)'),
    aquaMark: v([16, 14, 12, 10, 10], 'rom-verified', 'table 0x810047C'),
    aquaReach: v(3, 'unverified', '0x81010A0 loops 3 spawns in front of him'),
    woodDamage: v([30, 50, 70, 120, 120], 'rom-verified', 'table 0x81006F8 (0xD wood: type3 0x8F, his tower animation 0x12/0x13; turns its panel to grass, 0x80D7008)'),
    woodLead: v(10, 'rom-verified', 'table 0x81004C0'),
    woodGap: v([20, 16, 12, 10, 10], 'rom-verified', 'table 0x81004C4'),
    woodCount: v(5, 'rom-verified', 'loop until 5 in 0xD'),
    elecDamage: v([60, 100, 140, 240, 240], 'rom-verified', 'table 0x8100700 (0xE, type4 0x57 at the first panel ahead)'),
    elecLead: v(10, 'rom-verified', 'table 0x81004FC'),
    elementWait: v([40, 36, 32, 28, 28], 'rom-verified', 'tables 0x81004A0 / 0x81004E8 / 0x8100520'),
  },
  Colonel: { // AI index 18, table 0x8101328
    decision: v('2 moves; if MegaMan stands on a corner or the centre of his area, Screen Divide 0xA aimed at that spot (EX and up follow with a second cut), otherwise after 3 checks alternate cannon 0xB and lance 0xC (lance + cannon below half HP); when MegaMan\'s HP is at or under the finisher damage, every 3rd decision is the finisher 0xD', 'rom-verified', 'decision 0x8101360 / 0x81013AA, position table 0x81015D4'),
    moveWait: v([30, 24, 20, 16, 16], 'rom-verified', 'table 0x8101494'),
    warpTicks: v([3, 3], 'recalled'),
    divideSpots: v([[0, 0, 1], [0, 2, 2], [1, 1, 3], [2, 0, 3], [2, 2, 3]], 'rom-verified', 'table 0x81015D4 (game x mirrored): MegaMan panel → cut pattern'),
    divideShapes: v({ 1: [[0, 0], [1, 1], [2, 2]], 2: [[0, 2], [1, 1], [2, 0]], 3: [[0, 0], [1, 1], [2, 2], [0, 2], [2, 0]], 4: [[1, 0], [1, 1], [1, 2], [0, 1], [2, 1]] }, 'unverified', 'collision regions 0x12 / 0x13 / 0x1F / 0x22 (0x8103966); read as the two diagonals, an X and a cross'),
    divideDamage: v([80, 120, 190, 300, 300], 'rom-verified', 'table at 0x81017C4[0]'),
    divideFollowDamage: v([100, 150, 240, 380, 380], 'rom-verified', 'table at 0x81017C4[1]'),
    divideMark: v([30, 24], 'rom-verified', 'cut lit for 0x1E (follow-up 0x18): tables 0x81014BC / 0x81014E4'),
    divideWait: v([24, 40], 'rom-verified', 'tables 0x81014A8 / 0x81014D0'),
    cannonDamage: v([50, 80, 130, 210, 210], 'rom-verified', 'table at 0x81017C4[2]'),
    cannonCount: v([2, 3, 3, 4, 4], 'rom-verified', 'table 0x81014F8'),
    cannonGap: v([30, 26, 22, 18, 18], 'rom-verified', 'table 0x8101520'),
    cannonFall: v(20, 'unverified', 'missile (type3 0x53, sequences 30-32) lands on the panel MegaMan was on'),
    cannonWait: v([20, 16, 12, 10, 10], 'rom-verified', 'table 0x810150C'),
    lanceDamage: v([30, 50, 70, 70, 70], 'rom-verified', 'table at 0x81017C4[3]'),
    lanceCount: v([1, 1, 1, 2, 2], 'rom-verified', 'table 0x8101548'),
    lanceShape: v('the 2 panels ahead in his row', 'unverified', '0x8103A20 shuffles candidate panels; shape not decoded'),
    lanceWait: v([80, 70, 66, 60, 60], 'rom-verified', 'table 0x8101534'),
    finisherDamage: v([150, 220, 350, 550, 550], 'rom-verified', 'table at 0x81017C4[4]; also the HP threshold that unlocks it (0x81015E4)'),
    finisherMark: v([40, 30, 26, 20, 20], 'rom-verified', 'table 0x810156C'),
    finisherShape: v('MegaMan\'s row and column', 'unverified', 'type3 0x57 + type4 0x43; shape not decoded'),
    finisherWait: v([30, 24, 16, 12, 12], 'rom-verified', 'code bytes at 0x8101580'),
  },
  Bass: { // AI index 19, table 0x8101940
    decision: v('moves 3 times (sometimes 2) between attacks, 1 for the strong version; attacks alternate a basic one (Hell\'s Rolling 0xA / Shooting Buster 0xB, in turn) and one picked by where MegaMan stands: back column → Earth Breaker, middle or front → Dark Arm Blade; below half HP the charged forms are used', 'rom-verified', 'decision 0x8101AA0 (four modes by Param1 and HP), position tables 0x8101DBC / 0x8101DC3 / 0x8101DD0'),
    variantNote: v('the ROM\'s second stat row (3400 HP) carries the strongest damage column', 'rom-verified', 'Navi stats + damage tables; the name order (Bass, BassBX, BassSP…) comes from the ROM text as stored'),
    moveWait: v([30, 12, 18, 18, 18], 'rom-verified', 'table 0x8101978'),
    warpTicks: v([3, 3], 'recalled'),
    rollDamage: v([60, 130, 90, 90, 90], 'rom-verified', 'table 0x8101994 (0xA)'),
    rollLead: v([12, 6, 12, 12, 12], 'rom-verified', 'table 0x8101984'),
    rollCount: v(2, 'rom-verified', 'table 0x8101988'),
    rollStep: v(7, 'rom-verified', 'table 0x810198C, read as frames per panel'),
    rapidDamage: v([100, 220, 150, 150, 150], 'rom-verified', 'table 0x81019B4 (0xB)'),
    rapidGap: v(6, 'rom-verified', 'table 0x81019A4'),
    rapidCount: v([8, 6, 7, 8, 8], 'rom-verified', 'table 0x81019AC'),
    rapidMark: v([18, 12, 12, 12, 12], 'rom-verified', 'table 0x81019A8: each target lit first'),
    breakerDamage: v([150, 330, 220, 220, 220], 'rom-verified', 'table 0x81019CC (0xC mode 0)'),
    breakerChargedDamage: v([150, 330, 220, 220, 220], 'rom-verified', 'table 0x8101A00 (0xC mode 2, charge 0x50)'),
    breakerCharge: v(80, 'rom-verified', 'table 0x81019FC'),
    breakerShape: v('MegaMan\'s panel and the 4 around it', 'unverified', 'shape not decoded'),
    bladeDamage: v([200, 450, 300, 300, 300], 'rom-verified', 'table 0x81019E4 (0xC mode 1)'),
    bladeLowDamage: v([180, 400, 270, 270, 270], 'rom-verified', 'table 0x8101A18 (0xC mode 3)'),
    bladeShape: v([[-1, -1], [-1, 0], [-1, 1], [-2, -1], [-2, 0], [-2, 1]], 'unverified', 'read as 2 columns x 3 rows in front'),
    attackMark: v([18, 12, 12, 12, 12], 'rom-verified', 'tables 0x81019C4 / 0x81019DC / 0x8101A10'),
    overloadDamage: v([300, 670, 450, 450, 450], 'rom-verified', 'table 0x8101A38 (0xD): only chosen when MegaMan is in a form (navi stats byte 0x20, 0x8102280) — never in this app yet'),
  },
  Gregar: { // AI index 20, table 0x8103C74, spawn hook 0x8103D4C
    decision: v('jumps twice, then attacks: five claw/bite/thunder rounds (claw swipe or lunge at random, every 4th one Beast Thunder), then a big attack — Beast Breath while above half HP, below half Breath and Giga Rush in turn', 'rom-verified', 'decision 0x8103CD0 (counters c4/c5/c6/c7, RNG & 15 < 8)'),
    hp: v([2500, 3000, 4000, 5000], 'rom-verified', 'spawn hook 0x8103D4C overrides the stats table (code bytes 0x8103DB4)'),
    area: v('fills the whole enemy area (reserves all 9 panels) and is hit on any of them', 'rom-verified', 'object_reservePanel loop over columns 0x8103DA8, rows 1-3; hurtbox on every panel is an estimate (collision region 2 not decoded)'),
    jumpDamage: v([50, 150, 150, 150], 'rom-verified', 'damage table 0x81040F0 (action 9)'),
    jumpWait: v([24, 12, 12, 12], 'rom-verified', 'table 0x8103E64 row 0 (after landing)'),
    jumpHold: v([24, 16, 16, 16], 'rom-verified', 'table 0x8103E64 row 1 (crouch before the leap)'),
    jumpAir: v(7, 'rom-verified', 'rise timer 7 in sub_8104258'),
    jumpShock: v('landing shakes the screen and sends a shock along MegaMan\'s row', 'unverified', 'object 0x8A via sub_80E9D0C not decoded'),
    swipeDamage: v([100, 300, 300, 300], 'rom-verified', 'damage table 0x81040F8 (0xA)'),
    biteDamage: v([100, 300, 300, 300], 'rom-verified', 'damage table 0x8104100 (0xB)'),
    clawMark: v([30, 26, 20, 16], 'rom-verified', 'tables 0x8103EA0 / 0x8103ED8 row 1, read as the warning time'),
    clawWait: v([60, 60, 40, 40], 'rom-verified', 'tables 0x8103EA0 / 0x8103ED8 row 2, read as the wait afterwards'),
    swipeShape: v('front column, MegaMan\'s row and the rows either side', 'unverified', 'highlightPanelRegion 0x8105050 shape not decoded'),
    biteShape: v('the two front columns of MegaMan\'s row', 'unverified', 'two highlight regions in 0x81050C2'),
    breathDamage: v([60, 180, 180, 180], 'rom-verified', 'damage table 0x8104108 (0xC); a second value 100/300 (0x8104110) is loaded but its use is not decoded'),
    breathCount: v(3, 'rom-verified', 'table 0x80A0C10'),
    breathMark: v(32, 'rom-verified', 'table 0x80A0C10, read as the time each target stays lit'),
    thunderDamage: v([70, 210, 210, 210], 'rom-verified', 'damage table 0x8104118 (0xD)'),
    thunderWait: v([60, 40, 40, 30], 'rom-verified', 'table 0x8103F24 row 0'),
    thunderMark: v(12, 'rom-verified', 'table 0x8103F24 row 1'),
    thunderCount: v(3, 'unverified', 'strike count not decoded'),
    rushDamage: v([180, 540, 540, 540], 'rom-verified', 'damage table 0x8104120 (0xE)'),
    rushMark: v([18, 18, 12, 12], 'rom-verified', 'code bytes 0x8103F4C row 0'),
    rushShape: v('MegaMan\'s whole row', 'unverified', 'highlight region 0x81052FC not decoded'),
  },
  Falzar: { // AI index 21, table 0x810547C, spawn hook 0x8105554
    decision: v('moves twice, then attacks: two rounds of Feather Shot or Gust (RNG & 15 < 6 → 0xC, else 0xB), every third round Feather Rain (0xA) instead, and every third Feather Rain round a big attack — Feather Storm (0xD) while above half HP, below half HP Storm and Drill Dive (0xE) in turn', 'rom-verified', 'decision 0x81054D8 (counters c4/c5/c6/c7)'),
    hp: v([2000, 2800, 3200, 4000], 'rom-verified', 'spawn hook 0x8105554 overrides the stats table (0x81055CC)'),
    area: v('reserves (and hides) all 9 enemy panels; hit on any of them', 'rom-verified', 'object_reservePanel + object_hidePanel loop over 0x81055C0; hurtbox on every panel is an estimate (collision region 1)'),
    moveWait: v(1, 'rom-verified', 'dword 0x8105658 (wait after a move)'),
    rainDamage: v([80, 240, 240, 240], 'rom-verified', 'damage table 0x81058F8 (0xA)'),
    rainWait: v([30, 24, 20, 18], 'rom-verified', 'table 0x8105694 row 0'),
    rainMark: v([30, 24, 20, 18], 'rom-verified', 'table 0x8105694 row 1, read as each target\'s warning'),
    rainGap: v(16, 'rom-verified', 'table 0x8105694 row 2'),
    rainCount: v([8, 16, 20, 30], 'rom-verified', 'table 0x8105694 row 3, read as the number of feathers'),
    gustDamage: v([100, 300, 300, 300], 'rom-verified', 'damage table 0x8105900 (0xB)'),
    gustWait: v([30, 24, 20, 18], 'rom-verified', 'table 0x81056D0 row 0'),
    gustMark: v(25, 'rom-verified', 'table 0x81056D0 row 2'),
    gustShape: v('MegaMan\'s row', 'unverified', 'highlightPanelRegion in 0x8105DA2 not decoded'),
    shotDamage: v([80, 240, 240, 240], 'rom-verified', 'damage table 0x8105908 (0xC)'),
    shotWait: v([18, 18, 12, 12], 'rom-verified', 'table 0x8105708 row 0'),
    shotLead: v(20, 'rom-verified', 'table 0x8105708 row 1'),
    shotStep: v(8, 'rom-verified', 'table 0x8105708 row 2, read as frames per panel'),
    shotShape: v('a whirlwind down MegaMan\'s row', 'unverified', 'objects 0x81066C0 / 0x81066EA not decoded'),
    stormDamage: v([100, 300, 300, 300], 'rom-verified', 'damage table 0x8105910 (0xD)'),
    stormWait: v([30, 24, 20, 18], 'rom-verified', 'table 0x8105740 row 0'),
    stormMark: v(20, 'rom-verified', 'table 0x8105740 row 1'),
    stormCount: v([12, 18, 24, 30], 'rom-verified', 'table 0x8105740 row 2, read as the number of strikes'),
    stormGap: v(8, 'unverified', 'gap between strikes not decoded'),
    diveDamage: v([150, 450, 450, 450], 'rom-verified', 'damage table 0x8105918 (0xE)'),
    diveWait: v([30, 24, 20, 18], 'rom-verified', 'code bytes 0x8105768 row 0'),
    diveMark: v([24, 16, 16, 16], 'rom-verified', 'code bytes 0x8105768 row 1'),
    diveShape: v('MegaMan\'s row (drill form, animation 0x1D)', 'unverified', 'region 0x8106718 not decoded'),
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
