/**
 * 안양 여건 보정(ACA, Anyang Context Adjustment) + 판정 기반 재순위 — 순수 규칙 모듈.
 * 서버·클라이언트·빌드 스크립트(node)가 같은 식을 쓴다. 외부 import 없음.
 *
 *   adj_score = score × (1 + w_ctx) × (1 + w_verdict)
 *
 * w_ctx: 안양시 공공데이터 7종으로 만든 사후 보정 계수(C1~C7, 합산 후 [-1.0, +0.60] 절단). 모델 재학습 없음.
 * w_verdict: 반경 200m 담당자 판정의 라플라스 평활 차이(±0.25). 판정은 조사 순서만 바꾸고 위반 여부를 바꾸지 않는다.
 * 기존 `score` 는 절대 바꾸지 않는다 — 보정은 그 위에 얹는 값이며 NEXT_PUBLIC_ADJ_ENABLED=false 면 전부 꺼진다.
 */

export type CtxCode = "C1" | "C2" | "C3" | "C3b" | "C4" | "C5" | "C6" | "C7";

export const CTX_RULES: Record<CtxCode, { label: string; weight: number; dataset: string; source: string; cond: string }> = {
  C1: { label: "공공건축물 필지 — 후보 제외", weight: -1.0, dataset: "안양시_공공건축물현황", source: "공공데이터포털 15114534 (2026-06-30)", cond: "공공건축물 지번과 일치" },
  C2: { label: "반경 100m 착공신고 이력", weight: 0.2, dataset: "안양시_건축착공신고현황", source: "공공데이터포털 15114531 (2026-05-31)", cond: "반경 100m 안 착공신고 1건 이상" },
  C3: { label: "반경 150m 공동주택 1,000세대 이상", weight: 0.15, dataset: "안양시_공동주택 현황", source: "공공데이터포털 3045074 (2025-09-22)", cond: "반경 150m 단지 세대수 합 ≥ 1,000" },
  C3b: { label: "반경 150m 공동주택 500~999세대", weight: 0.08, dataset: "안양시_공동주택 현황", source: "공공데이터포털 3045074 (2025-09-22)", cond: "반경 150m 단지 세대수 합 500~999" },
  C4: { label: "행정동 수방자재 하위 25%", weight: 0.1, dataset: "안양시_수방자재 현황", source: "공공데이터포털 15085817 (2025-12-30)", cond: "수중펌프+엔진펌프 절대량 하위 25% (인구 데이터 없음)" },
  C5: { label: "반경 300m 비상대피시설 없음", weight: 0.05, dataset: "안양시_비상대피시설 현황", source: "공공데이터포털 3045138 (2025-12-26)", cond: "반경 300m 안 0곳" },
  C6: { label: "반경 300m 민방위 급수시설 없음", weight: 0.03, dataset: "안양시_민방위 급수시설 현황", source: "공공데이터포털 3045178 (2026-03-07)", cond: "반경 300m 안 0곳" },
  C7: { label: "반경 100m 진행 중·예정 도로굴착", weight: 0.1, dataset: "안양시_도로굴착 공사현황", source: "공공데이터포털 15152770 (조회 2026-09-19)", cond: "반경 100m 안 진행 중·예정 굴착 공사 — 현장 확인을 겸할 수 있음(위험도 아님)" },
};

export const W_CTX_MIN = -1.0;
export const W_CTX_MAX = 0.6;
export const VERDICT_RADIUS_M = 200;
export const VERDICT_MAX = 0.25;

export type CtxInput = {
  publicParcel: boolean;
  constructionWithin100m: number;
  aptUnitsWithin150m: number;
  floodLowQuartile: boolean;
  sheltersWithin300m: number;
  waterWithin300m: number;
  /** 반경 100m 진행 중·예정 도로굴착 건수 (C7) */
  activeExcavationWithin100m?: number;
};

export type CtxReason = { code: CtxCode; label: string; weight: number; dataset: string; source: string; cond: string; detail?: string };
export type CtxAdjust = { w: number; excluded: boolean; reasons: CtxReason[] };

/** C1~C6 → w_ctx. C1 이면 다른 항목은 계산하지 않고 제외. */
export function computeCtx(i: CtxInput): CtxAdjust {
  const reasons: CtxReason[] = [];
  const push = (code: CtxCode, detail?: string) => reasons.push({ code, ...CTX_RULES[code], detail });
  if (i.publicParcel) {
    push("C1");
    return { w: W_CTX_MIN, excluded: true, reasons };
  }
  if (i.constructionWithin100m > 0) push("C2", `${i.constructionWithin100m}건`);
  if (i.aptUnitsWithin150m >= 1000) push("C3", `${i.aptUnitsWithin150m.toLocaleString("ko-KR")}세대`);
  else if (i.aptUnitsWithin150m >= 500) push("C3b", `${i.aptUnitsWithin150m.toLocaleString("ko-KR")}세대`);
  if (i.floodLowQuartile) push("C4");
  if (i.sheltersWithin300m === 0) push("C5");
  if (i.waterWithin300m === 0) push("C6");
  if ((i.activeExcavationWithin100m ?? 0) > 0) push("C7", `${i.activeExcavationWithin100m}건`);
  const raw = reasons.reduce((a, r) => a + r.weight, 0);
  const w = Math.max(W_CTX_MIN, Math.min(W_CTX_MAX, Math.round(raw * 1000) / 1000));
  return { w, excluded: false, reasons };
}

/** 반경 200m 판정 → w_verdict (라플라스 평활). HOLD 는 세지 않는다. */
export function verdictWeight(nViol: number, nNorm: number): number {
  if (nViol + nNorm === 0) return 0;
  return Math.round((VERDICT_MAX * (nViol - nNorm)) / (nViol + nNorm + 2) * 10000) / 10000;
}

export function adjScore(score: number, wCtx: number, wVerdict: number): number {
  return Math.round(score * (1 + wCtx) * (1 + wVerdict) * 10000) / 10000;
}

/** 순위 비교용 — 보정 점수 내림차순, 동점이면 기본 점수, 그다음 id */
export function byAdjDesc<T extends { adj: number; score: number; id: number }>(a: T, b: T): number {
  return b.adj - a.adj || b.score - a.score || a.id - b.id;
}
