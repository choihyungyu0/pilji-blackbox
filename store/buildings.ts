"use client";

import { create } from "zustand";
import type { Building, Mode } from "@/lib/types";
import { parseJibunQuery, jibunOf, distanceM } from "@/lib/geo";

/**
 * DAT-01 건물 데이터 적재 — 모드별 정적 GeoJSON 을 한 번만 받아 인덱스를 만든다.
 * 담당자 파일(/data/officer/)은 미들웨어가 세션 쿠키로 보호한다.
 * FeatureCollection 은 MapLibre 소스에 그대로 넣고, 속성 검색·필터 집계는 여기 인덱스로 한다.
 */

export type BuildingFC = {
  type: "FeatureCollection";
  asof: string;
  source: string;
  n: number;
  counts: Record<string, number>;
  mode: Mode;
  features: { type: "Feature"; id: number; properties: Building; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }[];
};

export type BuildingIndex = {
  mode: Mode;
  asof: string;
  counts: Record<string, number>;
  fc: BuildingFC;
  list: Building[];
  byId: Map<number, Building>;
  byPnu: Map<string, Building[]>;
  uses: { use: string; n: number }[];
};

type State = {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  index: BuildingIndex | null;
  loadedMs: number | null;
  load: (mode: Mode) => Promise<void>;
};

let inflight: Promise<void> | null = null;

export const useBuildings = create<State>((set, get) => ({
  status: "idle",
  error: null,
  index: null,
  loadedMs: null,
  load: async (mode) => {
    const cur = get();
    if (cur.index && cur.index.mode === mode) return;
    if (inflight) return inflight;
    set({ status: "loading", error: null });
    const t0 = performance.now();
    inflight = (async () => {
      try {
        const res = await fetch(`/data/${mode}/buildings.geojson`, { cache: "force-cache" });
        if (!res.ok) throw new Error(`건물 데이터 ${res.status}`);
        const fc = (await res.json()) as BuildingFC;
        const list: Building[] = new Array(fc.features.length);
        const byId = new Map<number, Building>();
        const byPnu = new Map<string, Building[]>();
        const useCount = new Map<string, number>();
        fc.features.forEach((f, i) => {
          const p = f.properties;
          list[i] = p;
          byId.set(p.id, p);
          const arr = byPnu.get(p.pnu);
          if (arr) arr.push(p);
          else byPnu.set(p.pnu, [p]);
          if (p.use) useCount.set(p.use, (useCount.get(p.use) ?? 0) + 1);
        });
        // 같은 필지에 건물이 여럿이면 후보 > 대장 있음 > 연면적 큰 순 — 딥링크·검색이 대표 건물을 고르도록
        for (const arr of byPnu.values()) {
          if (arr.length > 1) arr.sort((a, b) => Number(Boolean(b.cand)) - Number(Boolean(a.cand)) || Number(b.ledger) - Number(a.ledger) || (b.gfa ?? 0) - (a.gfa ?? 0));
        }
        const uses = [...useCount.entries()].map(([use, n]) => ({ use, n })).sort((a, b) => b.n - a.n);
        set({
          status: "ready",
          index: { mode, asof: fc.asof, counts: fc.counts, fc, list, byId, byPnu, uses },
          loadedMs: Math.round(performance.now() - t0),
        });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));

/** MAP-05 지번 검색 — 정확 일치 없으면 같은 동에서 본번이 가까운 3건 제안 */
export function searchJibun(idx: BuildingIndex, q: string): { exact: Building[]; suggestions: Building[]; parsed: ReturnType<typeof parseJibunQuery> } {
  const parsed = parseJibunQuery(q);
  if (!parsed) return { exact: [], suggestions: [], parsed: null };
  const jibun = jibunOf(parsed.bon, parsed.bu);
  const sanKey = parsed.san ? "산" : "일반";
  const pool = parsed.dong ? idx.list.filter((b) => b.dong === parsed.dong) : idx.list;
  const exact = pool.filter((b) => b.jibun === jibun && b.san === sanKey);
  if (exact.length) return { exact, suggestions: [], parsed };
  const seen = new Set<string>();
  const suggestions = pool
    .filter((b) => b.san === sanKey)
    .map((b) => {
      const [bon, bu] = b.jibun.split("-").map(Number);
      return { b, d: Math.abs(bon - parsed.bon) * 1000 + Math.abs((bu || 0) - parsed.bu) };
    })
    .sort((x, y) => x.d - y.d)
    .filter(({ b }) => {
      const k = `${b.dong}|${b.jibun}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3)
    .map((x) => x.b);
  return { exact: [], suggestions, parsed };
}

/** 반경 내 건물 (중심점) — 주변 현황 집계 */
export function buildingsWithin(idx: BuildingIndex, lon: number, lat: number, radiusM: number): { b: Building; d: number }[] {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const out: { b: Building; d: number }[] = [];
  for (const b of idx.list) {
    if (Math.abs(b.lat - lat) > dLat || Math.abs(b.lon - lon) > dLon) continue;
    const d = distanceM(lon, lat, b.lon, b.lat);
    if (d <= radiusM) out.push({ b, d });
  }
  return out.sort((a, b) => a.d - b.d);
}
