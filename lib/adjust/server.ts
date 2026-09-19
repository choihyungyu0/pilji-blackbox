import "server-only";
import ctxJson from "@/data/derived/ctx_adjust.json";
import { adjScore, byAdjDesc, CTX_RULES } from "./rules";
import { verdictEffect, type VerdictPoint } from "./effect";
import { listVerdicts } from "@/lib/db";
import { buildingById } from "@/lib/data-server";
import type { Building } from "@/lib/types";
import type { CtxCode } from "./rules";

/**
 * 서버 쪽 보정 — 조사 목록 생성(/api/candidates)이 상위 N건을 "보정 순위"로 뽑을 때 쓴다.
 * 판정은 Supabase 에서 최선 노력으로 읽고(실패 시 0), 클라이언트는 여기에 로컬 판정을 더해 다시 정렬한다.
 */
export const ADJ_ENABLED_SERVER = process.env.NEXT_PUBLIC_ADJ_ENABLED !== "false";
type CtxItem = { w: number; x?: true; r: CtxCode[]; d?: Record<string, string>; rb: number; ra: number };
const ctx = ctxJson as unknown as { items: Record<string, CtxItem>; stats: Record<string, unknown> };
export const ctxStats = ctx.stats;
export const ctxItem = (id: number): CtxItem | undefined => ctx.items[String(id)];

export async function serverVerdictPoints(): Promise<VerdictPoint[]> {
  try {
    const r = await listVerdicts();
    return r.rows.map((v) => { const b = buildingById(v.building_id); return b ? { id: b.id, verdict: v.verdict, lon: b.lon, lat: b.lat } : null; }).filter((x): x is VerdictPoint => x != null);
  } catch {
    return [];
  }
}

export type ServerAdjusted = { b: Building; adj: number; wCtx: number; wVerdict: number; codes: CtxCode[]; excluded: boolean };

/** 후보 배열을 보정 점수로 정렬·제외 반영. 꺼져 있으면 기본 점수 순 그대로. */
export function adjustAndSort(rows: Building[], verdicts: VerdictPoint[]): ServerAdjusted[] {
  const out: ServerAdjusted[] = rows.map((b) => {
    if (!ADJ_ENABLED_SERVER) return { b, adj: b.score ?? 0, wCtx: 0, wVerdict: 0, codes: [], excluded: false };
    const it = ctxItem(b.id);
    const ve = verdictEffect(b, verdicts);
    const excluded = Boolean(it?.x) || ve.selfNotTarget;
    return { b, adj: excluded ? -1 : adjScore(b.score ?? 0, it?.w ?? 0, ve.w), wCtx: it?.w ?? 0, wVerdict: ve.w, codes: it?.r ?? [], excluded };
  });
  if (!ADJ_ENABLED_SERVER) return out;
  return out.filter((r) => !r.excluded).map((r) => ({ ...r, id: r.b.id, score: r.b.score ?? 0 })).sort(byAdjDesc);
}
export { CTX_RULES };
