import { NextRequest, NextResponse } from "next/server";
import { dbStatus, listVerdicts, upsertVerdict, writeLog } from "@/lib/db";
import { buildingById } from "@/lib/data-server";
import { findPII } from "@/lib/pii";
import type { Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERDICTS: Verdict[] = ["VIOLATION", "NORMAL", "NOT_TARGET", "HOLD"];

/** INV-02 판정 저장 — 담당자 전용. 저장 실패는 {ok:false, reason} 로 알려 기기 보관으로 폴백 (ST-V3). */
export async function GET() {
  const r = await listVerdicts();
  return NextResponse.json({ ...r, db: dbStatus() });
}

export async function POST(req: NextRequest) {
  let body: { id?: number; verdict?: string; memo?: string; at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const b = body.id != null ? buildingById(Number(body.id)) : null;
  if (!b) return NextResponse.json({ ok: false, error: "건물을 찾을 수 없습니다" }, { status: 404 });
  if (!VERDICTS.includes(body.verdict as Verdict)) return NextResponse.json({ ok: false, error: "판정을 선택해 주세요" }, { status: 400 });
  const memo = (body.memo ?? "").slice(0, 500);
  const pii = findPII(memo);
  if (pii) return NextResponse.json({ ok: false, error: `개인정보는 입력할 수 없어요 (${pii})` }, { status: 400 });

  const r = await upsertVerdict({ building_id: b.id, pnu: b.pnu, verdict: body.verdict as Verdict, memo: memo || null, decided_at: body.at ?? new Date().toISOString() });
  if (r.ok) void writeLog({ kind: "verdict", summary: `${b.dong} ${b.jibun} → ${body.verdict}` });
  // 저장 실패도 200(ok:false) — 클라이언트가 기기 보관으로 폴백하며 콘솔에 네트워크 오류를 남기지 않는다
  return NextResponse.json({ ok: r.ok, reason: r.reason ?? null, db: dbStatus() });
}
