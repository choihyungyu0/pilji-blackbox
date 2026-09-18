"use client";

import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { useCases } from "@/store/cases";
import { useBuildings } from "@/store/buildings";
import { VERDICT_LABEL } from "@/lib/types";

type DongRow = { dong: string; n: number; nl: number; viol: number; ledger: number; cand: number; A: number; B: number; gb: number; nl_pct: number; v_pct: number | null };

/** TBL-01 동별 현황 (DSH-01) — 막대 병행. 판정 열은 기기·서버 보관 판정에서 집계, 0건이면 "-" */
export function DongTable({ rows, total }: { rows: DongRow[]; total: Record<string, number> }) {
  const cases = useCases((s) => s.cases);
  const index = useBuildings((s) => s.index);
  const mode = useApp((s) => s.mode);
  const byDong = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const k of Object.values(cases)) {
      if (!k.survey) continue;
      const dong = index?.byId.get(k.id)?.dong ?? rows.find((r) => k.pnu.startsWith(pnuPrefix(r.dong)))?.dong;
      if (!dong) continue;
      const c = m.get(dong) ?? {};
      c[k.survey.verdict] = (c[k.survey.verdict] ?? 0) + 1;
      m.set(dong, c);
    }
    return m;
  }, [cases, index, rows]);
  const maxN = Math.max(...rows.map((r) => r.n));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">법정동</th>
            <th className="px-3 py-2">건물 수</th>
            <th className="px-3 py-2">대장 미연계</th>
            <th className="px-3 py-2">위반 표기 (대장 기준)</th>
            <th className="px-3 py-2">AI 후보 (A/B)</th>
            <th className="px-3 py-2">GB 내부</th>
            <th className="px-3 py-2">판정 결과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = byDong.get(r.dong);
            return (
              <tr key={r.dong} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.dong}</td>
                <td className="px-3 py-2"><Bar v={r.n} max={maxN} label={r.n.toLocaleString()} color="#0b0b0c" /></td>
                <td className="px-3 py-2"><Bar v={r.nl_pct} max={25} label={`${r.nl.toLocaleString()} (${r.nl_pct}%)`} color="#2563eb" /></td>
                <td className="px-3 py-2"><Bar v={r.v_pct ?? 0} max={12} label={`${r.viol.toLocaleString()} (${r.v_pct ?? "정보없음"}%)`} color="#dc2626" /></td>
                <td className="px-3 py-2"><Bar v={r.cand} max={Math.max(...rows.map((x) => x.cand))} label={`${r.cand} (${r.A}/${r.B})`} color="#ea580c" /></td>
                <td className="px-3 py-2 tnum">{r.gb}</td>
                <td className="px-3 py-2">
                  {mode !== "officer" ? <span className="text-muted-foreground">담당자 모드</span> : !v ? <span className="text-muted-foreground">-</span> : (
                    <span className="flex flex-wrap gap-1">
                      {Object.entries(v).map(([k, n]) => <span key={k} className="chip">{VERDICT_LABEL[k as keyof typeof VERDICT_LABEL]} {n}</span>)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td className="px-3 py-2">합계</td>
            <td className="px-3 py-2 tnum">{rows.reduce((a, r) => a + r.n, 0).toLocaleString()}</td>
            <td className="px-3 py-2 tnum">{total.ledger_false.toLocaleString()} (14.8%)</td>
            <td className="px-3 py-2 tnum">{total.viol_Y.toLocaleString()} (6.7%)</td>
            <td className="px-3 py-2 tnum">{total.cand.toLocaleString()} ({total.A}/{total.B})</td>
            <td className="px-3 py-2 tnum">{total.gb}</td>
            <td className="px-3 py-2 tnum">{mode === "officer" ? Object.values(cases).filter((k) => k.survey).length || "-" : ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Bar({ v, max, label, color }: { v: number; max: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded bg-muted"><div className="h-2 rounded" style={{ width: `${Math.min(100, (v / (max || 1)) * 100)}%`, background: color }} /></div>
      <span className="tnum">{label}</span>
    </div>
  );
}

function pnuPrefix(dong: string) {
  return { 안양동: "4117110100", 석수동: "4117110200", 박달동: "4117110300", 비산동: "4117310100", 관양동: "4117310200", 평촌동: "4117310300", 호계동: "4117310400" }[dong] ?? "x";
}
