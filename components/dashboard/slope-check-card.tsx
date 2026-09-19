import checkJson from "@/data/derived/slope_check.json";

type Band = { scope: string; buildings: number; ledger: number; viol: number; viol_pct: number | null; cand: number };
const check = checkJson as { generated: string; hypothesis: string; method: string; bands: Band[]; verdict: string; sources: string[] };

/**
 * 검증 카드 — 세운 가설을 데이터로 기각한 기록. "단순 통계"가 아니라 검증이며, "왜 사면 기능이 없느냐"에 대한 답이다.
 * 수치는 scripts/check_slopes.py 가 앱 데이터에서 그대로 계산한다.
 */
export function SlopeCheckCard() {
  const all = check.bands[check.bands.length - 1];
  return (
    <section className="card p-4" data-tour="slope-check">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold">검증: 급경사지와 위반건축물의 관련성</h2>
        <span className="text-[11px] text-muted-foreground">가설을 세우고 데이터로 기각한 기록 · 산출 {check.generated}</span>
      </div>
      <dl className="mt-3 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-muted-foreground">가설</dt><dd>{check.hypothesis}</dd>
        <dt className="font-semibold text-muted-foreground">방법</dt><dd>{check.method}</dd>
        <dt className="font-semibold text-muted-foreground">결과</dt>
        <dd>
          {check.bands.slice(1, 4).map((b) => `${b.scope} ${b.viol_pct ?? "–"}%`).join(" · ")} (안양 전체 {all.viol_pct}%) · 급경사지 필지 위 {check.bands[0].buildings}동 중 위반 표기 {check.bands[0].viol}동
        </dd>
        <dt className="font-semibold text-muted-foreground">판정</dt><dd className="font-semibold">{check.verdict}</dd>
      </dl>
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr><th className="py-1">범위</th><th className="py-1 text-right">건물</th><th className="py-1 text-right">대장연계</th><th className="py-1 text-right">위반 표기</th><th className="py-1 text-right">위반율</th><th className="py-1 text-right">AI 후보</th></tr>
        </thead>
        <tbody>
          {check.bands.map((b) => (
            <tr key={b.scope} className={`border-t border-border ${b.scope === "안양 전체" ? "font-semibold" : ""}`}>
              <td className="py-1">{b.scope}</td>
              <td className="tnum py-1 text-right">{b.buildings.toLocaleString("ko-KR")}</td>
              <td className="tnum py-1 text-right">{b.ledger.toLocaleString("ko-KR")}</td>
              <td className="tnum py-1 text-right">{b.viol.toLocaleString("ko-KR")}</td>
              <td className="tnum py-1 text-right">{b.viol_pct == null ? "–" : `${b.viol_pct}%`}</td>
              <td className="tnum py-1 text-right">{b.cand.toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">출처 {check.sources.join(" · ")}. 위성(Sentinel-2) 변화탐지도 대상이 개발제한구역 626동(2.3%)뿐이고 10m 해상도로 건물 단위 증축을 볼 수 없어 채택하지 않았다 — 지도 레이어에 "미적재"로 남긴다.</p>
    </section>
  );
}
