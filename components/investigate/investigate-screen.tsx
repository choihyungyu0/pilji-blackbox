"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Download, Trash2, FileText, MapPin, ClipboardCheck } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { DONGS, VERDICT_LABEL, type Building, type Case } from "@/lib/types";
import { fmt } from "@/lib/format";
import { STAGE_META } from "@/lib/stages";
import { caseForDoc, useDocGen } from "@/lib/client-docs";
import { SurveyForm } from "@/components/cases/survey-form";
import { OrgForm } from "@/components/cases/org-form";
import { DocCard } from "@/components/agent/doc-card";
import { cn } from "@/lib/utils";

const MiniMap = dynamic(() => import("./mini-map").then((m) => m.MiniMap), { ssr: false });

/**
 * WF4 조사 계획 — 담당자 업무 1단계.
 *  ① 동·등급·건수로 후보를 뽑는다(점수 내림차순) ② 현장조사 계획 기안문(HWPX/PDF)을 만들면 목록의 사건이 '조사 계획' 단계가 된다(결재)
 *  ③ 현장에서 판정을 입력한다(행마다) ④ 현장조사 결과 보고를 만든다. 개별 사건의 후속 처분은 사건 상세에서.
 */
export function InvestigateScreen() {
  const list = useApp((s) => s.list);
  const listMeta = useApp((s) => s.listMeta);
  const setList = useApp((s) => s.setList);
  const removeFromList = useApp((s) => s.removeFromList);
  const clearList = useApp((s) => s.clearList);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
  const cases = useCases((s) => s.cases);
  const ensure = useCases((s) => s.ensure);
  const setPlan = useCases((s) => s.setPlan);
  const index = useBuildings((s) => s.index);
  const status = useBuildings((s) => s.status);
  const load = useBuildings((s) => s.load);
  useEffect(() => {
    void load("officer");
  }, [load]);

  const [dong, setDong] = useState<string>(listMeta.dong ?? "박달동");
  const [grades, setGrades] = useState<"A" | "AB">(listMeta.grades.includes("B") ? "AB" : "A");
  const [n, setN] = useState<number>(listMeta.n || 10);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [team, setTeam] = useState("");
  const [purpose, setPurpose] = useState("");
  const plan = useDocGen();
  const report = useDocGen();

  type Row = { it: (typeof list)[number]; i: number; b: Building; c: Case | undefined };
  const rows = useMemo<Row[]>(() => {
    if (!index) return [];
    const out: Row[] = [];
    list.forEach((it, i) => {
      const b = index.byId.get(it.id);
      if (b) out.push({ it, i, b, c: cases[it.id] });
    });
    return out;
  }, [list, index, cases]);

  async function generate() {
    setBusy(true);
    setEmpty(false);
    try {
      const size = Math.max(1, Math.min(200, Number(n) || 20));
      const r = await fetch(`/api/candidates?dong=${encodeURIComponent(dong)}&grades=${grades === "A" ? "A" : "A,B"}&n=${size}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "생성 실패");
      const manual = list.filter((x) => x.addedBy === "manual");
      const auto = (j.items as { id: number; pnu: string; rank: number }[]).map((x) => ({ id: x.id, pnu: x.pnu, addedBy: "auto" as const, rank: x.rank }));
      const merged = [...auto, ...manual.filter((m) => !auto.some((a) => a.id === m.id))];
      setList(merged, { dong: dong || null, grades: grades === "A" ? ["A"] : ["A", "B"], n: size, createdAt: new Date().toISOString() });
      // 목록의 후보는 사건으로 등록(후보 단계)
      for (const a of auto) {
        const b = index?.byId.get(a.id);
        if (b) ensure(b, "ai");
      }
      setEmpty(auto.length === 0);
      addLog("list", `조사 목록 생성: ${dong || "전체"} ${grades} ${auto.length}건`);
      if (auto.length) showToast(`후보 ${auto.length}건 → 사건 등록(후보 단계)`, "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "생성 실패", "error");
    } finally {
      setBusy(false);
    }
  }

  async function makePlan() {
    const ids = rows.map((r) => r.b.id);
    const d = await plan.gen({ template: "survey_plan", ids, planDate, team, purpose });
    if (!d) return;
    rows.forEach((r) => ensure(r.b, r.c?.origin ?? (r.b.cand ? "ai" : "manual")));
    setPlan(ids, { planDate: planDate || undefined, team: team || undefined, batchAt: new Date().toISOString() });
    showToast(`${ids.length}건 → 조사 계획 단계 (기안문 생성)`, "ok");
  }

  async function makeReport() {
    const cs = rows.map((r) => r.c).filter(Boolean).map((c) => caseForDoc(c!));
    if (!cs.some((c) => c.survey)) return showToast("판정이 입력된 사건이 없습니다", "error");
    await report.gen({ template: "survey_report", cases: cs, team: team || listRowsTeam(rows) });
  }

  function exportCsv() {
    const head = ["순번", "PNU", "법정동", "지번", "주용도", "사용승인연도", "AI점수", "등급", "개발제한구역", "단계", "판정", "위반유형", "위반면적", "판정일시", "위반내용"];
    const lines = rows.map(({ i, b, c }) => {
      const sv = c?.survey;
      return [i + 1, b.pnu, b.dong, `${b.san === "산" ? "산 " : ""}${b.jibun}`, b.use ?? "정보없음", b.year ?? "정보없음", b.score == null ? "정보없음" : b.score.toFixed(4), b.grade ?? "", b.gb ? "내부" : "외부", c ? STAGE_META[c.stage].label : "미등록", sv ? VERDICT_LABEL[sv.verdict] : "", sv?.violationType ?? "", sv?.area ?? "", sv?.at ?? "", (sv?.findings ?? "").replace(/[\r\n,]/g, " ")];
    });
    const csv = "﻿" + [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `조사목록_${dong || "안양"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    addLog("list", `CSV 내보내기 ${rows.length}건`);
  }

  const pins = useMemo(() => rows.map(({ i, b, c }) => ({ id: b.id, lon: b.lon, lat: b.lat, label: String(i + 1), title: `${b.dong} ${b.jibun}`, verdict: c?.survey?.verdict ?? null })), [rows]);
  const onSelect = useCallback((id: number) => setSelected(id), []);
  const stats = useMemo(() => {
    const s = { total: rows.length, VIOLATION: 0, NORMAL: 0, NOT_TARGET: 0, HOLD: 0, pending: 0, planned: 0 };
    for (const { c } of rows) {
      const v = c?.survey?.verdict;
      if (v) s[v]++;
      else s.pending++;
      if (c && c.stage !== "CANDIDATE") s.planned++;
    }
    return s;
  }, [rows]);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-3 p-3 lg:grid-cols-[1fr_360px] lg:p-4">
      <section className="min-w-0 space-y-3">
        {/* ① 후보 뽑기 */}
        <div className="card p-3">
          <p className="label mb-1.5">① 조사 대상 뽑기 — AI 점수 내림차순 (건축법 79조⑤ 실태조사 대상)</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="dong">법정동</label>
              <select id="dong" className="input mt-1 block h-9" value={dong} onChange={(e) => setDong(e.target.value)}>
                <option value="">전체</option>
                {DONGS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <p className="label">등급</p>
              <div className="mt-1 flex">
                {(["A", "AB"] as const).map((g) => (
                  <button key={g} onClick={() => setGrades(g)} className={cn("h-9 border px-3 text-sm first:rounded-l-md last:rounded-r-md", grades === g ? "border-ink bg-ink text-white" : "border-border bg-paper")}>{g === "A" ? "A만" : "A+B"}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="n">건수 (1~200)</label>
              <input id="n" type="number" min={1} max={200} className="input mt-1 block h-9 w-24" value={n} onChange={(e) => setN(Number(e.target.value))} />
            </div>
            <button className="btn-primary h-9" onClick={generate} disabled={busy || status !== "ready"}>{busy ? "생성 중…" : "목록 생성"}</button>
            <div className="ml-auto flex gap-1.5">
              <button className="btn h-9" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> CSV</button>
              <button className="btn h-9" onClick={clearList} disabled={!list.length} title="목록 비우기(사건은 유지)"><Trash2 className="size-4" /></button>
            </div>
          </div>
          {empty && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">이 조건의 후보가 없어요. {grades === "A" ? <button className="underline" onClick={() => setGrades("AB")}>A+B 등급으로 완화</button> : <button className="underline" onClick={() => setDong("")}>전체 동으로 확대</button>}</p>}
        </div>

        {rows.length > 0 && (
          <>
            <OrgForm />
            {/* ② 계획 기안 */}
            <div className="card p-3">
              <p className="label mb-1.5">② 현장조사 계획 기안 — 시행령 115조② (목적·기간·대상·방법) · 결재 후 현장</p>
              <div className="grid gap-1.5 sm:grid-cols-[auto_1fr_auto]">
                <input type="date" className="input h-9 text-xs" value={planDate} onChange={(e) => setPlanDate(e.target.value)} aria-label="조사 예정일" />
                <input className="input h-9 text-xs" placeholder="조사반 (예: 건축과 주무관 2인)" value={team} onChange={(e) => setTeam(e.target.value)} />
                <button className="btn-primary h-9" disabled={plan.busy} onClick={makePlan}><FileText className="size-4" /> {plan.busy ? "생성 중…" : `기안문 생성 (${rows.length}건 → 조사 계획)`}</button>
              </div>
              <input className="input mt-1.5 h-9 w-full text-xs" placeholder="목적 (비우면 자동 문안)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              {plan.doc && <div className="mt-2"><DocCard doc={plan.doc} /></div>}
            </div>

            {/* ③ 현장조사 */}
            <div className="card overflow-x-auto">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2 text-xs">
                <span className="label">③ 현장조사 판정</span>
                <span className="chip">총 {stats.total}</span>
                <span className="chip">계획 {stats.planned}</span>
                <span className="chip">미판정 {stats.pending}</span>
                <span className="chip text-red-800">위반 {stats.VIOLATION}</span>
                <span className="chip text-green-700">정상 {stats.NORMAL}</span>
                <span className="chip">대상아님 {stats.NOT_TARGET}</span>
                <span className="chip text-violet-700">보류 {stats.HOLD}</span>
                <button className="btn btn-sm ml-auto" disabled={report.busy || stats.pending === stats.total} onClick={makeReport}><ClipboardCheck className="size-3.5" /> ④ 결과 보고 생성</button>
              </div>
              {report.doc && <div className="p-2"><DocCard doc={report.doc} /></div>}
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
                  <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">법정동 지번</th><th className="px-2 py-2">주용도</th><th className="px-2 py-2 text-right">점수</th><th className="px-2 py-2">단계</th><th className="px-2 py-2">판정 · 위반 내용 · 사진</th><th className="px-2 py-2"></th></tr>
                </thead>
                <tbody>
                  {rows.map(({ it, i, b, c }) => (
                    <tr key={b.id} className={cn("border-t border-border align-top", selected === b.id && "bg-brand/5")} onClick={() => setSelected(b.id)}>
                      <td className="px-2 py-2 font-semibold tnum">{i + 1}{it.addedBy === "manual" && <span className="ml-1 text-[9px] text-muted-foreground">수동</span>}</td>
                      <td className="px-2 py-2">
                        <Link href={`/cases/${b.id}`} className="font-semibold hover:underline">{b.dong} {b.san === "산" ? "산 " : ""}{b.jibun}</Link>
                        <p className="text-[10px] text-muted-foreground tnum">{b.pnu}{b.gb ? " · GB" : ""} · {fmt.int(b.year)}년</p>
                      </td>
                      <td className="px-2 py-2">{fmt.text(b.use)}</td>
                      <td className="px-2 py-2 text-right tnum font-semibold">{fmt.score(b.score)} {b.grade && b.cand ? <span className={cn("ml-1 rounded px-1 text-[10px] font-bold text-white", b.grade === "A" ? "bg-sig-cand" : "bg-sig-candb")}>{b.grade}</span> : null}</td>
                      <td className="px-2 py-2">{c ? <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: STAGE_META[c.stage].color }}>{STAGE_META[c.stage].label}</span> : <span className="text-muted-foreground">미등록</span>}</td>
                      <td className="min-w-[320px] px-2 py-2"><SurveyForm b={b} compact /></td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <Link href={`/cases/${b.id}`} className="btn btn-sm">상세</Link>
                          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); removeFromList(b.id); }} title="목록에서 제거"><Trash2 className="size-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {status === "ready" && rows.length === 0 && !empty && (
          <p className="mt-6 text-center text-sm text-muted-foreground">법정동·등급·건수를 고르고 목록을 생성하거나, 지도 필지 패널에서 "조사 목록에 담기"를 누르세요.</p>
        )}
      </section>

      <aside className="card relative min-h-[320px] overflow-hidden lg:sticky lg:top-16 lg:h-[calc(100dvh-5.5rem)]">
        <MiniMap pins={pins} selectedId={selected} onSelect={onSelect} />
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white"><MapPin className="mr-1 inline size-3" />번호 = 표 순번 · 위성 © 브이월드</p>
      </aside>
    </div>
  );
}

function listRowsTeam(rows: { c?: { plan?: { team?: string } } }[]) {
  return rows.find((r) => r.c?.plan?.team)?.c?.plan?.team ?? "";
}
