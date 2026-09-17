"""브이월드 GIS건물통합정보 경기도 전체본(zip)에서 안양시(41171 만안구, 41173 동안구) 건물만 추출.
사용: python 01_extract_anyang_from_vworld_zip.py ../raw/AL_D010_41_20260909.zip ../raw/anyang_bldg_20260909_5186.geojson
필요: pip install pyshp
- 원본은 3개 분할 SHP((2),(3) 접미사) + DBF(cp949). 레코드당 1,815바이트.
- A3(법정동코드 10자리) 앞 5자리로 필터. 좌표계는 EPSG:5186(2023-08-08 이후 배포본).
"""
import zipfile, struct, sys, io, json, os, time
import shapefile

def scan(z, part):
    f = z.open(part + '.dbf')
    hdr = f.read(32)
    n = struct.unpack('<I', hdr[4:8])[0]; hlen = struct.unpack('<H', hdr[8:10])[0]; rlen = struct.unpack('<H', hdr[10:12])[0]
    rest = f.read(hlen - 32)
    fields, off = [], 1
    for k in range(0, len(rest) - 1, 32):
        d = rest[k:k + 32]
        if d[0] == 0x0D: break
        fields.append((d[:11].split(b'\0')[0].decode(), off, d[16])); off += d[16]
    o3 = dict((nm, o) for nm, o, s in fields)['A3']
    keep, i = {}, 0
    while i < n:
        buf = f.read(rlen * min(20000, n - i)); m = len(buf) // rlen
        if m == 0: break
        for j in range(m):
            c = buf[o3 + j * rlen:o3 + j * rlen + 5]
            if c in (b'41171', b'41173'):
                keep[i + j] = buf[j * rlen:(j + 1) * rlen]
        i += m
    return fields, keep

def main(src, out):
    z = zipfile.ZipFile(src)
    stem = os.path.basename(src)[:-4]
    parts = [p[:-4] for p in z.namelist() if p.endswith('.dbf')]
    feats, t0 = [], time.time()
    for p in sorted(parts):
        fields, keep = scan(z, p)
        r = shapefile.Reader(shp=z.open(p + '.shp'), shx=io.BytesIO(z.read(p + '.shx')))
        for i in sorted(keep):
            raw = keep[i]
            props = {nm: raw[o:o + s].decode('cp949', 'replace').replace('\x00', '').strip() for nm, o, s in fields}
            feats.append({'type': 'Feature', 'properties': props, 'geometry': r.shape(i).__geo_interface__})
        print(p, len(keep), round(time.time() - t0, 1), flush=True)
    json.dump({'type': 'FeatureCollection', 'crs_note': 'EPSG:5186', 'features': feats}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('DONE', len(feats))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
