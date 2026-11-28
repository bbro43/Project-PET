# BN6 Navi Customizer — audit (27 Nov 2026)

All values read from the BN6 US ROMs (Falzar; Gregar copies located by search), using dism-exe/bn6f labels to find them.
Gregar: screen code +0x1DDC, data +0x1DE0; names 0x73C98C.

## Program data (rom-verified, data/bn6-navicust.mjs via tools/extract_bn6_navicust.py)
| Item | Location | Meaning |
|---|---|---|
| Programs | StructArr_813944C, 16 bytes per (program << 2 \| variant), sub_813B780 | +0 exclusive group, +1 Plus Part, +2 exists, +3 colour (0 = no such variant; 1 white 2 yellow 3 pink 4 red 5 blue 6 green), +4 bug type, +8 / +12 shape / compressed shape (7×7) |
| Names | text archive 0x73EA50 (pointer 0x8042078) | entries 0–46 ("None", "SuprArmr" … "HP+500") |
| Compression | event flag 0x2660 + part (sub_813B7A0) | compressed shape once the code is entered |
| Rotation | sub_813B7FC | (r, c) → (c, 6 − r), 90° clockwise |
| Board | byte_813B1EC / 813B2CD / 813B3AE by ExpMemry (key item 0x71) count | 15×15, grid at (5,5): 1 usable, 3 frame, 0 off; 4×4 / 5×4 / 5×5 |
| Command line | sub_813BC1C | grid row 3 |

## Rules (rom-verified)
| Rule | Code | |
|---|---|---|
| Placement | sub_813BAEC → sub_813BB00, sub_813BB68 | all blocks on the board (layout ≠ 0), at least one on a usable cell, no overlap |
| Programs on the line work; Plus Parts on it still work but add their bug type | sub_813BC1C | |
| Programs off the line add their bug type; Plus Parts off it work | sub_813BC98 | |
| Same colour touching | sub_813BD24 / sub_813BD90 / sub_813BE38 | each touching neighbour of the same colour adds its bug type; only neighbours inside the 5×5 (byte_813C640) |
| Colours | sub_813BEA8 | 5 colours → type 0xB +1, 6+ → type 0xC +2 |
| Frame | sub_813C584 | each part on a frame cell adds its bug type once |
| Bug level | sub_813BF0C | min(count, 3) |
| BugStop | sub_813C490 (stat 0x1F) → sub_813C020 | all bug counters cleared |
| Exclusive groups | applyNavicustPrograms_813C684 (byte_2006DD8) | programs on the line right to left; a second program of the same nonzero group doesn't apply |

## Effects (navicust_jt_NCPs, rom-verified)
SuperArmor stat 0x23; Custom1/2 stat 0xA +1/+2 (max 8); MegFldr1/2 stat 0xB +1/+2 (max 10); GigFldr1 stat 0xC +1 (max 10); FstBarr stat 6; Shield / Reflect / AntiDmg stat 7 = 0x3B / 0x8B / 0x3D (B+Left); FlotShoe, AirShoes, UnderShirt (their stats); ChpShufl 0x60; NumbrOpn 0x61; SneakRun 0x1E; OilBody / Fish / Battery / Jungle stat 0x27 = 2 / 4 / 8 / 0x10; Collect stat 0x26 |= 2; Millions 0x33; Humor 0x25; Poem 0x5F; SlipRunr 0x35; AutoHeal 0x36; BustPack Attack/Speed/Charge +3 (max 4); BodyPack = SuperArmor + FlotShoe + AirShoes + UnderSht; FldrPak1/2 = MegFldr + Custom; BugStop 0x1F; Rush / Beat / Tango stat 0xD bits 1 / 2 / 4; Attack/Speed/Charge+1 (max 4); …MAX = 4; HP+50…500 add to max HP.

## Battle values (rom-verified)
| Item | Location | Value |
|---|---|---|
| Buster damage | sub_801265A | Attack + 1 (+ byte_80126A4 per Navi, 1 for MegaMan… table is all 1s: + transformation bonus off_80126B0: +1 for HeatCross / HeatBeast) |
| Charge shot | busterBugChargeShotDamageCalcHappensHere_8011A7E | (Attack + 1) × 10 |
| Charge time | DeterminePowerAttackChargeTime, powerAttackChargeTimes_8020404 | row 1 (B power attack 1): 100 / 90 / 80 / 70 / 60 by Charge |
| Buster recovery | sub_80EB450 / sub_80EB502, byte_80209CC | 5 ticks + table[Speed][empty panels before the target, max 5]: Speed 1 = 4/8/12/16/20/24 … MAX = 2/3/4/5/6/7 |

## Bug effects (byte_813CC18: [type·4 + level])
Type 1 ProcessingBug (stat 0x31 = 1); 2 EmotionBug (0x24 = 1); 3 stats 0x12 = 3, 0x13 = 2/3/4; 4 TurnsUntilCustBugActivates (0x63) = 4/3/2; 5 stat 0x28 = 1; 6 stat 0x26 = 1; 7 stats 0x14/0x15 = 6,1 / 10,2 / 13,3; 8 stat 0xD = 0xFF; 9 stat 0x18 += level, 0x16 = 3; 0xA stat 0x62 = 3/2/1; 0xB stat 0x1A = 9; 0xC stat 0x1A = 10. What each does in battle: see "Bugs in battle (0.55.0)" below.

## Screen (decoded on device, src/rom/navicust.mjs)
Setup sub_81356F4 → sub_8135B94: palette list 0x8135C2C (resolved by sub_811FB84, PET theme 0), decompAndCopyData list 0x8135C64, BG palettes 4–11 from 0x201CF80; BG1 frame 0x201BE80 + board 0x201C380/0x201C780/0x201CB80 (17×17 at (1,2)); BG2 0x201D180 (12×9 at (17,11)); BG3 INFORMATION 0x813565C (10×6 at (18,13)). Mode 0x10 (byte_8001618). Board cells: per-cell palette entries (byte_813C4E8 + 0x34·Expand), colours byte_813C2EC (set 0 / set 1 brighter), Plus pattern byte_813C308, frame cells 0x5A91 empty / 0x3968 covered (sub_813C1C0). Sprites: cursor 0x20218F0, Move/Remove menu 0x20222F0, list bar 0x201DD70, banners 0x20226F0.

## Descriptions and abilities (0.54.0)
| Item | Location | Value |
|---|---|---|
| Descriptions | CompText873ECC8 (Gregar 0x73CC04), LZ77 text archive | entry n = program n; e.g. SuprArmr "Won't be / pushed!" |
| Ability flags | sub_8014080 (clears them) | SuperArmor object flag 0x20000, FloatShoes 0x20, UnderShirt 0x40000, AirShoes 0x10 |
| FstBarr | loc_80138D2 → sub_801A7CC, sub_80E0D98 | barrier at battle start |
| B+Left | power attacks 0x3B (Shield) sub_801216E, 0x8B (Reflect) sub_8012586, 0x3D (AntiDmg) sub_80121BC | Shield / Reflect → family 0x2B (sub_80ED154): guard 0x14 ticks; Reflect (Unk_03 4) answers with sub_80C4FFE, damage 0x32. AntiDmg → family 0x5A (sub_80EFEAC): window Unk_10 0x1E, damage 0x32 |
| ChpShufl | sub_802A5DA (stat 0x60), custom screen sub_80280E0 | a Shuffle option, once (battle modes 0, 5, 8, 0xA, 0xB) |
| NumbrOpn | sub_802A5A0 (stat 0x61), sub_802A40C | 10 chips in the custom screen (not battle modes 1, 6, 7, 9, nor DustCross / DustBeast) |
| AutoHeal | sub_8014040 (stat 0x36) | (MaxBaseHP + 9) / 10 HP, heal effect 6 |
| SlipRunr | stat 0x35, read only by ow_player | overworld |
| Navi base stats | byte_80210DD (16 bytes per Navi, init_8013B64) | HP/2, SuperArmor, FloatShoes, AirShoes, UnderShirt, FstBarr, Mega, Giga, BButton, BPwrAtk, BLeftAbility … (for playable Navis later) |

## Bugs in battle (0.55.0)
Level = min(bug count, 3) (sub_813BF0C); the routine for level 0 is empty. BugStop skips them all (sub_813CBCC → sub_813C490).

| Type | Stats set | In battle | Confidence |
|---|---|---|---|
| 1 Processing | 0x31 = 1 | sub_80103A8 gives the move routine (sub_80116AE, family 0x10) mode 3 → sub_800FA20: from MegaMan's panel, step in the pressed direction (byte_800FA14) while panels are valid (sub_800D120). Every move slides as far as it can go | rom-verified |
| 2 Emotion | 0x24 = 1 | random mood (sub_8013DA0). The app has no emotion system | no effect |
| 3 Panel | 0x12 = 3, 0x13 = 2/3/4 | when MegaMan leaves a panel (move routine, before PanelX = FuturePanelX), (rnd & 7) ≤ 0x13 − 1 → object_crackPanel; not on empty or broken panels (sub_8013CC4, actor type 2 only) | rom-verified |
| 4 Custom | 0x63 = 4/3/2 | from that turn on the custom screen shows turn − value + 1 fewer chips, at least 2 (sub_802A40C) | rom-verified values; first-turn count recalled |
| 5 / 6 | 0x28 / 0x26 | encounters (asm29) | no effect |
| 7 Buster | 0x14 / 0x15 = 6,1 / 10,2 / 13,3 | each normal buster shot (power attack 0, megamanChargeShotBPwrAtk_init_8011A26) rolls a 16-slot table (sub_8013D5E): 1 → family 0x33 (sub_80ED764: buster pose, sound 0xF8, no shot = a misfire), 2 → family 0x16, the charge shot ((Attack + 1) × 10). The charge shot itself (power attack 1) isn't affected. 0.55.0 had this on the charge shot by mistake | rom-verified |
| 8 | 0xD = 0xFF | turns off Rush / Beat / Tango (sub_8010660) | no effect (those are VS only) |
| 9 HP | 0x18 += level, 0x16 = 3 | every byte_80102A4[0x18] frames (0, 40, 35, 30, 25, 20, 15, 10) MegaMan loses 1 HP, never below 1 (sub_8010230); each hit raises 0x18 by 1, max 7 (sub_8013F1E → sub_8013F96) | rom-verified |
| 0xA | 0x62 = 3/2/1 | no program has bug type 0xA | — |
| 0xB / 0xC colours | 0x1A = 9 / 10 | at battle start one of four at random (sub_8013E58), 0x12C (B) or 0x258 (C) frames: flashing invisibility (sub_8010474), invulnerability (object_setInvulnerableTime), blind (BlindTimer, flag2 0x20), confusion (CollisionData 0x1E: its countdown clears OBJECT_FLAGS_CONFUSED 0x8000; 0.55.0 misread it as the bubble) | rom-verified; what blind and confusion do to MegaMan is from the N1GP wiki (enemies and their obstacles hidden / D-pad reversed) |

## SuperArmor and pushing (0.55.0)
The ROM's text for SuperArmor is "Won't be pushed!". WindBox / VacuumFan gusts no longer move MegaMan when it's installed. The code path that skips the push was not traced (the push itself is in the hit routine sub_80178D4 → sub_800E45E).

## Game sprites for the abilities (0.55.0)
| Effect | Object | Sprite | Notes |
|---|---|---|---|
| FstBarr barrier | t4 0x7 (sub_80E0D98, param 1 = stat 6) | 0x0C/0x3D, byte_80E0A14 entry 1: animation 0, palette 0 | drawn half see-through; the game's blend level is not traced |
| Shield / Reflect | t3 0x2B (sub_80C97E0; Unk_0c 0x214 / 0x114 → param 2 / 1) | 0x0C/0x1B, byte_80C9664: Shield animations 4/5, Reflect 2/3, palette 0 | palette entries 9–15 are 0x03E0 fillers; drawn transparent. 0.57.0: the OAM pieces that use them have palette offset +1 (5th OAM byte, high nibble), so the game draws them with the next OBJ palette slot, which the sprite doesn't supply. What the game loads there is not traced |
| Bubble | t4 0x3C (sub_80E4A6E) | 0x0C/0x20, animation 2 | entries 5–15 are fillers; drawn transparent |
| AntiDmg star | family 0x5A only sets AIData 0x48 flag 0x800; a hit then counts as the AntiDmg chip (0xBB, 0x802CF4A) → sub_80105F2 → family 0x47 (sub_80EE90C) → sub_80DD91A → t3 0xC2 | sprite 0x0C/0x2F: sequence 0 falling, 1 landing (0.57.0) | rom-verified |

## Emotions (0.56.0)
| Item | Location | Value |
|---|---|---|
| Emotion code | possiblyGetBattleEmotion_8015B64 | Anger timer → 3 Angry; AIData 0x32 → 1 Tired; mood (stat 0x0E) 0xFF → 2 Full Synchro; else 0 Normal (5 = mood 0 / AIData 0x36, Beast Out related, not used) |
| Window | sub_801CB38 / sub_801CDEC | face = byte_801E6F4[code] = [0, 2, 3, 1, 5, 4]; 8 tiles from off_801CD08[face] + 4 from dword_872D914 (Gregar 0x872B850) at OBJ tile 0x3B4; palette dword_872F114 (Gregar 0x872D050) + 32·face → OBJ palette 12; OAM 32×16 at (0, 18) and 16×16 at (32, 18) |
| Full Synchro | sub_801A200 | counter hit (collision 0x90 & 0x8000) → mood 0xFF; base form (or transformation 0xB / 0xC) |
| Counter window | object_setDefaultCounterTime | 0x10 frames; set by each AI as its attack starts. The app opens it when an enemy enters a non-moving state (its reading) |
| Mood loss | sub_801A200 → sub_8015C12 | each hit lowers the mood by collision 0x8E (read as the damage), at least 1 left |
| Boost | sub_8012A38, 0x8012866 | chip flag byte 9 bit 2: damage marked 0x8000 (double) under Full Synchro (then mood 0x80) or Angry (then sub_80143A6) |
| Angry | sub_80142DC, sub_8014326 | base MegaMan: ≥ 0x78 frames under flag 0xC00, or collision 0x80 / 2 ≥ 0x96 → Anger 600 frames, red colour shader 0xF (sub_80143E4) |
| Tired | sub_801445C | blocks mood changes and anger |
| Emotion bug | sub_8013DA0 | every 0x3C frames when stat 0x24, stat 0x21 (Beast Out counter) ≠ 0 and not transformed: reset, then byte_8013E44 with the current emotion's entries swapped (0 → 1 from Normal, else → 0); 1 Tired (0x32 = 0xFFFF), 2 Angry, 0 / 3 mood 0x99 / 0xFF (dword_8013E54). Matches the N1GP wiki's table |

Not done: the counter ring and the Full Synchro flash are app-drawn; the counter's other effects (stun) aren't in; Beast Out is not in the app, so the emotion bug treats its counter as above 0.

## Bubbled (0.56.0)
OBJECT_FLAGS_BUBBLED 0x80000000, timer CollisionData 0x2C (sub_800E730), sprite t4 0x3C. 150 frames, popped by a hit, Elec ×2, mashing shortens it (N1GP wiki). StarFish's bubbles apply it in the app; their hit modifier 3 (0x80CBBDE) meaning Bubble is not traced.

## RegUP (0.57.0)
sub_803CFB0: Regular memory = 4 + RegUP1 + 2·RegUP2 + 3·RegUP3 (key items 0x72–0x74), at most 0x63 = 99 → Navi stat 9. The app's RegUP1/2/3 are app-made 1×1 white Plus Parts (owner decision) standing in for the key items.
