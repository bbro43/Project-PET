# Owner's tabletop project folder ("EXE/gamma") — what it contributes

Source: the owner's earlier tabletop/paper-PET project folder (606 files), connected 27 Nov 2026. Nothing from it is committed here. Images and text stay on the owner's computer; only identifications derived from it are recorded.

## Used
| Item | Use | Result |
|---|---|---|
| Navi Sprites/ (94 labelled battle sprites) | Colour-histogram matching against every sprite block in the BN4/BN5 ROMs, then visual review | 35 Navi blocks named in BN4 RS/BM and BN5 TP/TC → data/navi-sprites.json |
| Exe.xlsx › Viruses | Cross-check of the BN6 virus family list read from the ROM | All 29 BN6 families present by name (Mettaur … WindBox, Nightmare) — independent confirmation |
| Exe.xlsx › NetNavis (95 names) | Roster checklist for the coverage matrix | — |
| Exe.xlsx › Upgrades / Common and Plus Parts | Navi Customizer rule summary (command line, colour adjacency, max 4 colours, plus parts off command line) and part names | To be checked against ROM data when the Customizer is built |

## Not used as canonical data
- Exe.xlsx › Battle Chips All (479 rows): wiki-derived and mostly BN3-era; chip data will be read per game from the ROMs. Useful later as a name/description cross-check.
- Tabletop stats (HP 1000/500, Move, BA, abilities), Rules.docx, Quests.docx, Paper PET documents, STL models: tabletop design, not game behaviour.

## BN4/BN5 Navi blocks identified (both versions of each game, same offsets)
BN4: AquaMan, BurnerMan, ColdMan, FireMan, GutsMan, HeelNavi, JunkMan, KendoMan, LaserMan, NormalNavi, ProtoMan, ShadeMan, SparkMan, ThunderMan, TopMan, VideoMan, WindMan, WoodMan.
BN5: Bass, BlizzardMan, CloudMan, Colonel, CosmoMan, GridMan, GyroMan, KnightMan, LarkMan, MagnetMan, NapalmMan, NumberMan, Roll, SearchMan, ShadowMan, ToadMan, TomahawkMan.

Method: first frame of sequence 0 for each block; reference sprites include their shadow, so pixel-exact matching fails and a colour histogram (shadow pixels excluded) ranked candidates. All 37 top pairs at score ≥ 0.55 were reviewed side by side and judged correct. Two of them were duplicate references: BN6 Colonel and a second ProtoMan. Confidence: "visual". Sequence roles are not mapped yet.

Still to identify in BN4/BN5: MegaMan (both games), Roll/NumberMan/SearchMan/Bass in BN4, GutsMan/ProtoMan/Meddy in BN5, MetalMan, ElecMan, DarkMegaMan and other Navis with no reference sprite in the folder.
