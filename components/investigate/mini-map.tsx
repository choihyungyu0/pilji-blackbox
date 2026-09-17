"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { ANYANG_CENTER } from "@/lib/geo";
import { baseStyle, VWORLD_KEY } from "@/components/map/map-style";

export type Pin = { id: number; lon: number; lat: number; label: string; title: string; verdict?: string | null };

/** WF4 MAP-04 — 조사 목록 번호 핀 (2D). 순서 번호가 표와 동일. */
export function MiniMap({ pins, selectedId, onSelect }: { pins: Pin[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: boxRef.current, style: baseStyle(), center: ANYANG_CENTER, zoom: 12, pitch: 0, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    let errs = 0;
    let ok = false;
    map.on("sourcedata", (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: unknown };
      if (ev.sourceId === "sat" && ev.tile) ok = true;
    });
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string };
      if (ev.sourceId === "sat" && !ok && ++errs >= 4 && map.isStyleLoaded()) {
        // StrictMode 이중 마운트로 제거된 인스턴스의 타일 중단 오류가 올 수 있어 스타일 확인 후에만
        try {
          map.setLayoutProperty("sat", "visibility", "none");
          map.setLayoutProperty("hyb", "visibility", "none");
          map.setLayoutProperty("osm", "visibility", "visible");
        } catch { /* removed map */ }
      }
    });
    if (!VWORLD_KEY) map.on("load", () => map.setLayoutProperty("osm", "visibility", "visible"));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!pins.length) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of pins) {
      const el = document.createElement("div");
      el.className = "pb-marker" + (p.id === selectedId ? " sel" : "");
      el.textContent = p.label;
      el.title = p.title;
      if (p.verdict === "VIOLATION") el.style.background = "#7f1d1d";
      else if (p.verdict === "NORMAL") el.style.background = "#15803d";
      el.onclick = () => onSelect(p.id);
      markers.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(map));
      bounds.extend([p.lon, p.lat]);
    }
    map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 600 });
  }, [pins, selectedId, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    const p = pins.find((x) => x.id === selectedId);
    if (map && p) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16), duration: 500 });
  }, [selectedId, pins]);

  return <div ref={boxRef} style={{ position: "absolute", inset: 0 }} aria-label="조사 목록 지도" />;
}
