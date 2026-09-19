"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Building, Mode, Verdict } from "@/lib/types";

/** 지도 레이어 토글 (LYR-01~08). P1 레이어는 데이터가 없으면 UI 에서 비활성 */
export type LayerKey = "viol" | "cand" | "ledger" | "gb" | "slopes" | "hjd" | "facilities" | "grid" | "excavation";
export type ColorMode = "score" | "viol" | "age" | "use";

export type Filters = {
  dong: string | null;
  use: string | null;
  scoreMin: number | null;
  scoreMax: number | null;
  ageMin: number | null;
  ageMax: number | null;
  gb: boolean | null;
};

export type ListItem = { id: number; pnu: string; addedBy: "auto" | "manual"; rank?: number };

export type LogEntry = { at: string; kind: "agent" | "doc" | "verdict" | "list" | "auth" | "case"; summary: string };

/** 문서 공통 기관·결재선 — 한 번 입력해 모든 문서에 쓴다 (개인 성명은 넣지 않아도 됨, 직위만 권장) */
export type OrgInfo = {
  orgName: string; dept: string; drafter: string; reviewer: string; approver: string; coop: string;
  orgAddr: string; orgTel: string; orgFax: string; orgEmail: string; openClass: string;
};
export const DEFAULT_ORG: OrgInfo = {
  orgName: "안양시", dept: "", drafter: "", reviewer: "", approver: "", coop: "",
  orgAddr: "", orgTel: "", orgFax: "", orgEmail: "", openClass: "부분공개(개인정보)",
};

type State = {
  mode: Mode;
  setMode: (m: Mode) => void;

  /** 지도 UI */
  layers: Record<LayerKey, boolean>;
  toggleLayer: (k: LayerKey) => void;
  colorMode: ColorMode;
  setColorMode: (c: ColorMode) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  selectedId: number | null;
  select: (id: number | null) => void;
  flyTo: { lon: number; lat: number; zoom?: number; nonce: number } | null;
  requestFlyTo: (lon: number, lat: number, zoom?: number) => void;

  /** 문서 공통 기관·결재선 */
  org: OrgInfo;
  setOrg: (o: Partial<OrgInfo>) => void;

  /** 조사 목록 (INV-01) */
  list: ListItem[];
  listMeta: { dong: string | null; grades: string[]; n: number; createdAt: string | null };
  setList: (items: ListItem[], meta: State["listMeta"]) => void;
  addToList: (b: Building) => void;
  removeFromList: (id: number) => void;
  clearList: () => void;

  /** 작업 로그 (SEC-04 최소 구현, 기기 보관) */
  log: LogEntry[];
  addLog: (kind: LogEntry["kind"], summary: string) => void;

  toast: { text: string; kind: "info" | "error" | "ok"; nonce: number } | null;
  showToast: (text: string, kind?: "info" | "error" | "ok") => void;
};

const DEFAULT_FILTERS: Filters = { dong: null, use: null, scoreMin: null, scoreMax: null, ageMin: null, ageMax: null, gb: null };

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      mode: "public",
      setMode: (m) => set({ mode: m }),

      layers: { viol: true, cand: true, ledger: false, gb: false, slopes: true, hjd: true, facilities: false, grid: true, excavation: true },
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      colorMode: "score",
      setColorMode: (c) => set({ colorMode: c }),
      filters: DEFAULT_FILTERS,
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      selectedId: null,
      select: (id) => set({ selectedId: id }),
      flyTo: null,
      requestFlyTo: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, nonce: Date.now() } }),

      org: DEFAULT_ORG,
      setOrg: (o) => set((s) => ({ org: { ...s.org, ...o } })),

      list: [],
      listMeta: { dong: null, grades: [], n: 0, createdAt: null },
      setList: (items, meta) => set({ list: items, listMeta: meta }),
      addToList: (b) => {
        if (get().list.some((x) => x.id === b.id)) return;
        set((s) => ({ list: [...s.list, { id: b.id, pnu: b.pnu, addedBy: "manual" }] }));
        get().addLog("list", `조사 목록에 담기: ${b.dong} ${b.jibun}`);
      },
      removeFromList: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
      clearList: () => set({ list: [], listMeta: { dong: null, grades: [], n: 0, createdAt: null } }),

      log: [],
      addLog: (kind, summary) =>
        set((s) => ({ log: [{ at: new Date().toISOString(), kind, summary }, ...s.log].slice(0, 300) })),

      toast: null,
      showToast: (text, kind = "info") => set({ toast: { text, kind, nonce: Date.now() } }),
    }),
    {
      name: "pilji-blackbox-v1",
      version: 2,
      migrate: (state) => ({ ...(state as object), layers: { viol: true, cand: true, ledger: false, gb: false, slopes: true, hjd: true, facilities: false, grid: true, excavation: true, ...((state as { layers?: object })?.layers ?? {}) } }),
      partialize: (s) => ({ org: s.org, list: s.list, listMeta: s.listMeta, log: s.log, layers: s.layers, colorMode: s.colorMode }),
    }
  )
);

export const VERDICT_ORDER: Verdict[] = ["VIOLATION", "NORMAL", "NOT_TARGET", "HOLD"];
