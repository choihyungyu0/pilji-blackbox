"use client";

import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { DONGS, type Mode } from "@/lib/types";
import { filterPredicate, isFilterActive } from "./map-style";

/** FLT-01 필터 (MAP-04): 법정동·용도·점수 구간·경과연수·개발제한구역. 건수 배지는 지도 필터와 같은 규칙. */
export function FilterPanel({ mode }: { mode: Mode }) {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const resetFilters = useApp((s) => s.resetFilters);
  const index = useBuildings((s) => s.index);
  const officer = mode === "officer";

  const count = useMemo(() => {
    if (!index) return null;
    if (!isFilterActive(filters)) return index.list.length;
    const pred = filterPredicate(filters);
    let n = 0;
    for (const b of index.list) if (pred(b)) n++;
    return n;
  }, [index, filters]);

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="label">필터</p>
        <span className="tnum rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">{count == null ? "…" : `${count.toLocaleString()}동`}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <select className="input h-8 text-xs" value={filters.dong ?? ""} onChange={(e) => setFilters({ dong: e.target.value || null })} aria-label="법정동">
          <option value="">법정동 전체</option>
          {DONGS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input h-8 text-xs" value={filters.use ?? ""} onChange={(e) => setFilters({ use: e.target.value || null })} aria-label="용도">
          <option value="">용도 전체</option>
          {index?.uses.slice(0, 14).map((u) => <option key={u.use} value={u.use}>{u.use} ({u.n.toLocaleString()})</option>)}
        </select>
      </div>
      {officer && (
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5">
          <span className="text-muted-foreground">점수</span>
          <input className="input h-8 text-xs" type="number" step="0.01" min={0} max={1} placeholder="최소" value={filters.scoreMin ?? ""} onChange={(e) => setFilters({ scoreMin: num(e.target.value) })} />
          <span className="text-muted-foreground">~</span>
          <input className="input h-8 text-xs" type="number" step="0.01" min={0} max={1} placeholder="최대" value={filters.scoreMax ?? ""} onChange={(e) => setFilters({ scoreMax: num(e.target.value) })} />
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5">
        <span className="text-muted-foreground">연수</span>
        <input className="input h-8 text-xs" type="number" min={0} max={150} placeholder="최소" value={filters.ageMin ?? ""} onChange={(e) => setFilters({ ageMin: num(e.target.value) })} />
        <span className="text-muted-foreground">~</span>
        <input className="input h-8 text-xs" type="number" min={0} max={150} placeholder="최대" value={filters.ageMax ?? ""} onChange={(e) => setFilters({ ageMax: num(e.target.value) })} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">개발제한구역</span>
        {([null, true, false] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => setFilters({ gb: v })}
            className={`h-7 rounded border px-2 text-[11px] ${filters.gb === v ? "border-ink bg-ink text-white" : "border-border bg-paper"}`}
          >
            {v === null ? "전체" : v ? "내부" : "외부"}
          </button>
        ))}
      </div>
      {officer && (
        <div className="flex flex-wrap gap-1">
          <button className="chip hover:bg-accent" onClick={() => setFilters({ scoreMin: 0.222, scoreMax: null })}>A등급만</button>
          <button className="chip hover:bg-accent" onClick={() => setFilters({ scoreMin: 0.165, scoreMax: null })}>후보(A+B)</button>
          <button className="chip hover:bg-accent" onClick={() => setFilters({ ageMin: 30 })}>30년 이상</button>
        </div>
      )}
      {count === 0 && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-900">
          조건에 맞는 건물이 없어요.{" "}
          <button className="underline" onClick={resetFilters}>필터 해제</button>
        </p>
      )}
      {isFilterActive(filters) && count !== 0 && (
        <button className="text-[11px] text-muted-foreground underline" onClick={resetFilters}>필터 해제</button>
      )}
    </div>
  );
}
