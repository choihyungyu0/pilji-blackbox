import type { Metadata } from "next";
import { SOURCES } from "@/lib/sources";
import metrics from "@/data/model_metrics.json";
import { dongStats } from "@/lib/data-server";
import { WorkLog } from "@/components/about/work-log";

export const metadata: Metadata = { title: "데이터·모델 정보" };

type Metrics = {
  asof: string; label: string; model: string; features: string[];
  spatial_cv: { design: string; auc: number; ap: number; n: number; positives: number; base: number };
  temporal: { design: string; auc: number; ap: number; n: number; positives: number; baseline_auc: Record<string, number> };
  thresholds: Record<string, number>;
  permutation_importance_auc: [string, number][];
  limits: string[];
};

const FEATURE_KO: Record<string, string> = {
  nb_viol: "반경 100m 이웃 위반 비율", age: "경과연수", "use_공동주택": "용도=공동주택", gfa: "연면적", garea: "도형 면적", foot_ratio: "도형/대장 면적비",
  bcr: "건폐율", n_bld50: "반경 50m 건물 수", "st_벽돌구조": "구조=벽돌구조", fl_up: "지상층수",
};

/** WF7 데이터·모델 정보 — CRD-02 모델 카드 · TBL-02 출처·기준일·라이선스 · TBL-03 작업 로그 */
export default function AboutPage() {
  const m = metrics as unknown as Metrics;
  const groups = [...new Set(SOURCES.map((s) => s.group))];
  const maxImp = m.permutation_importance_auc[0][1];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header>
        <p className="kicker text-muted-foreground">WF7 데이터·모델 정보</p>
        <h1 className="text-2xl font-extrabold">모델 카드 · 데이터 출처</h1>
      </header>

      {/* CRD-02 모델 카드 */}
      <section className="card p-4 text-sm">
        <h2 className="text-base font-bold">모델 카드 (MDL-03)</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <dl className="space-y-1.5 text-xs">
            <Row k="목적" v="위반건축물 현장조사 우선순위(조사 순서) 산출. 위반 판정이 아니다." />
            <Row k="라벨" v={`${m.label} — 이미 적발되어 표기된 위반만 포함`} />
            <Row k="학습 데이터" v={`GIS건물통합정보 안양 27,713동 중 대장 있는 23,558동 (기준 ${m.asof}), 양성 1,573`} />
            <Row k="모델" v={m.model} />
            <Row k="변수" v={m.features.join(", ")} />
            <Row k="공간 검증" v={`${m.spatial_cv.design} · AUC ${m.spatial_cv.auc} · AP ${m.spatial_cv.ap} · 상위 20% 조사 시 위반 46.8% 포착 (기저율 ${(m.spatial_cv.base * 100).toFixed(1)}%)`} />
            <Row k="시간 검증" v={`${m.temporal.design} · AUC ${m.temporal.auc} · AP ${m.temporal.ap} · 신규 위반 88동 중 상위 20%에서 41동(46.6%)`} />
            <Row k="후보 정의" v={`위반 표기 없는 건물 중 점수 ≥ ${m.thresholds.cand_top10}(상위 10%) → 1,918동. A ≥ ${m.thresholds.gradeA_top5}(상위 5%) 913동, B 1,005동`} />
            <Row k="점수 비대상" v="대장 미연계 4,112동, 위반 표기 1,573동 (BR-M2)" />
            <Row k="재학습" v="P1 — 판정 누적 ≥20건, 위반·정상 각 ≥5건일 때 (BR-M3). 현재 앱은 사전 계산값만 표시" />
          </dl>
          <div>
            <p className="label">순열 중요도 (AUC 감소)</p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {m.permutation_importance_auc.map(([k, v]) => (
                <li key={k}>
                  <div className="flex justify-between"><span>{FEATURE_KO[k] ?? k}</span><span className="tnum text-muted-foreground">{v.toFixed(4)}</span></div>
                  <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-sig-cand" style={{ width: `${(v / maxImp) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
            <p className="label mt-4">한계</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {m.limits.map((l) => <li key={l}>{l}</li>)}
              <li>이웃 위반 비율 기여가 50%를 넘는 후보에는 "과거 단속 지역 영향 큼" 경고 (BR-M4)</li>
              <li>화면의 신호 기여도는 전역 중요도 × 값의 추정치이며 개별 SHAP 값이 아님</li>
              <li>임계값(0.165·0.222)은 2026-09-09 분석값 — 재학습 시 재계산</li>
            </ul>
          </div>
        </div>
      </section>

      {/* TBL-02 출처 */}
      <section>
        <h2 className="mb-2 text-base font-bold">데이터 출처·기준일·라이선스 (TBL-02)</h2>
        <p className="mb-2 text-xs text-muted-foreground">사업계획서 3장 "제공기관 | 데이터명 | URL" 표와 동일. 안양시 공공데이터 6종 포함. 모든 레이어·카드는 이 기준일을 표시한다.</p>
        {groups.map((g) => (
          <div key={g} className="card mb-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2 w-40">{g}</th><th className="px-3 py-2">데이터명</th><th className="px-3 py-2">기준일</th><th className="px-3 py-2">라이선스</th><th className="px-3 py-2">용도 · 한계</th></tr>
              </thead>
              <tbody>
                {SOURCES.filter((s) => s.group === g).map((s) => (
                  <tr key={s.name} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-muted-foreground">{s.provider}</td>
                    <td className="px-3 py-2"><a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">{s.name}</a><p className="break-all text-[10px] text-muted-foreground">{s.url}</p></td>
                    <td className="px-3 py-2 tnum whitespace-nowrap">{s.asof}</td>
                    <td className="px-3 py-2">{s.license}</td>
                    <td className="px-3 py-2">{s.use}{s.limit && <p className="text-[11px] text-amber-800">한계: {s.limit}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">미적재(P1): 안양시 도로굴착 API(15152770), 국토부 지하안전정보 API(15041891), 경기데이터드림 CCTV, Sentinel-2 위성 지수, 국토정보플랫폼 DEM 5m. 관련 안양시 데이터: 불법건축물 지도점검 현황(15149103, 동 단위 5행) — 본 서비스는 이를 비식별 필지 단위 후보로 확장하는 제안.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4 text-xs">
          <h2 className="text-sm font-bold">원칙</h2>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li>소유자·거주자 이름·연락처·주민번호 수집·표시·저장 없음 (SEC-02). 메모의 전화·주민번호 패턴은 저장 차단</li>
            <li>공개 모드는 AI 후보를 100m 격자 개수로만 표시, 필지 클릭 시 기본정보만 (BR-P1)</li>
            <li>사전통지 초안은 담당자 판정 = 위반일 때만 (BR-C1). 문서 머리말 "초안 — 담당자 검토 필요" + 생성시각·근거 목록 (BR-C3)</li>
            <li>에이전트 답변의 수치는 도구 결과에 있는 값만 남기고 나머지 문장은 삭제 (BR-A1). 도구 실패는 답변에 명시 (BR-A2)</li>
            <li>결측은 0이 아닌 "정보없음" (BR-D1). 브이월드 영상 타일은 조회만</li>
            <li>박달동 축대 붕괴(2026-05-21)의 원인·소유 관계는 공식 미확인 — 단정하지 않음</li>
          </ul>
        </div>
        <div className="card p-4 text-xs">
          <h2 className="text-sm font-bold">확정 수치 (README)</h2>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tnum">
            <dt className="text-muted-foreground">건물</dt><dd>27,713동 (만안 16,479 · 동안 11,234), 기준 {dongStats.asof}</dd>
            <dt className="text-muted-foreground">위반 표기</dt><dd>1,573동 (대장 있는 23,558동의 6.7%)</dd>
            <dt className="text-muted-foreground">대장 미연계</dt><dd>4,112동 (14.8%)</dd>
            <dt className="text-muted-foreground">AI 후보</dt><dd>1,918동 = A 913 + B 1,005</dd>
            <dt className="text-muted-foreground">검증</dt><dd>공간 AUC 0.728 · 시간 AUC 0.698 · 상위 20% 포착 46.8% / 46.6%</dd>
            <dt className="text-muted-foreground">1년 변화</dt><dd>신규 위반 88 · 해제 64 · 신규 건물 1</dd>
            <dt className="text-muted-foreground">급경사지</dt><dd>공개 47곳 (시 발표 59곳), 위치화 45행·필지 38개</dd>
          </dl>
        </div>
      </section>

      <WorkLog />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
