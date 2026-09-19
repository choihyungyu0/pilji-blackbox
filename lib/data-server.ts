import "server-only";
import propsJson from "@/data/derived/bldg_props.json";
import timelineJson from "@/data/derived/timeline_sources.json";
import dongStatsJson from "@/data/derived/dong_stats.json";
import lawsJson from "@/data/laws/laws.json";
import excavationJson from "@/data/derived/excavation.json";
import redevelopJson from "@/data/derived/redevelop.json";
import type { Building, Grade, LawItem } from "./types";

/**
 * 서버 전용 정적 인덱스 — 건물 속성(도형 없음)·타임라인 원천·법령 조문.
 * 빌드 시 JSON 이 번들에 포함되므로 Vercel 함수에서도 파일 접근 없이 동작한다.
 * 점수는 사전 계산값 그대로 (데이터 원칙 2: 재계산 금지).
 */

export const DATA_ASOF = propsJson.asof as string;

type Row = (string | number | boolean | null)[];
const cols = propsJson.cols as string[];
const rows = propsJson.rows as Row[];

let byId: Map<number, Building> | null = null;
let byPnu: Map<string, Building[]> | null = null;
let all: Building[] | null = null;

function rowToBuilding(r: Row): Building {
  const o: Record<string, unknown> = {};
  cols.forEach((c, i) => (o[c] = r[i]));
  return o as unknown as Building;
}

function ensure() {
  if (all) return;
  all = rows.map(rowToBuilding);
  byId = new Map(all.map((b) => [b.id, b]));
  byPnu = new Map();
  for (const b of all) {
    const arr = byPnu.get(b.pnu);
    if (arr) arr.push(b);
    else byPnu.set(b.pnu, [b]);
  }
}

export function allBuildings(): Building[] {
  ensure();
  return all!;
}

export function buildingById(id: number): Building | null {
  ensure();
  return byId!.get(id) ?? null;
}

/** 같은 필지에 건물이 여럿이면 대장 있는 건물·큰 연면적 우선 */
export function buildingsByPnu(pnu: string): Building[] {
  ensure();
  const arr = byPnu!.get(pnu) ?? [];
  return [...arr].sort((a, b) => Number(b.ledger) - Number(a.ledger) || (b.gfa ?? 0) - (a.gfa ?? 0));
}

export function findByJibun(dong: string | null, jibun: string, san: boolean): Building[] {
  ensure();
  const sanKey = san ? "산" : "일반";
  return all!.filter((b) => (!dong || b.dong === dong) && b.jibun === jibun && b.san === sanKey);
}

/** 반경 내 건물 (중심점 기준) */
export function nearby(lon: number, lat: number, radiusM: number): { b: Building; d: number }[] {
  ensure();
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const out: { b: Building; d: number }[] = [];
  for (const b of all!) {
    if (Math.abs(b.lat - lat) > dLat || Math.abs(b.lon - lon) > dLon) continue;
    const d = haversine(lon, lat, b.lon, b.lat);
    if (d <= radiusM) out.push({ b, d });
  }
  return out.sort((x, y) => x.d - y.d);
}

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** INV-01: 법정동·등급·건수 → 점수 내림차순 후보 */
export function candidates(opts: { dong?: string | null; grades: Grade[]; limit: number }): Building[] {
  ensure();
  const gset = new Set(opts.grades);
  return all!
    .filter((b) => b.cand && b.grade && gset.has(b.grade) && (!opts.dong || b.dong === opts.dong))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.max(1, Math.min(200, opts.limit)));
}

// ── 타임라인 원천 ─────────────────────────────────────────────
export type ChangeItem = {
  id: number; type: "viol_added" | "viol_cleared" | "new_building"; pnu: string; dong: string; jibun: string;
  use: string | null; lon: number; lat: number; from_date: string; to_date: string; source: string;
};
export type IncidentItem = {
  id: string; date: string; type: string; title: string; address: string | null; lon: number | null; lat: number | null;
  approx: boolean; managing: string; source: string; url: string | null; urls?: string[]; note?: string; pnu?: string;
  geocoded?: string; geocode_fail?: string;
};
export type ConstructionItem = {
  date: string; type: string; use: string; address: string; lat: number; lon: number;
  nearest_building_id: number; nearest_pnu: string; nearest_m: number; source: string;
};
export type SlopeItem = {
  pnu: string; names: string[]; n: number; dong: string; sgg: string; san: boolean; jibun: string;
  addr: string | null; jimok: string | null; lon: number; lat: number; source: string; asof: string;
};

export const timelineSources = timelineJson as unknown as {
  asof: string;
  changes: { snapshots: string[]; counts: { viol_added: number; viol_cleared: number; new_building: number }; items: ChangeItem[] };
  incidents: IncidentItem[];
  construction: ConstructionItem[];
  slopes: SlopeItem[];
  slopes_unlocated: { name: string; dong: string; pnu: string | null }[];
  slopes_log: { rows: number; located_rows: number; failed_rows: number; parcels: number; generated: string };
};

export const dongStats = dongStatsJson as {
  asof: string; n: number;
  total: Record<string, number>;
  dongs: { dong: string; n: number; nl: number; viol: number; ledger: number; cand: number; A: number; B: number; gb: number; nl_pct: number; v_pct: number | null }[];
};

export const laws = (lawsJson as { items: LawItem[] }).items;

// ── 도로굴착(안양시 15152770)·지반침하사고(국토부 15041891) — 빌드 시 캐시, 런타임 호출 없음 ──
export type ExcavationItem = { id: string; name: string; company: string; address: string; start: string | null; end: string | null; status: "예정" | "진행중" | "완료"; lon: number | null; lat: number | null };
export type SubsidenceItem = {
  id: string; date: string; sigungu: string; dong: string; jibun: string; pnu: string | null; reason: string; detail: string; size: string;
  death: number; injury: number; vehicle: number; restore: string; restoreMethod: string; restoreDate: string | null; lon: number | null; lat: number | null; matched: string;
};
export type RedevelopItem = { id: string; name: string; type: string; stage: string; status: string; location: string; area_m2: string | null; union_at: string | null; start_at: string | null; done_at: string | null; units_before: string | null; lon: number | null; lat: number | null; c8: boolean };
export const redevelopSources = redevelopJson as unknown as { source: string; asof: string; rule: string; total: number; located: number; c8_zones: number; items: RedevelopItem[] };
export const excavationSources = excavationJson as unknown as {
  fetched: string;
  excavation: { source: string; asof: string; crs_note: string; total: number; geocoded: number; items: ExcavationItem[] };
  subsidence: { source: string; asof: string; range: string; total_national: number; anyang: number; items: SubsidenceItem[] };
};
