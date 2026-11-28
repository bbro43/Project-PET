def lz77(b,o,limit=None):
    if b[o]!=0x10: raise ValueError
    size=b[o+1]|b[o+2]<<8|b[o+3]<<16
    if limit: size=min(size,limit)
    out=bytearray(); i=o+4
    while len(out)<size:
        flags=b[i]; i+=1
        for bit in range(8):
            if len(out)>=size: break
            if flags&(0x80>>bit):
                x=b[i]<<8|b[i+1]; i+=2
                n=(x>>12)+3; d=(x&0xFFF)+1
                if d>len(out): raise ValueError
                for _ in range(n): out.append(out[-d])
            else:
                out.append(b[i]); i+=1
    return bytes(out[:size])
