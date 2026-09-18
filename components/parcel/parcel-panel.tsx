"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X, ClipboardPlus, MessageSquareText, Crosshair } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings, buildingsWithin } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { STAGE_META } from "@/lib/stages";
import { fmt, floorsText, kstDate } from "@/lib/format";
import { distanceM } from "@/lib/geo";
import { VERDICT_LABEL, type Mode } from "@/lib/types";
import { ScoreCard } from "./score-card";
import { ParcelFacts, Timeline, useTimeline } from "./timeline";

type Facility = { kind: "public_building" | "shelter" | "water"; name: string; address: string; lon: number; lat: number; source: string; asof: string; capacity?: string };
const FAC_LABEL = { public_building: "공공건축물", shelter: "비상대피시설", water: "민방위 급수시설" } as const;

let facCache: Facility[] | null = null;
async function loadFacilities(): Promise<Facility[]> {
  if (facCache) return facCache;
  const fc = (await fetch("/data/facilities.geojson").then((r) => r.json())) as { features: { properties: Omit<Facility, "lon" | "lat">; geometry: { coordinates: [number, number] } }[] };
  facCache = fc.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  return facCache;
}

/** WF2 필지 패널 — CRD-01 기본정보 · SCR-01/BDG-01 점수 근거(담당자) · TML-01 타임라인 · LST-02 주변 현황 · BTN-02·07 */
export function ParcelPanel({ mode }: { mode: Mode }) {
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const requestFlyTo = useApp((s) => s.requestFlyTo);
  const addToList = useApp((s) => s.addToList);
  const list = useApp((s) => s.list);
  const kase = useCases((s) => (selectedId != null ? s.cases[selectedId] : undefined));
  const ensure = useCases((s) => s.ensure);
  const index = useBuildings((s) => s.index);
  const b = selectedId != null ? index?.byId.get(selectedId) ?? null : null;
  const tl = useTimeline(b?.pnu ?? null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  useEffect(() => {
    if (b) loadFacilities().then(setFacilities).catch(() => setFacilities([]));
  }, [b]);

  const around = useMemo(() => {
    if (!b || !index) return null;
    const within = buildingsWithin(index, b.lon, b.lat, 100).filter((x) => x.b.id !== b.id);
    return {
      n: within.length,
      viol: within.filter((x) => x.b.viol === "Y").length,
      noLedger: within.filter((x) => !x.b.ledger).length,
      pub: within.filter((x) => x.b.public_parcel).length,
    };
  }, [b, index]);
  const nearFac = useMemo(() => {
    if (!b || !facilities) return [];
    return facilities.map((f) => ({ ...f, d: Math.round(distanceM(b.lon, b.lat, f.lon, f.lat)) })).filter((f) => f.d <= 300).sort((a, c) => a.d - c.d).slice(0, 6);
  }, [b, facilities]);

  if (!b) return null;
  const officer = mode === "officer";
  const inList = list.some((x) => x.id === b.id);
  const sameParcelList = index?.byPnu.get(b.pnu) ?? [b];
  const sameParcel = sameParcelList.length;

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-paper" aria-label="필지 패널">
      <header className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="label">필지 · 건물 {b.id}</p>
          <h2 className="truncate text-base font-bold">
            {b.dong} {b.san === "산" ? "산 " : ""}{b.jibun}
          </h2>
          <p className="tnum text-[11px] text-muted-foreground">PNU {b.pnu}{sameParcel > 1 ? ` · 같은 필지 건물 ${sameParcel}동` : ""}</p>
        </div>
        <button className="btn btn-sm" onClick={() => requestFlyTo(b.lon, b.lat)} title="지도 이동"><Crosshair className="size-3.5" /></button>
        <button className="btn btn-sm" onClick={() => select(null)} aria-label="닫기"><X className="size-3.5" /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {sameParcel > 1 && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="text-muted-foreground">같은 필지 건물:</span>
            {sameParcelList.map((x) => (
              <button key={x.id} onClick={() => select(x.id)} className={`chip ${x.id === b.id ? "border-ink bg-ink text-white" : "hover:bg-accent"}`}>
                {x.id} · {x.use ?? "정보없음"}{officer && x.grade && x.cand ? ` · ${x.grade}` : ""}{x.viol === "Y" ? " · 위반" : ""}
              </button>
            ))}
          </div>
        )}
        {kase && officer && (
          <Link href={`/cases/${kase.id}`} className="flex items-center gap-2 rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: STAGE_META[kase.stage].color }}>{STAGE_META[kase.stage].label}</span>
            {kase.survey ? <>현장 판정 <b>{VERDICT_LABEL[kase.survey.verdict]}</b> · {kstDate(kase.survey.at)}{kase.synced ? "" : " · 기기 보관"}</> : <>사건 등록됨 · 판정 없음</>}
            <span className="ml-auto underline">사건 열기 →</span>
          </Link>
        )}
        {b.viol === "Y" && <p className="rounded-md bg-sig-viol/10 px-3 py-1.5 text-xs font-semibold text-sig-viol">위반건축물 표기 있음 (건물통합정보 A20=Y)</p>}

        {/* CRD-01 기본정보 */}
        <section className="card p-3">
          <p className="label">기본정보</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <Row k="주용도" v={fmt.text(b.use)} />
            <Row k="구조" v={fmt.text(b.struct)} />
            <Row k="사용승인" v={fmt.date(b.approve)} />
            <Row k="층수" v={floorsText(b.fl_up, b.fl_dn)} />
            <Row k="높이" v={fmt.num(b.h, 1, "m")} />
            <Row k="연면적" v={fmt.num(b.gfa, 1, "㎡")} />
            <Row k="대장 연계" v={b.ledger ? "연계" : "미연계 (용도·구조 없음)"} />
            <Row k="개발제한구역" v={b.gb == null ? "정보없음" : b.gb ? "내부" : "외부"} />
            <Row k="공공건축물 필지" v={b.public_parcel ? "예 (안양시 공공건축물현황 지번 일치)" : "아니오"} />
            <Row k="데이터 변경일" v={fmt.date(b.chg)} />
          </dl>
          <p className="mt-2 text-[10px] text-muted-foreground">출처 국토교통부 GIS건물통합정보(브이월드, CC BY) · 기준 {index?.asof} · 결측은 "정보없음"</p>
        </section>

        {officer ? <div data-tour="score"><ScoreCard b={b} /></div> : (
          <section className="card p-3 text-xs text-muted-foreground">
            공개 모드 — AI 후보·점수는 필지 단위로 표시하지 않습니다(100m 격자 집계만). 담당자 모드에서 점수·근거·판정을 볼 수 있습니다.
          </section>
        )}

        {/* PCL-04 필지 여건 — 안양시 공공데이터·법령 */}
        {tl.data?.context && (
          <section className="card p-3" data-tour="facts">
            <ParcelFacts context={tl.data.context} />
          </section>
        )}

        {/* TML-01 */}
        <section className="card p-3">
          <p className="label mb-2">필지 타임라인</p>
          <Timeline state={tl} />
        </section>

        {/* LST-02 주변 현황 */}
        <section className="card p-3">
          <p className="label">주변 현황</p>
          {around && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="chip">반경 100m 건물 {around.n}</span>
              <span className="chip text-sig-viol">위반 표기 {around.viol}</span>
              <span className="chip text-sig-ledger">대장 미연계 {around.noLedger}</span>
              {around.pub > 0 && <span className="chip">공공 필지 {around.pub}</span>}
            </div>
          )}
          {tl.data && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold">급경사지 (공개 47곳) · 가까운 순</p>
              {tl.data.nearbySlopes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">반경 1km·같은 동에 등재된 급경사지 없음</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5 text-[11px]">
                  {tl.data.nearbySlopes.map((s) => (
                    <li key={s.pnu} className="flex justify-between gap-2">
                      <button className="truncate text-left hover:underline" onClick={() => requestFlyTo(s.lon, s.lat, 17)}>
                        {s.names.join(", ")} <span className="text-muted-foreground">({s.dong} {s.jibun})</span>
                      </button>
                      <span className="tnum shrink-0 text-muted-foreground">{s.d}m</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-2">
            <p className="text-[11px] font-semibold">공공건축물·대피·급수시설 (반경 300m)</p>
            {facilities == null ? (
              <p className="text-[11px] text-muted-foreground">불러오는 중…</p>
            ) : nearFac.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">반경 300m 내 없음</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5 text-[11px]">
                {nearFac.map((f) => (
                  <li key={`${f.kind}-${f.name}-${f.d}`} className="flex justify-between gap-2">
                    <span className="truncate"><span className="text-muted-foreground">[{FAC_LABEL[f.kind]}]</span> {f.name}</span>
                    <span className="tnum shrink-0 text-muted-foreground">{f.d}m</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">출처 안양시 공공건축물현황(2026-06-30)·비상대피시설(2025-12-26)·민방위 급수시설(2026-03-07), 브이월드 지오코더</p>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">굴착·지반침하·CCTV는 미적재(P1) — 해당 칩은 표시하지 않음</p>
        </section>
      </div>

      {officer && (
        <footer data-tour="panel-actions" className="grid grid-cols-3 gap-1.5 border-t border-border p-2">
          <button className="btn" disabled={inList} onClick={() => { addToList(b); ensure(b, b.cand ? "ai" : "manual"); }} title="조사 계획에 넣기 (후보 단계 사건 등록)">
            <ClipboardPlus className="size-3.5" /> {inList ? "목록에 있음" : "조사 목록"}
          </button>
          <Link href={`/cases/${b.id}`} className="btn-primary" onClick={() => ensure(b, kase?.origin ?? (b.cand ? "ai" : "manual"))}>
            사건 {kase ? "열기" : "등록"}
          </Link>
          <Link href={`/agent?id=${b.id}`} className="btn">
            <MessageSquareText className="size-3.5" /> 에이전트
          </Link>
        </footer>
      )}
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={v === "정보없음" ? "text-muted-foreground" : ""}>{v}</dd>
    </>
  );
}
