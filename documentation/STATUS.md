# Project PET — status (updated 27 Nov 2026, app 0.19.0 / assets 20)

Legend: **Done** = implemented and tested · **Partial** = works but incomplete or using unverified values · **Pending** = not started · **Unverified** = claim without fresh evidence.

## Reconciled task list
| Area | State | Evidence / notes |
|---|---|---|
| Repo + branch audit | Done | documentation/audit/2026-11-27-baseline-and-sprite-format.md |
| Prototype tests | Done | 3/3 re-run; kept as tests/prototype.test.mjs |
| Signal Yard prototype | Kept | Moved to /prototype/, still playable, linked from menu |
| Live Pages + install identity | Done for 0.2.0 | Same id/scope/start_url `./`; display name now "P.E.T." (0.12.1) |
| Phone update flow | Partial | In-app "Update ready" banner; 0.1.x installs auto-migrate once. Real-phone test pending. |
| Sprite format (tiles/OAM/palette) | Done (BN6) | 78/78 MegaMan frames pixel-exact; JS = Python on 108 frames |
| Runtime palette choice, flip bits | Unverified | See audit |
| On-device ROM import | Done | .gba or .zip, header + SHA-1 check, IndexedDB, nothing uploaded |
| Asset registry | Partial | BN6: MegaMan, Mettaur, Champy, Gunner, ShockWave, crosshair (both versions). Sprite offsets + stats for all 29 BN6 virus families. BN4/BN5 not mapped |
| Sequence roles (MegaMan, Mettaur) | Unverified | Visual candidates; runtime trace pending |
| Battle engine core | Partial | 60 Hz deterministic; 6×3 field, areas, move, buster, charge, flinch + invincibility, custom gauge, chip select rules, queue. Several timings unverified (data/rules.mjs) |
| BattleChips | Partial | 10 chips (Cannon family, AirShot, Sword family, MiniBomb, Recovery). No chip art/icons yet |
| Folder editor | Pending | Test folder only (not the canonical BN6 default) |
| Virus battles | Partial | Mettaur, Champy, Gunner families, all 6 variants, 1–3 count. Stats ROM-verified; Champy/Gunner AI from recall (26 families have stats but no AI yet) |
| Endless survival | Partial | Random Mettaur/Champy/Gunner waves up to Ω; composition non-canonical |
| Navi roster / NetBattle vs CPU Navis | Partial | CPU: HeatMan and SlashMan (all three attacks each decoded), EraseMan (move, scythe, eye-marker beam decoded; start-of-battle object not simulated), ChargeMan (dash, train patterns and big charge decoded; inner loop of the big charge estimated), SpoutMan (bomb, hose, sprinkler decoded), TomahawkMan (throw, swing, chop decoded; battle-start eagle not simulated), TenguMan (nose, tornado patterns, dash decoded; dash path simplified), GroundMan (pop-up, missiles, tank + rocks decoded), DustMan (junk, scrap shots, vacuum decoded), BlastMan (punch, fireball, fire storm patterns decoded), DiveMan (swim, torpedoes, big wave decoded; battle-start object not simulated), CircusMan (clap, lion hoop, tent trap decoded), JudgeMan (whip, book press, law book decoded), ElementMan (decision, timings and damage decoded; elemental attack visuals and shapes partial). All 16 BN6 Navis in the AI table are playable as CPU opponents, ElecMan (all four attacks + coils decoded) and ProtoMan (both phases, guard, targets decoded) with ROM stats, damage and timings (documentation/audit/2026-11-27-bn6-navi-ai.md). Data: Sprite blocks located for 19 BN6 Navis + Beast/Cross forms (sprite table) and 35 BN4/BN5 Navis (matched to the owner's reference sprites): data/navi-sprites.json. No sequence roles or AI yet |
| Transformations (Cross/Beast/Soul) | Pending | |
| Navi Customizer | Pending | |
| Audio | Pending | |
| Private phone multiplayer | Pending | Needs a backend choice (Pages is static) |
| Private repo / hosting | Pending | Pages from a private repo needs a paid plan and the site stays public |

## Coverage matrix
| Entity | Extracted | Identified | Animated | Playable | CPU | Tested |
|---|---|---|---|---|---|---|
| MegaMan (BN6) | ✓ (on device) | ✓ | candidate roles | ✓ | – | engine tests |
| Mettaur (BN6) | ✓ (on device) | ✓ ROM tables | candidate roles | – | ✓ AI (partly ROM) | engine tests |
| Champy, Gunner (BN6) | ✓ (on device) | ✓ ROM tables | candidate roles | – | ✓ AI (recalled) | engine tests |
| 26 other BN6 virus families | offsets ✓ | ✓ ROM names/stats | – | – | – | ROM hash test |
| HeatMan, ElecMan, SlashMan, EraseMan, ChargeMan, SpoutMan, TomahawkMan, TenguMan, GroundMan, DustMan, BlastMan, DiveMan, CircusMan, JudgeMan, ElementMan, ProtoMan (BN6) CPU — all 16 | ✓ | ✓ ROM tables | AI-set animations + effect sprites | – | ✓ decoded AI (some timings estimated) | 79 tests |
| 19 BN6 Navis, 35 BN4/BN5 Navis | offsets ✓ | ✓ (BN6 labels / BN4-5 visual) | – | – | – | ROM hash test |

## Next checkpoint
1. Fill the gaps the Navi audit lists: battle-start objects (EraseMan, DiveMan, TomahawkMan's eagle), ElementMan's element visuals, TenguMan's diagonal dash; then BN5/BN4 Navis.
2. Decode Champy/Gunner AI routines to replace recalled behaviour.
3. Trace timings in an emulator (glide speeds, hit frames, custom gauge, charge, invincibility).
4. Chip table and icons from the ROM; folder editor; Navi Customizer.
