import { NextRequest, NextResponse } from "next/server";
import { buildCorrectionOrder, buildFineImposition, buildFineWarning, buildLedger, buildPriorNotice, buildSurveyPlan, buildSurveyReport, type CaseInput, type OrgInput } from "@/lib/docs";
import { writeLog } from "@/lib/db";
import type { DocPayload } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 결재 문서 7종 토큰·체크리스트 생성 (담당자 전용). HWPX/PDF 는 클라이언트가 만든다 (템플릿 치환 / 인쇄 화면).
 * body.template: survey_plan | survey_report | prior_notice | correction_order | fine_warning | fine_imposition | ledger
 * body.case / body.cases: 클라이언트 사건 스토어의 사건(들). body.org: 기관·결재선 입력.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const org = (body.org ?? {}) as OrgInput;
  const c = body.case as CaseInput | undefined;
  const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  let r: DocPayload | { error: string };
  switch (body.template) {
    case "survey_plan": {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(Number).filter(Number.isFinite) : [];
      if (!ids.length) return NextResponse.json({ ok: false, error: "조사 목록이 비어 있습니다" }, { status: 400 });
      r = buildSurveyPlan({ ids, purpose: str(body.purpose), planDate: str(body.planDate), team: str(body.team), org });
      break;
    }
    case "survey_report": {
      const cases = Array.isArray(body.cases) ? (body.cases as CaseInput[]) : [];
      if (!cases.length) return NextResponse.json({ ok: false, error: "보고할 사건이 없습니다" }, { status: 400 });
      r = buildSurveyReport({ cases, team: str(body.team), planRef: str(body.planRef), org });
      break;
    }
    case "prior_notice":
      if (!c) return NextResponse.json({ ok: false, error: "사건 정보 필요" }, { status: 400 });
      r = buildPriorNotice({ c, dueDays: num(body.dueDays), content: str(body.content), org });
      break;
    case "correction_order":
      if (!c) return NextResponse.json({ ok: false, error: "사건 정보 필요" }, { status: 400 });
      r = buildCorrectionOrder({ c, content: str(body.content), deadlineDays: num(body.deadlineDays), deadline: str(body.deadline), org });
      break;
    case "fine_warning":
      if (!c) return NextResponse.json({ ok: false, error: "사건 정보 필요" }, { status: 400 });
      r = buildFineWarning({ c, deadlineDays: num(body.deadlineDays), deadline: str(body.deadline), noncomplianceNote: str(body.noncomplianceNote), org });
      break;
    case "fine_imposition":
      if (!c) return NextResponse.json({ ok: false, error: "사건 정보 필요" }, { status: 400 });
      r = buildFineImposition({ c, payDays: num(body.payDays), payOrg: str(body.payOrg), org });
      break;
    case "ledger":
      if (!c) return NextResponse.json({ ok: false, error: "사건 정보 필요" }, { status: 400 });
      r = buildLedger({ c, org });
      break;
    default:
      return NextResponse.json({ ok: false, error: "알 수 없는 템플릿" }, { status: 400 });
  }
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  void writeLog({ kind: "doc", summary: `${r.template} · 누락 ${r.missing.length}` });
  return NextResponse.json({ ok: true, doc: r });
}
