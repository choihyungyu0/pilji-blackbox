"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type MapMouseEvent } from "maplibre-gl";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { useRanking } from "@/lib/adjust/use-ranking";
import { ANYANG_CENTER } from "@/lib/geo";
import type { Building, Mode } from "@/lib/types";
import { HEIGHT_EXPR, VWORLD_KEY, baseStyle, colorExpr, filterExpr, COLORS } from "./map-style";

/**
 * MAP-01 위성 배경 + 3D 건물 (MapLibre fill-extrusion, 높이 = 층수×3m / 높이 / 3m).
 * 스택 메모: CLAUDE.md 는 deck.gl GeoJsonLayer 를 적었으나 27,713동은 MapLibre 내장 돌출 레이어가
 * 의존성 없이 더 가볍고(feature-state 로 판정·선택 색 즉시 반영) 타일 분할이 자동이라 이쪽을 택했다 — README 기록.
 */

const BLDG_LAYER = "bldg-3d";

type Props = { mode: Mode; onSatFallback?: (reason: string) => void };

export function MapView({ mode, onSatFallback }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const selectedRef = useRef<number | null>(null);
  const hoverPopup = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const dongMarkersRef = useRef<maplibregl.Marker[]>([]);
  const satFailed = useRef(false);

  const index = useBuildings((s) => s.index);
  const layers = useApp((s) => s.layers);
  const colorMode = useApp((s) => s.colorMode);
  const filters = useApp((s) => s.filters);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const flyTo = useApp((s) => s.flyTo);
  const cases = useCases((s) => s.cases);
  const list = useApp((s) => s.list);

  /* ── 지도 생성 ── */
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: baseStyle(),
      center: ANYANG_CENTER,
      zoom: 12.6,
      pitch: 52,
      bearing: -12,
      minZoom: 10,
      maxZoom: 19,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), "bottom-left");
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();

    // 브이월드 타일 실패 감지 → OSM 폴백 + 배너 (ST-M4)
    let satErrors = 0;
    let satOk = false;
    const fallback = (reason: string) => {
      if (satFailed.current) return;
      satFailed.current = true;
      try {
        map.setLayoutProperty("sat", "visibility", "none");
        map.setLayoutProperty("hyb", "visibility", "none");
        map.setLayoutProperty("osm", "visibility", "visible");
      } catch {
        /* style not ready */
      }
      onSatFallback?.(reason);
    };
    if (!VWORLD_KEY) fallback("브이월드 인증키 없음");
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; error?: { status?: number } };
      if (ev.sourceId === "sat" && !satOk && map.isStyleLoaded()) {
        satErrors += 1;
        if (satErrors >= 4) fallback(`위성 타일 오류 ${ev.error?.status ?? ""}`.trim());
      }
    });
    map.on("sourcedata", (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: unknown };
      if (ev.sourceId === "sat" && ev.tile) satOk = true;
    });
    const satTimer = window.setTimeout(() => {
      if (VWORLD_KEY && !satOk && satErrors > 0) fallback("위성 타일 응답 없음");
    }, 12000);

    map.on("load", () => setReady(true));
    mapRef.current = map;
    return () => {
      window.clearTimeout(satTimer);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 정적 레이어 (경계·급경사지·시설·격자) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const add = async () => {
      if (!map.getSource("gb")) {
        map.addSource("gb", { type: "geojson", data: "/data/gb.geojson" });
        map.addLayer({ id: "gb-fill", type: "fill", source: "gb", paint: { "fill-color": COLORS.gb, "fill-opacity": 0.16 } });
        map.addLayer({ id: "gb-line", type: "line", source: "gb", paint: { "line-color": COLORS.gb, "line-width": 1.5, "line-opacity": 0.9 } });
      }
      if (!map.getSource("hjd")) {
        map.addSource("hjd", { type: "geojson", data: "/data/hjd.geojson" });
        map.addLayer({ id: "hjd-line", type: "line", source: "hjd", paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.55, "line-dasharray": [2, 2] } });
      }
      if (!map.getSource("slopes")) {
        map.addSource("slopes", { type: "geojson", data: "/data/slopes.geojson" });
        map.addLayer({ id: "slopes-fill", type: "fill", source: "slopes", paint: { "fill-color": COLORS.slope, "fill-opacity": 0.28 } });
        map.addLayer({ id: "slopes-line", type: "line", source: "slopes", paint: { "line-color": COLORS.slope, "line-width": 2.5 } });
      }
      if (!map.getSource("fac")) {
        map.addSource("fac", { type: "geojson", data: "/data/facilities.geojson" });
        map.addLayer({
          id: "fac-pt", type: "circle", source: "fac", minzoom: 13.5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13.5, 3, 17, 6],
            "circle-color": ["match", ["get", "kind"], "public_building", "#a855f7", "shelter", "#14b8a6", "water", "#06b6d4", "#ffffff"],
            "circle-stroke-color": "#fff", "circle-stroke-width": 1,
          },
        });
      }
      if (!map.getSource("exc")) {
        map.addSource("exc", { type: "geojson", data: "/data/excavation.geojson" });
        map.addLayer({
          id: "exc-pt", type: "circle", source: "exc", minzoom: 11,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 7, 17, 9],
            "circle-color": ["case", ["==", ["get", "kind"], "subsidence"], "#7c3aed", ["==", ["get", "status"], "완료"], "#9ca3af", "#dc2626"],
            "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9,
          },
        });
        const excPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: "300px" });
        map.on("click", "exc-pt", (e) => {
          const p = (e.features?.[0]?.properties ?? {}) as Record<string, string>;
          const html = p.kind === "subsidence"
            ? `<b>[지반침하] ${p.reason || "원인 미기재"}</b><br/>${p.date} · ${p.dong} ${p.jibun}<br/>${p.detail || ""}<br/>${p.size}<br/>복구 ${p.restore || "정보없음"}<br/><span style="color:#6b7280;font-size:10px">국토교통부 지하안전정보(15041891)</span>`
            : `<b>도로굴착 (${p.status})</b><br/>${p.name}<br/>${p.start} ~ ${p.end}<br/>${p.address}<br/><span style="color:#6b7280;font-size:10px">안양시 도로굴착 공사현황(15152770) · EPSG:5186→4326</span>`;
          excPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        });
        map.on("mouseenter", "exc-pt", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "exc-pt", () => { map.getCanvas().style.cursor = ""; });
      }
      if (mode === "public" && !map.getSource("grid")) {
        map.addSource("grid", { type: "geojson", data: "/data/public/cand_grid100.geojson" });
        map.addLayer({
          id: "grid-fill", type: "fill", source: "grid",
          paint: { "fill-color": COLORS.candA, "fill-opacity": ["interpolate", ["linear"], ["get", "n"], 1, 0.22, 4, 0.42, 10, 0.65, 20, 0.85] },
        });
        map.addLayer({ id: "grid-line", type: "line", source: "grid", paint: { "line-color": COLORS.candA, "line-width": 0.5, "line-opacity": 0.6 } });
      }
      // 행정동 이름 — 글리프 의존 없이 HTML 마커
      if (dongMarkersRef.current.length === 0) {
        try {
          const hjd = (await fetch("/data/hjd.geojson").then((r) => r.json())) as { features: { properties: { adm_nm: string }; geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon }[] };
          for (const f of hjd.features) {
            const ring = (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0]) as [number, number][];
            const lon = ring.reduce((a, c) => a + c[0], 0) / ring.length;
            const lat = ring.reduce((a, c) => a + c[1], 0) / ring.length;
            const el = document.createElement("div");
            el.className = "pb-dong-label" + (satFailed.current || !VWORLD_KEY ? " on-light" : "");
            el.textContent = f.properties.adm_nm;
            dongMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
          }
        } catch {
          /* 라벨 실패는 무시 */
        }
      }
    };
    void add();
  }, [ready, mode]);

  /* ── 건물 소스·레이어 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !index) return;
    if (!map.getSource("bldg")) {
      map.addSource("bldg", { type: "geojson", data: index.fc as unknown as GeoJSON.FeatureCollection, tolerance: 0.4, buffer: 32, maxzoom: 16 });
      map.addLayer({
        id: BLDG_LAYER,
        type: "fill-extrusion",
        source: "bldg",
        paint: {
          "fill-extrusion-height": HEIGHT_EXPR,
          "fill-extrusion-base": 0,
          "fill-extrusion-color": colorExpr(colorMode, layers, mode),
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      // 시설·굴착 점은 건물 위로
      if (map.getLayer("fac-pt")) map.moveLayer("fac-pt");
      if (map.getLayer("exc-pt")) map.moveLayer("exc-pt");

      const onMove = (e: MapMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: [BLDG_LAYER] })[0];
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (!f) {
          hoverPopup.current?.remove();
          hoverPopup.current = null;
          return;
        }
        const p = f.properties as unknown as Building;
        const grade = mode === "officer" && p.grade && p.cand ? ` · ${p.grade}등급 후보` : "";
        const html = `<b>${p.dong} ${p.san === "산" ? "산 " : ""}${p.jibun}</b><br/>${p.use ?? "용도 정보없음"}${p.viol === "Y" ? " · <span style='color:#dc2626'>위반 표기</span>" : ""}${grade}`;
        if (!hoverPopup.current) hoverPopup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 }).addTo(map);
        hoverPopup.current.setLngLat(e.lngLat).setHTML(html);
      };
      const onClick = (e: MapMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: [BLDG_LAYER] })[0];
        if (!f) return;
        const id = Number(f.id ?? (f.properties as { id: number }).id);
        useApp.getState().select(id);
      };
      map.on("mousemove", onMove);
      map.on("click", onClick);
    } else {
      (map.getSource("bldg") as maplibregl.GeoJSONSource).setData(index.fc as unknown as GeoJSON.FeatureCollection);
    }
  }, [ready, index, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 색상·레이어 토글 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer(BLDG_LAYER)) map.setPaintProperty(BLDG_LAYER, "fill-extrusion-color", colorExpr(colorMode, layers, mode));
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("gb-fill", layers.gb);
    vis("gb-line", layers.gb);
    vis("slopes-fill", layers.slopes);
    vis("slopes-line", layers.slopes);
    vis("hjd-line", layers.hjd);
    vis("fac-pt", layers.facilities);
    vis("exc-pt", layers.excavation);
    vis("grid-fill", mode === "public" && layers.grid);
    vis("grid-line", mode === "public" && layers.grid);
    dongMarkersRef.current.forEach((m) => (m.getElement().style.display = layers.hjd ? "" : "none"));
  }, [ready, colorMode, layers, mode, index]);

  /* ── 필터 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(BLDG_LAYER)) return;
    map.setFilter(BLDG_LAYER, filterExpr(filters));
  }, [ready, filters, index]);

  /* ── 선택 강조 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("bldg")) return;
    if (selectedRef.current != null) map.setFeatureState({ source: "bldg", id: selectedRef.current }, { selected: false });
    if (selectedId != null) map.setFeatureState({ source: "bldg", id: selectedId }, { selected: true });
    selectedRef.current = selectedId;
  }, [ready, selectedId, index]);

  /* ── 판정 색 (feature-state) ── */
  const appliedVerdicts = useRef<Set<number>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("bldg") || mode !== "officer") return;
    const next = new Set<number>();
    for (const c of Object.values(cases)) {
      if (!c.survey) continue;
      next.add(c.id);
      map.setFeatureState({ source: "bldg", id: c.id }, { verdict: c.survey.verdict });
    }
    for (const id of appliedVerdicts.current) if (!next.has(id)) map.setFeatureState({ source: "bldg", id }, { verdict: null });
    appliedVerdicts.current = next;
  }, [ready, cases, mode, index]);

  /* ── 안양 여건 보정 × 판정 재순위 (feature-state: adj·excluded) — 판정이 바뀌면 즉시 다시 칠한다 ── */
  const ranking = useRanking();
  const appliedAdj = useRef<Set<number>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("bldg") || mode !== "officer" || !ranking.ready || !index) return;
    const next = new Set<number>();
    for (const b of index.list) {
      if (!b.cand) continue;
      const a = ranking.adjOf(b.id);
      if (!a) continue;
      next.add(b.id);
      map.setFeatureState({ source: "bldg", id: b.id }, { adj: a.excluded ? null : a.adj, excluded: a.excluded });
    }
    for (const id of appliedAdj.current) if (!next.has(id)) map.setFeatureState({ source: "bldg", id }, { adj: null, excluded: false });
    appliedAdj.current = next;
  }, [ready, mode, index, ranking]);

  /* ── 조사 목록 번호 핀 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mode !== "officer" || !index) return;
    list.forEach((it, i) => {
      const b = index.byId.get(it.id);
      if (!b) return;
      const el = document.createElement("div");
      el.className = "pb-marker" + (b.id === selectedId ? " sel" : "");
      el.textContent = String(i + 1);
      el.title = `${b.dong} ${b.jibun}`;
      el.onclick = (ev) => {
        ev.stopPropagation();
        select(b.id);
      };
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([b.lon, b.lat]).addTo(map));
    });
  }, [ready, list, index, mode, selectedId, select]);

  /* ── 이동 요청 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyTo) return;
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? 17.2, pitch: 55, duration: 900, essential: true });
  }, [ready, flyTo]);

  // maplibre.css 의 .maplibregl-map{position:relative} 가 레이어 없는 규칙이라 Tailwind 유틸리티를 이기므로 인라인으로 고정
  return <div ref={boxRef} style={{ position: "absolute", inset: 0 }} aria-label="안양시 3D 건물 지도" />;
}
