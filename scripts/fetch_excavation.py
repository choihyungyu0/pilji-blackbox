# -*- coding: utf-8 -*-
"""
안양시 도로굴착 공사현황(공공데이터포털 15152770) + 국토교통부 지하안전정보(15041891) 지반침하사고 — 빌드 시 1회 조회·캐시.
런타임 호출 없음. 실패해도 기존 캐시(data/derived/excavation.json)가 있으면 그대로 둔다.

  python scripts/fetch_excavation.py

- 도로굴착 API 는 EPSG:5186(중부원점 TM) 좌표를 준다 → pyproj 로 EPSG:4326 변환. 변환 후 안양 범위(126.85~127.0, 37.35~37.45) 밖이면 실패로 기록.
- 공사업체 연락처(TEL_NUM)는 싣지 않는다. 진행 상태는 조회일 기준 예정/진행중/완료.
- 지반침하사고는 전국 목록에서 '안양시' 만 걸러 상세를 받고, 좌표가 0이면 법정동+지번으로 건물통합정보 필지에 매칭한다.
출력: data/derived/excavation.json (앱 서버 import), public/data/excavation.json + excavation.geojson (지도·클라이언트)
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DERIVED = os.path.join(DATA, "derived")
PUB = os.path.join(ROOT, "public", "data")


def load_env():
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
KEY = os.environ.get("DATA_GO_KR_KEY", "")
if not KEY:
    print("DATA_GO_KR_KEY 없음 (.env.local)")
    sys.exit(1)

TODAY = dt.date.today().isoformat()
tf = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)
IN_ANYANG = lambda lon, lat: 126.85 <= lon <= 127.0 and 37.35 <= lat <= 37.45


def get(url, params, enc="utf-8", tries=3):
    q = urllib.parse.urlencode({**params, "serviceKey": KEY, "type": "json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(url + "?" + q, timeout=40) as r:
                raw = r.read()
            try:
                return json.loads(raw.decode(enc))
            except UnicodeDecodeError:
                return json.loads(raw.decode("cp949", errors="replace"))
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(1.5)


VWORLD_KEY = os.environ.get("VWORLD_KEY") or os.environ.get("NEXT_PUBLIC_VWORLD_KEY", "")


def vworld_geocode(address):
    """지번 주소 → (lon, lat, True). 실패 시 None."""
    if not VWORLD_KEY:
        return None
    q = urllib.parse.urlencode({"service": "address", "request": "getcoord", "version": "2.0", "crs": "epsg:4326", "address": address, "type": "parcel", "key": VWORLD_KEY, "refine": "true", "simple": "true"})
    try:
        with urllib.request.urlopen("https://api.vworld.kr/req/address?" + q, timeout=20) as r:
            js = json.loads(r.read().decode("utf-8"))
        resp = js.get("response", {})
        if resp.get("status") != "OK":
            return None
        pt = resp["result"]["point"]
        return round(float(pt["x"]), 6), round(float(pt["y"]), 6), True
    except Exception:  # noqa: BLE001
        return None


def fetch_excavation():
    print("[excavation] 안양시 도로굴착 공사현황 …")
    url = "https://apis.data.go.kr/3830000/roadExcavation/getConstructionList"
    items, page = [], 1
    while True:
        j = get(url, {"pageNo": page, "numOfRows": 100})
        body = j.get("response", {}).get("body", {})
        rows = body.get("items") or []
        if not rows:
            break
        items += rows
        if len(items) >= int(body.get("totalCount", 0)):
            break
        page += 1
    out, fail = [], 0
    for i, r in enumerate(items):
        x, y = r.get("CENTER_X"), r.get("CENTER_Y")
        lon = lat = None
        if isinstance(x, (int, float)) and isinstance(y, (int, float)) and x > 0 and y > 0:
            lon, lat = tf.transform(x, y)
            lon, lat = round(lon, 6), round(lat, 6)
            if not IN_ANYANG(lon, lat):
                lon = lat = None
        if lon is None:
            fail += 1
        start, end = r.get("CCS_YMD") or None, r.get("CCE_YMD") or None
        status = "완료" if end and end < TODAY else ("예정" if start and start > TODAY else "진행중")
        out.append({
            "id": f"EXC-{i + 1:03d}", "name": (r.get("CNT_NAM") or "").strip(), "company": (r.get("COM_NAM") or "").strip(),
            "address": (r.get("JYG_LOC") or "").strip(), "start": start, "end": end, "status": status, "lon": lon, "lat": lat,
        })
    print(f"  조회 {len(items)}건 · 좌표 변환 성공 {len(items) - fail}건 · 실패 {fail}건")
    return {"total": len(items), "geocoded": len(items) - fail, "items": out}


def fetch_subsidence():
    print("[subsidence] 국토교통부 지하안전정보 — 지반침하사고(안양) …")
    url = "https://apis.data.go.kr/1613000/undergroundsafetyinfo01/getSubsidenceList01"
    items, page = [], 1
    while True:
        j = get(url, {"pageNo": page, "numOfRows": 100, "sagoDateFrom": "20180101", "sagoDateTo": TODAY.replace("-", "")})
        rows = j.get("response", {}).get("body", {}).get("items") or []
        if not rows:
            break
        items += rows
        if len(items) >= int(j["response"].get("totalCount", 0)):
            break
        page += 1
    an = [r for r in items if "안양" in (r.get("sigungu") or "")]
    print(f"  전국 {len(items)}건 중 안양시 {len(an)}건")
    # 건물통합정보 필지 매칭용 (법정동+지번 → 대표 건물)
    props = json.load(open(os.path.join(DERIVED, "bldg_props.json"), encoding="utf-8"))
    col = {c: i for i, c in enumerate(props["cols"])}
    by_jibun = {}
    for row in props["rows"]:
        key = (row[col["dong"]], row[col["jibun"]], row[col["san"]])
        by_jibun.setdefault(key, row)
    out = []
    for r in an:
        d = get("https://apis.data.go.kr/1613000/undergroundsafetyinfo01/getSubsidenceInfo01", {"sagoNo": r["sagoNo"]})
        info = (d.get("response", {}).get("body", {}).get("items") or [{}])[0]
        lat = float(info.get("sagoLat") or 0) or None
        lon = float(info.get("sagoLon") or 0) or None
        dong, addr = (info.get("dong") or "").strip(), (info.get("addr") or "").strip()
        if not dong and " " in addr:  # "석수동 241-43" 처럼 dong 이 비고 addr 에 붙은 경우
            dong, addr = addr.split(" ", 1)
        dong = dong.replace("호계1동", "호계동").replace("호계2동", "호계동").replace("호계3동", "호계동")
        pnu = None
        san = "산" if addr.startswith("산") else "일반"
        jib = addr.replace("산", "").strip()
        b = by_jibun.get((dong, jib, san))
        geocoded = False
        if b is not None:
            pnu = b[col["pnu"]]
            if lon is None or lat is None:
                lon, lat = b[col["lon"]], b[col["lat"]]
        elif (lon is None or lat is None) and dong and addr:
            # 건물이 없는 도로 필지 — 브이월드 지오코더(지번)로 좌표만
            gu = "동안구" if dong in ("호계동", "비산동", "관양동", "평촌동") else "만안구"
            g = vworld_geocode(f"경기도 안양시 {gu} {dong} {addr}")
            if g:
                lon, lat, geocoded = g
        sd = info.get("sagoDate") or r.get("sagoDate") or ""
        out.append({
            "id": f"SUB-{r['sagoNo']}", "date": f"{sd[:4]}-{sd[4:6]}-{sd[6:8]}" if len(sd) == 8 else sd,
            "sigungu": (info.get("sigungu") or r.get("sigungu") or "").strip(), "dong": dong, "jibun": addr, "pnu": pnu,
            "reason": (info.get("sagoReason") or r.get("sagoReason") or "").strip(), "detail": (info.get("sagoDetail") or "").strip(),
            "size": f"폭 {info.get('sinkWidth')}m · 연장 {info.get('sinkExtend')}m · 깊이 {info.get('sinkDepth')}m",
            "death": int(info.get("deathCnt") or 0), "injury": int(info.get("injuryCnt") or 0), "vehicle": int(info.get("vehicleCnt") or 0),
            "restore": (info.get("trStatus") or "").strip(), "restoreMethod": (info.get("trMethod") or "").strip(), "restoreDate": info.get("trFnDate"),
            "lon": lon, "lat": lat, "matched": "pnu" if pnu else ("geocoder" if geocoded else ("coord" if lon else "none")),
        })
        time.sleep(0.2)
    return {"total_national": len(items), "anyang": len(an), "items": out}


def main():
    exc = fetch_excavation()
    sub = fetch_subsidence()
    out = {
        "fetched": TODAY,
        "excavation": {
            "source": "경기도 안양시_도로굴착 공사현황 정보(공공데이터포털 15152770, 도로점용굴착 인허가시스템)", "asof": TODAY, "crs_note": "원본 EPSG:5186 → EPSG:4326 (pyproj)",
            **exc,
        },
        "subsidence": {
            "source": "국토교통부_지하안전정보(공공데이터포털 15041891) 지반침하사고", "asof": TODAY, "range": "2018-01-01 ~ " + TODAY,
            **sub,
        },
    }
    os.makedirs(PUB, exist_ok=True)
    for p in (os.path.join(DERIVED, "excavation.json"), os.path.join(PUB, "excavation.json")):
        json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("  →", os.path.relpath(p, ROOT), f"{os.path.getsize(p) / 1024:.0f}KB")
    feats = [{"type": "Feature", "properties": {k: v for k, v in it.items() if k not in ("lon", "lat")}, "geometry": {"type": "Point", "coordinates": [it["lon"], it["lat"]]}}
             for it in exc["items"] if it["lon"] is not None]
    feats += [{"type": "Feature", "properties": {**{k: v for k, v in it.items() if k not in ("lon", "lat")}, "kind": "subsidence"}, "geometry": {"type": "Point", "coordinates": [it["lon"], it["lat"]]}}
              for it in sub["items"] if it["lon"] is not None]
    gp = os.path.join(PUB, "excavation.geojson")
    json.dump({"type": "FeatureCollection", "asof": TODAY, "features": feats}, open(gp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("  →", os.path.relpath(gp, ROOT), f"{len(feats)} features")


if __name__ == "__main__":
    main()
