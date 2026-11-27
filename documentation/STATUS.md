# Project PET — status (updated 27 Nov 2026, app 0.3.0 / assets 3)

Legend: **Done** = implemented and tested · **Partial** = works but incomplete or using unverified values · **Pending** = not started · **Unverified** = claim without fresh evidence.

## Reconciled task list
| Area | State | Evidence / notes |
|---|---|---|
| Repo + branch audit | Done | documentation/audit/2026-11-27-baseline-and-sprite-format.md |
| Prototype tests | Done | 3/3 re-run; kept as tests/prototype.test.mjs |
| Signal Yard prototype | Kept | Moved to /prototype/, still playable, linked from menu |
| Live Pages + install identity | Done for 0.2.0 | Same id/scope/start_url `./`; display name now "Project PET" |
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
| Navi roster / NetBattle vs CPU Navis | Pending | Navi blocks located in scan (BN6), not mapped |
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
| All Navis except MegaMan | – | – | – | – | – | – |

## Next checkpoint
1. First CPU Navi (BN6): map sprite, decode its AI routine in the disassembly, implement attack pattern.
2. More virus families, prioritising ones whose AI is easiest to read from the disassembly.
3. Trace timings (custom gauge, charge, invincibility, ShockWave speed) in an emulator.
4. Chip icons/effects from ROM; folder editor; Navi Customizer.
