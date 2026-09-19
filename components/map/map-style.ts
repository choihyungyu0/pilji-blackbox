import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from "maplibre-gl";
import type { ColorMode, Filters, LayerKey } from "@/store/app-store";
import type { Building, Mode } from "@/lib/types";

/** 브이월드 WMTS 위성 + 하이브리드(지명) — 키 없으면 OSM 폴백 (ST-M4) */
export const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? "";
export const SAT_URL = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`;
export const HYB_URL = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`;
export const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      sat: { type: "raster", tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: "위성 배경 © 국토교통부 브이월드 (조회만, 저장·가공 없음)" },
      hyb: { type: "raster", tiles: [HYB_URL], tileSize: 256, maxzoom: 19 },
      osm: { type: "raster", tiles: [OSM_URL], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b1220" } },
      { id: "sat", type: "raster", source: "sat", layout: { visibility: VWORLD_KEY ? "visible" : "none" }, paint: { "raster-brightness-max": 0.9 } },
      { id: "hyb", type: "raster", source: "hyb", layout: { visibility: VWORLD_KEY ? "visible" : "none" }, paint: { "raster-opacity": 0.85 } },
      { id: "osm", type: "raster", source: "osm", layout: { visibility: VWORLD_KEY ? "none" : "visible" }, paint: { "raster-saturation": -0.6, "raster-brightness-max": 0.85 } },
    ],
  };
}

export const COLORS = {
  viol: "#dc2626",
  candA: "#ea580c",
  candB: "#f59e0b",
  ledger: "#2563eb",
  gb: "#16a34a",
  slope: "#ca8a04",
  selected: "#38bdf8",
  na: "#9ca3af",
  neutral: "#d4d4d8",
  verdict: { VIOLATION: "#7f1d1d", NORMAL: "#15803d", NOT_TARGET: "#52525b", HOLD: "#7c3aed" },
};

export const USE_COLORS: [string, string][] = [
  ["단독주택", "#60a5fa"],
  ["공동주택", "#2563eb"],
  ["제1종근린생활시설", "#f472b6"],
  ["제2종근린생활시설", "#db2777"],
  ["공장", "#a16207"],
  ["창고시설", "#ca8a04"],
  ["업무시설", "#7c3aed"],
  ["교육연구시설", "#0d9488"],
  ["종교시설", "#65a30d"],
  ["노유자시설", "#0ea5e9"],
];

/** MAP-03 색상 기준 — 결측은 회색(정보없음) */
export function baseColorExpr(mode: ColorMode): ExpressionSpecification {
  switch (mode) {
    case "score":
      // 보정 점수(feature-state.adj, 안양 여건 × 판정)가 있으면 그것으로, 없으면 기본 점수로 색을 칠한다
      return [
        "case",
        ["==", ["typeof", ["get", "score"]], "number"],
        ["interpolate", ["linear"], ["coalesce", ["feature-state", "adj"], ["get", "score"]], 0, "#e5e7eb", 0.08, "#fde68a", 0.165, "#fb923c", 0.222, "#ef4444", 0.5, "#991b1b", 0.75, "#450a0a"],
        COLORS.na,
      ];
    case "viol":
      return ["match", ["coalesce", ["get", "viol"], "null"], "Y", COLORS.viol, "N", COLORS.neutral, COLORS.na];
    case "age":
      return [
        "case",
        ["==", ["typeof", ["get", "year"]], "number"],
        ["interpolate", ["linear"], ["-", 2026, ["get", "year"]], 0, "#dbeafe", 15, "#93c5fd", 30, "#3b82f6", 45, "#1d4ed8", 70, "#1e3a8a"],
        COLORS.na,
      ];
    case "use": {
      const m: (string | ExpressionSpecification)[] = ["match", ["coalesce", ["get", "use"], "null"]];
      for (const [u, c] of USE_COLORS) m.push(u, c);
      m.push("null", COLORS.na);
      m.push("#a3a3a3");
      return m as unknown as ExpressionSpecification;
    }
  }
}

/** 레이어 토글(LYR-01~03)은 색상 기준 위에 덮는 강조색. 우선순위 선택 > 판정 > 위반 > 후보 > 대장 미연계 > 기준색 */
export function colorExpr(colorMode: ColorMode, layers: Record<LayerKey, boolean>, mode: Mode): ExpressionSpecification {
  const e: unknown[] = ["case", ["boolean", ["feature-state", "selected"], false], COLORS.selected];
  if (mode === "officer") {
    e.push(["==", ["feature-state", "verdict"], "VIOLATION"], COLORS.verdict.VIOLATION);
    e.push(["==", ["feature-state", "verdict"], "NORMAL"], COLORS.verdict.NORMAL);
    e.push(["==", ["feature-state", "verdict"], "NOT_TARGET"], COLORS.verdict.NOT_TARGET);
    e.push(["==", ["feature-state", "verdict"], "HOLD"], COLORS.verdict.HOLD);
  }
  if (layers.viol) e.push(["==", ["coalesce", ["get", "viol"], ""], "Y"], COLORS.viol);
  if (mode === "officer" && layers.cand) {
    // 후보 제외(C1 공공건축물 필지·'대상 아님' 판정)는 후보 강조색을 주지 않는다
    const notExcluded = ["!", ["boolean", ["feature-state", "excluded"], false]];
    e.push(["all", notExcluded, ["==", ["coalesce", ["get", "grade"], ""], "A"]], COLORS.candA);
    e.push(["all", notExcluded, ["==", ["coalesce", ["get", "grade"], ""], "B"]], COLORS.candB);
  }
  if (layers.ledger) e.push(["!", ["to-boolean", ["get", "ledger"]]], COLORS.ledger);
  e.push(baseColorExpr(colorMode));
  return e as unknown as ExpressionSpecification;
}

export const HEIGHT_EXPR: ExpressionSpecification = [
  "case",
  [">", ["coalesce", ["get", "fl_up"], 0], 0], ["*", ["get", "fl_up"], 3],
  [">", ["coalesce", ["get", "h"], 0], 0], ["get", "h"],
  3,
];

/** MAP-04 필터 — 지도 필터식과 JS 술어를 같은 규칙으로 만든다 (건수 배지와 지도가 일치) */
export function filterExpr(f: Filters): FilterSpecification {
  const parts: unknown[] = ["all"];
  if (f.dong) parts.push(["==", ["get", "dong"], f.dong]);
  if (f.use) parts.push(["==", ["coalesce", ["get", "use"], ""], f.use]);
  if (f.scoreMin != null) parts.push(["all", ["==", ["typeof", ["get", "score"]], "number"], [">=", ["get", "score"], f.scoreMin]]);
  if (f.scoreMax != null) parts.push(["all", ["==", ["typeof", ["get", "score"]], "number"], ["<=", ["get", "score"], f.scoreMax]]);
  if (f.ageMin != null) parts.push(["all", ["==", ["typeof", ["get", "year"]], "number"], ["<=", ["get", "year"], 2026 - f.ageMin]]);
  if (f.ageMax != null) parts.push(["all", ["==", ["typeof", ["get", "year"]], "number"], [">=", ["get", "year"], 2026 - f.ageMax]]);
  if (f.gb === true) parts.push(["==", ["coalesce", ["get", "gb"], false], true]);
  if (f.gb === false) parts.push(["!=", ["coalesce", ["get", "gb"], false], true]);
  return (parts.length > 1 ? parts : ["all"]) as unknown as FilterSpecification;
}

export function filterPredicate(f: Filters): (b: Building) => boolean {
  return (b) => {
    if (f.dong && b.dong !== f.dong) return false;
    if (f.use && (b.use ?? "") !== f.use) return false;
    if (f.scoreMin != null && (b.score == null || b.score < f.scoreMin)) return false;
    if (f.scoreMax != null && (b.score == null || b.score > f.scoreMax)) return false;
    if (f.ageMin != null && (b.year == null || b.year > 2026 - f.ageMin)) return false;
    if (f.ageMax != null && (b.year == null || b.year < 2026 - f.ageMax)) return false;
    if (f.gb === true && b.gb !== true) return false;
    if (f.gb === false && b.gb === true) return false;
    return true;
  };
}

export function isFilterActive(f: Filters) {
  return Boolean(f.dong || f.use || f.scoreMin != null || f.scoreMax != null || f.ageMin != null || f.ageMax != null || f.gb != null);
}
