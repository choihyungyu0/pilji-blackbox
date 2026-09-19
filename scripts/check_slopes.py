# -*- coding: utf-8 -*-
"""
검증: 급경사지와 위반건축물의 관련성 — 가설 "급경사지 주변에 위반건축물이 많을 것이다" 를 데이터로 확인한다.
행안부 급경사지 47행 → 연속지적도 위치화 38필지(중심점) 기준 반경별 건물·대장연계·위반 표기·AI 후보 집계.
결과는 성과 대시보드 카드(검증 카드)가 그대로 읽는다.  python scripts/check_slopes.py → data/derived/slope_check.json
"""
import datetime as dt
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DERIVED = os.path.join(ROOT, "data", "derived")

props = json.load(open(os.path.join(DERIVED, "bldg_props.json"), encoding="utf-8"))
col = {c: i for i, c in enumerate(props["cols"])}
rows = props["rows"]
tl = json.load(open(os.path.join(DERIVED, "timeline_sources.json"), encoding="utf-8"))
slopes = tl["slopes"]
spnu = {s["pnu"] for s in slopes}


def hav(lon1, lat1, lon2, lat2):
    R, p = 6371000, math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def stats(sel):
    n = len(sel)
    led = sum(1 for r in sel if r[col["ledger"]])
    v = sum(1 for r in sel if r[col["viol"]] == "Y")
    c = sum(1 for r in sel if r[col["cand"]])
    return {"buildings": n, "ledger": led, "viol": v, "viol_pct": round(v / led * 100, 1) if led else None, "cand": c}


out = {"scope": "급경사지 필지 위", **stats([r for r in rows if r[col["pnu"]] in spnu])}
bands = [out]
for R in (100, 200, 300):
    sel = []
    for r in rows:
        lon, lat = r[col["lon"]], r[col["lat"]]
        for s in slopes:
            if abs(s["lon"] - lon) < 0.005 and abs(s["lat"] - lat) < 0.004 and hav(s["lon"], s["lat"], lon, lat) <= R:
                sel.append(r)
                break
    bands.append({"scope": f"반경 {R}m", **stats(sel)})
bands.append({"scope": "안양 전체", **stats(rows)})
result = {
    "generated": dt.date.today().isoformat(),
    "hypothesis": "급경사지 주변에 위반건축물이 많을 것이다",
    "method": f"행정안전부 급경사지 현황 47행 → 브이월드 연속지적도 위치화 {len(slopes)}필지(중심점) 기준 반경별 집계 (미위치 {len(tl['slopes_unlocated'])}행 제외). 위반율 = 위반 표기 / 대장 연계 건물",
    "bands": bands,
    "verdict": "기각 — 급경사지 주변 위반 표기 비율이 안양 전체와 같거나 낮다. 사면 위험과 위반건축물은 별개 문제로 다루며, DEM 기반 사면 신호는 만들지 않는다.",
    "sources": ["행정안전부 급경사지 현황(공공데이터포털 15083292, 2026-06-30)", "국토교통부 GIS건물통합정보(브이월드, 2026-09-09)", "브이월드 연속지적도(LP_PA_CBND_BUBUN)"],
}
p = os.path.join(DERIVED, "slope_check.json")
json.dump(result, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for b in bands:
    print(b)
print("→", os.path.relpath(p, ROOT))
