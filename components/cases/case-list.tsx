"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { useApp } from "@/store/app-store";
import { STAGES, STAGE_META, todosOf, ledgerCategory, fmtWon } from "@/lib/stages";
import { VERDICT_LABEL, type Stage } from "@/lib/types";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 사건 목록 — 단계 탭·표·관리대장 CSV(별지 29호 열, 개인정보 없음) */
export function CaseList() {
  const index = useBuildings((s) => s.index);
  const load = useBuildings((s) => s.load);
  const cases = useCases((s) => s.cases);
  const addLog = useApp((s) => s.addLog);
  const [tab, setTab] = useState<Stage | "ALL" | "TODO">("ALL");
  useEffect(() => {
    void load("officer");
  }, [load]);

  const rows = useMemo(() => {
    const all = Object.values(cases);
    const todos = new Map(todosOf(all).map((t) => [t.id, t]));
    return all
      .map((c) => ({ c, b: index?.byId.get(c.id) ?? null, todo: todos.get(c.id) }))
      .filter((r) => (tab === "ALL" ? true : tab === "TODO" ? r.todo && (r.todo.overdue || r.todo.priority <= 2) : r.c.stage === tab))
      .sort((x, y) => (x.todo?.priority ?? 9) - (y.todo?.priority ?? 9) || y.c.updatedAt.localeCompare(x.c.updatedAt));
  }, [cases, index, tab]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of Object.values(cases)) m[c.stage] = (m[c.stage] ?? 0) + 1;
    return m;
  }, [cases]);

  function exportLedgerCsv() {
    const head = ["관리번호", "PNU", "대지위치", "지번", "용도구역", "주구조", "주용도", "적발일자", "위반구분", "위반유형", "위반층", "위반면적(㎡)", "변경전용도", "변경후용도", "위반내용", "현재단계", "사전통지일", "의견제출기한", "시정명령일", "시정기한", "계고일", "계고이행기한", "이행강제금(원)", "부과일", "납부기한", "종결일", "종결사유"];
    const lines = Object.values(cases).filter((c) => c.survey?.verdict === "VIOLATION").map((c) => {
      const b = index?.byId.get(c.id);
      const sv = c.survey!;
      const gu = c.pnu.startsWith("41171") ? "만안구" : "동안구";
      return [
        c.plan?.docNo || `PB-${c.pnu.slice(0, 10)}-${c.id}`, c.pnu, b ? `경기도 안양시 ${gu} ${b.dong}` : "", b ? `${b.san === "산" ? "산 " : ""}${b.jibun}` : "", b?.gb ? "개발제한구역" : "", b?.struct ?? "정보없음", b?.use ?? "정보없음",
        sv.at.slice(0, 10), ledgerCategory(sv.violationType), sv.violationType ?? "", sv.floor ?? "", sv.area ?? "", sv.useBefore ?? "", sv.useAfter ?? "", (sv.findings ?? "").replace(/[\r\n]/g, " "),
        STAGE_META[c.stage].label, c.notice?.sentAt ?? "", c.notice?.dueDate ?? "", c.order?.sentAt ?? "", c.order?.deadline ?? "", c.warn?.sentAt ?? "", c.warn?.deadline ?? "",
        c.fine?.estimate.amount ?? c.warn?.estimate.amount ?? "", c.fine?.imposedAt ?? "", c.fine?.payDue ?? "", c.closed?.at.slice(0, 10) ?? "", c.closed?.reason ?? "",
      ];
    });
    const csv = "﻿" + [head, ...lines].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `위반건축물관리대장_안양_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    addLog("doc", `관리대장 CSV ${lines.length}건`);
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 p-3 lg:p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["ALL", "TODO", ...STAGES] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("chip h-7", tab === t && "border-ink bg-ink text-white")}>
            {t === "ALL" ? `전체 ${Object.keys(cases).length}` : t === "TODO" ? "할 일" : `${STAGE_META[t].label} ${counts[t] ?? 0}`}
          </button>
        ))}
        <span className="ml-auto flex gap-1.5">
          <Link href="/investigate" className="btn h-8">조사 목록·기안</Link>
          <button className="btn h-8" onClick={exportLedgerCsv} disabled={!Object.values(cases).some((c) => c.survey?.verdict === "VIOLATION")}><Download className="size-3.5" /> 관리대장 CSV</button>
        </span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
            <tr><th className="px-2 py-2">사건</th><th className="px-2 py-2">주용도 · 점수</th><th className="px-2 py-2">단계</th><th className="px-2 py-2">판정 · 위반</th><th className="px-2 py-2">다음 할 일</th><th className="px-2 py-2">기한</th><th className="px-2 py-2">이행강제금</th><th className="px-2 py-2">갱신</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">사건이 없습니다 — 지도에서 후보를 골라 “조사 목록에 담기” 또는 조사 목록 화면에서 생성</td></tr>}
            {rows.map(({ c, b, todo }) => (
              <tr key={c.id} className="border-t border-border align-top hover:bg-accent/40">
                <td className="px-2 py-2"><Link href={`/cases/${c.id}`} className="font-semibold hover:underline">{b ? `${b.dong} ${b.san === "산" ? "산 " : ""}${b.jibun}` : c.pnu}</Link><p className="tnum text-[10px] text-muted-foreground">{c.pnu}</p></td>
                <td className="px-2 py-2">{fmt.text(b?.use)}<p className="tnum text-[10px] text-muted-foreground">{b?.cand ? `${b.grade} · ${fmt.score(b.score)}` : "후보 아님"}</p></td>
                <td className="px-2 py-2"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: STAGE_META[c.stage].color }}>{STAGE_META[c.stage].label}</span></td>
                <td className="px-2 py-2">{c.survey ? `${VERDICT_LABEL[c.survey.verdict]}${c.survey.violationType ? ` · ${c.survey.violationType}` : ""}${c.survey.area != null ? ` ${c.survey.area}㎡` : ""}` : <span className="text-muted-foreground">미조사</span>}</td>
                <td className={cn("px-2 py-2", todo?.overdue && "font-semibold text-red-700")}>{todo?.text ?? "-"}</td>
                <td className="px-2 py-2 tnum">{todo?.due ?? ""}</td>
                <td className="px-2 py-2 tnum">{c.fine?.estimate.amount != null ? `${fmtWon(c.fine.estimate.amount)}원` : c.warn?.estimate.amount != null ? `예정 ${fmtWon(c.warn.estimate.amount)}원` : ""}</td>
                <td className="px-2 py-2 tnum text-muted-foreground">{c.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">관리대장 CSV 는 건축법 시행규칙 별지 29호 항목(대지현황·위반내용·행정조치)만 담고 건축주·거주자 정보는 넣지 않습니다. 사건 기록은 기기 보관 + 판정만 서버 동기화.</p>
    </div>
  );
}
