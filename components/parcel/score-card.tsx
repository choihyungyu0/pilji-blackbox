"use client";

import { Info } from "lucide-react";
import type { Building } from "@/lib/types";
import { fmt } from "@/lib/format";
import { useRanking } from "@/lib/adjust/use-ranking";
import { pct } from "@/lib/adjust/context";

/**
 * SCR-01 AI 점수·등급 + BDG-01 신호 근거 막대 (PCL-02, MDL-01).
 * 기여도는 전역 순열 중요도(model_metrics) × 정규화 값의 추정치 — SHAP 이 아니므로 "추정"으로 표기.
 * BR-M4: 이웃 위반 비율 기여 추정이 50% 초과면 "과거 단속 지역 영향 큼" 경고.
 */
const IMPORTANCE: Record<string, number> = { f_nbv: 0.0908, f_age: 0.0436, f_footratio: 0.0236, f_nb50: 0.0151, f_nl30: 0.012 };
const SIGNALS: { key: keyof Building; label: string; norm: (v: number) => number; fmt: (v: number) => string; why: string }[] = [
  { key: "f_nbv", label: "반경 100m 위반 비율", norm: (v) => Math.min(1, v / 0.5), fmt: (v) => `${(v * 100).toFixed(1)}%`, why: "이웃 건물의 위반 표기 비율(자기 제외). 점수 근거 1순위" },
  { key: "f_age", label: "경과연수", norm: (v) => Math.min(1, v / 60), fmt: (v) => `${v}년`, why: "2026 − 사용승인연도" },
  { key: "f_footratio", label: "도형/대장 면적비", norm: (v) => Math.min(1, Math.max(0, (v - 0.8) / 1.2)), fmt: (v) => v.toFixed(2), why: "1보다 크면 대장보다 실제 도형이 큼" },
  { key: "f_nb50", label: "반경 50m 건물 수", norm: (v) => Math.min(1, v / 40), fmt: (v) => `${v}동`, why: "밀집도" },
  { key: "f_nl30", label: "반경 30m 대장 미연계", norm: (v) => Math.min(1, v / 6), fmt: (v) => `${v}동`, why: "S1 신호 — 부속건물·가설물 가능성" },
];

export function ScoreCard({ b }: { b: Building }) {
  if (b.score == null) {
    const reason = !b.ledger ? "대장 미연계" : b.viol === "Y" ? "이미 위반 표기(A20=Y)" : "점수 없음";
    return (
      <section className="card p-3">
        <p className="label">AI 우선조사 점수</p>
        <p className="mt-1 text-sm font-semibold">점수 산출 대상 아님</p>
        <p className="text-xs text-muted-foreground">사유: {reason} (BR-M2)</p>
      </section>
    );
  }
  const contributions = SIGNALS.map((s) => {
    const v = b[s.key] as number | null | undefined;
    const w = v == null ? 0 : IMPORTANCE[s.key] * s.norm(v);
    return { ...s, v, w };
  });
  const total = contributions.reduce((a, c) => a + c.w, 0) || 1;
  const nbvShare = (contributions.find((c) => c.key === "f_nbv")?.w ?? 0) / total;

  return (
    <section className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="label">AI 우선조사 점수</p>
          <p className="tnum mt-0.5 text-2xl font-extrabold leading-none">{fmt.score(b.score)}</p>
        </div>
        <div className="text-right">
          {b.cand ? (
            <>
              <span
                className={`inline-block rounded-md px-2 py-1 text-sm font-bold text-white ${b.grade === "A" ? "bg-sig-cand" : "bg-sig-candb"}`}
                title="등급은 조사 순서이지 위반 판정이 아닙니다"
              >
                {b.grade}등급
              </span>
              <p className="badge-cand mt-1">후보(현장 확인 전)</p>
            </>
          ) : (
            <span className="inline-block rounded-md bg-muted px-2 py-1 text-xs font-semibold" title="점수 상위 10% 임계값(0.165) 미만 — 후보 아님(점수만 표시)">
              C · 후보 아님
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Info className="size-3" /> 등급은 조사 순서이며 위반 판정이 아님 · A ≥0.222 · B ≥0.165 · 기준 2026-09-09
      </p>
      {b.cand && <AdjustLine b={b} />}

      <p className="label mt-3">신호 근거 <span className="font-normal normal-case tracking-normal">(기여 추정 = 전역 중요도 × 값)</span></p>
      <ul className="mt-1 space-y-1.5">
        {contributions.map((c) => (
          <li key={c.key} title={c.why}>
            <div className="flex justify-between text-[11px]">
              <span>{c.label}</span>
              <span className="tnum text-muted-foreground">
                {c.v == null ? "정보없음" : c.fmt(c.v)} · {Math.round((c.w / total) * 100)}%
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded bg-muted">
              <div className="h-1.5 rounded bg-sig-cand" style={{ width: `${Math.round((c.w / total) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {nbvShare > 0.5 && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">과거 단속 지역 영향 큼 — 이웃 위반 비율 기여가 50%를 넘습니다 (BR-M4)</p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">모델: HistGradientBoosting · 공간 5-fold AUC 0.728 · 시간 검증 AUC 0.698 · 점수는 사전 계산값</p>
    </section>
  );
}

/**
 * 안양 여건 보정 + 판정 재순위 (P0-1·P0-2) — AI 점수는 그대로 두고 조사 순위만 바꾼 값을 근거와 함께 보여준다.
 * 보정이 0이면 "안양 여건 보정 없음"이라고 숨기지 않고 적는다. 꺼져 있으면 아무것도 그리지 않는다.
 */
function AdjustLine({ b }: { b: Building }) {
  const { enabled, ready, adjOf, ctx } = useRanking();
  if (!enabled || !ready) return null;
  const a = adjOf(b.id);
  if (!a || b.score == null) return null;
  const ctxPct = pct(a.wCtx);
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-[11px]" data-tour="adjust">
      {a.excluded ? (
        <p className="font-semibold text-red-800">
          조사 후보 제외 — {a.excludedBy === "C1" ? "공공건축물 필지(안양시_공공건축물현황)" : "담당자 판정 '대상 아님'"}
        </p>
      ) : (
        <p className="tnum">
          AI 점수 <b>{fmt.score(b.score)}</b> → 조사 순위 점수 <b>{a.adj.toFixed(3)}</b>
          {a.wCtx !== 0 ? ` (안양 여건 ${ctxPct}` : " (안양 여건 보정 없음"}
          {a.wVerdict !== 0 ? ` · 주변 판정 ${pct(a.wVerdict)}` : ""}
          {")"}
          {a.rankBase != null && a.rankAdj != null && (
            <span className="ml-1 text-muted-foreground">· 기본 {a.rankBase.toLocaleString("ko-KR")}위 → 보정 {a.rankAdj.toLocaleString("ko-KR")}위 / {ctx?.stats.final_candidates.toLocaleString("ko-KR")}</span>
          )}
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {a.reasons.map((r) => (
          <span key={r.code} className="chip" title={`${r.cond ?? ""} · 출처 ${r.source}`}>
            {r.label}{r.detail ? ` ${r.detail}` : ""}({pct(r.weight)}) · {r.dataset}
          </span>
        ))}
        {a.reasons.length === 0 && !a.excluded && <span className="chip text-muted-foreground">안양 여건 보정 없음</span>}
        {(a.verdict.nViol > 0 || a.verdict.nNorm > 0) && (
          <span className="chip" title="반경 200m 담당자 판정 — 라플라스 평활 0.25×(위반−정상)/(위반+정상+2)">
            주변 판정 반영 {pct(a.wVerdict)} (반경 200m 위반 {a.verdict.nViol}건 · 정상 {a.verdict.nNorm}건)
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        adj = score × (1 + w_ctx) × (1 + w_verdict) · 판정은 조사 순서만 바꾼다. 위반 여부를 바꾸지 않는다.
        {a.reasons.some((r) => r.code === "C4") ? " · C4 는 행정동 인구 자료가 없어 절대량 기준" : ""}
      </p>
    </div>
  );
}
