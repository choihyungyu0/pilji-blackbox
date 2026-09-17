import "server-only";
import { sbConfigured, sbRest } from "./supabase-rest";
import type { Verdict } from "./types";

/**
 * Supabase(Postgres) 저장 — 판정·조사 목록·작업 로그만 (건물 데이터는 정적 파일).
 * 테이블은 supabase/schema.sql. 미설정·테이블 없음이면 {ok:false, reason} 으로 알려 클라이언트가 기기 보관으로 폴백한다 (ST-V3).
 * 개인 식별 필드 없음 (SEC-02).
 */

export type DbVerdictRow = {
  building_id: number;
  pnu: string;
  verdict: Verdict;
  memo: string | null;
  decided_at: string;
  updated_at?: string;
};

export function dbStatus() {
  return { configured: sbConfigured() };
}

export async function upsertVerdict(row: DbVerdictRow): Promise<{ ok: boolean; reason?: string }> {
  if (!sbConfigured()) return { ok: false, reason: "SUPABASE 미설정" };
  try {
    const r = await sbRest("pb_verdicts?on_conflict=building_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) return { ok: false, reason: `Supabase ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function listVerdicts(): Promise<{ ok: boolean; rows: DbVerdictRow[]; reason?: string }> {
  if (!sbConfigured()) return { ok: false, rows: [], reason: "SUPABASE 미설정" };
  try {
    const r = await sbRest("pb_verdicts?select=building_id,pnu,verdict,memo,decided_at,updated_at&order=updated_at.desc&limit=2000");
    if (!r.ok) return { ok: false, rows: [], reason: `Supabase ${r.status}` };
    return { ok: true, rows: (await r.json()) as DbVerdictRow[] };
  } catch (e) {
    return { ok: false, rows: [], reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function writeLog(entry: { kind: string; summary: string; payload?: unknown }): Promise<void> {
  if (!sbConfigured()) return;
  try {
    await sbRest("pb_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ kind: entry.kind, summary: entry.summary.slice(0, 500), payload: entry.payload ?? null }),
    });
  } catch {
    /* 로그 실패는 본 기능을 막지 않는다 */
  }
}
