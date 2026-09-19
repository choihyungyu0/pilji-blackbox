import "server-only";
import { buildingById, DATA_ASOF } from "./data-server";
import { lawById, toCitation } from "./laws";
import { fmtWon, ledgerCategory } from "./stages";
import type { Building, Case, Citation, DocPayload, DocTemplate } from "./types";

/**
 * 결재 문서 7종 — 토큰 조립 + 필수 기재사항 점검(DOC-04, BR-C2).
 * 값은 정적 데이터·담당자가 기록한 사건 정보에서만 온다. LLM 이 만든 수치는 들어오지 않는다 (BR-A1).
 * BR-C3: 모든 초안에 "초안 — 담당자 검토 필요" + 생성시각 + 근거 목록. 당사자 성명·주소는 항상 공란 (SEC-02).
 * 서식: 기안문(행정업무규정 시행규칙 별지1) · 처분사전통지서(행정절차법 시행규칙 별지8) · 위반건축물관리대장(건축법 시행규칙 별지29)
 */

const DRAFT_HEADER = "초안 — 담당자 검토 필요";
export const SURVEY_ROWS = 20;

/** 문서에 공통으로 들어가는 기관·결재 정보 — 화면 입력값, 없으면 기본값/공란 */
export type OrgInput = {
  orgName?: string;   // 행정기관명 (기본: 안양시)
  dept?: string;      // 처리과 (기본: 만안구/동안구 건축과)
  drafter?: string;   // 기안자 직위(직급)
  reviewer?: string;
  approver?: string;
  coop?: string;
  docNo?: string;     // 시행 문서번호 (처리과명-연도별 일련번호)
  orgAddr?: string;
  orgTel?: string;
  orgFax?: string;
  orgEmail?: string;
  orgWeb?: string;
  openClass?: string; // 공개 구분
};

const kstNow = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
const kstToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const kstOf = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
};
const s = (v: unknown) => (v == null || v === "" ? "정보없음" : String(v));
const guName = (b: Building) => (b.pnu.startsWith("41171") ? "만안구" : "동안구");
const addrOf = (b: Building) => `경기도 안양시 ${guName(b)} ${b.dong} ${b.san === "산" ? "산 " : ""}${b.jibun}`;
const bldgInfo = (b: Building) =>
  `용도 ${s(b.use)} · 구조 ${s(b.struct)} · 지상 ${s(b.fl_up)}층/지하 ${s(b.fl_dn)}층 · 연면적 ${b.gfa == null ? "정보없음" : b.gfa + "㎡"} · 사용승인 ${s(b.approve)}`;

const BLDG_SRC = `국토교통부 GIS건물통합정보(브이월드, CC BY, 기준 ${DATA_ASOF})`;
const MODEL_SRC = "AI 우선조사 점수 — HistGradientBoosting, 공간 5-fold 교차검증 AUC 0.728 (후보 = 점수 상위 10% 임계값 이상이면서 위반 표기 없는 건물)";
const cite = (id: string, para = 0) => toCitation(lawById(id)!, para);
const evLine = (ev: string[]) => ev.map((e, i) => `${i + 1}) ${e}`).join("  ");

function orgTokens(b: Building | null, org: OrgInput, opts: { to?: string; title: string; sender?: string }): Record<string, string> {
  const gu = b ? guName(b) : "";
  const dept = org.dept?.trim() || (b ? `${gu}청 건축과` : "건축과");
  const orgName = org.orgName?.trim() || "안양시";
  return {
    HEADER: DRAFT_HEADER,
    GEN_AT: kstNow(),
    TODAY: kstToday(),
    DATA_ASOF,
    ORG_NAME: orgName,
    DEPT: dept,
    TO: opts.to ?? "내부결재",
    VIA: "",
    TITLE: opts.title,
    SENDER: opts.sender ?? `안양시장`,
    DRAFTER: org.drafter?.trim() || "",
    REVIEWER: org.reviewer?.trim() || "",
    APPROVER: org.approver?.trim() || "",
    COOP: org.coop?.trim() || "",
    DOC_NO: org.docNo?.trim() || `${dept}-        (${kstToday()})`,
    RECV_NO: "",
    ORG_ADDR: org.orgAddr?.trim() || "",
    ORG_WEB: org.orgWeb?.trim() || "https://www.anyang.go.kr",
    ORG_TEL: org.orgTel?.trim() || "",
    ORG_FAX: org.orgFax?.trim() || "",
    ORG_EMAIL: org.orgEmail?.trim() || "",
    OPEN_CLASS: org.openClass?.trim() || "부분공개(개인정보)",
  };
}

const commonChecks = (t: Record<string, string>) => [
  { key: "drafter", label: "기안자 직위(직급)", ok: Boolean(t.DRAFTER), note: t.DRAFTER ? undefined : "기안자 입력 필요" },
  { key: "approver", label: "결재권자", ok: Boolean(t.APPROVER), note: t.APPROVER ? undefined : "결재선 확인 필요" },
];

function finish(template: DocTemplate, filename: string, tokens: Record<string, string>, checklist: DocPayload["checklist"], evidenceRaw: string[]): DocPayload {
  const evidence = [...new Set(evidenceRaw.filter(Boolean))];
  tokens.EV_LINE = evLine(evidence);
  return { template, filename, tokens, checklist, missing: checklist.filter((c) => !c.ok).map((c) => c.label), evidence, generatedAt: tokens.GEN_AT };
}

/** 사건 정보 중 문서에 쓰는 부분 (클라이언트 스토어에서 전달) */
export type CaseInput = Partial<Case> & { id: number };

// ───────────────────────────────────────────── DOC-01 현장조사 계획 기안문
export function buildSurveyPlan(input: { ids: number[]; purpose?: string; planDate?: string; team?: string; org?: OrgInput }): DocPayload {
  const bs = input.ids.map((id) => buildingById(id)).filter((b): b is Building => Boolean(b)).slice(0, SURVEY_ROWS);
  const dongs = [...new Set(bs.map((b) => b.dong))];
  const grades = [...new Set(bs.map((b) => b.grade).filter(Boolean))].sort();
  const org = input.org ?? {};
  const t = orgTokens(bs[0] ?? null, org, { title: `위반 건축물 현장조사 계획 (${dongs.join("·") || "안양시"} ${bs.length}건)` });
  const citations: Citation[] = [cite("bldg-79", 4), cite("bldg-dec-115", 1)];
  if (bs.some((b) => b.gb)) citations.push(cite("gb-30", 0));
  Object.assign(t, {
    PURPOSE: input.purpose?.trim() || `「건축법」 제79조제5항에 따른 위반 건축물 실태조사. GIS건물통합정보(${DATA_ASOF}) 기반 AI 우선조사 후보 중 ${dongs.join("·")} ${grades.join("·")}등급 ${bs.length}건의 위반 여부를 현장에서 확인한다.`,
    PLAN_DATE: input.planDate?.trim() || "",
    TEAM: input.team?.trim() || "",
    TARGET_SUMMARY: `${dongs.join("·") || "-"} · 등급 ${grades.join("·") || "-"} · ${bs.length}건 (AI 점수 내림차순, 붙임)`,
    METHOD: `${MODEL_SRC}. 대장 미연계 건물·위반 표기 건물은 점수 산출 대상이 아님. 임계값 A ≥ 0.222, B ≥ 0.165 (${DATA_ASOF} 분석값).`,
    CAUTION: "※ 붙임 목록의 건축물은 AI 우선조사 후보(현장 확인 전)이며 위반 판정이 아님.",
  });
  for (let i = 0; i < SURVEY_ROWS; i++) {
    const b = bs[i];
    const cells = b
      ? [String(i + 1), b.dong, `${b.san === "산" ? "산 " : ""}${b.jibun}`, s(b.use), s(b.year), b.score == null ? "정보없음" : b.score.toFixed(3), s(b.grade), b.gb == null ? "정보없음" : b.gb ? "내부" : "외부"]
      : ["", "", "", "", "", "", "", ""];
    cells.forEach((c, j) => (t[`R${i + 1}C${j + 1}`] = c));
  }
  const evidence = [BLDG_SRC, MODEL_SRC, ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "targets", label: "조사 대상 (1건 이상)", ok: bs.length > 0, note: bs.length ? `${bs.length}건` : "조사 목록이 비어 있음" },
    { key: "plan", label: "조사 기간(예정일)", ok: Boolean(t.PLAN_DATE), note: t.PLAN_DATE ? undefined : "시행령 115조② — 기간 필수" },
    { key: "team", label: "조사반", ok: Boolean(t.TEAM), note: t.TEAM ? undefined : "조사반 구성 입력 필요" },
    { key: "purpose", label: "목적·대상·방법", ok: true },
    ...commonChecks(t),
  ];
  return finish("doc01_survey_plan", `현장조사계획_기안_${dongs.join("") || "안양"}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-03 현장조사 결과 보고
export function buildSurveyReport(input: { cases: CaseInput[]; team?: string; planRef?: string; org?: OrgInput }): DocPayload {
  const rows = input.cases.map((c) => ({ c, b: buildingById(c.id) })).filter((x): x is { c: CaseInput; b: Building } => Boolean(x.b)).slice(0, SURVEY_ROWS);
  const dongs = [...new Set(rows.map((r) => r.b.dong))];
  const org = input.org ?? {};
  const t = orgTokens(rows[0]?.b ?? null, org, { title: `위반 건축물 현장조사 결과 보고 (${dongs.join("·") || "안양시"} ${rows.length}건)` });
  const dates = rows.map((r) => kstOf(r.c.survey?.at)).filter(Boolean).sort();
  const count = (v: string) => rows.filter((r) => r.c.survey?.verdict === v).length;
  Object.assign(t, {
    PLAN_REF: input.planRef?.trim() || rows.find((r) => r.c.plan?.docNo)?.c.plan?.docNo || "문서번호 미기재",
    SURVEY_PERIOD: dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`) : "조사일 미기록",
    TEAM: input.team?.trim() || rows.find((r) => r.c.plan?.team)?.c.plan?.team || "",
    N_TOTAL: String(rows.length),
    TARGET_SUMMARY: `${dongs.join("·") || "-"}`,
    N_VIOL: String(count("VIOLATION")),
    N_NORMAL: String(count("NORMAL")),
    N_NT: String(count("NOT_TARGET")),
    N_HOLD: String(count("HOLD")),
    N_PENDING: String(rows.filter((r) => !r.c.survey).length),
  });
  const VLABEL: Record<string, string> = { VIOLATION: "위반", NORMAL: "정상", NOT_TARGET: "대상 아님", HOLD: "보류" };
  const NEXT: Record<string, string> = { VIOLATION: "사전통지", NORMAL: "종결", NOT_TARGET: "종결", HOLD: "재방문" };
  for (let i = 0; i < SURVEY_ROWS; i++) {
    const r = rows[i];
    const sv = r?.c.survey;
    const cells = r
      ? [String(i + 1), `${r.b.dong} ${r.b.san === "산" ? "산 " : ""}${r.b.jibun}`, s(r.b.use), kstOf(sv?.at) || "미조사", sv ? VLABEL[sv.verdict] : "미조사", sv?.violationType ?? "", sv?.area == null ? "" : String(sv.area), sv?.findings ?? "", sv ? NEXT[sv.verdict] : "조사"]
      : ["", "", "", "", "", "", "", "", ""];
    cells.forEach((c, j) => (t[`R${i + 1}C${j + 1}`] = c));
  }
  const evidence = [BLDG_SRC, "담당자 현장조사 판정(기기·서버 저장)", ...[cite("bldg-79", 4), cite("bldg-rule-40", 0)].map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "rows", label: "조사 결과 (1건 이상)", ok: rows.some((r) => r.c.survey), note: rows.some((r) => r.c.survey) ? undefined : "판정이 입력된 사건이 없음" },
    { key: "pending", label: "미조사 건 없음", ok: rows.every((r) => r.c.survey), note: rows.every((r) => r.c.survey) ? undefined : `${rows.filter((r) => !r.c.survey).length}건 미조사 — 보고서에 '미조사'로 표기됨` },
    { key: "findings", label: "위반 건의 위반 내용 기재", ok: rows.filter((r) => r.c.survey?.verdict === "VIOLATION").every((r) => r.c.survey?.findings?.trim()), note: "위반 판정 건은 원인 사실이 필요" },
    ...commonChecks(t),
  ];
  return finish("doc03_survey_report", `현장조사결과_보고_${dongs.join("") || "안양"}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-02 처분사전통지서 (별지 8호)
export function buildPriorNotice(input: { c: CaseInput; dueDays?: number; content?: string; org?: OrgInput }): DocPayload | { error: string } {
  const b = buildingById(input.c.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  const sv = input.c.survey;
  // BR-C1: 판정 = VIOLATION 일 때만. AI 점수만으로 처분 문서를 만들지 않는다.
  if (sv?.verdict !== "VIOLATION") return { error: "현장 판정이 '위반'인 사건에만 사전통지서를 만들 수 있습니다 (BR-C1)" };
  const due = Math.min(30, Math.max(10, Number(input.dueDays) || 10));
  const org = input.org ?? {};
  const t = orgTokens(b, org, { to: "", title: "처분사전통지서(의견제출통지)" });
  const dueDate = new Date(Date.now() + due * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const citations: Citation[] = [cite("bldg-79", 0), cite("bldg-80", 0), cite("proc-21", 0), cite("proc-27", 0)];
  if (b.gb) citations.push(cite("gb-30", 0), cite("gb-30-2", 0));
  const fact = [
    `${addrOf(b)} 소재 건축물(${bldgInfo(b)})에 대하여 ${kstOf(sv.at)} 현장조사 결과 ${sv.violationType ?? "위반"}${sv.area != null ? ` (위반면적 약 ${sv.area}㎡)` : ""}${sv.floor ? ` · ${sv.floor}` : ""}이 확인됨.`,
    sv.findings?.trim() ? `확인 사항: ${sv.findings.trim()}` : "",
  ].filter(Boolean).join(" ");
  const basis = b.gb
    ? "「건축법」 제79조제1항(위반 건축물 등에 대한 조치: 시정명령), 제80조(이행강제금), 「개발제한구역의 지정 및 관리에 관한 특별조치법」 제30조(행정처분)·제30조의2(이행강제금)"
    : "「건축법」 제79조제1항(위반 건축물 등에 대한 조치: 허가권자는 위반 건축물의 건축주등에게 상당한 기간을 정하여 해체ㆍ개축ㆍ증축ㆍ수선ㆍ용도변경ㆍ사용금지ㆍ사용제한 등 필요한 조치를 명할 수 있다), 제80조(이행강제금)";
  const content = input.content?.trim() || input.c.notice?.content?.trim() || "";
  Object.assign(t, {
    DISP_TITLE: "위반건축물 시정명령",
    PARTY_NAME: "",
    PARTY_ADDR: "",
    FACT: fact,
    CONTENT: content || "「건축법」 제79조제1항에 따른 시정명령(위반 부분의 원상복구 등) — 담당자 확정 필요",
    BASIS: basis,
    DUE_DATE: dueDate,
    DUE_DAYS: String(due),
    SITE_ADDR: addrOf(b),
    PNU: b.pnu,
  });
  const evidence = [BLDG_SRC, `담당자 현장 판정(위반) ${kstOf(sv.at)}`, ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "title", label: "예정된 처분의 제목", ok: true },
    { key: "party", label: "당사자 성명·주소", ok: false, note: "개인정보 — 발송 전 담당자가 직접 기재 (자동 미기재)" },
    { key: "fact", label: "처분의 원인이 되는 사실", ok: Boolean(sv.findings?.trim()), note: sv.findings?.trim() ? undefined : "현장조사에 위반 내용을 기록" },
    { key: "content", label: "처분하고자 하는 내용", ok: Boolean(content), note: content ? undefined : "처분 내용 확정 필요" },
    { key: "basis", label: "법적근거 및 조문내용", ok: true },
    { key: "org", label: "의견제출 제출처(기관·부서·담당자·주소·전화)", ok: Boolean(t.ORG_ADDR && t.ORG_TEL && t.DRAFTER), note: t.ORG_ADDR && t.ORG_TEL && t.DRAFTER ? undefined : "주소·전화·담당자 입력 필요" },
    { key: "due", label: "제출기한 (10일 이상)", ok: due >= 10 },
    ...commonChecks(t),
  ];
  return finish("doc02_prior_notice", `처분사전통지서_${b.dong}_${b.jibun}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-04 시정명령서
export function buildCorrectionOrder(input: { c: CaseInput; content?: string; deadlineDays?: number; deadline?: string; org?: OrgInput }): DocPayload | { error: string } {
  const b = buildingById(input.c.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  const { survey: sv, notice } = input.c;
  if (sv?.verdict !== "VIOLATION") return { error: "판정이 '위반'인 사건만 시정명령 (BR-C1)" };
  if (!notice) return { error: "처분사전통지가 먼저 필요합니다 (행정절차법 21조)" };
  const days = Math.min(180, Math.max(0, Number(input.deadlineDays) || 30));
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(input.deadline ?? "") ? input.deadline! : new Date(Date.now() + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const deadlineDays = Math.round((new Date(deadline + "T00:00:00+09:00").getTime() - new Date(kstToday() + "T00:00:00+09:00").getTime()) / 86400000);
  const org = input.org ?? {};
  const t = orgTokens(b, org, { to: "", title: `위반건축물 시정명령 (${b.dong} ${b.jibun})` });
  const content = input.content?.trim() || notice.content?.trim() || "";
  const citations: Citation[] = [cite("bldg-79", 0), cite("bldg-79", 3), cite("bldg-80", 0), cite("proc-26", 0)];
  if (b.gb) citations.push(cite("gb-30", 0));
  Object.assign(t, {
    NOTICE_REF: `(${kstOf(notice.sentAt) || "발송일 미기재"} 발송, 의견제출기한 ${notice.dueDate})`,
    OPINION_RESULT: notice.opinion === "received" ? `의견 제출됨 — ${notice.opinionNote?.trim() || "검토 내용 기재 필요"}` : "기한 내 의견 미제출(의견 없음으로 간주, 행정절차법 27조④)",
    SITE_ADDR: addrOf(b),
    PNU: b.pnu,
    BLDG_INFO: bldgInfo(b),
    FACT: sv.findings?.trim() || "정보없음",
    VIOL_TYPE: sv.violationType ?? "정보없음",
    VIOL_AREA: sv.area == null ? "정보없음" : `약 ${sv.area}㎡`,
    SURVEY_DATE: kstOf(sv.at),
    ORDER_CONTENT: content || "시정명령 내용 확정 필요(원상복구·용도 환원·사용금지 등)",
    ORDER_DEADLINE: deadline,
  });
  const evidence = [BLDG_SRC, `담당자 현장 판정(위반) ${kstOf(sv.at)}`, `처분사전통지 ${kstOf(notice.sentAt)} (기한 ${notice.dueDate})`, ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "to", label: "수신자(당사자)", ok: false, note: "개인정보 — 담당자 기재" },
    { key: "content", label: "시정명령 내용", ok: Boolean(content), note: content ? undefined : "명령 내용 확정 필요" },
    { key: "deadline", label: "시정기한(상당한 기간)", ok: deadlineDays >= 7, note: deadlineDays >= 7 ? undefined : `${deadlineDays}일 — 상당한 기간인지 확인` },
    { key: "opinion", label: "의견제출 결과 반영", ok: notice.opinion === "none" || notice.opinion === "received", note: notice.opinion ? undefined : "의견 없음/제출 여부 기록 필요" },
    { key: "appeal", label: "불복 절차 고지(행정절차법 26조)", ok: true },
    ...commonChecks(t),
  ];
  return finish("doc04_correction_order", `시정명령서_${b.dong}_${b.jibun}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-05 이행강제금 계고서
export function buildFineWarning(input: { c: CaseInput; deadlineDays?: number; deadline?: string; noncomplianceNote?: string; org?: OrgInput }): DocPayload | { error: string } {
  const b = buildingById(input.c.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  const { survey: sv, order, warn } = input.c;
  if (!order) return { error: "시정명령이 먼저 필요합니다 (건축법 80조①)" };
  const est = warn?.estimate;
  if (!est) return { error: "이행강제금 산정 정보가 없습니다" };
  const days = Math.min(90, Math.max(0, Number(input.deadlineDays) || 15));
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(input.deadline ?? "") ? input.deadline! : new Date(Date.now() + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const deadlineDays = Math.round((new Date(deadline + "T00:00:00+09:00").getTime() - new Date(kstToday() + "T00:00:00+09:00").getTime()) / 86400000);
  const org = input.org ?? {};
  const t = orgTokens(b, org, { to: "", title: `이행강제금 부과 계고 (${b.dong} ${b.jibun})` });
  const citations: Citation[] = [cite("bldg-80", 2), cite("bldg-80", 0), cite("bldg-dec-115-3", 0), cite("anyang-ord-37", 0), cite("bldg-80-2", 0)];
  Object.assign(t, {
    ORDER_REF: `(${kstOf(order.sentAt) || "발송일 미기재"} 발송${order.docNo ? `, ${order.docNo}` : ""})`,
    ORDER_DEADLINE: order.deadline,
    NONCOMPLIANCE_NOTE: input.noncomplianceNote?.trim() || warn?.noncomplianceNote?.trim() || "재방문 확인",
    SITE_ADDR: addrOf(b),
    PNU: b.pnu,
    FACT: sv?.findings?.trim() || "정보없음",
    WARN_DEADLINE: deadline,
    FINE_AMOUNT: est.amount == null ? "산정값 입력 필요" : `금 ${fmtWon(est.amount)}원`,
    FINE_BASIS: est.basis === "80-1-1"
      ? `건축법 제80조제1항제1호(1㎡ 시가표준액의 50% × 위반면적 × 시행령 제115조의3 비율 ${est.ratio}%)${est.halved ? " · 조례 37조① 1/2" : ""}${est.aggravated ? " · 80조② 가중 30%" : ""}`
      : `건축법 제80조제1항제2호(시가표준액 × 시행령 별표15 비율 ${est.ratio}%)${est.halved ? " · 조례 37조① 1/2" : ""}${est.aggravated ? " · 80조② 가중 30%" : ""}`,
    FINE_FORMULA: est.formula || "산식 입력 필요",
  });
  const evidence = [BLDG_SRC, `시정명령 ${kstOf(order.sentAt)} (기한 ${order.deadline})`, "시가표준액·위반면적: 담당자 입력값", ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "to", label: "수신자(당사자)", ok: false, note: "개인정보 — 담당자 기재" },
    { key: "amount", label: "부과 예정 금액·산식", ok: est.amount != null, note: est.amount != null ? undefined : "시가표준액 등 산정값 입력" },
    { key: "deadline", label: "이행 기한(상당한 기간)", ok: deadlineDays >= 7, note: deadlineDays >= 7 ? undefined : `${deadlineDays}일 — 상당한 기간인지 확인` },
    { key: "noncompliance", label: "미이행 확인 근거", ok: Boolean(t.NONCOMPLIANCE_NOTE && t.NONCOMPLIANCE_NOTE !== "재방문 확인"), note: t.NONCOMPLIANCE_NOTE !== "재방문 확인" ? undefined : "재방문 확인 내용 기재 권장" },
    ...commonChecks(t),
  ];
  return finish("doc05_fine_warning", `이행강제금_계고서_${b.dong}_${b.jibun}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-06 이행강제금 부과 통지
export function buildFineImposition(input: { c: CaseInput; payDays?: number; payOrg?: string; org?: OrgInput }): DocPayload | { error: string } {
  const b = buildingById(input.c.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  const { survey: sv, order, warn, fine } = input.c;
  if (!warn) return { error: "계고가 먼저 필요합니다 (건축법 80조③)" };
  const est = fine?.estimate ?? warn.estimate;
  if (est.amount == null) return { error: "이행강제금 금액이 산정되지 않았습니다" };
  const days = Math.min(60, Math.max(15, Number(input.payDays) || 30));
  const payDue = new Date(Date.now() + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const org = input.org ?? {};
  const t = orgTokens(b, org, { to: "", title: `이행강제금 부과 통지 (${b.dong} ${b.jibun})` });
  const citations: Citation[] = [cite("bldg-80", 3), cite("bldg-80", 0), cite("bldg-80", 5), cite("anyang-ord-37", 0), cite("proc-26", 0)];
  Object.assign(t, {
    WARN_REF: `(${kstOf(warn.sentAt) || "발송일 미기재"} 발송)`,
    WARN_DEADLINE: warn.deadline,
    ORDER_REF: order ? `${kstOf(order.sentAt)}${order.docNo ? " " + order.docNo : ""}` : "정보없음",
    SITE_ADDR: addrOf(b),
    PNU: b.pnu,
    FACT: sv?.findings?.trim() || "정보없음",
    FINE_AMOUNT: `금 ${fmtWon(est.amount)}원`,
    FINE_BASIS: est.basis === "80-1-1" ? `건축법 제80조제1항제1호 · 시행령 제115조의3 비율 ${est.ratio}%` : `건축법 제80조제1항제2호 · 시행령 별표15 비율 ${est.ratio}%`,
    FINE_FORMULA: est.formula,
    PAY_DUE: payDue,
    PAY_ORG: input.payOrg?.trim() || "안양시 금고(농협은행) 및 전 금융기관 — 고지서 기재",
  });
  const evidence = [BLDG_SRC, `계고 ${kstOf(warn.sentAt)} (기한 ${warn.deadline})`, "시가표준액·위반면적: 담당자 입력값", ...citations.map((c) => `${c.law} ${c.article}(${c.title}) — ${c.url}`)];
  const checklist = [
    { key: "to", label: "수신자(당사자)", ok: false, note: "개인정보 — 담당자 기재" },
    { key: "amount", label: "금액", ok: true },
    { key: "reason", label: "부과 사유", ok: Boolean(sv?.findings?.trim()) },
    { key: "due", label: "납부기한", ok: true },
    { key: "org", label: "수납기관", ok: Boolean(t.PAY_ORG) },
    { key: "appeal", label: "이의제기 방법 및 기관", ok: true },
    { key: "once", label: "연 1회 부과 확인(조례 37조③)", ok: false, note: "같은 해 기부과 여부 담당자 확인" },
    ...commonChecks(t),
  ];
  return finish("doc06_fine_imposition", `이행강제금_부과통지_${b.dong}_${b.jibun}_${kstToday()}.hwpx`, t, checklist, evidence);
}

// ───────────────────────────────────────────── DOC-07 위반건축물관리대장 (별지 29호)
export function buildLedger(input: { c: CaseInput; org?: OrgInput }): DocPayload | { error: string } {
  const b = buildingById(input.c.id);
  if (!b) return { error: "건물을 찾을 수 없습니다" };
  const c = input.c;
  const sv = c.survey;
  if (sv?.verdict !== "VIOLATION") return { error: "위반 판정 사건만 관리대장에 기록합니다" };
  const org = input.org ?? {};
  const t = orgTokens(b, org, { title: "위반건축물관리대장" });
  const date = kstOf(sv.at);
  const cat = ledgerCategory(sv.violationType);
  Object.assign(t, {
    LEDGER_NO: c.plan?.docNo ? `${c.plan.docNo}` : `PB-${b.pnu.slice(0, 10)}-${b.id}`,
    SITE_ADDR: addrOf(b),
    JIBUN: `${b.san === "산" ? "산 " : ""}${b.jibun}`,
    JIMOK: "",
    ZONE: "",
    GB_ZONE: b.gb ? "개발제한구역" : "",
    STRUCT: s(b.struct),
    U_DATE: cat === "무허가" ? date : "", U_FLOOR: cat === "무허가" ? sv.floor ?? "" : "", U_USE: cat === "무허가" ? s(b.use) : "", U_AREA: cat === "무허가" && sv.area != null ? String(sv.area) : "",
    C_DATE: cat === "무단 용도변경" ? date : "", C_FLOOR: cat === "무단 용도변경" ? sv.floor ?? "" : "", C_AREA: cat === "무단 용도변경" && sv.area != null ? String(sv.area) : "", C_BEFORE: cat === "무단 용도변경" ? sv.useBefore ?? s(b.use) : "", C_AFTER: cat === "무단 용도변경" ? sv.useAfter ?? "" : "",
    S_DATE: cat === "위법 시공" ? date : "", S_AREA: cat === "위법 시공" && sv.area != null ? String(sv.area) : "", S_USE: cat === "위법 시공" ? s(b.use) : "", S_DETAIL: cat === "위법 시공" ? sv.findings : "",
    E_DATE: cat === "기타 위반" ? date : "", E_USE: cat === "기타 위반" ? s(b.use) : "", E_DETAIL: cat === "기타 위반" ? sv.findings : "",
  });
  const actions: string[][] = [];
  if (c.notice) actions.push([date, cat, kstOf(c.notice.sentAt) || c.notice.generatedAt.slice(0, 10), `처분사전통지(의견제출기한 ${c.notice.dueDate})`, ""]);
  if (c.order) actions.push([date, cat, kstOf(c.order.sentAt) || c.order.generatedAt.slice(0, 10), `시정명령(시정기한 ${c.order.deadline})`, ""]);
  if (c.warn) actions.push([date, cat, kstOf(c.warn.sentAt) || c.warn.generatedAt.slice(0, 10), `이행강제금 계고(이행기한 ${c.warn.deadline})`, c.warn.estimate.amount == null ? "" : String(Math.round(c.warn.estimate.amount / 1000))]);
  if (c.fine) actions.push([date, cat, kstOf(c.fine.imposedAt) || c.fine.generatedAt.slice(0, 10), `이행강제금 부과(납부기한 ${c.fine.payDue})`, c.fine.estimate.amount == null ? "" : String(Math.round(c.fine.estimate.amount / 1000))]);
  if (c.closed) actions.push([date, cat, kstOf(c.closed.at), `종결: ${c.closed.reason}${c.closed.note ? " — " + c.closed.note : ""}`, ""]);
  for (let i = 0; i < 5; i++) {
    const row = actions[i] ?? ["", "", "", "", ""];
    row.forEach((v, j) => (t[`A${i + 1}C${j + 1}`] = v));
  }
  const evidence = [BLDG_SRC, `담당자 현장 판정(위반) ${date}`, ...[cite("bldg-rule-40", 1), cite("bldg-dec-115", 4)].map((x) => `${x.law} ${x.article}(${x.title}) — ${x.url}`)];
  const checklist = [
    { key: "party", label: "건축주·현거주자", ok: false, note: "개인정보 — 담당자 기재(자동 미기재)" },
    { key: "zone", label: "지목·용도지역", ok: false, note: "토지이용계획 확인 후 기재" },
    { key: "viol", label: "위반 구분·적발일·면적", ok: Boolean(sv.violationType) },
    { key: "actions", label: "행정조치 내용", ok: actions.length > 0, note: actions.length ? `${actions.length}건` : "조치 이력 없음" },
  ];
  return finish("doc07_ledger", `위반건축물관리대장_${b.dong}_${b.jibun}_${kstToday()}.hwpx`, t, checklist, evidence);
}
