# BN6 Falzar USA · MegaMan battle sprite audit

Status: partially verified. All sequence and frame numbers below are zero-based.

The catalog entries 0000_1D8000, 0678_1D8000, 0679_1D8000 and 0790_1D8000 point to one ROM offset and have byte-identical animation JSON. Preserve all four references while counting one source block. The 29,728 bytes in the six-game staging archive for entry 0000 match the Falzar ROM starting at 0x1D8000. Block SHA-256: 3c170c2acb1147931db572baf9e67507cb99e7d9ef972d7eeb7d056796079db6.

The block contains 24 sequences with 78 top-level frame records referencing 25 distinct exported frame images. Every exported frame duration and flags value agrees with its ROM record. To repeat, use the block start plus four as the base. Read each little-endian 32-bit sequence offset from the table at that base. Each 20-byte frame record ends with its 16-bit duration and 16-bit flags.

All visible pixel colors fit the first 16 palette entries at the frame's palette pointer plus four, except sequence 3 frame 0 and sequence 4 frame 3. Their colors fit the next 16 entries. Conversion used floor(channel * 255 / 31). This verifies color membership only. Hardware palette selection and tile-to-pixel mapping still need an independent check.

Visual inspection identifies base MegaMan.EXE. Sequence 0 shows his ready stance. Sequences 3 and 4 show materializing and disappearing in opposite order, four one-tick frames each. Several sequences show the arm cannon. Exact basic-shot dispatch, projectile activation, movement dispatch, and on-screen alignment remain unverified. Next check: trace a single uncharged shot and a panel move while recording the active sequence ID, logical frame, and on-screen anchor. Commit observations separately from archive labels.
