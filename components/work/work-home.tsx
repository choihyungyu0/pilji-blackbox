"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ClipboardList, Map as MapIcon, FileText, ArrowRight, BarChart3 } from "lucide-react";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { useApp } from "@/store/app-store";
import { STAGES, STAGE_META, todosOf } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { IntegrationStatus } from "@/components/app/integration-status";

/**
 * 업무 홈 — 담당자가 출근해서 처음 보는 화면. 오늘 할 일(기한 지난 것 우선) · 단계 파이프라인 · 시작하기.
 * 시연용이 아니라 실제 하루 업무 순서: 계획 결재 → 현장 → 통지·명령 발송 → 기한 관리 → 부과 → 종결.
 */
export function WorkHome() {
  const index = useBuildings((s) => s.index);
  const load = useBuildings((s) => s.load);
  const cases = useCases((s) => s.cases);
  const list = useApp((s) => s.list);
  const log = useApp((s) => s.log);
  useEffect(() => {
    void load("officer");
  }, [load]);
  const all = useMemo(() => Object.values(cases), [cases]);
  const todos = useMemo(() => todosOf(all), [all]);
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, all.filter((c) => c.stage === s).length])) as Record<string, number>, [all]);
  const overdue = todos.filter((t) => t.overdue).length;
  const label = (id: number) => {
    const b = index?.byId.get(id);
    return b ? `${b.dong} ${b.san === "산" ? "산 " : ""}${b.jibun}` : String(id);
  };
  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-end gap-2">
        <div>
          <p className="kicker text-muted-foreground">담당자 업무 홈 · {today}</p>
          <h1 className="text-2xl font-extrabold">오늘 할 일 {todos.length}건{overdue ? <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-sm text-white">기한 경과 {overdue}</span> : null}</h1>
        </div>
        <div data-tour="quick" className="ml-auto flex flex-wrap gap-1.5">
          <Link href="/map" className="btn h-9"><MapIcon className="size-4" /> 지도에서 후보 찾기</Link>
          <Link href="/investigate" className="btn h-9"><ClipboardList className="size-4" /> 조사 목록·기안 {list.length ? `(${list.length})` : ""}</Link>
          <Link href="/cases" className="btn-primary h-9"><FileText className="size-4" /> 사건 {all.length}건</Link>
        </div>
      </header>

      {/* 파이프라인 */}
      <section data-tour="pipeline" className="card overflow-x-auto p-3">
        <ol className="flex min-w-[720px] items-stretch gap-1">
          {STAGES.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-1">
              <Link href={`/cases?stage=${s}`} className="flex w-full flex-col items-center rounded-md border border-border px-2 py-2 hover:bg-accent">
                <span className="tnum text-xl font-extrabold" style={{ color: STAGE_META[s].color }}>{counts[s] ?? 0}</span>
                <span className="text-[11px]">{STAGE_META[s].label}</span>
                {STAGE_META[s].doc && <span className="mt-0.5 text-[9px] text-muted-foreground">{STAGE_META[s].doc}</span>}
              </Link>
              {i < STAGES.length - 1 && <ArrowRight className="size-3 shrink-0 text-muted-foreground" />}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">건축법 79조 실태조사 → 행정절차법 21조 사전통지 → 79조① 시정명령 → 80조③ 계고 → 80조④ 부과(안양시 조례 연 1회) → 시행규칙 40조 관리대장. 각 단계의 전제가 갖춰지지 않으면 다음 문서는 만들어지지 않습니다.</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <section data-tour="todos" className="card p-3">
          <p className="label mb-2">할 일 (기한 경과 → 임박 → 미조사 순)</p>
          {todos.length === 0 ? (
            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">등록된 사건이 없습니다.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                <li><Link href="/investigate" className="underline">조사 목록</Link>에서 법정동·등급·건수를 정해 후보를 뽑고 <b>현장조사 계획 기안문</b>을 만듭니다 (결재).</li>
                <li>현장에서 <b>판정</b>(위반/정상/대상아님/보류)과 위반 내용·면적·사진을 기록합니다.</li>
                <li>위반 건은 <b>처분사전통지서</b> → 의견제출기한 경과 → <b>시정명령서</b> → 미이행 시 <b>계고·부과</b> → <b>종결·관리대장</b>.</li>
              </ol>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {todos.slice(0, 30).map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: STAGE_META[t.stage].color }}>{STAGE_META[t.stage].short}</span>
                  <Link href={`/cases/${t.id}`} className="font-semibold hover:underline">{label(t.id)}</Link>
                  <span className={cn("flex-1", t.overdue && "font-semibold text-red-700")}>{t.text}</span>
                  {t.due && <span className="tnum text-muted-foreground">{t.due}</span>}
                  <Link href={`/cases/${t.id}`} className="btn btn-sm">열기</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-3">
          <section className="card p-3 text-xs">
            <p className="label mb-1">최근 작업</p>
            {log.length === 0 ? <p className="text-muted-foreground">기록 없음</p> : (
              <ul className="space-y-0.5">
                {log.slice(0, 8).map((l, i) => <li key={i} className="flex gap-2"><span className="tnum shrink-0 text-muted-foreground">{new Date(l.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span><span className="truncate">{l.summary}</span></li>)}
              </ul>
            )}
          </section>
          <section className="card p-3 text-xs">
            <p className="label mb-1">연동 상태</p>
            <IntegrationStatus />
          </section>
          <section className="card p-3 text-xs">
            <p className="label mb-1">데이터 기준</p>
            <p>건물통합정보 {index?.asof ?? "…"} · 후보 1,918동(A 913·B 1,005) · 위반 표기 1,573 · 급경사지 47곳</p>
            <p className="mt-1"><Link href="/dashboard" className="underline"><BarChart3 className="mr-1 inline size-3" />성과</Link> · <Link href="/about" className="underline">데이터·모델 정보</Link></p>
          </section>
        </div>
      </div>
    </div>
  );
}
