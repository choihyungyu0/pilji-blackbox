"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Layers, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import type { Mode } from "@/lib/types";
import { SearchBar } from "./search-bar";
import { LayerPanel } from "./layer-panel";
import { FilterPanel } from "./filter-panel";
import { ParcelPanel } from "@/components/parcel/parcel-panel";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), { ssr: false });

/** WF1 찾기 지도 — 좌: 검색·레이어·필터 / 중앙: 3D 지도 / 우: WF2 필지 패널 */
export function MapScreen({ mode }: { mode: Mode }) {
  const status = useBuildings((s) => s.status);
  const error = useBuildings((s) => s.error);
  const index = useBuildings((s) => s.index);
  const loadedMs = useBuildings((s) => s.loadedMs);
  const load = useBuildings((s) => s.load);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const requestFlyTo = useApp((s) => s.requestFlyTo);
  const setColorMode = useApp((s) => s.setColorMode);
  const colorMode = useApp((s) => s.colorMode);
  const [fallback, setFallback] = useState<string | null>(null);
  const [tab, setTab] = useState<"layers" | "filter">("layers");
  const [panelOpen, setPanelOpen] = useState(true);
  const sp = useSearchParams();

  useEffect(() => {
    void load(mode);
  }, [mode, load]);
  // 좁은 화면(휴대폰·태블릿)에서는 패널이 지도를 덮으므로 접힌 채로 시작 (SSR 과 첫 렌더를 맞추려고 마운트 뒤에 접는다)
  useEffect(() => {
    if (window.innerWidth < 1024) setPanelOpen(false);
  }, []);
  // 공개 모드에는 점수가 없다 → 색상 기준을 위반으로
  useEffect(() => {
    if (mode === "public" && colorMode === "score") setColorMode("viol");
  }, [mode, colorMode, setColorMode]);
  // 딥링크 ?id= / ?pnu=
  useEffect(() => {
    if (!index) return;
    const id = sp.get("id");
    const pnu = sp.get("pnu");
    const b = id ? index.byId.get(Number(id)) : pnu ? index.byPnu.get(pnu)?.[0] : null;
    if (b) {
      select(b.id);
      requestFlyTo(b.lon, b.lat);
    }
  }, [index, sp, select, requestFlyTo]);

  return (
    <div className="relative flex w-full" style={{ height: "calc(100dvh - 3rem)" }}>
      <div data-tour="map" className="relative h-full min-w-0 flex-1 bg-[#0b1220]">
        {status !== "error" && <MapView mode={mode} onSatFallback={setFallback} />}

        {/* 좌측 컨트롤 */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex w-[300px] max-w-[calc(100%-1.5rem)] flex-col gap-2">
          <div data-tour="search" className="pointer-events-auto"><SearchBar /></div>
          <div className={cn("pointer-events-auto rounded-md border border-border bg-paper/95 shadow-sm backdrop-blur", !panelOpen && "w-fit")}>
            <div className="flex items-center gap-1 border-b border-border p-1">
              <button data-tour="layers" onClick={() => { setTab("layers"); setPanelOpen(tab !== "layers" || !panelOpen); }} className={cn("btn btn-sm border-0", tab === "layers" && panelOpen && "bg-accent")}>
                <Layers className="size-3.5" /> 레이어
              </button>
              <button data-tour="filter" onClick={() => { setTab("filter"); setPanelOpen(tab !== "filter" || !panelOpen); }} className={cn("btn btn-sm border-0", tab === "filter" && panelOpen && "bg-accent")}>
                <SlidersHorizontal className="size-3.5" /> 필터
              </button>
            </div>
            {panelOpen && <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto p-2.5">{tab === "layers" ? <LayerPanel mode={mode} /> : <FilterPanel mode={mode} />}</div>}
          </div>
        </div>

        {/* 상태 배너 */}
        {status === "loading" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b1220]/70 backdrop-blur-[2px]">
            <div className="rounded-lg bg-paper px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-2 h-1.5 w-40 overflow-hidden rounded bg-muted"><div className="h-full w-1/2 animate-[pulse_1s_ease-in-out_infinite] bg-ink" /></div>
              <p className="text-sm font-semibold">안양 건물 27,713동 불러오는 중</p>
              <p className="text-[11px] text-muted-foreground">{mode === "officer" ? "점수·등급 포함 (담당자 파일)" : "공개 파일 — 점수 미포함"}</p>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 z-20 grid place-items-center">
            <div className="rounded-lg bg-paper px-5 py-4 text-center shadow-xl">
              <p className="text-sm font-semibold text-red-600">건물 데이터를 불러오지 못했습니다</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <button className="btn mt-2" onClick={() => location.reload()}>다시 시도</button>
            </div>
          </div>
        )}
        {fallback && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-amber-100 px-3 py-1.5 text-xs text-amber-900 shadow" role="status">
            <AlertTriangle className="mr-1 inline size-3.5" /> 위성 배경 불가({fallback}) — OpenStreetMap 배경으로 표시 중
          </div>
        )}
        {index && (
          <div className="pointer-events-none absolute bottom-6 right-3 z-10 hidden rounded bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur lg:block">
            건물 {index.list.length.toLocaleString()}동 · 기준 {index.asof} · 로드 {loadedMs}ms · 출처 GIS건물통합정보(브이월드)
          </div>
        )}
      </div>

      {selectedId != null && (
        <div data-tour="panel" className="absolute inset-y-0 right-0 z-30 w-full max-w-[400px] border-l border-border shadow-2xl sm:relative sm:z-auto sm:w-[340px] sm:shadow-none lg:w-[400px]">
          <ParcelPanel mode={mode} />
        </div>
      )}
    </div>
  );
}
