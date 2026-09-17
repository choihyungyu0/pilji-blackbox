"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Download, Trash2, FileText, MapPin } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { DONGS, VERDICT_LABEL, type Building } from "@/lib/types";
import { fmt } from "@/lib/format";
import { VerdictEditor } from "./verdict-editor";
import { cn } from "@/lib/utils";

const MiniMap = dynamic(() => import("./mini-map").then((m) => m.MiniMap), { ssr: false });

/**
 * WF4 조사 목록 — LST-01 표(점수 내림차순) · BTN-01 CSV · SEG-02/INP-02 판정 · MAP-04 번호 핀.
 * 후보 0건 → ST-V2 "이 조건의 후보가 없어요" + 등급 완화 제안.
 */
export function InvestigateScreen() {
  const list = useApp((s) => s.list);
  const listMeta = useApp((s) => s.listMeta);
  const setList = useApp((s) => s.setList);
  const removeFromList = useApp((s) => s.removeFromList);
  const clearList = useApp((s) => s.clearList);
  const verdicts = useApp((s) => s.verdicts);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
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

  const rows = useMemo(() => {
    if (!index) return [];
    return list.map((it, i) => ({ it, i, b: index.byId.get(it.id) })).filter((r): r is { it: (typeof list)[number]; i: number; b: Building } => Boolean(r.b));
  }, [list, index]);

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
      setEmpty(auto.length === 0);
      addLog("list", `조사 목록 생성: ${dong || "전체"} ${grades} ${auto.length}건`);
      if (auto.length) showToast(`조사 목록 ${auto.length}건 생성 (점수 내림차순)`, "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "생성 실패", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    // BTN-01: 소유자 정보 없음 — PNU·지번·점수·판정만
    const head = ["순번", "PNU", "법정동", "지번", "주용도", "사용승인연도", "AI점수", "등급", "개발제한구역", "판정", "판정일시", "메모"];
    const lines = rows.map(({ i, b }) => {
      const v = verdicts[b.id];
      return [i + 1, b.pnu, b.dong, `${b.san === "산" ? "산 " : ""}${b.jibun}`, b.use ?? "정보없음", b.year ?? "정보없음", b.score == null ? "정보없음" : b.score.toFixed(4), b.grade ?? "", b.gb ? "내부" : "외부", v ? VERDICT_LABEL[v.verdict] : "", v?.at ?? "", (v?.memo ?? "").replace(/[\r\n,]/g, " ")];
    });
    const csv = "﻿" + [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `조사목록_${dong || "안양"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    addLog("list", `CSV 내보내기 ${rows.length}건`);
  }

  const pins = useMemo(() => rows.map(({ i, b }) => ({ id: b.id, lon: b.lon, lat: b.lat, label: String(i + 1), title: `${b.dong} ${b.jibun}`, verdict: verdicts[b.id]?.verdict ?? null })), [rows, verdicts]);
  const onSelect = useCallback((id: number) => setSelected(id), []);
  const stats = useMemo(() => {
    const c = { total: rows.length, VIOLATION: 0, NORMAL: 0, NOT_TARGET: 0, HOLD: 0, pending: 0 };
    for (const { b } of rows) {
      const v = verdicts[b.id]?.verdict;
      if (v) c[v]++;
      else c.pending++;
    }
    return c;
  }, [rows, verdicts]);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-3 p-3 lg:grid-cols-[1fr_380px] lg:p-4">
      <section className="min-w-0">
        <div className="card flex flex-wrap items-end gap-2 p-3">
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
                <button key={g} onClick={() => setGrades(g)} className={cn("h-9 border px-3 text-sm first:rounded-l-md last:rounded-r-md", grades === g ? "border-ink bg-ink text-white" : "border-border bg-paper")}>
                  {g === "A" ? "A만" : "A+B"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="n">건수 (1~200)</label>
            <input id="n" type="number" min={1} max={200} className="input mt-1 block h-9 w-24" value={n} onChange={(e) => setN(Number(e.target.value))} />
          </div>
          <button className="btn-primary h-9" onClick={generate} disabled={busy || status !== "ready"}>
            {busy ? "생성 중…" : "목록 생성"}
          </button>
          <div className="ml-auto flex gap-1.5">
            <button className="btn h-9" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> CSV</button>
            <Link href="/agent" className={cn("btn h-9", !rows.length && "pointer-events-none opacity-50")}><FileText className="size-4" /> 기안문 생성</Link>
            <button className="btn h-9" onClick={clearList} disabled={!list.length} title="목록 비우기"><Trash2 className="size-4" /></button>
          </div>
        </div>

        {status === "loading" && <p className="mt-3 text-xs text-muted-foreground">건물 데이터 불러오는 중…</p>}
        {empty && (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            이 조건의 후보가 없어요. {grades === "A" ? <button className="underline" onClick={() => setGrades("AB")}>A+B 등급으로 완화</button> : <button className="underline" onClick={() => setDong("")}>전체 동으로 확대</button>}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="chip">총 {stats.total}건</span>
              <span className="chip">미판정 {stats.pending}</span>
              <span className="chip text-red-800">위반 {stats.VIOLATION}</span>
              <span className="chip text-green-700">정상 {stats.NORMAL}</span>
              <span className="chip">대상아님 {stats.NOT_TARGET}</span>
              <span className="chip text-violet-700">보류 {stats.HOLD}</span>
              {listMeta.createdAt && <span className="text-muted-foreground">생성 {new Date(listMeta.createdAt).toLocaleString("ko-KR")} · 점수 내림차순 · 후보(현장 확인 전)</span>}
            </div>
            <div className="card mt-2 overflow-x-auto">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">법정동 지번</th>
                    <th className="px-2 py-2">주용도</th>
                    <th className="px-2 py-2">승인</th>
                    <th className="px-2 py-2 text-right">점수</th>
                    <th className="px-2 py-2">등급</th>
                    <th className="px-2 py-2">판정 · 메모 · 사진</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ it, i, b }) => (
                    <tr key={b.id} className={cn("border-t border-border align-top", selected === b.id && "bg-brand/5")} onClick={() => setSelected(b.id)}>
                      <td className="px-2 py-2 font-semibold tnum">{i + 1}{it.addedBy === "manual" && <span className="ml-1 text-[9px] text-muted-foreground">수동</span>}</td>
                      <td className="px-2 py-2">
                        <Link href={`/map?id=${b.id}`} className="font-semibold hover:underline">{b.dong} {b.san === "산" ? "산 " : ""}{b.jibun}</Link>
                        <p className="text-[10px] text-muted-foreground tnum">{b.pnu}{b.gb ? " · GB" : ""}</p>
                      </td>
                      <td className="px-2 py-2">{fmt.text(b.use)}</td>
                      <td className="px-2 py-2 tnum">{fmt.int(b.year)}</td>
                      <td className="px-2 py-2 text-right tnum font-semibold">{fmt.score(b.score)}</td>
                      <td className="px-2 py-2">
                        {b.grade && b.cand ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold text-white", b.grade === "A" ? "bg-sig-cand" : "bg-sig-candb")}>{b.grade}</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-2 py-2 min-w-[300px]"><VerdictEditor b={b} compact /></td>
                      <td className="px-2 py-2">
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); removeFromList(b.id); }} title="목록에서 제거"><Trash2 className="size-3" /></button>
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
