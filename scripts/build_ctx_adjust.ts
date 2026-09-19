/**
 * 안양 여건 보정 계수(C1~C6) 빌드 — 후보 1,918동 전부에 대해 1회 계산해 정적 JSON 으로 떨어뜨린다 (런타임 계산 금지).
 *   node scripts/build_ctx_adjust.ts
 * 입력: data/derived/bldg_props.json · facilities.json(공동주택·대피·급수) · timeline_sources.json(착공신고) · flood_supplies.json · hjd.json
 * 출력: public/data/ctx_adjust.json (클라이언트) + data/derived/ctx_adjust.json (서버 import, 같은 내용)
 * 통계(순위 변동·상위 100 진입/이탈·항목별 건수)도 같이 넣어 성과 대시보드가 그대로 읽는다.
 */
import fs from "node:fs";
import path from "node:path";
import { computeCtx, adjScore, byAdjDesc, CTX_RULES, type CtxCode } from "../lib/adjust/rules.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf-8"));

type Row = (string | number | boolean | null)[];
const props = read("data/derived/bldg_props.json") as { asof: string; cols: string[]; rows: Row[] };
const col = Object.fromEntries(props.cols.map((c, i) => [c, i])) as Record<string, number>;
const fac = read("data/derived/facilities.json") as { items: { kind: string; lon?: number; lat?: number; units?: string | null }[] };
const tl = read("data/derived/timeline_sources.json") as { construction: { lon: number; lat: number; nearest_building_id: number }[] };
const flood = read("data/derived/flood_supplies.json") as { rows: { hjd: string; items: Record<string, number | string> }[] };
const hjd = read("data/derived/hjd.json") as { features: { properties: { adm_nm: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };

function haversine(lon1: number, lat1: number, lon2: number, lat2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function hjdOf(lon: number, lat: number): string | null {
  for (const f of hjd.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    for (const p of polys) {
      if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return f.properties.adm_nm.split(" ").pop() ?? null;
    }
  }
  return null;
}

// 반경 질의용 점 목록
const apts = fac.items.filter((f) => f.kind === "apartment" && f.lon != null).map((f) => ({ lon: f.lon!, lat: f.lat!, units: Number(f.units) || 0 }));
const shelters = fac.items.filter((f) => f.kind === "shelter" && f.lon != null).map((f) => ({ lon: f.lon!, lat: f.lat! }));
const water = fac.items.filter((f) => f.kind === "water" && f.lon != null).map((f) => ({ lon: f.lon!, lat: f.lat! }));
const cons = tl.construction.map((c) => ({ lon: c.lon, lat: c.lat, id: c.nearest_building_id }));
const within = <T extends { lon: number; lat: number }>(pts: T[], lon: number, lat: number, r: number) => pts.filter((p) => haversine(p.lon, p.lat, lon, lat) <= r);

// C4: 수방자재 — 수중펌프+엔진펌프 절대량, 행정동(구청 행 제외) 하위 25%. 인구 데이터가 없어 절대량 기준 (규칙 표에 명시).
const pumpRows = flood.rows.filter((r) => !r.hjd.endsWith("구청")).map((r) => ({ hjd: r.hjd, pumps: Number(r.items["수중펌프"] || 0) + Number(r.items["엔진펌프"] || 0) }));
const sortedPumps = [...pumpRows].sort((a, b) => a.pumps - b.pumps);
const q25 = sortedPumps[Math.floor(sortedPumps.length * 0.25) - 1]?.pumps ?? 0;
const lowFlood = new Set(pumpRows.filter((r) => r.pumps <= q25).map((r) => r.hjd));

type Cand = { id: number; pnu: string; dong: string; jibun: string; score: number; grade: string; lon: number; lat: number; public_parcel: boolean };
const cands: Cand[] = props.rows
  .filter((r) => r[col.cand] === true && typeof r[col.score] === "number")
  .map((r) => ({ id: r[col.id] as number, pnu: r[col.pnu] as string, dong: r[col.dong] as string, jibun: r[col.jibun] as string, score: r[col.score] as number, grade: r[col.grade] as string, lon: r[col.lon] as number, lat: r[col.lat] as number, public_parcel: r[col.public_parcel] === true }));
if (cands.length !== 1918) throw new Error(`후보 수 불일치: ${cands.length} (기대 1,918)`);

const counts: Record<CtxCode, number> = { C1: 0, C2: 0, C3: 0, C3b: 0, C4: 0, C5: 0, C6: 0 };
const items: Record<string, { w: number; x?: true; r: CtxCode[]; d?: Record<string, string>; rb: number; ra: number }> = {};
const scored = cands.map((c) => {
  const h = hjdOf(c.lon, c.lat);
  const aptUnits = within(apts, c.lon, c.lat, 150).reduce((a, p) => a + p.units, 0);
  const consN = cons.filter((k) => k.id === c.id || haversine(k.lon, k.lat, c.lon, c.lat) <= 100).length;
  const adj = computeCtx({
    publicParcel: c.public_parcel,
    constructionWithin100m: consN,
    aptUnitsWithin150m: aptUnits,
    floodLowQuartile: h != null && lowFlood.has(h),
    sheltersWithin300m: within(shelters, c.lon, c.lat, 300).length,
    waterWithin300m: within(water, c.lon, c.lat, 300).length,
  });
  for (const r of adj.reasons) counts[r.code]++;
  const detail: Record<string, string> = {};
  for (const r of adj.reasons) if (r.detail) detail[r.code] = r.detail;
  if (h) detail.hjd = h;
  return { ...c, w: adj.w, excluded: adj.excluded, reasons: adj.reasons.map((r) => r.code), detail, adj: adj.excluded ? -1 : adjScore(c.score, adj.w, 0) };
});

// 순위: 기본(score 내림차순) vs 보정(adj 내림차순, 제외는 맨 뒤)
const baseOrder = [...scored].sort((a, b) => b.score - a.score || a.id - b.id);
const adjOrder = [...scored].sort(byAdjDesc);
const rankBase = new Map(baseOrder.map((c, i) => [c.id, i + 1]));
const rankAdj = new Map(adjOrder.map((c, i) => [c.id, i + 1]));
let changed = 0;
for (const c of scored) if (rankBase.get(c.id) !== rankAdj.get(c.id)) changed++;
const top100Base = new Set(baseOrder.slice(0, 100).map((c) => c.id));
const top100Adj = new Set(adjOrder.slice(0, 100).map((c) => c.id));
const entered = [...top100Adj].filter((id) => !top100Base.has(id)).length;
const left = [...top100Base].filter((id) => !top100Adj.has(id)).length;
const excludedList = scored.filter((c) => c.excluded).map((c) => `${c.dong} ${c.jibun} (건물 ${c.id})`);

for (const c of scored) {
  items[String(c.id)] = { w: c.w, ...(c.excluded ? { x: true as const } : {}), r: c.reasons, ...(Object.keys(c.detail).length ? { d: c.detail } : {}), rb: rankBase.get(c.id)!, ra: rankAdj.get(c.id)!, };
}
const adjusted = scored.filter((c) => c.w !== 0).length;
const out = {
  generated: new Date().toISOString().slice(0, 10),
  asof: props.asof,
  formula: "adj_score = score × (1 + w_ctx) × (1 + w_verdict); w_ctx ∈ [-1.0, +0.60]",
  rules: CTX_RULES,
  flood_note: "C4 는 행정동 인구 데이터가 없어 수중펌프+엔진펌프 절대량 하위 25% 기준 (임계 " + q25 + "대 이하: " + [...lowFlood].join(", ") + ")",
  stats: {
    candidates: cands.length, adjusted, unchanged: cands.length - adjusted, rank_changed: changed,
    top100_entered: entered, top100_left: left, excluded: excludedList.length, excluded_list: excludedList,
    final_candidates: cands.length - excludedList.length, by_code: counts,
    w_max: Math.max(...scored.map((c) => c.w)), w_min_non_excluded: Math.min(...scored.filter((c) => !c.excluded).map((c) => c.w)),
  },
  items,
};
for (const p of ["public/data/ctx_adjust.json", "data/derived/ctx_adjust.json"]) {
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(out));
  console.log("→", p, (fs.statSync(path.join(ROOT, p)).size / 1024).toFixed(0) + "KB");
}
console.log(JSON.stringify(out.stats, null, 1));
