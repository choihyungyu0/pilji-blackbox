import type { Metadata } from "next";
import Link from "next/link";
import { dongStats, timelineSources } from "@/lib/data-server";
import metrics from "@/data/model_metrics.json";
import { GainsChart } from "@/components/dashboard/gains-chart";
import { DongTable } from "@/components/dashboard/dong-table";

export const metadata: Metadata = { title: "성과" };

type Metrics = {
  spatial_cv: { auc: number; ap: number; n: number; positives: number; base: number; lifts: { top: number; n: number; hits: number; recall: number; lift: number }[]; gains: [number, number][] };
  temporal: { auc: number; ap: number; n: number; positives: number; lifts: { top: number; n: number; hits: number; recall: number; lift: number }[]; gains: [number, number][]; baseline_auc: Record<string, number> };
  limits?: string[];
};

/** WF6 성과 — TBL-01 동별 현황 · CHT-02 누적 포착 곡선 · 1년 변화 · 급경사지 위치화 결과 */
export default function DashboardPage() {
  const m = metrics as unknown as Metrics;
  const t = dongStats.total;
  const ch = timelineSources.changes.counts;
  const sl = timelineSources.slopes_log;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <header>
        <p className="kicker text-muted-foreground">WF6 성과 · 기준 {dongStats.asof}</p>
        <h1 className="text-2xl font-extrabold">성과 대시보드</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="상위 20% 조사 시 위반 포착" value="46.8%" note="공간 5-fold 교차검증 (기저 6.7%, 리프트 2.34)" />
        <Kpi label="1년 뒤 신규 위반 포착" value="46.6%" note="2025.9 학습 → 2026.9 신규 88동 중 41동 (상위 20%)" />
        <Kpi label="AI 후보" value={`${t.cand.toLocaleString()}동`} note={`A ${t.A} · B ${t.B.toLocaleString()} (위반 표기 없는 건물의 상위 10%)`} />
        <Kpi label="1년 변화 (2025.9→2026.9)" value={`신규 ${ch.viol_added} · 해제 ${ch.viol_cleared}`} note={`신규 건물 ${ch.new_building} · 두 스냅숏 A20 비교`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-4">
          <h2 className="text-sm font-bold">누적 포착 곡선 (CHT-02)</h2>
          <p className="text-[11px] text-muted-foreground">점수 상위 x% 를 조사했을 때 실제 위반 표기 건물의 몇 %를 포착하는가. 대각선 = 무작위.</p>
          <div className="mt-2"><GainsChart spatial={m.spatial_cv.gains} temporal={m.temporal.gains} /></div>
        </div>
        <div className="card p-4 text-xs">
          <h2 className="text-sm font-bold">검증 요약</h2>
          <table className="mt-2 w-full">
            <thead className="text-left text-[11px] text-muted-foreground"><tr><th>구분</th><th>상위</th><th className="text-right">조사 동수</th><th className="text-right">포착</th><th className="text-right">재현율</th><th className="text-right">리프트</th></tr></thead>
            <tbody className="tnum">
              {m.spatial_cv.lifts.map((l) => (
                <tr key={`s${l.top}`} className="border-t border-border"><td>공간</td><td>{Math.round(l.top * 100)}%</td><td className="text-right">{l.n.toLocaleString()}</td><td className="text-right">{l.hits}</td><td className="text-right">{(l.recall * 100).toFixed(1)}%</td><td className="text-right">{l.lift}</td></tr>
              ))}
              {m.temporal.lifts.map((l) => (
                <tr key={`t${l.top}`} className="border-t border-border"><td>시간</td><td>{Math.round(l.top * 100)}%</td><td className="text-right">{l.n.toLocaleString()}</td><td className="text-right">{l.hits}</td><td className="text-right">{(l.recall * 100).toFixed(1)}%</td><td className="text-right">{l.lift}</td></tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">공간 AUC / AP</dt><dd className="tnum">{m.spatial_cv.auc} / {m.spatial_cv.ap} (n={m.spatial_cv.n.toLocaleString()}, 양성 {m.spatial_cv.positives.toLocaleString()})</dd>
            <dt className="text-muted-foreground">시간 AUC / AP</dt><dd className="tnum">{m.temporal.auc} / {m.temporal.ap} (n={m.temporal.n.toLocaleString()}, 신규 위반 {m.temporal.positives})</dd>
            <dt className="text-muted-foreground">기준선 AUC</dt><dd className="tnum">이웃 위반 비율만 {m.temporal.baseline_auc.nb_viol_only} · 경과연수만 {m.temporal.baseline_auc.age_only}</dd>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">모델 한계·라벨 정의는 <Link href="/about" className="underline">데이터·모델 정보</Link>의 모델 카드에 있습니다. 재학습(MDL-02)은 P1 — 판정 20건 이상 누적 시 별도 실행.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold">동별 현황 (TBL-01)</h2>
        <DongTable rows={dongStats.dongs} total={t} />
        <p className="mt-1 text-[11px] text-muted-foreground">출처 GIS건물통합정보 {dongStats.asof} · 위반 비율은 대장 있는 건물 기준 · 판정은 담당자 모드에서 입력한 값(기기·서버 보관)</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4 text-xs">
          <h2 className="text-sm font-bold">급경사지 위치화 (DAT-04)</h2>
          <p className="mt-1">행안부 목록 안양 {sl.rows}행 중 <b>{sl.located_rows}행</b> 위치화(필지 {sl.parcels}개), 실패 {sl.failed_rows}행 — 호계3동 안양교도소(지번 없음), 만안 안양 N10지구(연속지적도에 PNU 없음).</p>
          <p className="mt-1 text-muted-foreground">시 발표(2026.7.2) 59곳과 12곳 차이 — 사유지 제외 가능성. 박달동 139-137(5.21 축대 붕괴)은 목록에 없음.</p>
        </div>
        <div className="card p-4 text-xs">
          <h2 className="text-sm font-bold">대장 미연계 신호 (S1)</h2>
          <p className="mt-1">용도·구조가 빈 건물 <b>{t.ledger_false.toLocaleString()}동</b>(14.8%). 반경 20m 안에 미연계 건물이 있는 건물의 위반 표기 비율 7.7% vs 없는 건물 6.5% (RR 1.19, p=0.006).</p>
          <p className="mt-1 text-muted-foreground">부속건물·가설물 가능성이 있어 단독 신호로 쓰지 않고 모델 변수(반경 30m 수)로만 사용.</p>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="label">{label}</p>
      <p className="tnum mt-0.5 text-xl font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
