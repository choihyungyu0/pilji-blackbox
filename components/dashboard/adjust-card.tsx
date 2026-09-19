import ctxJson from "@/data/derived/ctx_adjust.json";
import { CTX_RULES, type CtxCode } from "@/lib/adjust/rules";

type Stats = {
  candidates: number; adjusted: number; unchanged: number; rank_changed: number; top100_entered: number; top100_left: number;
  excluded: number; excluded_list: string[]; final_candidates: number; by_code: Record<CtxCode, number>;
};
const ctx = ctxJson as unknown as { generated: string; asof: string; formula: string; flood_note: string; stats: Stats };
const ENABLED = process.env.NEXT_PUBLIC_ADJ_ENABLED !== "false";

/**
 * 성과 대시보드 카드 — "안양시 데이터가 바꾼 조사 순서" (P0-1). 빌드 시 계산된 통계(ctx_adjust.json)를 그대로 읽는다.
 * 보정이 꺼져 있으면(NEXT_PUBLIC_ADJ_ENABLED=false) 그리지 않는다 — 대시보드는 종전과 동일.
 */
export function AdjustCard() {
  if (!ENABLED) return null;
  const s = ctx.stats;
  const codes = Object.keys(CTX_RULES) as CtxCode[];
  return (
    <section className="card p-4" data-tour="adjust-card">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold">안양시 데이터가 바꾼 조사 순서</h2>
        <span className="text-[11px] text-muted-foreground">안양 여건 보정(ACA) · AI 점수는 그대로, 조사 순위만 조정 · 산출 {ctx.generated}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border px-3 py-2">
          <p className="label">순위가 바뀐 후보</p>
          <p className="tnum text-lg font-bold">{s.rank_changed.toLocaleString("ko-KR")}<span className="text-xs font-normal text-muted-foreground"> / {s.candidates.toLocaleString("ko-KR")}동</span></p>
          <p className="text-[11px] text-muted-foreground">보정 계수 적용 {s.adjusted.toLocaleString("ko-KR")}동 · 무보정 {s.unchanged}동</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="label">상위 100위 진입 / 이탈</p>
          <p className="tnum text-lg font-bold">{s.top100_entered} <span className="text-xs font-normal text-muted-foreground">/</span> {s.top100_left}</p>
          <p className="text-[11px] text-muted-foreground">기본 순위 대비 보정 순위</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="label">후보 제외 (C1)</p>
          <p className="tnum text-lg font-bold">{s.excluded}동</p>
          <p className="text-[11px] text-muted-foreground">{s.excluded_list.join(", ") || "없음"} → 최종 후보 {s.final_candidates.toLocaleString("ko-KR")}동</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="label">산식</p>
          <p className="text-[11px]">adj = score × (1 + w_ctx) × (1 + w_verdict)</p>
          <p className="text-[11px] text-muted-foreground">w_ctx ∈ [−1.0, +0.60] · w_verdict ±0.25 (반경 200m 판정)</p>
        </div>
      </div>
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr><th className="py-1">코드</th><th className="py-1">조건</th><th className="py-1 text-right">가중</th><th className="py-1 text-right">적용 건수</th><th className="py-1">근거 데이터 (안양시 공공데이터포털)</th></tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c} className="border-t border-border">
              <td className="py-1 font-semibold">{c === "C3b" ? "C3′" : c}</td>
              <td className="py-1">{CTX_RULES[c].cond}</td>
              <td className="tnum py-1 text-right">{CTX_RULES[c].weight > 0 ? "+" : ""}{CTX_RULES[c].weight === -1 ? "제외" : CTX_RULES[c].weight.toFixed(2)}</td>
              <td className="tnum py-1 text-right font-semibold">{s.by_code[c].toLocaleString("ko-KR")}</td>
              <td className="py-1 text-muted-foreground">{CTX_RULES[c].dataset} · {CTX_RULES[c].source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">{ctx.flood_note}. 판정 기반 재순위(w_verdict)는 담당자 판정이 쌓일수록 달라지므로 여기 통계에는 넣지 않는다 — 조사 목록 화면에서 실시간 표시. 판정은 조사 순서만 바꾸고 위반 여부를 바꾸지 않는다.</p>
    </section>
  );
}
