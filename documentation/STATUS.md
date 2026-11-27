# Project PET — status (updated 27 Nov 2026, app 0.2.0 / assets 2)

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
| Asset registry | Partial | 2 sprites × 2 BN6 versions. BN4/BN5 not mapped |
| Sequence roles (MegaMan, Mettaur) | Unverified | Visual candidates; runtime trace pending |
| Battle engine core | Partial | 60 Hz deterministic; 6×3 field, areas, move, buster, charge, flinch + invincibility, custom gauge, chip select rules, queue. Several timings unverified (data/rules.mjs) |
| BattleChips | Partial | 10 chips (Cannon family, AirShot, Sword family, MiniBomb, Recovery). No chip art/icons yet |
| Folder editor | Pending | Test folder only (not the canonical BN6 default) |
| Virus battles | Partial | Mettaur/2/3 formations; variant palettes not traced |
| Endless survival | Partial | Mettaur waves, non-canonical composition |
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
| Mettaur (BN6) | ✓ (on device) | ✓ visual | candidate roles | – | ✓ basic AI | engine tests |
| All other Navis/viruses | – | – | – | – | – | – |

## Next checkpoint
1. Map BN6 virus families (LZ77 0–19) and the first CPU Navi.
2. Trace MegaMan buster/move dispatch and the custom gauge / charge timings in an emulator; promote rules from unverified.
3. Decode battle effects (shockwave, buster hit) and chip icons from the ROM.
4. Folder editor with saved folders; then Navi Customizer grid.
