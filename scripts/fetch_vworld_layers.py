# -*- coding: utf-8 -*-
"""
브이월드 API로 정적 레이어를 미리 받아 둔다 (DAT-03 · DAT-04 · DAT-05 · DAT-09 지오코딩).
런타임에는 브이월드 데이터 API를 호출하지 않는다 — 배포본은 여기서 만든 파일만 읽는다.

  python scripts/fetch_vworld_layers.py            # 전부
  python scripts/fetch_vworld_layers.py gb slopes  # 일부만

키는 .env / .env.local 의 VWORLD_KEY. 도메인은 VWORLD_DOMAIN.
산출:
  public/data/gb.geojson                 개발제한구역 (LT_C_UD801, 안양 bbox)
  public/data/slopes.geojson             급경사지 47곳 → 연속지적도 필지 도형 (LP_PA_CBND_BUBUN)
  data/derived/slopes_log.json           위치화 성공/실패 사유
  data/derived/incidents_geocoded.json   사고 8건 주소 → 좌표 (approx 유지)
  data/derived/facilities.json           공공건축물·비상대피시설·민방위급수시설 좌표화
"""
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data")
DERIVED = os.path.join(DATA, "derived")
PUB = os.path.join(ROOT, "public", "data")
os.makedirs(DERIVED, exist_ok=True)
os.makedirs(PUB, exist_ok=True)


def load_env():
    env = {}
    for name in (".env", ".env.local"):
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
KEY = ENV.get("VWORLD_KEY") or os.environ.get("VWORLD_KEY", "")
DOMAIN = ENV.get("VWORLD_DOMAIN") or os.environ.get("VWORLD_DOMAIN", "https://pilji-blackbox.vercel.app")
if not KEY:
    print("VWORLD_KEY 없음 — .env.local 에 넣고 다시 실행")
    sys.exit(1)

# 안양시 bbox (행정동 경계 기준, 여유 0.01도)
ANYANG_BBOX = (126.86, 37.34, 127.01, 37.46)


def get_json(url, tries=3):
    req = urllib.request.Request(url, headers={"Referer": DOMAIN, "User-Agent": "pilji-blackbox/1.0"})
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"요청 실패: {url[:120]}… ({last})")


def data_api(layer, **params):
    """2D 데이터 API GetFeature — 페이지를 모두 모아 feature 목록으로 돌려준다."""
    feats = []
    page = 1
    while True:
        q = {
            "service": "data", "request": "GetFeature", "data": layer, "key": KEY,
            "domain": DOMAIN, "format": "json", "crs": "EPSG:4326", "size": 1000, "page": page,
            **params,
        }
        js = get_json("https://api.vworld.kr/req/data?" + urllib.parse.urlencode(q))
        resp = js.get("response", {})
        if resp.get("status") != "OK":
            if resp.get("status") == "NOT_FOUND":
                return feats
            raise RuntimeError(f"{layer}: {resp.get('status')} {resp.get('error')}")
        fc = resp["result"]["featureCollection"]
        feats.extend(fc.get("features", []))
        total_pages = int(resp.get("page", {}).get("total", 1))
        if page >= total_pages:
            return feats
        page += 1


def geocode(address, kind):
    q = {
        "service": "address", "request": "getcoord", "version": "2.0", "crs": "epsg:4326",
        "address": address, "type": kind, "key": KEY, "refine": "true", "simple": "true",
    }
    js = get_json("https://api.vworld.kr/req/address?" + urllib.parse.urlencode(q))
    resp = js.get("response", {})
    if resp.get("status") != "OK":
        return None
    pt = resp["result"]["point"]
    return {"lon": float(pt["x"]), "lat": float(pt["y"]),
            "refined": resp.get("refined", {}).get("text", ""), "type": kind}


ROAD_RE = re.compile(r"(로|길|대로)\s*\d")


def geocode_any(address):
    """도로명·지번 자동 판별 후 실패 시 다른 형식으로 재시도. 괄호 안 법정동 힌트는 제거."""
    if not address:
        return None
    a = re.sub(r"\(.*?\)", "", address).strip()
    a = re.sub(r"\s+외\s*\d+\s*필지", "", a)  # "550-7 외3필지" → "550-7"
    order = ("road", "parcel") if ROAD_RE.search(a) else ("parcel", "road")
    for kind in order:
        r = geocode(a, kind)
        if r:
            return r
        time.sleep(0.05)
    return None


def round_coords(obj, nd=6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)) and len(obj) in (2, 3):
            return [round(obj[0], nd), round(obj[1], nd)]
        return [round_coords(x, nd) for x in obj]
    return obj


def save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  → {os.path.relpath(path, ROOT)} ({os.path.getsize(path)/1024:.0f}KB)")


# ─────────────────────────────── DAT-03 개발제한구역
def fetch_gb():
    print("[gb] LT_C_UD801 개발제한구역 …")
    feats = data_api("LT_C_UD801", geomFilter="BOX(%s,%s,%s,%s)" % ANYANG_BBOX)
    out = []
    for f in feats:
        p = f.get("properties", {})
        out.append({
            "type": "Feature",
            "properties": {k: p.get(k) for k in ("uname", "sido", "sido_name", "sgg", "sgg_name", "std_date", "s_date", "e_date") if k in p},
            "geometry": round_coords(f["geometry"]),
        })
    fc = {"type": "FeatureCollection", "name": "gb_anyang_bbox",
          "source": "브이월드 2D데이터 API LT_C_UD801(개발제한구역), 안양 bbox 조회",
          "asof": time.strftime("%Y-%m-%d"), "features": out}
    save(os.path.join(PUB, "gb.geojson"), fc)
    print(f"  {len(out)}개 폴리곤")


# ─────────────────────────────── DAT-04 급경사지 47곳
def fetch_slopes():
    print("[slopes] 급경사지 47곳 → 연속지적도 …")
    rows = list(csv.DictReader(open(os.path.join(DATA, "slopes_47_20260630.csv"), encoding="utf-8-sig")))
    by_pnu = {}
    log = []
    for r in rows:
        pnu = (r.get("pnu") or "").strip()
        if not pnu:
            log.append({"name": r["급경사지명"], "dong": r["법정동"], "ok": False, "reason": "본번 결측(지번 없음) — 목록에만 표시"})
            continue
        by_pnu.setdefault(pnu, []).append(r)
    feats = []
    for pnu, rs in by_pnu.items():
        names = [x["급경사지명"] for x in rs]
        try:
            fs = data_api("LP_PA_CBND_BUBUN", attrFilter=f"pnu:=:{pnu}")
        except Exception as e:  # noqa: BLE001
            for n in names:
                log.append({"name": n, "dong": rs[0]["법정동"], "pnu": pnu, "ok": False, "reason": f"API 오류 {e}"})
            continue
        if not fs:
            for n in names:
                log.append({"name": n, "dong": rs[0]["법정동"], "pnu": pnu, "ok": False, "reason": "연속지적도에 해당 PNU 없음"})
            continue
        g = fs[0]["geometry"]
        p = fs[0].get("properties", {})
        # 중심점
        ring = g["coordinates"][0][0] if g["type"] == "MultiPolygon" else g["coordinates"][0]
        lon = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        feats.append({
            "type": "Feature",
            "properties": {
                "pnu": pnu, "names": names, "n": len(names), "dong": rs[0]["법정동"], "sgg": rs[0]["시군구"],
                "san": rs[0]["산"] == "Y", "jibun": f"{'산 ' if rs[0]['산']=='Y' else ''}{rs[0]['본번']}{('-' + rs[0]['부번']) if rs[0]['부번'] else ''}",
                "addr": p.get("addr"), "jimok": p.get("jimok"), "lon": round(lon, 6), "lat": round(lat, 6),
                "source": "행정안전부 급경사지 현황(공공데이터포털 15083292, 기준 2026-06) + 브이월드 연속지적도(LP_PA_CBND_BUBUN)",
                "asof": "2026-06-30",
            },
            "geometry": round_coords(g),
        })
        for n in names:
            log.append({"name": n, "dong": rs[0]["법정동"], "pnu": pnu, "ok": True})
        time.sleep(0.05)
    fc = {"type": "FeatureCollection", "name": "slopes_47",
          "note": "시 발표(2026.7.2) 59곳과 12곳 차이 — 사유지 제외 가능성. 같은 필지에 여러 지구가 있으면 names에 모아 둠",
          "features": feats}
    save(os.path.join(PUB, "slopes.geojson"), fc)
    ok = sum(1 for x in log if x["ok"])
    summary = {"rows": len(rows), "located_rows": ok, "failed_rows": len(rows) - ok,
               "parcels": len(feats), "generated": time.strftime("%Y-%m-%d %H:%M"), "log": log}
    save(os.path.join(DERIVED, "slopes_log.json"), summary)
    print(f"  {len(rows)}행 중 {ok}행 위치화, 필지 {len(feats)}개, 실패 {len(rows)-ok}행")


# ─────────────────────────────── DAT-05 사고 지오코딩
# 기사 주소가 지점 단위가 아닌 사건은 공개된 시설 주소로 대체(대략 위치, approx 유지).
# INC-05 "안양시(현장 위치 미확인)"·INC-01(주소 없음)·INC-03(광명 구간)·INC-08(공사현장 미상)은 좌표 없이 목록에만.
MANUAL_ADDR = {
    "INC-02": "경기도 안양시 동안구 흥안대로 439",   # 안양 농수산물도매시장
    "INC-06": "경기도 안양시 동안구 시민대로 180",   # 범계역 롯데백화점 평촌점
}
NO_POINT = {"INC-01", "INC-03", "INC-05", "INC-08"}


def geocode_incidents():
    print("[incidents] 사고 8건 지오코딩 …")
    src = json.load(open(os.path.join(DATA, "incidents.json"), encoding="utf-8"))
    out = []
    for inc in src["incidents"]:
        item = dict(inc)
        if item["id"] in NO_POINT:
            item["geocode_fail"] = "지점 단위 주소 없음 — 관내 사고 목록에만 표시"
            out.append(item)
            continue
        if item.get("lon") is None and (item.get("address") or MANUAL_ADDR.get(item["id"])):
            r = geocode_any(MANUAL_ADDR.get(item["id"], item["address"]))
            if r:
                item["lon"], item["lat"] = r["lon"], r["lat"]
                item["geocoded"] = r["refined"] or item["address"]
            else:
                item["geocode_fail"] = "브이월드 지오코더 결과 없음(주소가 지점 단위가 아님)"
        out.append(item)
        time.sleep(0.05)
    save(os.path.join(DERIVED, "incidents_geocoded.json"), {"note": src.get("note"), "incidents": out,
                                                            "generated": time.strftime("%Y-%m-%d")})
    print("  좌표 확보:", sum(1 for x in out if x.get("lon") is not None), "/", len(out))


# ─────────────────────────────── DAT-09 시설 지오코딩
def geocode_facilities():
    print("[facilities] 공공건축물·대피시설·급수시설 지오코딩 …")
    od = os.path.join(DATA, "anyang_opendata")
    sets = [
        ("public_building", "anyang_public_buildings_20260630_15114534.csv", "명칭", "주소",
         {"area": "면적", "acquired": "취득일"}, "경기도 안양시_공공건축물현황(공공데이터포털 15114534)", "2026-06-30"),
        ("shelter", "anyang_emergency_shelters_20251226_3045138.csv", "시설", "주소",
         {"area": "규모(제곱미터)", "capacity": "최대 수용인원(명)"}, "경기도 안양시_비상대피시설 현황(공공데이터포털 3045138)", "2025-12-26"),
        ("water", "anyang_civil_defense_water_20260307_3045178.csv", "시설명", "주소",
         {"use": "용도", "capacity": "급수용량(톤_일)"}, "경기도 안양시_민방위 급수시설 현황(공공데이터포털 3045178)", "2026-03-07"),
    ]
    items = []
    stats = {}
    for kind, fname, name_col, addr_col, extra, source, asof in sets:
        rows = list(csv.DictReader(open(os.path.join(od, fname), encoding="utf-8-sig")))
        ok = 0
        for r in rows:
            r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
            name = r.get(name_col, "")
            addr = r.get(addr_col, "")
            g = geocode_any(addr)
            it = {"kind": kind, "name": name, "address": addr, "source": source, "asof": asof}
            for k, col in extra.items():
                if r.get(col):
                    it[k] = r[col]
            if g:
                it["lon"], it["lat"] = round(g["lon"], 6), round(g["lat"], 6)
                ok += 1
            items.append(it)
            time.sleep(0.04)
        stats[kind] = {"rows": len(rows), "geocoded": ok}
        print(f"  {kind}: {ok}/{len(rows)}")
    save(os.path.join(DERIVED, "facilities.json"), {"stats": stats, "generated": time.strftime("%Y-%m-%d"), "items": items})


if __name__ == "__main__":
    steps = sys.argv[1:] or ["gb", "slopes", "incidents", "facilities"]
    for s in steps:
        {"gb": fetch_gb, "slopes": fetch_slopes, "incidents": geocode_incidents, "facilities": geocode_facilities}[s]()
    print("완료")
