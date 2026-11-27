# Baseline audit and sprite format verification — 27 Nov 2026

## Repository baseline (before 0.2.0)
| Item | Finding |
|---|---|
| main HEAD | 64eafc0 (matches pinned migration commit) |
| signal-yard-source | 17b9676; same app under `signal-yard/` plus tests and a GitHub Actions Pages workflow. Not merged into main. |
| Live Pages | https://bbro43.github.io/Project-PET/ returned 200 serving `release.js` app 0.1.1 / assets 1 (deployed from main root; the branch workflow never ran on main). |
| Prototype tests | 3/3 pass (Node 22) — re-run, not historical. |
| Archives | BN_Simulator_Asset_Revision.zip: 6,158 entries, 27 Navi folders (incl. "Unidentified"), 570 Falzar animation blocks. Frames.zip: 13,252 entries (13,251 PNGs + folder) — matches the historical 13,251 report. Grid-Battle-Checkpoint.zip: 12 files, earlier prototype + audit tool. |
| Asset rights | The two asset ZIPs contain ripped Capcom sprites in a public repo. User chose to leave them in place; the app does not use them. |

## ROMs (local only, never committed)
| Code | Title | SHA-1 |
|---|---|---|
| B4WE | BN4 Red Sun | a97e96a7da03abd70f7953328e511b9fa29179f1 |
| B4BE | BN4 Blue Moon | 5e017c803ddc768efb8010314b46bc17e9757f71 |
| BRBE | BN5 Team ProtoMan | b3774e96b1f107bb8b1db79b216be41b9bc5bac0 |
| BRKE | BN5 Team Colonel | 5f472f78d8de2df01d5039e045c043cb40969a39 |
| BR5E | BN6 Cybeast Gregar | 89fe0bac4fd3d2ab1d2ca35e87ef8b1294a84cd6 |
| BR6E | BN6 Cybeast Falzar | 0676ecd4d58a976af3346caebb44b9b6489ad099 |

Note: BR6E is Falzar and BR5E is Gregar.

## Sprite format — now verified
Previously open items "tile-to-pixel mapping" and "OAM layout" are closed for BN6 MegaMan:
- Frame record (20 B): u32 tiles, u32 palettes, u32 sub-animation, u32 OAM, u16 ticks, u16 flags. Pointers relative to block+4.
- Flags: 0x80 = last frame, 0x40 = loop.
- Tiles: u32 size + 4bpp 8×8 tiles in 1D order. Palettes: u32 size (0x20) + consecutive 16-colour BGR555 palettes.
- Sub-animation: u32 table → 3-byte entries [OAM list index, ticks, flags].
- OAM: u32 table → 5-byte entries [tile, x (s8), y (s8), size | 0x40 hflip | 0x80 vflip, shape]; 0xFF×5 terminates. Size/shape follow GBA OBJ tables.
- Compressed blocks: GBA LZ77 (0x10) whose output has a 4-byte size prefix; the sprite block starts at +4.

Evidence:
- Independent Python decoder reproduced all 78 frames of Falzar 0x1D8000 pixel-for-pixel against the prior Frames.zip export, with identical anchors, ticks and flags (palette 0 for 76 frames, palette 1 for seq 3 f0 / seq 4 f3, matching the prior palette-fit note).
- The shipped JS decoder (`src/rom/sprite.mjs`) matches the Python decoder for all 78 MegaMan and 30 Mettaur frames (SHA-256 of RGBA output).
- MegaMan block is byte-identical in Gregar at the same offset; SHA-256 matches the earlier audit.

Still unverified: which palette the game selects at runtime for the two odd frames (the decoder defaults to palette 0); horizontal flip bits never occur in this block, so flip handling is untested against real data.

## New identification: Mettaur (BN6)
Found by scanning both ROMs for LZ77 sprite blocks (187 in Falzar). Index 0, offset 0x241EC4, 5 sequences, 10,224 bytes decompressed, SHA-256 911026…7690; identical in Gregar. Identified visually: seq 0 idle, seq 1 pickaxe swing (38 ticks), seq 2 hide, seq 3 hidden, seq 4 unhide. Role labels are visual candidates.

## MegaMan sequence roles (visual candidates, not traced)
0 idle · 1 flinch · 3 appear · 4 vanish · 5 throw · 6 slash · 8 cannon · 9 buster · 10 charge hold. 21–23 are shadows. A runtime trace of the shot and move dispatch is still pending (needs an emulator with RAM watch).

## Scan results for future work
Falzar contains 390 uncompressed and 187 LZ77 sprite blocks. Uncompressed indices 0–34 are Navis/Cross forms, then effects; LZ77 indices 0–19 are viruses, 20–32 are further Navis. Tools used are in the session notes; re-create from this description.
