# -*- coding: utf-8 -*-
"""out/*.hwpx 를 python-hwpx 로 다시 열어 구조(mimetype 선두·STORE)·잔여 토큰·본문 길이를 검증한다."""
import glob, os, sys, zipfile
sys.stdout.reconfigure(encoding="utf-8")
from hwpx.document import HwpxDocument
ok = True
for p in sorted(glob.glob(os.path.join("out", "*.hwpx"))):
    z = zipfile.ZipFile(p); first = z.infolist()[0]
    d = HwpxDocument.open(p); t = d.text.plain; txt = t() if callable(t) else t
    good = first.filename == "mimetype" and first.compress_type == 0 and "{{" not in txt and len(txt) > 300
    ok &= good
    print(("OK " if good else "FAIL"), os.path.basename(p), f"| {len(txt)}자 | 잔여토큰 {txt.count('{{')} | {txt[:110].replace(chr(10),' | ')}")
sys.exit(0 if ok else 1)
