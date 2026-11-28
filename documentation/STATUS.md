# Project PET — status (updated 27 Nov 2026, app 0.45.0 / assets 48)

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
| On-device ROM import | Done | .gba or .zip, header + SHA-1 check, IndexedDB, nothing uploaded. Sprites come from all imported ROMs, priority Gregar → Falzar → Team Colonel → Team ProtoMan → Red Sun → Blue Moon (0.32.0) |
| Asset registry | Partial | BN6: MegaMan, Mettaur, Champy, Gunner, ShockWave, crosshair (both versions). Sprite offsets + stats for all 29 BN6 virus families. BN4/BN5 not mapped |
| Sequence roles (MegaMan, Mettaur) | Partial | MegaMan's attack animations rom-verified from the chip actions (0.40.0); idle / flinch / move and Mettaur still visual candidates |
| Battle engine core | Partial | 60 Hz deterministic; 6×3 field, areas, move, buster, charge, flinch + invincibility, custom gauge, chip select rules, queue. Several timings unverified (data/rules.mjs) |
| BattleChips | Partial | All 411 BN6 chips (names, codes, damage, element, class, MB) and the starting folder from the ROM; chip pictures and icons decoded on device; the game's custom window (frame, slots, code strips, digits, element icons) decoded on device and pixel-matched (0.37.0), drawn over the battle screen with D-pad/A/B control (0.38.0), selected-chip column from the ROM (0.38.1), with Add on R; gauge timing from the ROM (documentation/audit/2026-11-27-bn6-chips.md). Effects in for the starting folder's chips except WhiCapsl; AreaGrab / PanlGrab with time freeze, ROM beam sprite and area return (0.39.0); MegaBuster arm + muzzle flash and the Cannon / Vulcan / AirShot / MiniBomb arms, poses and thrown ball from the ROM (0.40.0); hit sparks (buster, charge, cannon explosion), Recov sparkle, Sword blade and Vulcan firing pose from the ROM (0.41.0); Vulcan timing / hit effect and AirShot hit from the ROM (0.42.0); queued chip icon above MegaMan (0.43.0); game font, HP digits, BATTLE START! / ENEMY DELETED! / YOU WIN! banners and the deletion dissolve (0.44.0); game battle text font for names and messages (0.45.0); the rest pending (Phase 2) |
| Panel types | Partial | Cracked/broken (+ repair), poison, holy, grass, ice (slide, freeze), volcano eruptions decoded and playable; ROM panel graphics + palette animations decoded on device and pixel-matched (0.35.0); Field option in the menu (documentation/audit/2026-11-27-bn6-panels.md). Roads not modelled yet. Shockwaves stop at broken panels (flag 0x10, 0.39.0); area stealing with panel ownership (0.39.0) |
| Folder editor | Pending | The game's starting folder is used |
| Virus battles | Done (BN6) | All 29 BN6 families decoded from the ROM, all 6 versions each: Mettaur, Piranha, Heady, Swordy, KillerEye, Quaker, Catack, Champy, WindBox, Trumpy, OldStove, HauntedCandle, Kettle, Puffy, StarFish, Dragon, ScareCrow, PulseBulb, BigHat, BombCorn, Shrubby, HoneyBomber, Gunner, FighterPlane, DarkMech, SnakeArm, Armadillo, Cragger, Nightmare (documentation/audit/2026-11-27-bn6-virus-ai.md); some timings estimated. Paralysis (DarkMech's elec ball) added in 0.33.0, length unverified |
| Endless survival | Partial | Random Mettaur/Champy/Gunner waves up to Ω; composition non-canonical |
| Navi roster / NetBattle vs CPU Navis | Partial | CPU: HeatMan and SlashMan (all three attacks each decoded), EraseMan (move, scythe, eye-marker beam, battle-start dark portals decoded), ChargeMan (dash, train patterns and big charge decoded; inner loop of the big charge estimated), SpoutMan (bomb, hose, sprinkler decoded), TomahawkMan (throw, swing, chop, battle-start totem and eagle decoded), TenguMan (nose, tornado patterns, dash and its ROM paths decoded), GroundMan (pop-up, missiles, tank + rocks decoded), DustMan (junk, scrap shots, vacuum decoded), BlastMan (punch, fireball, fire storm patterns decoded), DiveMan (swim, torpedoes, big wave, battle-start mines decoded), CircusMan (clap, lion hoop, tent trap decoded), JudgeMan (whip, book press, law book decoded), ElementMan (decision, element cycle and palettes, basic tornado, timings and damage decoded; aqua attacks leave ice, wood leaves grass; element attack shapes estimated). All 16 BN6 Navis in the AI table are playable as CPU opponents. Bosses: Colonel, Bass, Cybeast Gregar and Cybeast Falzar (decision logic, damage and timings decoded; attack shapes estimated; each Cybeast fills the enemy area, and its sprite comes from its own version's ROM), ElecMan (all four attacks + coils decoded) and ProtoMan (both phases, guard, targets decoded) with ROM stats, damage and timings (documentation/audit/2026-11-27-bn6-navi-ai.md). Data: Sprite blocks located for 19 BN6 Navis + Beast/Cross forms (sprite table) and 35 BN4/BN5 Navis (matched to the owner's reference sprites): data/navi-sprites.json. No sequence roles or AI yet |
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
| 26 other BN6 virus families | ✓ (on device) | ✓ ROM names/stats | AI-set animations | – | ✓ decoded AI (some timings estimated) | per-family engine tests |
| HeatMan, ElecMan, SlashMan, EraseMan, ChargeMan, SpoutMan, TomahawkMan, TenguMan, GroundMan, DustMan, BlastMan, DiveMan, CircusMan, JudgeMan, ElementMan, ProtoMan (BN6) CPU — all 16 | ✓ | ✓ ROM tables | AI-set animations + effect sprites | – | ✓ decoded AI (some timings estimated) | 79 tests |
| 19 BN6 Navis, 35 BN4/BN5 Navis | offsets ✓ | ✓ (BN6 labels / BN4-5 visual) | – | – | – | ROM hash test |

## Next checkpoint
1. BN5/BN4 Navis (sprites located; AI not decoded yet). Smaller leftovers: road panel movement, TomahawkMan's eagle-to-axe during his chop.
2. Trace timings in an emulator (glide speeds, hit frames, custom gauge, charge, invincibility).
3. Chips Phase 2: effects and ROM chip graphics in batches by family (trace the chip-family dispatch first); folder editor; Navi Customizer. Enemy attacks that list MegaMan's panels as x 0–2 don't yet include stolen panels.
