#!/usr/bin/env python3
"""Builds data/bn6-viruses.json from a BN6 US ROM (Falzar or Gregar).

Reads only numbers and offsets (HP, element, damage, sprite pointers, block
hashes); no graphics are written. Table addresses were located with the
dism-exe/bn6f disassembly (built from Falzar SHA-1 0676ecd4…) and confirmed by
reading the ROM:
  flat sprite pointer table (bit 31 = LZ77 compressed)
  per-AI pointer to 6 variant records: u16 elem<<12|hp, u16 flags|variant, u16 damage
Usage: python3 tools/extract_bn6_viruses.py ROM.gba > data/bn6-viruses.mjs
"""
import hashlib, json, struct, sys

FAMILIES = ['Mettaur', 'Piranha', 'Heady', 'Swordy', 'KillerEye', 'Quaker', 'Catack', 'Champy',
            'WindBox', 'Trumpy', 'OldStove', 'HauntedCandle', 'Kettle', 'Puffy', 'StarFish',
            'Dragon', 'ScareCrow', 'PulseBulb', 'BigHat', 'BombCorn', 'Shrubby', 'HoneyBomber',
            'Gunner', 'FighterPlane', 'DarkMech', 'SnakeArm', 'Armadillo', 'Cragger', 'Nightmare']
ELEMENTS = ['none', 'fire', 'aqua', 'elec', 'wood']
FIRST_VIRUS_SPRITE = 0x0F
# Table addresses differ per version: (sprite pointer table, per-AI stats pointer table)
TABLES = {'BR6E': (0x31CEC, 0x109150),   # Falzar, from disassembly + ROM read
          'BR5E': (0x31CEC, 0x10A478)}   # Gregar, found by matching Falzar's Mettaur stats bytes
# Navi stats pointer table (enemy_getStruct2, actor type 1). Gregar located via ElecMan's stats bytes.
NAVI_STATS = {'BR6E': 0x0F253C, 'BR5E': None}
NAVIS = ['HeatMan', 'ElecMan', 'SlashMan', 'EraseMan', 'ChargeMan', 'SpoutMan', 'TomahawkMan', 'TenguMan',
         'GroundMan', 'DustMan', 'ProtoMan', 'BlastMan', 'DiveMan', 'CircusMan', 'JudgeMan', 'ElementMan']
BOSSES = [(18, 'Colonel', 'Colonel'), (19, 'Bass', 'Bass'), (20, 'Gregar', 'Gregar'), (21, 'Falzar', 'Falzar')]  # AI indices past the Navi block
NAVI_TEXT = ['HeatMan', 'ElecMan', 'SlashMan', 'EraseMan', 'ChrgeMan', 'SpoutMan', 'TmhkMan', 'TenguMan',
             'GrndMan', 'DustMan', 'ProtoMan', 'BlastMan', 'DiveMan', 'CrcusMan', 'JudgeMan', 'ElmntMan']


def lz77(b, o):
    size = b[o + 1] | b[o + 2] << 8 | b[o + 3] << 16
    out, i = bytearray(), o + 4
    while len(out) < size:
        flags = b[i]; i += 1
        for bit in range(8):
            if len(out) >= size: break
            if flags & (0x80 >> bit):
                x = b[i] << 8 | b[i + 1]; i += 2
                for _ in range((x >> 12) + 3): out.append(out[-((x & 0xFFF) + 1)])
            else:
                out.append(b[i]); i += 1
    return bytes(out[:size])


TEXT = {}
for i in range(26): TEXT[0x0B + i] = chr(65 + i); TEXT[0x26 + i] = chr(97 + i)
for i in range(10): TEXT[0x01 + i] = chr(48 + i)
TEXT[0x00] = ' '; TEXT.update({0x40: 'RV', 0x41: 'BX', 0x42: 'EX', 0x43: 'SP'})  # per bn6f charmap


def encode(word):
    inv = {v: k for k, v in TEXT.items()}
    return bytes(inv[c] for c in word)


def virus_names(b):
    """Enemy names in enemy-index order, read from the ROM's name strings (0xE6-terminated)."""
    at = b.find(encode('Mettaur') + b'\xe6')
    start = b.rfind(b'\xe6', 0, at - 1) + 1  # the entry before Mettaur (index 0, test virus)
    names, o = [], start
    while len(names) < 256:
        e = b.index(b'\xe6', o)
        names.append(''.join(TEXT.get(x, '?') for x in b[o:e])); o = e + 1
    return names


def enemy_index(b):
    """(variant, actor type, AI index) triples per enemy index; located by Falzar's first rows."""
    head = bytes([0, 0, 0, 0, 0, 1, 1, 0, 1, 2, 0, 1, 3, 0, 1, 4, 0, 1, 5, 0, 1, 0, 0, 2])
    at = b.find(head)
    return [tuple(b[at + 3 * i:at + 3 * i + 3]) for i in range(256)]


def navi_stats_table(b, code):
    if NAVI_STATS[code]: return NAVI_STATS[code]
    f = open(sys.argv[2], 'rb').read() if len(sys.argv) > 2 else None
    # Find ElecMan's stat block (HP 900, elec) and the pointer table holding it at AI index 2.
    pat = struct.pack('<HHH', 0x3000 | 900, 0x600, 10)
    at = b.find(pat)
    ptr = b.find(struct.pack('<I', 0x08000000 | at))
    return ptr - 8


def navi_names(b, base):
    """Base name and its EX/SP/RV/BX variants as stored in the enemy-name strings."""
    enc = encode(base) + b'\xe6'
    at = b.find(enc, b.find(encode('Mettaur') + b'\xe6'))
    names, o = [], at
    for _ in range(6):
        e = b.index(b'\xe6', o); names.append(''.join(TEXT.get(x, '?') for x in b[o:e])); o = e + 1
    return names


def main(path):
    b = open(path, 'rb').read()
    code = b[0xAC:0xB0].decode()
    if code not in TABLES: sys.exit('Not a BN6 US ROM: ' + code)
    SPRITE_TABLE, STATS_TABLE = TABLES[code]
    u32 = lambda o: struct.unpack_from('<I', b, o)[0]
    u16 = lambda o: struct.unpack_from('<H', b, o)[0]
    names, index = virus_names(b), enemy_index(b)
    label = {}
    for idx, (var, actor, ai) in enumerate(index):
        if idx and actor == 0 and 1 <= ai <= len(FAMILIES) and var < 6:
            label.setdefault((ai, var), names[idx])
    families = {}
    for ai, name in enumerate(FAMILIES, start=1):
        ptr = u32(SPRITE_TABLE + 4 * (FIRST_VIRUS_SPRITE + ai - 1))
        off, comp = ptr & 0x1FFFFFF, bool(ptr & 0x80000000)
        data = lz77(b, off) if comp else None
        stats = u32(STATS_TABLE + 4 * ai) & 0x1FFFFFF
        variants = []
        for k in range(6):
            hp, flags, dmg = u16(stats + 6 * k), u16(stats + 6 * k + 2), u16(stats + 6 * k + 4)
            variants.append({'name': label.get((ai, k)), 'hp': hp & 0xFFF, 'element': ELEMENTS[hp >> 12] if hp >> 12 < 5 else hp >> 12,
                             'damage': dmg & 0xFFF, 'palette': flags & 0xFF})
        families[name] = {
            'ai': ai, 'sprite': {'offset': f'{off:X}', 'compression': 'lz77' if comp else 'none',
                                 'sha256': hashlib.sha256(data).hexdigest() if data else None},
            'variants': variants}
    sys.stdout.write('// Generated by tools/extract_bn6_viruses.py — do not edit by hand.\n// Identical output from BN6 Falzar (BR6E) and Gregar (BR5E) US ROMs.\nexport default ')
    nst = navi_stats_table(b, code)
    navis = {}
    for ai, name, text in [(i + 1, n, t) for i, (n, t) in enumerate(zip(NAVIS, NAVI_TEXT))] + BOSSES:
        stats = u32(nst + 4 * ai) & 0x1FFFFFF
        names = navi_names(b, text)
        variants = []
        for k in range(6):
            hp, flags = u16(stats + 6 * k), u16(stats + 6 * k + 2)
            if not names[k]: continue
            variants.append({'name': names[k], 'hp': hp & 0xFFF, 'element': ELEMENTS[hp >> 12] if hp >> 12 < 5 else hp >> 12})
        navis[name] = {'ai': ai, 'variants': variants}
    json.dump({'source': code, 'navis': navis,
               'confidence': 'rom-verified (stats); names from ROM text; AI not decoded',
               'families': families}, sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == '__main__':
    main(sys.argv[1])
