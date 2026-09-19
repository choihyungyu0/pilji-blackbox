# -*- coding: utf-8 -*-
"""
안양시_일반건축물_시가표준액(공공데이터포털 15080551, 798,333행) — 파일데이터 오픈API(odcloud)로 빌드 시 1회 수집·전처리.
런타임 호출 없음.  python scripts/fetch_std_value.py

PNU 조립(주소 매칭 불필요): 자치단체코드(5) + 법정동(3) + 법정리(2) + 특수지(1: 산이면 2, 아니면 1) + 본번(4) + 부번(4) = 19자리.
전처리: 같은 PNU 는 과세년도 최댓값 행만 → 동·호 합산(시가표준액 합계 / 연면적 합계 = ㎡당 시가표준액). 0 이하·결측 제외.
출력: data/anyang_opendata/std_value_raw.jsonl.gz(원본 캐시) · data/derived/std_value.json · public/data/std_value.json
"""
import gzip
import json
import os
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DERIVED = os.path.join(DATA, "derived")
PUB = os.path.join(ROOT, "public", "data")
RAW = os.path.join(DATA, "anyang_opendata", "std_value_raw.jsonl.gz")
UDDI = "uddi:e0c8f354-eace-4209-a886-e89b2ec6edd1"  # 20241231 판
API = f"https://api.odcloud.kr/api/15080551/v1/{UDDI}"
PER_PAGE = 5000


def load_env():
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def fetch_raw():
    load_env()
    key = os.environ.get("DATA_GO_KR_KEY", "")
    if not key:
        print("DATA_GO_KR_KEY 없음")
        sys.exit(1)
    if os.path.exists(RAW):
        print("[std] 원본 캐시 사용:", os.path.relpath(RAW, ROOT))
        return
    print("[std] 파일데이터 API 수집 …")
    total = None
    page = 1
    n = 0
    with gzip.open(RAW, "wt", encoding="utf-8") as fh:
        while True:
            q = urllib.parse.urlencode({"page": page, "perPage": PER_PAGE, "serviceKey": key})
            for t in range(4):
                try:
                    with urllib.request.urlopen(API + "?" + q, timeout=120) as r:
                        j = json.loads(r.read().decode("utf-8"))
                    break
                except Exception:  # noqa: BLE001
                    if t == 3:
                        raise
                    time.sleep(2)
            rows = j.get("data") or []
            total = total or int(j.get("totalCount") or 0)
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += len(rows)
            print(f"  page {page} · {n:,}/{total:,}", end="\r")
            if not rows or n >= total:
                break
            page += 1
            time.sleep(0.15)
    print(f"\n  수집 {n:,}행 → {os.path.relpath(RAW, ROOT)}")


def build():
    props = json.load(open(os.path.join(DERIVED, "bldg_props.json"), encoding="utf-8"))
    col = {c: i for i, c in enumerate(props["cols"])}
    our_pnu = {}
    for r in props["rows"]:
        our_pnu.setdefault(r[col["pnu"]], []).append(r)
    cand_pnu = {r[col["pnu"]] for r in props["rows"] if r[col["cand"]]}

    # PNU 별 과세년도 최댓값 행만 모아 합산
    latest_year = {}
    rows_by = defaultdict(list)
    n_rows = 0
    with gzip.open(RAW, "rt", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            n_rows += 1
            try:
                sgg = str(row["자치단체코드"]).zfill(5)
                emd = str(row["법정동"]).zfill(3)
                ri = str(row.get("법정리") or 0).zfill(2)
                sp = "2" if str(row.get("특수지") or "1").strip() in ("2", "산") else "1"
                bon = str(row["본번"]).zfill(4)
                bu = str(row.get("부번") or 0).zfill(4)
                year = int(row["과세년도"])
            except (KeyError, ValueError, TypeError):
                continue
            pnu = f"{sgg}{emd}{ri}{sp}{bon}{bu}"
            if pnu not in our_pnu:
                continue
            cur = latest_year.get(pnu)
            if cur is None or year > cur:
                latest_year[pnu] = year
                rows_by[pnu] = [row]
            elif year == cur:
                rows_by[pnu].append(row)

    out = {}
    years = defaultdict(int)
    for pnu, rows in rows_by.items():
        val = sum(float(r.get("시가표준액") or 0) for r in rows)
        gfa = sum(float(r.get("연면적") or 0) for r in rows)
        if val <= 0 or gfa <= 0:
            continue
        per = round(val / gfa)
        y = latest_year[pnu]
        years[y] += 1
        out[pnu] = {"v": per, "y": y, "t": round(val), "a": round(gfa, 1), "n": len(rows)}

    matched_bldg = sum(len(our_pnu[p]) for p in out)
    matched_cand = sum(1 for r in props["rows"] if r[col["cand"]] and r[col["pnu"]] in out)
    vals = sorted(o["v"] for o in out.values())
    stats = {
        "source_rows": n_rows,
        "buildings_total": len(props["rows"]),
        "buildings_matched": matched_bldg,
        "join_rate_pct": round(matched_bldg / len(props["rows"]) * 100, 1),
        "parcels_total": len(our_pnu),
        "parcels_matched": len(out),
        "cand_total": len(cand_pnu) and sum(1 for r in props["rows"] if r[col["cand"]]),
        "cand_matched": matched_cand,
        "per_m2_median": vals[len(vals) // 2] if vals else None,
        "per_m2_min": vals[0] if vals else None,
        "per_m2_max": vals[-1] if vals else None,
        "per_m2_p10": vals[len(vals) // 10] if vals else None,
        "per_m2_p90": vals[len(vals) * 9 // 10] if vals else None,
        "years": dict(sorted(years.items())),
    }
    result = {
        "source": "경기도 안양시_일반건축물_시가표준액(공공데이터포털 15080551, 2024-12-31 판)",
        "asof": "2024-12-31",
        "note": "㎡당 시가표준액 = 같은 필지(PNU)·최신 과세년도의 동·호 시가표준액 합계 ÷ 연면적 합계. 이행강제금은 부과 시점의 시가표준액으로 산정하므로 참고 산정값이며 확정 금액은 담당자가 다시 확인해야 한다.",
        "generated": time.strftime("%Y-%m-%d"),
        "stats": stats,
        "items": out,
    }
    for p in (os.path.join(DERIVED, "std_value.json"), os.path.join(PUB, "std_value.json")):
        json.dump(result, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("  →", os.path.relpath(p, ROOT), f"{os.path.getsize(p) / 1024:.0f}KB")
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    fetch_raw()
    build()
