# -*- coding: utf-8 -*-
"""
안양시_일반 정비사업 추진현황(공공데이터포털 15150142, 42행) — 빌드 시 1회 조회·캐시. 런타임 호출 없음.
  python scripts/fetch_redevelop.py
위치(지번)·경도·위도 컬럼이 있어 추정 매칭 없이 좌표를 그대로 쓴다. 담당자 전화번호는 싣지 않는다.
C8 대상 = 조합설립인가일자가 있고 사업단계가 조합설립·관리처분·착공(준공 전) 인 구역 — 곧 철거되므로 반경 200m 후보의 조사 우선순위를 내린다(−0.30).
출력: data/derived/redevelop.json · public/data/redevelop.json
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DERIVED = os.path.join(ROOT, "data", "derived")
PUB = os.path.join(ROOT, "public", "data")
API = "https://api.odcloud.kr/api/15150142/v1/uddi:d0827e51-ef17-4a73-8bbc-a19483ede645"
ACTIVE_STAGES = ("조합설립", "관리처분", "착공")


def load_env():
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    key = os.environ.get("DATA_GO_KR_KEY", "")
    if not key:
        print("DATA_GO_KR_KEY 없음")
        sys.exit(1)
    q = urllib.parse.urlencode({"page": 1, "perPage": 200, "serviceKey": key})
    with urllib.request.urlopen(API + "?" + q, timeout=60) as r:
        j = json.loads(r.read().decode("utf-8"))
    rows = j.get("data") or []
    out = []
    for i, r in enumerate(rows):
        try:
            lon, lat = float(r.get("경도") or 0), float(r.get("위도") or 0)
        except ValueError:
            lon = lat = 0
        stage = (r.get("사업단계") or "").strip()
        union = (r.get("조합설립인가일자") or "").strip()
        union = None if union in ("", "None") else union
        active = bool(union) and stage in ACTIVE_STAGES
        out.append({
            "id": f"RDV-{i + 1:02d}", "name": (r.get("정비구역명") or "").strip(), "type": (r.get("사업유형") or "").strip(),
            "stage": stage, "status": (r.get("현추진상황") or "").strip(), "location": (r.get("위치") or "").strip(),
            "area_m2": r.get("구역면적 제곱미터"), "union_at": union, "start_at": r.get("착공일자") if r.get("착공일자") not in ("", "None") else None,
            "done_at": r.get("준공일자") if r.get("준공일자") not in ("", "None") else None, "units_before": r.get("기존주택 세대수"),
            "lon": lon or None, "lat": lat or None, "c8": active,
        })
    res = {
        "source": "경기도 안양시_일반 정비사업 추진현황(공공데이터포털 15150142, 2025-04-30 판)", "asof": "2025-04-30", "fetched": time.strftime("%Y-%m-%d"),
        "rule": "C8 = 조합설립인가 이후·준공 전(사업단계 조합설립·관리처분·착공) 구역 반경 200m 후보 −0.30",
        "total": len(out), "located": sum(1 for o in out if o["lon"]), "c8_zones": sum(1 for o in out if o["c8"]), "items": out,
    }
    for p in (os.path.join(DERIVED, "redevelop.json"), os.path.join(PUB, "redevelop.json")):
        json.dump(res, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("  →", os.path.relpath(p, ROOT))
    print(f"정비구역 {res['total']}행 · 좌표 {res['located']} · C8 대상 {res['c8_zones']}: " + ", ".join(o["name"] for o in out if o["c8"]))


if __name__ == "__main__":
    main()
