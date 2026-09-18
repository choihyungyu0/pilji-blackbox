import type { Case, FineEstimate, Stage } from "./types";

/**
 * 사건 단계 규칙 — 담당자의 실제 업무 순서.
 *   후보 → 조사계획(기안·결재) → 현장조사(판정) → 사전통지(행정절차법 21조) → 시정명령(건축법 79조①)
 *   → 이행강제금 계고(80조③) → 이행강제금 부과(80조④) → 종결(시정완료·정상·대상아님)
 * 각 화살표의 전제(guard)와 "다음 할 일"·기한을 한 곳에서 정의한다. 화면·문서·업무 홈이 모두 이 규칙을 쓴다.
 */
export const STAGES: Stage[] = ["CANDIDATE", "PLANNED", "SURVEYED", "NOTICED", "ORDERED", "WARNED", "FINED", "CLOSED"];

export const STAGE_META: Record<Stage, { label: string; short: string; color: string; doc?: string; law: string }> = {
  CANDIDATE: { label: "후보", short: "후보", color: "#f59e0b", law: "건축법 79조⑤ 실태조사 대상 선정 (AI 후보 = 현장 확인 전)" },
  PLANNED: { label: "조사 계획", short: "계획", color: "#0ea5e9", doc: "현장조사 계획 기안문", law: "건축법 시행령 115조② 실태조사 계획(목적·기간·대상·방법)" },
  SURVEYED: { label: "현장조사", short: "조사", color: "#6366f1", doc: "현장조사 결과 보고", law: "건축법 시행령 115조③ 현장조사, 시행규칙 40조 결과 기록" },
  NOTICED: { label: "사전통지", short: "통지", color: "#d97706", doc: "처분사전통지서(의견제출통지)", law: "행정절차법 21조① (별지 8호서식), 의견제출기한 10일 이상(21조③)" },
  ORDERED: { label: "시정명령", short: "명령", color: "#dc2626", doc: "시정명령서", law: "건축법 79조① 시정명령, 79조④ 건축물대장 기재, 행정절차법 26조 불복 고지" },
  WARNED: { label: "이행강제금 계고", short: "계고", color: "#9f1239", doc: "이행강제금 부과 계고서", law: "건축법 80조③ 문서 계고, 80조① 산정" },
  FINED: { label: "이행강제금 부과", short: "부과", color: "#4c0519", doc: "이행강제금 부과 통지", law: "건축법 80조④ 금액·사유·납부기한·수납기관·이의제기, 안양시 건축 조례 37조③ 연 1회" },
  CLOSED: { label: "종결", short: "종결", color: "#52525b", law: "시정 완료 확인·대장 정리 (시행령 115조⑤)" },
};

export const stageIndex = (s: Stage) => STAGES.indexOf(s);

export const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00+09:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
};
export const daysUntil = (iso: string) => Math.round((new Date(iso + "T00:00:00+09:00").getTime() - new Date(todayISO() + "T00:00:00+09:00").getTime()) / 86400000);

export type Guard = { ok: boolean; reason?: string; warn?: string };

/** 다음 단계로 갈 수 있는가 — 법정 전제는 막고(ok:false), 시기·확인 사항은 경고(warn)로 알린다 */
export function canAdvance(c: Case, to: Stage): Guard {
  switch (to) {
    case "PLANNED":
      return c.stage === "CANDIDATE" ? { ok: true } : { ok: false, reason: "후보 단계에서만 조사 계획에 넣을 수 있음" };
    case "SURVEYED":
      if (c.stage !== "PLANNED" && c.stage !== "CANDIDATE") return { ok: false, reason: "이미 조사된 사건" };
      return { ok: true, warn: c.plan?.approvedAt ? undefined : "조사 계획 결재일이 기록되지 않음 — 결재 후 현장조사 원칙" };
    case "NOTICED":
      if (!c.survey) return { ok: false, reason: "현장조사 판정이 먼저 필요" };
      if (c.survey.verdict !== "VIOLATION") return { ok: false, reason: "판정이 '위반'인 사건만 사전통지 (BR-C1) — AI 점수만으로 처분 문서 금지" };
      if (!c.survey.findings?.trim()) return { ok: false, reason: "위반 내용(원인 사실)을 현장조사에 기록해야 함 (행정절차법 21조①3)" };
      return { ok: true };
    case "ORDERED": {
      if (!c.notice) return { ok: false, reason: "사전통지가 먼저 필요 (행정절차법 21조)" };
      if (!c.notice.sentAt) return { ok: false, reason: "사전통지 발송일을 기록해야 함" };
      const left = daysUntil(c.notice.dueDate);
      if (left > 0 && c.notice.opinion !== "received") return { ok: false, reason: `의견제출기한(${c.notice.dueDate})까지 ${left}일 남음 — 기한 경과 또는 의견 접수 후 시정명령 (행정절차법 22조③·27조)` };
      return { ok: true, warn: c.notice.opinion === "received" ? "제출된 의견을 검토·반영했는지 확인 (행정절차법 27조의2)" : undefined };
    }
    case "WARNED": {
      if (!c.order) return { ok: false, reason: "시정명령이 먼저 필요 (건축법 80조①)" };
      if (!c.order.sentAt) return { ok: false, reason: "시정명령 발송일을 기록해야 함" };
      const left = daysUntil(c.order.deadline);
      if (left > 0) return { ok: false, reason: `시정기한(${c.order.deadline})까지 ${left}일 남음 — 기한 경과·미이행 확인 후 계고` };
      return { ok: true, warn: "현장에서 미이행을 확인했는지 기록 (재방문 사진·메모)" };
    }
    case "FINED": {
      if (!c.warn) return { ok: false, reason: "계고가 먼저 필요 (건축법 80조③)" };
      if (!c.warn.sentAt) return { ok: false, reason: "계고서 발송일을 기록해야 함" };
      const left = daysUntil(c.warn.deadline);
      if (left > 0) return { ok: false, reason: `계고 이행기한(${c.warn.deadline})까지 ${left}일 남음` };
      if (c.warn.estimate.amount == null) return { ok: false, reason: "이행강제금 산정값(시가표준액 등)을 입력해야 함" };
      return { ok: true, warn: "안양시 건축 조례 37조③: 부과 횟수 연 1회 — 같은 해 기부과 여부 확인" };
    }
    case "CLOSED":
      if (c.stage === "CLOSED") return { ok: false, reason: "이미 종결" };
      if (c.stage === "CANDIDATE") return { ok: false, reason: "조사 없이 종결 불가 — '대상 아님' 판정으로 종결" };
      return { ok: true };
    default:
      return { ok: false, reason: "지원하지 않는 전이" };
  }
}

export type Todo = { id: number; pnu: string; stage: Stage; kind: "survey" | "notice_due" | "order_due" | "warn_due" | "send" | "hold"; text: string; due?: string; overdue: boolean; priority: number };

/** 업무 홈 "오늘 할 일" — 기한이 지난 것 > 오늘/3일 내 > 미조사 순 */
export function todosOf(cases: Case[]): Todo[] {
  const out: Todo[] = [];
  for (const c of cases) {
    if (c.stage === "CLOSED") continue;
    if (c.stage === "PLANNED" || c.stage === "CANDIDATE") {
      out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "survey", text: c.stage === "PLANNED" ? "현장조사 실시·판정 입력" : "조사 계획에 포함(기안) 또는 바로 조사", priority: 3, overdue: false, due: c.plan?.planDate });
      continue;
    }
    if (c.stage === "SURVEYED") {
      if (c.survey?.verdict === "HOLD") out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "hold", text: "보류 — 재방문 필요", priority: 3, overdue: false });
      else if (c.survey?.verdict === "VIOLATION") out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: "위반 판정 — 처분사전통지서 작성·발송", priority: 2, overdue: false });
      else out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: "정상/대상아님 — 결과 보고 후 종결", priority: 4, overdue: false });
      continue;
    }
    if (c.stage === "NOTICED" && c.notice) {
      if (!c.notice.sentAt) out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: "사전통지서 발송일 기록", priority: 2, overdue: false });
      else {
        const d = daysUntil(c.notice.dueDate);
        out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "notice_due", text: d <= 0 ? "의견제출기한 경과 — 시정명령 진행" : `의견제출기한 ${d}일 남음`, due: c.notice.dueDate, overdue: d <= 0, priority: d <= 0 ? 1 : d <= 3 ? 2 : 4 });
      }
      continue;
    }
    if (c.stage === "ORDERED" && c.order) {
      if (!c.order.sentAt) out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: "시정명령서 발송일 기록", priority: 2, overdue: false });
      else {
        const d = daysUntil(c.order.deadline);
        out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "order_due", text: d <= 0 ? "시정기한 경과 — 이행 여부 확인 후 계고" : `시정기한 ${d}일 남음`, due: c.order.deadline, overdue: d <= 0, priority: d <= 0 ? 1 : d <= 3 ? 2 : 4 });
      }
      continue;
    }
    if (c.stage === "WARNED" && c.warn) {
      if (!c.warn.sentAt) out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: "계고서 발송일 기록", priority: 2, overdue: false });
      else {
        const d = daysUntil(c.warn.deadline);
        out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "warn_due", text: d <= 0 ? "계고 기한 경과 — 이행강제금 부과" : `계고 이행기한 ${d}일 남음`, due: c.warn.deadline, overdue: d <= 0, priority: d <= 0 ? 1 : d <= 3 ? 2 : 4 });
      }
      continue;
    }
    if (c.stage === "FINED" && c.fine) {
      out.push({ id: c.id, pnu: c.pnu, stage: c.stage, kind: "send", text: c.fine.imposedAt ? `납부기한 ${c.fine.payDue} — 시정 여부 확인, 미시정 시 다음 해 재부과` : "부과 통지 발송일 기록", due: c.fine.payDue, overdue: daysUntil(c.fine.payDue) <= 0, priority: 3 });
    }
  }
  return out.sort((a, b) => a.priority - b.priority || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

/**
 * 이행강제금 산정 (금액은 담당자 입력값 기준·검토용).
 * 1호(80조①1): 1㎡ 시가표준액 × 50% × 위반면적 × 비율(시행령 115조의3①: 무허가 100%·무신고 70%·건폐율 80%·용적률 90%)
 * 2호(80조①2): 건축물 시가표준액 × 별표15 비율(10% 등)
 * 안양시 건축 조례 37조: ① 60㎡ 이하 주거용 등 1/2 감경 ② 영리·상습 가중 30% / 80조의2 감경(0~75%)
 */
export function estimateFine(input: Omit<FineEstimate, "amount" | "formula">): FineEstimate {
  const { basis, stdPricePerM2, stdPriceTotal, area, ratio, halved, aggravated, reduction } = input;
  let base: number | null = null;
  let formula = "";
  if (basis === "80-1-1") {
    if (stdPricePerM2 != null && area != null) {
      base = stdPricePerM2 * 0.5 * area * (ratio / 100);
      formula = `${fmtWon(stdPricePerM2)}원/㎡ × 50% × ${area}㎡ × ${ratio}%`;
    } else formula = "1㎡ 시가표준액 × 50% × 위반면적 × 비율 (입력 필요)";
  } else {
    if (stdPriceTotal != null) {
      base = stdPriceTotal * (ratio / 100);
      formula = `${fmtWon(stdPriceTotal)}원 × ${ratio}%`;
    } else formula = "건축물 시가표준액 × 별표15 비율 (입력 필요)";
  }
  let amount = base;
  if (amount != null) {
    if (halved) { amount *= 0.5; formula += " × 1/2(조례 37조①)"; }
    if (aggravated) { amount *= 1.3; formula += " × 1.3(조례 37조② 가중)"; }
    if (reduction > 0) { amount *= 1 - reduction; formula += ` × (1−${Math.round(reduction * 100)}%)(80조의2 감경)`; }
    amount = Math.floor(amount / 10) * 10; // 10원 미만 절사(관행)
  }
  return { ...input, amount, formula };
}

export const fmtWon = (v: number | null | undefined) => (v == null ? "정보없음" : new Intl.NumberFormat("ko-KR").format(Math.round(v)));

/** 관리대장 '위반구분' 표기 (별지 29호) */
export function ledgerCategory(t: string | null | undefined) {
  switch (t) {
    case "무허가건축": case "무단증축": return "무허가";
    case "무단용도변경": return "무단 용도변경";
    case "위법시공": return "위법 시공";
    default: return "기타 위반";
  }
}
