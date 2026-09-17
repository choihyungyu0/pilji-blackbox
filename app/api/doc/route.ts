import { NextRequest, NextResponse } from "next/server";
import { buildPriorNotice, buildSurveyPlan } from "@/lib/docs";
import { writeLog } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DOC-01·02·04 — 문서 토큰·체크리스트 생성 (담당자 전용). HWPX 파일은 클라이언트가 템플릿 치환으로 만든다.
 * body: { template: "survey_plan", ids, purpose?, planDate?, team?, drafter?, dept? }
 *       { template: "prior_notice", id, verdict, memo?, verdictAt?, dueDays?, content?, drafter?, dept? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (body.template === "survey_plan") {
    const ids = Array.isArray(body.ids) ? (body.ids as number[]).map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "조사 목록이 비어 있습니다" }, { status: 400 });
    const doc = buildSurveyPlan({ ids, purpose: str(body.purpose), planDate: str(body.planDate), team: str(body.team), drafter: str(body.drafter), dept: str(body.dept) });
    void writeLog({ kind: "doc", summary: `현장조사 기안 ${ids.length}건 · 누락 ${doc.missing.length}` });
    return NextResponse.json({ ok: true, doc });
  }
  if (body.template === "prior_notice") {
    const r = buildPriorNotice({
      id: Number(body.id), verdict: str(body.verdict), memo: str(body.memo), verdictAt: str(body.verdictAt),
      dueDays: body.dueDays == null ? undefined : Number(body.dueDays), content: str(body.content), drafter: str(body.drafter), dept: str(body.dept),
    });
    if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    void writeLog({ kind: "doc", summary: `사전통지 초안 id=${body.id} · 누락 ${r.missing.length}` });
    return NextResponse.json({ ok: true, doc: r });
  }
  return NextResponse.json({ ok: false, error: "알 수 없는 템플릿" }, { status: 400 });
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
