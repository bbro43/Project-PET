# BN6 virus tables — 27 Nov 2026

Reference: dism-exe/bn6f disassembly (built from Falzar SHA-1 0676ecd4…, identical to our ROM) was used to locate tables; every number below was then read from the ROM itself by tools/extract_bn6_viruses.py.

| Table | Falzar | Gregar | Format |
|---|---|---|---|
| Flat sprite pointers | 0x31CEC | 0x31CEC | u32 per sprite ID, bit 31 = LZ77. MegaMan 0x00, viruses 0x0F–0x2B, ShockWave 0xB1, Gunner crosshair 0xD5 |
| Virus stats pointers | 0x109150 | 0x10A478 | u32 per AI index → 6 × {u16 element<<12 \| HP, u16 flags \| palette slot, u16 damage} |
| Enemy index | 0x182C4 | found by pattern | 3 bytes per enemy: variant, actor type, AI index |
| Enemy names | ~0x6F065B | found by pattern | 0xE6-terminated strings in enemy-index order. Charset: 0x00 space, 0x01–0x0A digits, 0x0B–0x24 A–Z, 0x26–0x3F a–z, 0x43 Ω |

Results:
- 29 families × 6 variants of HP/element/damage. Falzar and Gregar output is identical.
- Elements: 0 none, 1 fire, 2 aqua, 3 elec, 4 wood (consistent with Piranha/Puffy aqua, OldStove fire, PulseBulb elec, BombCorn wood).
- Variant palette = palette slot 0–5 in the sprite block (checked by eye for Mettaur, Gunner, Champy).
- Mettaur AI reads a per-variant byte table at 0x109F46: 30, 24, 18, 12, 18, 12. Used as its pause between actions; that role is inferred, not traced.
- Effects ShockWave (4,324 B) and crosshair (887 B) are byte-identical across versions at different offsets.

Not decoded: virus AI code beyond the Mettaur table. Champy and Gunner behaviour is implemented from recall with animation-derived timings (see data/rules.mjs tags).
