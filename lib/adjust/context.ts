"use client";

import { create } from "zustand";
import { adjScore, byAdjDesc, type CtxCode, type CtxReason, CTX_RULES } from "./rules";
import { verdictEffect, type VerdictEffect, type VerdictPoint } from "./effect";
import type { Building } from "@/lib/types";

/**
 * 안양 여건 보정 + 판정 재순위 — 클라이언트 상태.
 *  - ctx: 빌드 시 계산된 /data/ctx_adjust.json (후보 1,918동의 w_ctx·사유·기본/보정 순위). 런타임 계산 없음.
 *  - verdicts: /api/adjust/verdict (Supabase pb_verdicts + 좌표) ∪ 이 기기 사건 판정(로컬 우선) → 반경 200m 이웃 가중.
 *  - NEXT_PUBLIC_ADJ_ENABLED=false 면 enabled=false — 모든 화면이 보정 전과 똑같이 동작한다.
 *  - 실패(파일 없음·API 오류)는 조용히 기본 점수로 폴백한다.
 */
export const ADJ_ENABLED = process.env.NEXT_PUBLIC_ADJ_ENABLED !== "false";

export type CtxItem = { w: number; x?: true; r: CtxCode[]; d?: Record<string, string>; rb: number; ra: number };
export type CtxFile = {
  generated: string; asof: string; formula: string; flood_note: string;
  rules: typeof CTX_RULES;
  stats: { candidates: number; adjusted: number; unchanged: number; rank_changed: number; top100_entered: number; top100_left: number; excluded: number; excluded_list: string[]; final_candidates: number; by_code: Record<CtxCode, number> };
  items: Record<string, CtxItem>;
};
export type { VerdictPoint, VerdictEffect };

type State = {
  status: "idle" | "loading" | "ready" | "error";
  ctx: CtxFile | null;
  remote: VerdictPoint[];
  remoteAt: number | null;
  load: () => Promise<void>;
  loadVerdicts: () => Promise<void>;
};

let inflight: Promise<void> | null = null;

export const useAdjust = create<State>((set, get) => ({
  status: "idle",
  ctx: null,
  remote: [],
  remoteAt: null,
  load: async () => {
    if (!ADJ_ENABLED || get().ctx || inflight) return inflight ?? undefined;
    set({ status: "loading" });
    inflight = (async () => {
      try {
        const r = await fetch("/data/ctx_adjust.json", { cache: "force-cache" });
        if (!r.ok) throw new Error(String(r.status));
        set({ ctx: (await r.json()) as CtxFile, status: "ready" });
      } catch {
        set({ status: "error", ctx: null }); // 조용히 폴백
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  loadVerdicts: async () => {
    if (!ADJ_ENABLED) return;
    try {
      const r = await fetch("/api/adjust/verdict", { cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; items?: VerdictPoint[] };
      if (j.ok && j.items) set({ remote: j.items, remoteAt: Date.now() });
    } catch {
      /* 서버 판정 없이 로컬 판정만으로 계산 */
    }
  },
}));

/** 원격 ∪ 로컬 판정 (같은 건물이면 로컬 우선) */
export function mergeVerdicts(remote: VerdictPoint[], local: VerdictPoint[]): VerdictPoint[] {
  const m = new Map<number, VerdictPoint>();
  for (const v of remote) m.set(v.id, v);
  for (const v of local) m.set(v.id, { ...v, local: true });
  return [...m.values()];
}

export type Adjusted = {
  id: number; score: number; adj: number; wCtx: number; wVerdict: number;
  reasons: CtxReason[]; excluded: boolean; excludedBy: "C1" | "NOT_TARGET" | null;
  rankBase: number | null; rankAdj: number | null; verdict: VerdictEffect; hjd?: string;
};

/** 후보 전체(또는 주어진 건물들)의 보정 점수·전역 순위 — 판정이 바뀔 때마다 다시 계산 (1,918건, 수 ms) */
export function rankAll(buildings: Building[], ctx: CtxFile | null, verdicts: VerdictPoint[]): Map<number, Adjusted> {
  const rows: Adjusted[] = [];
  for (const b of buildings) {
    if (b.score == null || !b.cand) continue;
    const it = ctx?.items[String(b.id)];
    const reasons: CtxReason[] = (it?.r ?? []).map((code) => ({ code, ...CTX_RULES[code], detail: it?.d?.[code] }));
    const ve = verdictEffect(b, verdicts);
    const excludedBy = it?.x ? "C1" : ve.selfNotTarget ? "NOT_TARGET" : null;
    const wCtx = it?.w ?? 0;
    rows.push({
      id: b.id, score: b.score, adj: excludedBy ? -1 : adjScore(b.score, wCtx, ve.w), wCtx, wVerdict: ve.w,
      reasons, excluded: Boolean(excludedBy), excludedBy, rankBase: null, rankAdj: null, verdict: ve, hjd: it?.d?.hjd,
    });
  }
  const base = [...rows].sort((a, b) => b.score - a.score || a.id - b.id);
  base.forEach((r, i) => (r.rankBase = i + 1));
  const adj = [...rows].sort(byAdjDesc);
  adj.forEach((r, i) => (r.rankAdj = r.excluded ? null : i + 1));
  return new Map(rows.map((r) => [r.id, r]));
}

export const pct = (w: number) => `${w > 0 ? "+" : ""}${Math.round(w * 100)}%`;
