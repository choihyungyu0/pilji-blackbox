"use client";

import { Info } from "lucide-react";
import type { Building } from "@/lib/types";
import { fmt } from "@/lib/format";

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
            <span className="inline-block rounded-md bg-muted px-2 py-1 text-xs font-semibold" title="상위 10% 밖 — 후보 아님(점수만 표시)">
              C · 후보 아님
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Info className="size-3" /> 등급은 조사 순서이며 위반 판정이 아님 · A ≥0.222 · B ≥0.165 · 기준 2026-09-09
      </p>

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
