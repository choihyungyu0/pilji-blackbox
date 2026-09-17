import "server-only";
import { buildingById, DATA_ASOF } from "./data-server";
import { lawById, toCitation } from "./laws";
import type { Building, Citation, DocPayload } from "./types";

/**
 * DOC-01 현장조사 계획 기안문 · DOC-02 처분 사전통지서 초안 — 토큰 조립 + DOC-04 필수 기재사항 점검.
 * 값은 도구(정적 데이터·판정)에서만 온다. LLM 이 만든 수치는 들어오지 않는다 (BR-A1).
 * BR-C3: 머리말 "초안 — 담당자 검토 필요" + 생성시각 + 근거 목록.
 */

const DRAFT_HEADER = "초안 — 담당자 검토 필요";
export const SURVEY_ROWS = 20;

function kstNow() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}
function kstDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
function kstOf(iso: string | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
const s = (v: unknown) => (v == null || v === "" ? "정보없음" : String(v));
const guName = (b: Building) => (b.pnu.startsWith("41171") ? "만안구" : "동안구");

const BLDG_SRC = `국토교통부 GIS건물통합정보(브이월드, CC BY, 기준 ${DATA_ASOF})`;
const MODEL_SRC = "AI 우선조사 점수 — HistGradientBoosting, 공간 5-fold 교차검증 AUC 0.728 (후보 = 위반 표기 없는 건물 중 상위 10%)";

export type SurveyInput = {
  ids: number[];
  purpose?: string;
  planDate?: string;
  team?: string;
  drafter?: string;
  dept?: string;
};

export function buildSurveyPlan(input: SurveyInput): DocPayload {
  const bs = input.ids.map((id) => buildingById(id)).filter((b): b is Building => Boolean(b)).slice(0, SURVEY_ROWS);
  const dongs = [...new Set(bs.map((b) => b.dong))];
  const grades = [...new Set(bs.map((b) => b.grade).filter(Boolean))].sort();
  const gen = kstNow();
  const lawA = lawById("bldg-79")!;
  const citations: Citation[] = [toCitation(lawA, 4), toCitation(lawById("bldg-80")!, 0)];
  if (bs.some((b) => b.gb)) citations.push(toCitation(lawById("gb-30")!, 0));

  const purpose =
    input.purpose?.trim() ||
    `건축법 제79조제5항에 따른 위반 건축물 실태조사. GIS건물통합정보(${DATA_ASOF}) 기반 AI 우선조사 후보 중 ${dongs.join("·")} ${grades.join("·")}등급 ${bs.length}건을 현장 확인한다. 후보는 현장 확인 전 상태이며 위반 판정이 아니다.`;

  const tokens: Record<string, string> = {
    HEADER: DRAFT_HEADER,
    GEN_AT: gen,
    TITLE: `위반 건축물 현장조사 계획 (${dongs.join("·") || "안양시"} ${bs.length}건)`,
    DEPT: input.dept?.trim() || "안양시 건축과",
    DRAFTER: input.drafter?.trim() || "",
    TODAY: kstDate(),
    PURPOSE: purpose,
    TARGET_SUMMARY: `${dongs.join("·") || "-"} · 등급 ${grades.join("·") || "-"} · ${bs.length}건 (점수 내림차순)`,
    PLAN_DATE: input.planDate?.trim() || "",
    TEAM: input.team?.trim() || "",
    BASIS: `건축법 제79조제5항(실태조사)·제1항(시정명령), 제80조(이행강제금)${bs.some((b) => b.gb) ? ", 개발제한구역의 지정 및 관리에 관한 특별조치법 제30조(행정처분)" : ""}`,
    METHOD: `${MODEL_SRC}. 대장 미연계 건물과 위반 표기 건물은 점수 산출 대상이 아님. 임계값 A ≥ 0.222, B ≥ 0.165 (2026-09-09 분석값).`,
    DATA_ASOF,
    CAUTION: "본 목록의 건물은 AI 우선조사 후보(현장 확인 전)이며 위반 판정이 아니다. 소유자·거주자 정보는 수록하지 않는다.",
  };
  for (let i = 0; i < SURVEY_ROWS; i++) {
    const b = bs[i];
    const cells = b
      ? [String(i + 1), b.dong, `${b.san === "산" ? "산 " : ""}${b.jibun}`, s(b.use), s(b.year), b.score == null ? "정보없음" : b.score.toFixed(3), s(b.grade), b.gb ? "GB" : ""]
      : ["", "", "", "", "", "", "", ""];
    cells.forEach((c, j) => (tokens[`R${i + 1}C${j + 1}`] = c));
  }
  const evidence = [BLDG_SRC, MODEL_SRC, ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  evidence.forEach((e, i) => (tokens[`EV${i + 1}`] = `${i + 1}. ${e}`));

  const checklist = [
    { key: "title", label: "제목", ok: Boolean(tokens.TITLE) },
    { key: "purpose", label: "목적", ok: Boolean(tokens.PURPOSE) },
    { key: "targets", label: "대상 (1건 이상)", ok: bs.length > 0, note: bs.length ? `${bs.length}건` : "조사 목록이 비어 있음" },
    { key: "plan", label: "일정", ok: Boolean(tokens.PLAN_DATE), note: tokens.PLAN_DATE ? undefined : "조사 예정일 입력 필요" },
    { key: "team", label: "조사반", ok: Boolean(tokens.TEAM), note: tokens.TEAM ? undefined : "조사반 구성 입력 필요" },
    { key: "basis", label: "근거", ok: citations.length > 0 },
  ];
  return {
    template: "doc01_survey_plan",
    filename: `현장조사계획_기안_${dongs.join("") || "안양"}_${kstDate()}.hwpx`,
    tokens,
    checklist,
    missing: checklist.filter((c) => !c.ok).map((c) => c.label),
    evidence,
    generatedAt: gen,
  };
}

export type NoticeInput = {
  id: number;
  verdict: string | null | undefined;
  memo?: string;
  verdictAt?: string;
  dueDays?: number;
  content?: string;
  dept?: string;
  drafter?: string;
};

export function buildPriorNotice(input: NoticeInput): DocPayload | { error: string } {
  const b = buildingById(input.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  // BR-C1: 판정 = VIOLATION 일 때만. AI 점수만으로 처분 문서를 만들지 않는다.
  if (input.verdict !== "VIOLATION") return { error: "현장 판정이 '위반'인 필지에만 사전통지 초안을 만들 수 있습니다 (BR-C1)" };
  const due = Math.min(30, Math.max(10, Number(input.dueDays) || 10));
  const gen = kstNow();
  const gu = guName(b);
  const citations: Citation[] = [toCitation(lawById("bldg-79")!, 0), toCitation(lawById("bldg-80")!, 0), toCitation(lawById("proc-21")!, 0), toCitation(lawById("proc-14")!, 0)];
  if (b.gb) citations.push(toCitation(lawById("gb-30")!, 0), toCitation(lawById("gb-30-2")!, 0));

  const addr = `경기도 안양시 ${gu} ${b.dong} ${b.san === "산" ? "산 " : ""}${b.jibun}`;
  const fact = [
    `${addr} 소재 건축물(용도 ${s(b.use)}, 구조 ${s(b.struct)}, 지상 ${s(b.fl_up)}층/지하 ${s(b.fl_dn)}층, 사용승인 ${s(b.approve)})에 대하여`,
    `${kstOf(input.verdictAt) ?? kstDate()} 현장조사 결과 담당자가 '위반'으로 판정함.`,
    input.memo?.trim() ? `현장 확인 사항: ${input.memo.trim()}` : "",
  ].filter(Boolean).join(" ");
  const basis = b.gb
    ? "건축법 제79조제1항(위반 건축물 등에 대한 조치), 제80조(이행강제금) 및 개발제한구역의 지정 및 관리에 관한 특별조치법 제30조(행정처분)·제30조의2(이행강제금)"
    : "건축법 제79조제1항(위반 건축물 등에 대한 조치), 제80조(이행강제금)";
  const content = input.content?.trim() || "건축법 제79조제1항에 따른 시정명령(위반 부분의 원상복구 등) — 처분 내용은 담당자가 확정";

  const tokens: Record<string, string> = {
    HEADER: DRAFT_HEADER,
    GEN_AT: gen,
    DEPT: input.dept?.trim() || `안양시 ${gu}청 건축과`,
    DRAFTER: input.drafter?.trim() || "",
    TODAY: kstDate(),
    DISP_TITLE: "위반건축물 시정명령 사전통지",
    PARTY_NAME: "",  // SEC-02: 당사자 정보는 자동으로 채우지 않는다
    PARTY_ADDR: "",
    SITE_ADDR: addr,
    PNU: b.pnu,
    BLDG_INFO: `용도 ${s(b.use)} · 구조 ${s(b.struct)} · 지상 ${s(b.fl_up)}층/지하 ${s(b.fl_dn)}층 · 연면적 ${b.gfa == null ? "정보없음" : b.gfa + "㎡"} · 사용승인 ${s(b.approve)}`,
    FACT: fact,
    CONTENT: content,
    BASIS: basis,
    OPINION: `귀하는 위 처분에 대하여 의견을 제출할 수 있으며, 의견제출기한까지 의견을 제출하지 아니하는 경우 의견이 없는 것으로 보아 처분을 진행할 수 있습니다 (행정절차법 제21조제1항제4호·제27조).`,
    ORG_NAME: `안양시 ${gu}청 건축과`,
    ORG_ADDR: "",
    DUE_DATE: kstDate(due),
    DUE_DAYS: String(due),
    DUE_NOTE: "행정절차법 제21조제3항: 의견제출기한은 10일 이상으로 정한다.",
    ETC: "본 문서는 AI 도구가 정적 공공데이터와 담당자 판정만으로 만든 초안이며, 발송 전 담당자 검토·결재를 거쳐야 합니다.",
    DATA_ASOF,
  };
  const evidence = [BLDG_SRC, `담당자 현장 판정(위반) ${kstOf(input.verdictAt) ?? ""}`.trim(), ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  evidence.forEach((e, i) => (tokens[`EV${i + 1}`] = `${i + 1}. ${e}`));

  // BR-C2 필수 기재사항 (행정절차법 21조①)
  const checklist = [
    { key: "title", label: "처분 제목", ok: Boolean(tokens.DISP_TITLE) },
    { key: "party", label: "당사자 성명·주소", ok: false, note: "개인정보 — 담당자가 발송 시 직접 기재 (자동 미기재)" },
    { key: "fact", label: "원인 사실", ok: Boolean(fact) },
    { key: "content", label: "처분 내용", ok: Boolean(content) && !content.includes("담당자가 확정"), note: content.includes("담당자가 확정") ? "처분 내용 확정 필요" : undefined },
    { key: "basis", label: "근거 조문", ok: citations.length > 0 },
    { key: "opinion", label: "의견제출 안내·미제출 시 처리방법", ok: true },
    { key: "org", label: "의견제출기관 명칭·주소", ok: Boolean(tokens.ORG_NAME), note: tokens.ORG_ADDR ? undefined : "기관 주소 입력 필요" },
    { key: "due", label: "의견제출 기한", ok: due >= 10 },
  ];
  return {
    template: "doc02_prior_notice",
    filename: `사전통지_초안_${b.dong}_${b.jibun}_${kstDate()}.hwpx`,
    tokens,
    checklist,
    missing: checklist.filter((c) => !c.ok).map((c) => c.label),
    evidence,
    generatedAt: gen,
  };
}
