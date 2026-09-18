import "server-only";
import { buildingById, buildingsByPnu, findByJibun, nearby, DATA_ASOF } from "../data-server";
import { buildTimeline, nearbySlopes } from "../timeline";
import { searchLaws } from "../laws";
import { buildCorrectionOrder, buildFineImposition, buildFineWarning, buildLedger, buildPriorNotice, buildSurveyPlan, buildSurveyReport, type CaseInput } from "../docs";
import { canAdvance, STAGE_META, todosOf } from "../stages";
import { parseJibunQuery, jibunOf } from "../geo";
import type { Building, Case, ToolCallLog } from "../types";

/**
 * AGT-01 공간 AI 에이전트 도구 8종 (CLAUDE.md 표). 모든 도구는 정적 데이터·판정 컨텍스트만 읽는다.
 * 실패는 {error} 로 돌려주고 답변에 명시한다 (BR-A2). 미구현(P1)은 available:false 로 솔직하게.
 */

export type AgentContext = {
  pnu?: string | null;
  id?: number | null;
  /** 클라이언트 사건 스토어 (건물 id → 사건) — 판정·단계·문서 기록 */
  cases?: Record<string, CaseInput>;
  /** 조사 목록 건물 id */
  listIds?: number[];
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown> | unknown;
};

const publicView = (b: Building) => ({
  id: b.id, pnu: b.pnu, dong: b.dong, jibun: b.jibun, san: b.san, use: b.use, struct: b.struct, year: b.year, approve: b.approve,
  fl_up: b.fl_up, fl_dn: b.fl_dn, h: b.h, gfa: b.gfa, viol: b.viol, ledger: b.ledger, chg: b.chg, gb: b.gb, public_parcel: b.public_parcel,
  lon: b.lon, lat: b.lat, source: "GIS건물통합정보(브이월드)", asOf: DATA_ASOF,
});

function resolveBuilding(args: Record<string, unknown>, ctx: AgentContext): Building | null {
  if (typeof args.id === "number") return buildingById(args.id);
  if (typeof args.pnu === "string" && args.pnu.length === 19) return buildingsByPnu(args.pnu)[0] ?? null;
  if (typeof args.jibun === "string") {
    const q = parseJibunQuery(`${typeof args.dong === "string" ? args.dong + " " : ""}${args.jibun}`);
    if (q) return findByJibun(q.dong, jibunOf(q.bon, q.bu), q.san)[0] ?? null;
  }
  if (typeof args.lon === "number" && typeof args.lat === "number") return nearby(args.lon, args.lat, 30)[0]?.b ?? null;
  if (ctx.id) return buildingById(ctx.id);
  if (ctx.pnu) return buildingsByPnu(ctx.pnu)[0] ?? null;
  return null;
}

export const TOOLS: ToolDef[] = [
  {
    name: "parcel_lookup",
    description: "필지(pnu 19자리)·건물 id·지번(예: 박달동 139-137)·좌표로 건물 속성을 조회한다. 결측은 null(정보없음).",
    parameters: {
      type: "object",
      properties: {
        pnu: { type: "string", description: "필지고유번호 19자리" },
        id: { type: "number", description: "건물 도형 id" },
        dong: { type: "string", description: "법정동명 (예: 박달동)" },
        jibun: { type: "string", description: "지번 (예: 139-137, 산 27-12)" },
        lon: { type: "number" }, lat: { type: "number" },
      },
    },
    run: (args, ctx) => {
      const b = resolveBuilding(args, ctx);
      if (!b) return { error: "해당 조건의 건물이 없습니다" };
      const same = buildingsByPnu(b.pnu);
      return { building: publicView(b), buildings_on_parcel: same.length, others: same.filter((x) => x.id !== b.id).map(publicView) };
    },
  },
  {
    name: "timeline_build",
    description: "필지 타임라인(사용승인·대장 변경·위반 표기 신규/해제·급경사지 등재·착공신고·사고 보도)을 연도순으로 조립한다. 각 이벤트에 출처·기준일이 있다.",
    parameters: { type: "object", properties: { pnu: { type: "string" }, id: { type: "number" } } },
    run: (args, ctx) => {
      const b = resolveBuilding(args, ctx);
      if (!b) return { error: "필지를 찾을 수 없습니다" };
      const t = buildTimeline(b.pnu);
      return { pnu: b.pnu, count: t.events.length, events: t.events, notes: t.notes, nearby_slopes: nearbySlopes(b) };
    },
  },
  {
    name: "signal_score",
    description: "AI 우선조사 점수·등급(A/B/C)·신호 근거값(반경100m 위반 비율, 경과연수, 도형/대장 면적비, 반경50m 건물수, 반경30m 대장미연계수)을 반환한다. 점수 null 이면 산출 대상 아님(대장 미연계 또는 위반 표기).",
    parameters: { type: "object", properties: { pnu: { type: "string" }, id: { type: "number" } } },
    run: (args, ctx) => {
      const b = resolveBuilding(args, ctx);
      if (!b) return { error: "필지를 찾을 수 없습니다" };
      const notTarget = b.score == null ? (b.ledger ? (b.viol === "Y" ? "이미 위반 표기(A20=Y)" : "점수 없음") : "대장 미연계") : null;
      return {
        id: b.id, pnu: b.pnu, score: b.score ?? null, grade: b.grade ?? null, candidate: Boolean(b.cand),
        not_target_reason: notTarget,
        signals: { f_nbv: b.f_nbv ?? null, f_age: b.f_age ?? null, f_footratio: b.f_footratio ?? null, f_nb50: b.f_nb50 ?? null, f_nl30: b.f_nl30 ?? null },
        thresholds: { A: 0.222, B: 0.165 },
        badge: "후보(현장 확인 전) — 등급은 조사 순서이며 위반 판정이 아님",
        model: "HistGradientBoosting, 공간 5-fold AUC 0.728 / 시간 검증 AUC 0.698", asOf: DATA_ASOF,
      };
    },
  },
  {
    name: "change_detect",
    description: "위성 지수(NDVI·NDBI·PGI) 연도별 변화. 현재 미적재(P1).",
    parameters: { type: "object", properties: { pnu: { type: "string" } } },
    run: () => ({ available: false, message: "위성 데이터 미적재 (SAT-01, P1) — 연도별 지수는 제공되지 않습니다" }),
  },
  {
    name: "rules_rag",
    description: "법령 조문 검색: 건축법 79·80조, 행정절차법 14·21조, 개발제한구역법 30조·30조의2, 급경사지법 시행령 2조. 조문 번호·링크와 발췌를 돌려준다.",
    parameters: { type: "object", properties: { query: { type: "string", description: "검색어 (예: 시정명령 이행강제금, 사전통지 기재사항)" } }, required: ["query"] },
    run: (args) => {
      const q = String(args.query ?? "");
      const cites = searchLaws(q, 4);
      if (!cites.length) return { citations: [], message: "근거 조문 확인 필요 — 검색 결과 없음" };
      return { citations: cites };
    },
  },
  {
    name: "doc_render",
    description: "결재 문서 초안 토큰을 만든다. template: survey_plan(현장조사 계획 기안, 조사 목록) · survey_report(현장조사 결과 보고, 판정된 사건들) · prior_notice(처분사전통지서 — 판정=위반) · correction_order(시정명령서 — 사전통지 후) · fine_warning(이행강제금 계고 — 시정명령 후) · fine_imposition(이행강제금 부과 — 계고 후) · ledger(위반건축물관리대장). 실제 HWPX/PDF 는 화면에서 만든다.",
    parameters: {
      type: "object",
      properties: {
        template: { type: "string", enum: ["survey_plan", "survey_report", "prior_notice", "correction_order", "fine_warning", "fine_imposition", "ledger"] },
        ids: { type: "array", items: { type: "number" }, description: "survey_plan/survey_report 대상 건물 id (없으면 조사 목록)" },
        id: { type: "number", description: "단일 사건 문서의 건물 id (없으면 선택 필지)" },
        purpose: { type: "string" }, planDate: { type: "string" }, team: { type: "string" },
        dueDays: { type: "number", description: "의견제출 기한(일) 10~30" }, content: { type: "string", description: "처분(시정명령) 내용" },
        deadlineDays: { type: "number", description: "시정기한/이행기한(일)" },
      },
      required: ["template"],
    },
    run: (args, ctx) => {
      const tpl = String(args.template);
      if (tpl === "survey_plan") {
        const ids = Array.isArray(args.ids) && args.ids.length ? (args.ids as number[]) : ctx.listIds ?? (ctx.id ? [ctx.id] : []);
        if (!ids.length) return { error: "조사 목록이 비어 있습니다 — 조사 목록을 먼저 만들거나 필지를 선택하세요" };
        return buildSurveyPlan({ ids, purpose: args.purpose as string | undefined, planDate: args.planDate as string | undefined, team: args.team as string | undefined });
      }
      if (tpl === "survey_report") {
        const ids = Array.isArray(args.ids) && args.ids.length ? (args.ids as number[]) : ctx.listIds ?? [];
        const cases = ids.map((id) => ctx.cases?.[String(id)]).filter((x): x is CaseInput => Boolean(x));
        if (!cases.length) return { error: "판정이 기록된 사건이 없습니다" };
        return buildSurveyReport({ cases, team: args.team as string | undefined });
      }
      const b = resolveBuilding(args, ctx);
      if (!b) return { error: "필지를 찾을 수 없습니다" };
      const c = ctx.cases?.[String(b.id)];
      if (!c) return { error: `${b.dong} ${b.jibun} 은 아직 사건으로 등록되지 않았습니다 — 조사 목록에 담거나 현장조사를 먼저 기록하세요` };
      switch (tpl) {
        case "prior_notice": return buildPriorNotice({ c, dueDays: args.dueDays as number | undefined, content: args.content as string | undefined });
        case "correction_order": return buildCorrectionOrder({ c, content: args.content as string | undefined, deadlineDays: args.deadlineDays as number | undefined });
        case "fine_warning": return buildFineWarning({ c, deadlineDays: args.deadlineDays as number | undefined });
        case "fine_imposition": return buildFineImposition({ c });
        case "ledger": return buildLedger({ c });
        default: return { error: "알 수 없는 템플릿" };
      }
    },
  },
  {
    name: "case_status",
    description: "사건(필지)의 현재 단계·다음 할 일·다음 단계로 갈 수 있는지(법정 전제)를 돌려준다. id 없으면 전체 사건 요약(단계별 건수, 오늘 할 일).",
    parameters: { type: "object", properties: { id: { type: "number" }, pnu: { type: "string" } } },
    run: (args, ctx) => {
      const all = Object.values(ctx.cases ?? {}) as Case[];
      if (args.id == null && !args.pnu && !ctx.id) {
        const byStage: Record<string, number> = {};
        for (const c of all) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
        return { total: all.length, byStage, todos: todosOf(all).slice(0, 15) };
      }
      const b = resolveBuilding(args, ctx);
      if (!b) return { error: "필지를 찾을 수 없습니다" };
      const c = (ctx.cases?.[String(b.id)] ?? null) as Case | null;
      if (!c) return { id: b.id, pnu: b.pnu, registered: false, message: "사건 미등록 — 조사 목록에 담기 또는 현장조사 기록으로 등록" };
      const nexts = (["PLANNED", "SURVEYED", "NOTICED", "ORDERED", "WARNED", "FINED", "CLOSED"] as const).map((to) => ({ to, label: STAGE_META[to].label, ...canAdvance(c, to) }));
      return { id: c.id, pnu: c.pnu, stage: c.stage, stageLabel: STAGE_META[c.stage].label, survey: c.survey ?? null, notice: c.notice ?? null, order: c.order ?? null, warn: c.warn ? { ...c.warn } : null, fine: c.fine ?? null, closed: c.closed ?? null, history: c.history.slice(-8), canAdvance: nexts.filter((n) => n.ok || n.reason), todos: todosOf([c]) };
    },
  },
  {
    name: "doc_check",
    description: "문서 초안의 필수 기재사항 누락을 점검한다 (BR-C2). doc_render 와 같은 인자를 받아 체크리스트만 돌려준다.",
    parameters: {
      type: "object",
      properties: { template: { type: "string", enum: ["survey_plan", "survey_report", "prior_notice", "correction_order", "fine_warning", "fine_imposition", "ledger"] }, ids: { type: "array", items: { type: "number" } }, id: { type: "number" } },
      required: ["template"],
    },
    run: async (args, ctx) => {
      const r = (await TOOLS.find((t) => t.name === "doc_render")!.run(args, ctx)) as { error?: string; checklist?: unknown; missing?: string[] };
      if (r.error) return r;
      return { checklist: r.checklist, missing: r.missing };
    },
  },
  {
    name: "cctv_nearby",
    description: "반경 100m CCTV 위치 목록. 현재 미적재(P1).",
    parameters: { type: "object", properties: { lon: { type: "number" }, lat: { type: "number" } } },
    run: () => ({ available: false, message: "CCTV 위치 데이터 미적재 (DAT-08, P1)" }),
  },
];

export function openAiTools() {
  return TOOLS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<{ result: unknown; log: ToolCallLog }> {
  const t = TOOLS.find((x) => x.name === name);
  const started = Date.now();
  if (!t) return { result: { error: `알 수 없는 도구 ${name}` }, log: { name, args, ok: false, ms: 0, note: "알 수 없는 도구" } };
  try {
    const result = await Promise.race([
      Promise.resolve(t.run(args, ctx)),
      new Promise((_, rej) => setTimeout(() => rej(new Error("시간 초과(8초)")), 8000)),
    ]);
    const r = result as { error?: string; available?: boolean; message?: string };
    const ok = !r?.error;
    const note = r?.error ?? (r?.available === false ? r.message ?? "미적재" : summarize(name, result));
    return { result, log: { name, args, ok, ms: Date.now() - started, note } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: { error: `조회 실패(${name}): ${msg}` }, log: { name, args, ok: false, ms: Date.now() - started, note: msg } };
  }
}

function summarize(name: string, r: unknown): string {
  const o = r as Record<string, unknown>;
  switch (name) {
    case "parcel_lookup": { const b = o.building as Record<string, unknown>; return `${b.dong} ${b.jibun} · ${b.use ?? "용도 정보없음"}`; }
    case "timeline_build": return `이벤트 ${o.count}건`;
    case "signal_score": return o.score == null ? `점수 대상 아님(${o.not_target_reason})` : `점수 ${o.score} · 등급 ${o.grade}`;
    case "rules_rag": return `조문 ${(o.citations as unknown[]).length}건`;
    case "doc_render": return `${o.template} · 누락 ${(o.missing as string[]).length}건`;
    case "doc_check": return `누락 ${(o.missing as string[]).length}건`;
    case "case_status": return o.stageLabel ? `단계 ${o.stageLabel}` : `사건 ${o.total}건`;
    default: return "완료";
  }
}
