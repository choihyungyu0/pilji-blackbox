"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, MessageSquareText, MapPin, Trash2 } from "lucide-react";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { useApp } from "@/store/app-store";
import { STAGES, STAGE_META, stageIndex, todosOf } from "@/lib/stages";
import { caseForDoc, useDocGen } from "@/lib/client-docs";
import { fmt } from "@/lib/format";
import { VERDICT_LABEL, type Stage } from "@/lib/types";
import { Timeline, useTimeline, ParcelFacts } from "@/components/parcel/timeline";
import { ScoreCard } from "@/components/parcel/score-card";
import { DocCard } from "@/components/agent/doc-card";
import { OrgForm } from "./org-form";
import { SurveyForm } from "./survey-form";
import { ClosePanel, FinePanel, NoticePanel, OrderPanel, WarnPanel } from "./stage-panels";
import { cn } from "@/lib/utils";

/**
 * 사건 상세 — 담당자가 한 필지를 처음부터 끝까지 처리하는 화면.
 * 좌: 단계 스테퍼(후보→계획→조사→사전통지→시정명령→계고→부과→종결) + 현재 단계 입력·문서 / 우: 점수 근거·타임라인·이력.
 */
export function CaseDetail({ id }: { id: number }) {
  const index = useBuildings((s) => s.index);
  const status = useBuildings((s) => s.status);
  const load = useBuildings((s) => s.load);
  const c = useCases((s) => s.cases[id]);
  const ensure = useCases((s) => s.ensure);
  const update = useCases((s) => s.update);
  const remove = useCases((s) => s.remove);
  const addToList = useApp((s) => s.addToList);
  const inList = useApp((s) => s.list.some((x) => x.id === id));
  const [open, setOpen] = useState<Stage | null>(null);
  const b = index?.byId.get(id) ?? null;
  const tl = useTimeline(b?.pnu ?? null);
  const report = useDocGen();

  useEffect(() => {
    void load("officer");
  }, [load]);
  useEffect(() => {
    if (c && open == null) setOpen(c.stage === "CANDIDATE" ? "PLANNED" : c.stage);
  }, [c, open]);

  if (status === "loading" || !index) return <p className="p-6 text-sm text-muted-foreground">건물 데이터 불러오는 중…</p>;
  if (!b) return <p className="p-6 text-sm text-red-600">건물 {id} 없음</p>;
  if (!c)
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm">
        <p className="font-semibold">{b.dong} {b.jibun} — 아직 사건으로 등록되지 않았습니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">AI 후보({b.cand ? `${b.grade}등급` : "아님"}) · {b.use ?? "용도 정보없음"}. 등록하면 조사 계획 → 현장조사 → 처분 순서로 진행합니다.</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={() => ensure(b, b.cand ? "ai" : "manual")}>사건 등록</button>
          <button className="btn" onClick={() => ensure(b, "complaint")}>민원 접수로 등록</button>
          <Link href={`/map?id=${b.id}`} className="btn">지도</Link>
        </div>
      </div>
    );

  const cur = stageIndex(c.stage);
  const todo = todosOf([c])[0];

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-3 p-3 lg:grid-cols-[1fr_380px] lg:p-4">
      <section className="min-w-0 space-y-3">
        {/* 헤더 */}
        <div data-tour="case-head" className="card p-3">
          <div className="flex flex-wrap items-start gap-2">
            <Link href="/cases" className="btn btn-sm"><ArrowLeft className="size-3.5" /> 사건 목록</Link>
            <div className="min-w-0 flex-1">
              <p className="label">사건 · 건물 {b.id} · PNU {b.pnu} · 등록 {c.createdAt.slice(0, 10)} ({c.origin === "ai" ? "AI 후보" : c.origin === "manual" ? "담당자 추가" : "민원"})</p>
              <h1 className="text-lg font-bold">{b.dong} {b.san === "산" ? "산 " : ""}{b.jibun} <span className="block text-sm font-normal text-muted-foreground sm:inline">{fmt.text(b.use)} · {fmt.text(b.struct)} · 지상 {fmt.int(b.fl_up)}층 · 사용승인 {fmt.date(b.approve)}{b.gb ? " · 개발제한구역" : ""}</span></h1>
            </div>
            <span className="rounded-md px-2 py-1 text-xs font-bold text-white" style={{ background: STAGE_META[c.stage].color }}>{STAGE_META[c.stage].label}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {b.cand && <span className="badge-cand">{b.grade}등급 후보(현장 확인 전) · 점수 {fmt.score(b.score)}</span>}
            {c.survey && <span className="chip">현장 판정 {VERDICT_LABEL[c.survey.verdict]}{c.survey.violationType ? ` · ${c.survey.violationType}` : ""}</span>}
            {todo && <span className={cn("chip", todo.overdue ? "border-red-300 bg-red-50 text-red-800" : "text-brand")}>다음: {todo.text}{todo.due ? ` (${todo.due})` : ""}</span>}
            <span className="ml-auto flex gap-1">
              <Link href={`/map?id=${b.id}`} className="btn btn-sm"><MapPin className="size-3.5" /> 지도</Link>
              <Link href={`/agent?id=${b.id}`} className="btn btn-sm"><MessageSquareText className="size-3.5" /> 에이전트</Link>
              <button className="btn btn-sm" title="사건 삭제(기기 보관 데이터)" onClick={() => { if (confirm("이 사건 기록을 삭제할까요? (기기 보관 데이터)")) { remove(c.id); location.href = "/cases"; } }}><Trash2 className="size-3.5" /></button>
            </span>
          </div>
        </div>

        {/* 스테퍼 */}
        <ol data-tour="stepper" className="card flex overflow-x-auto p-1.5">
          {STAGES.map((s, i) => {
            const m = STAGE_META[s];
            const done = i < cur || c.stage === "CLOSED";
            const active = s === c.stage;
            const clickable = i <= cur + 1 || c.stage === "CLOSED";
            return (
              <li key={s} className="flex min-w-[96px] flex-1 items-center">
                <button
                  disabled={!clickable}
                  onClick={() => setOpen(s)}
                  className={cn("flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px]", open === s ? "bg-accent" : "hover:bg-accent/60", !clickable && "opacity-40")}
                >
                  <span className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: done || active ? m.color : "#d4d4d8" }}>{i + 1}</span>
                  <span className={cn("whitespace-nowrap", active && "font-bold")}>{m.label}</span>
                </button>
                {i < STAGES.length - 1 && <span className="h-px w-3 shrink-0 bg-border" />}
              </li>
            );
          })}
        </ol>

        <OrgForm />

        {/* 단계 패널 */}
        <div data-tour="stage-panel" className="card p-3">
          <h2 className="mb-1 text-sm font-bold">{open ? `${stageIndex(open) + 1}. ${STAGE_META[open].label}` : ""}</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">{open ? STAGE_META[open].law : ""}</p>
          {(open === "CANDIDATE" || open === "PLANNED") && (
            <div className="space-y-2 text-xs">
              <p>조사 계획은 여러 후보를 묶어 기안합니다 — 조사 목록 화면에서 동·등급·건수를 정해 기안문(HWPX/PDF)을 만들면 목록의 사건이 모두 '조사 계획' 단계가 됩니다.</p>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn" disabled={inList} onClick={() => addToList(b)}>{inList ? "조사 목록에 있음" : "조사 목록에 담기"}</button>
                <Link href="/investigate" className="btn-primary"><FileText className="size-3.5" /> 조사 목록·기안문</Link>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                <label className="block"><span className="text-[10px] text-muted-foreground">조사 예정일</span><input type="date" className="input mt-0.5 h-8 w-full text-xs" value={c.plan?.planDate ?? ""} onChange={(e) => update(c.id, { plan: { ...c.plan, planDate: e.target.value } })} /></label>
                <label className="block"><span className="text-[10px] text-muted-foreground">기안 문서번호</span><input className="input mt-0.5 h-8 w-full text-xs" placeholder="건축과-12345" value={c.plan?.docNo ?? ""} onChange={(e) => update(c.id, { plan: { ...c.plan, docNo: e.target.value } })} /></label>
                <label className="block"><span className="text-[10px] text-muted-foreground">결재 완료일</span><input type="date" className="input mt-0.5 h-8 w-full text-xs" value={c.plan?.approvedAt ?? ""} onChange={(e) => update(c.id, { plan: { ...c.plan, approvedAt: e.target.value } }, `조사 계획 결재 ${e.target.value}`)} /></label>
              </div>
            </div>
          )}
          {open === "SURVEYED" && (
            <div className="space-y-3">
              <SurveyForm b={b} />
              {c.survey && (
                <div className="space-y-1.5 border-t border-border pt-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button className="btn h-8" disabled={report.busy} onClick={() => report.gen({ template: "survey_report", cases: [caseForDoc(c)] })}>{report.busy ? "생성 중…" : "현장조사 결과 보고 (이 건, HWPX/PDF)"}</button>
                    <span className="text-[11px] text-muted-foreground">여러 건을 묶은 보고는 조사 목록 화면에서</span>
                  </div>
                  {report.doc && <DocCard doc={report.doc} />}
                </div>
              )}
            </div>
          )}
          {open === "NOTICED" && <NoticePanel c={c} b={b} />}
          {open === "ORDERED" && <OrderPanel c={c} b={b} />}
          {open === "WARNED" && <WarnPanel c={c} b={b} />}
          {open === "FINED" && <FinePanel c={c} b={b} />}
          {open === "CLOSED" && <ClosePanel c={c} b={b} />}
        </div>
      </section>

      <aside data-tour="side" className="space-y-3">
        <ScoreCard b={b} />
        {tl.data?.context && (
          <section className="card p-3">
            <ParcelFacts context={tl.data.context} compact />
          </section>
        )}
        <section className="card p-3">
          <p className="label mb-2">필지 타임라인</p>
          <Timeline state={tl} />
        </section>
        <section className="card p-3 text-xs">
          <p className="label mb-1">사건 이력</p>
          <ol className="space-y-0.5">
            {[...c.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-2"><span className="tnum shrink-0 text-muted-foreground">{new Date(h.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><span>{h.action}</span></li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
