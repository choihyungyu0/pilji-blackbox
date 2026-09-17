# -*- coding: utf-8 -*-
"""
앱이 읽는 파일을 data/ 에서 만든다 (DAT-01 · DAT-02 · DAT-05 · DAT-09 · SEC-01 격자).

  python scripts/build_data.py

산출 (모두 EPSG:4326, UTF-8):
  public/data/officer/buildings.geojson   담당자 모드 — 전체 속성 (점수·등급·근거값 포함)    ← middleware 로 보호
  public/data/public/buildings.geojson    공개 모드 — 점수·후보·근거값 제거 (BR-P1)
  public/data/public/cand_grid100.geojson 공개 모드 후보 집계 — 100m 격자 개수만
  public/data/hjd.geojson                 행정동 31개 경계
  public/data/model_metrics.json          모델 카드·성과 곡선
  public/data/facilities.geojson          공공건축물·대피시설·급수시설 (지오코딩 산출물이 있을 때)
  data/derived/bldg_props.json            서버 도구용 속성 인덱스 (도형 없음, 열 배열)
  data/derived/dong_stats.json            법정동별 집계 (DSH-01)
  data/derived/timeline_sources.json      변화·사고·착공·급경사지 — 타임라인 조립 원천 (서버)

IS-01 임시 결정: tippecanoe 가 Windows 작업환경에 없어 PMTiles 대신 GeoJSON(정적, Vercel gzip/brotli)로 적재.
"""
import csv
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data")
DERIVED = os.path.join(DATA, "derived")
PUB = os.path.join(ROOT, "public", "data")
for d in (DERIVED, os.path.join(PUB, "officer"), os.path.join(PUB, "public")):
    os.makedirs(d, exist_ok=True)

ASOF = "2026-09-09"
CAND_THRESHOLD = 0.1649   # 화면 표기 0.165
GRADE_A = 0.2221          # 화면 표기 0.222


def load(path):
    return json.load(open(path, encoding="utf-8"))


def clean_nan(o):
    """원천 NaN(float) → null. JSON 표준에 NaN 이 없어 그대로 두면 클라이언트 파싱이 깨진다 (BR-D1: 결측=null)."""
    if isinstance(o, float):
        return None if o != o else o
    if isinstance(o, dict):
        return {k: clean_nan(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean_nan(v) for v in o]
    return o


def dump(path, obj, pretty=False):
    obj = clean_nan(obj)
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1, allow_nan=False)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"  → {os.path.relpath(path, ROOT)} ({os.path.getsize(path)/1024/1024:.2f}MB)")


def round_coords(obj, nd=6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)) and len(obj) in (2, 3):
            return [round(obj[0], nd), round(obj[1], nd)]
        return [round_coords(x, nd) for x in obj]
    return obj


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geom(x, y, geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        if not poly:
            continue
        if point_in_ring(x, y, poly[0]) and not any(point_in_ring(x, y, hole) for hole in poly[1:]):
            return True
    return False


def bbox_of(geom):
    xs, ys = [], []

    def walk(o):
        if isinstance(o, (list, tuple)):
            if o and isinstance(o[0], (int, float)):
                xs.append(o[0]); ys.append(o[1])
            else:
                for c in o:
                    walk(c)
    walk(geom["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


# ───────────────────────────────────────────── 건물
OFFICER_KEYS = ["id", "pnu", "dong", "jibun", "san", "use", "struct", "year", "approve", "fl_up", "fl_dn", "h", "gfa",
                "viol", "ledger", "chg", "score", "cand", "grade", "f_nbv", "f_age", "f_footratio", "f_nb50", "f_nl30",
                "public_parcel", "lon", "lat", "gb"]
PUBLIC_DROP = {"score", "cand", "grade", "f_nbv", "f_age", "f_footratio", "f_nb50", "f_nl30"}


def build_buildings():
    print("[buildings] 적재 …")
    src = load(os.path.join(DATA, "anyang_bldg_scored_20260909_4326.geojson"))
    feats = src["features"]
    assert len(feats) == 27713, len(feats)
    ids = set()

    # 개발제한구역 내부 여부 (MAP-04 필터용) — public/data/gb.geojson 이 있을 때만
    gb_path = os.path.join(PUB, "gb.geojson")
    gb = load(gb_path)["features"] if os.path.exists(gb_path) else []
    gb_idx = [(bbox_of(f["geometry"]), f["geometry"]) for f in gb]

    def in_gb(lon, lat):
        for (x0, y0, x1, y1), g in gb_idx:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_geom(lon, lat, g):
                return True
        return False

    officer, public = [], []
    props_rows = []
    counts = {"viol_Y": 0, "viol_N": 0, "viol_null": 0, "ledger_false": 0, "cand": 0, "A": 0, "B": 0, "gb": 0}
    dong_stats = {}
    for f in feats:
        p = dict(f["properties"])
        if p["id"] in ids:
            raise SystemExit(f"id 중복 → 적재 중단: {p['id']}")
        ids.add(p["id"])
        # BR-D1: 결측은 null 유지. 원천의 h=0.0 은 '높이 정보 없음'과 같다 → null (0으로 두면 층수 없는 건물이 납작해짐)
        if p.get("h") is not None and p["h"] <= 0:
            p["h"] = None
        if p.get("h") is not None and p["h"] > 300:
            p["h"] = None
        p["gb"] = in_gb(p["lon"], p["lat"]) if gb_idx else None
        # 등급 재검증 (BR-M1) — 사전 계산 등급을 그대로 쓰되, 반올림 오차(1e-4) 이상 어긋나면 중단
        if p.get("score") is not None:
            g = "A" if p["score"] >= GRADE_A else ("B" if p["score"] >= CAND_THRESHOLD else "C")
            if g != p.get("grade") and min(abs(p["score"] - GRADE_A), abs(p["score"] - CAND_THRESHOLD)) > 1e-4:
                raise SystemExit(f"등급 불일치 id={p['id']} score={p['score']} grade={p.get('grade')}")
        row = {k: p.get(k) for k in OFFICER_KEYS}
        geom = round_coords(f["geometry"])
        officer.append({"type": "Feature", "id": row["id"], "properties": row, "geometry": geom})
        pub_row = {k: v for k, v in row.items() if k not in PUBLIC_DROP}
        public.append({"type": "Feature", "id": row["id"], "properties": pub_row, "geometry": geom})
        props_rows.append([row[k] for k in OFFICER_KEYS])

        v = p.get("viol")
        counts["viol_Y" if v == "Y" else "viol_N" if v == "N" else "viol_null"] += 1
        if not p.get("ledger"):
            counts["ledger_false"] += 1
        if p.get("cand"):
            counts["cand"] += 1
            counts[p["grade"]] += 1
        if p["gb"]:
            counts["gb"] += 1
        d = dong_stats.setdefault(p["dong"], {"dong": p["dong"], "n": 0, "nl": 0, "viol": 0, "ledger": 0, "cand": 0, "A": 0, "B": 0, "gb": 0})
        d["n"] += 1
        d["nl"] += 0 if p.get("ledger") else 1
        d["ledger"] += 1 if p.get("ledger") else 0
        d["viol"] += 1 if v == "Y" else 0
        d["cand"] += 1 if p.get("cand") else 0
        if p.get("cand"):
            d[p["grade"]] += 1
        d["gb"] += 1 if p["gb"] else 0

    print("  집계:", counts)
    assert counts["viol_Y"] == 1573 and counts["ledger_false"] == 4112 and counts["cand"] == 1918 and counts["A"] == 913 and counts["B"] == 1005, counts

    meta = {"asof": ASOF, "source": "국토교통부 GIS건물통합정보(브이월드 공간정보 다운로드, 경기도 전체본 2026-09-09, CC BY) 안양시 추출",
            "n": len(feats), "counts": counts, "thresholds": {"cand": 0.165, "gradeA": 0.222}}
    dump(os.path.join(PUB, "officer", "buildings.geojson"), {"type": "FeatureCollection", **meta, "mode": "officer", "features": officer})
    dump(os.path.join(PUB, "public", "buildings.geojson"),
         {"type": "FeatureCollection", **meta, "mode": "public", "note": "공개 모드 — AI 점수·후보·근거값 미포함(BR-P1)", "features": public})
    dump(os.path.join(DERIVED, "bldg_props.json"), {"asof": ASOF, "cols": OFFICER_KEYS, "rows": props_rows})

    for d in dong_stats.values():
        d["nl_pct"] = round(d["nl"] / d["n"] * 100, 1)
        d["v_pct"] = round(d["viol"] / d["ledger"] * 100, 1) if d["ledger"] else None
    order = ["안양동", "석수동", "박달동", "비산동", "관양동", "평촌동", "호계동"]
    dump(os.path.join(DERIVED, "dong_stats.json"), {"asof": ASOF, "total": counts, "n": len(feats),
                                                    "dongs": [dong_stats[k] for k in order if k in dong_stats]}, pretty=True)

    # 공개 모드 100m 격자 (BR-P1) — 후보 위치를 격자 개수로만
    build_grid([p for p in (f["properties"] for f in officer) if p["cand"]])
    return officer


def build_grid(cands):
    lat0 = 37.39
    dlat = 100 / 111320.0
    dlon = 100 / (111320.0 * math.cos(math.radians(lat0)))
    cells = {}
    for p in cands:
        i = math.floor(p["lon"] / dlon)
        j = math.floor(p["lat"] / dlat)
        c = cells.setdefault((i, j), {"n": 0, "A": 0, "B": 0})
        c["n"] += 1
        c[p["grade"]] += 1
    feats = []
    for (i, j), c in cells.items():
        x0, y0 = i * dlon, j * dlat
        feats.append({"type": "Feature", "properties": c,
                      "geometry": {"type": "Polygon", "coordinates": [[[round(x0, 6), round(y0, 6)], [round(x0 + dlon, 6), round(y0, 6)],
                                                                        [round(x0 + dlon, 6), round(y0 + dlat, 6)], [round(x0, 6), round(y0 + dlat, 6)],
                                                                        [round(x0, 6), round(y0, 6)]]]}})
    dump(os.path.join(PUB, "public", "cand_grid100.geojson"),
         {"type": "FeatureCollection", "asof": ASOF, "cell_m": 100, "cells": len(feats), "candidates": len(cands),
          "note": "공개 모드 — AI 후보 1,918동을 100m 격자 개수로만 집계(BR-P1)", "features": feats})
    print(f"  격자 {len(feats)}칸, 후보 {len(cands)}")


# ───────────────────────────────────────────── 타임라인 원천 (서버)
def build_timeline_sources(officer):
    print("[timeline] 변화·사고·착공·급경사지 …")
    changes = load(os.path.join(DATA, "changes_20250904_20260909.json"))
    inc_path = os.path.join(DERIVED, "incidents_geocoded.json")
    incidents = load(inc_path)["incidents"] if os.path.exists(inc_path) else load(os.path.join(DATA, "incidents.json"))["incidents"]
    constr = load(os.path.join(DATA, "construction_events.json"))["events"]
    slopes_path = os.path.join(PUB, "slopes.geojson")
    slopes = load(slopes_path)["features"] if os.path.exists(slopes_path) else []
    slope_rows = list(csv.DictReader(open(os.path.join(DATA, "slopes_47_20260630.csv"), encoding="utf-8-sig")))
    slope_log_path = os.path.join(DERIVED, "slopes_log.json")
    slope_log = load(slope_log_path) if os.path.exists(slope_log_path) else None

    out = {
        "asof": ASOF,
        "changes": {"snapshots": changes["snapshots"], "counts": changes["counts"], "items": changes["changes"]},
        "incidents": incidents,
        "construction": constr,
        "slopes": [{**f["properties"]} for f in slopes],
        "slopes_unlocated": [{"name": r["급경사지명"], "dong": r["법정동"], "pnu": r.get("pnu") or None}
                             for r in slope_rows if not any(r.get("pnu") and r["pnu"] == f["properties"]["pnu"] for f in slopes)],
        "slopes_log": {k: v for k, v in (slope_log or {}).items() if k != "log"},
    }
    assert changes["counts"]["viol_added"] == 88 and changes["counts"]["viol_cleared"] == 64
    dump(os.path.join(DERIVED, "timeline_sources.json"), out)


# ───────────────────────────────────────────── 기타 정적 파일
def build_misc():
    print("[misc] 행정동·모델지표·시설 …")
    hjd = load(os.path.join(DATA, "hjd_anyang_31.geojson"))
    for f in hjd["features"]:
        f["geometry"] = round_coords(f["geometry"], 5)
        f["properties"] = {"adm_nm": f["properties"]["adm_nm"].split()[-1], "adm_cd2": f["properties"].get("adm_cd2"), "sggnm": f["properties"].get("sggnm")}
    dump(os.path.join(PUB, "hjd.geojson"), {"type": "FeatureCollection", "source": "행정동 경계(안양시 31개)", "features": hjd["features"]})

    mm = load(os.path.join(DATA, "model_metrics.json"))
    dump(os.path.join(PUB, "model_metrics.json"), mm)

    fac_path = os.path.join(DERIVED, "facilities.json")
    if os.path.exists(fac_path):
        fac = load(fac_path)
        feats = [{"type": "Feature", "properties": {k: v for k, v in it.items() if k not in ("lon", "lat")},
                  "geometry": {"type": "Point", "coordinates": [it["lon"], it["lat"]]}}
                 for it in fac["items"] if it.get("lon") is not None]
        dump(os.path.join(PUB, "facilities.geojson"), {"type": "FeatureCollection", "stats": fac["stats"], "generated": fac.get("generated"), "features": feats})
    else:
        print("  facilities.json 없음 — scripts/fetch_vworld_layers.py facilities 먼저")


if __name__ == "__main__":
    officer = build_buildings()
    build_timeline_sources(officer)
    build_misc()
    print("완료")
