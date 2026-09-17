"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

export type TimelineData = {
  events: TimelineEvent[];
  notes: string[];
  nearbySlopes: { pnu: string; names: string[]; dong: string; jibun: string; d: number; lon: number; lat: number }[];
  asof: string;
};

const KIND: Record<TimelineEvent["kind"], { label: string; color: string }> = {
  building: { label: "건축", color: "bg-slate-500" },
  violation: { label: "위반", color: "bg-sig-viol" },
  disaster: { label: "재난", color: "bg-sig-slope" },
  construction: { label: "공사", color: "bg-emerald-600" },
  satellite: { label: "위성", color: "bg-sky-500" },
};

export function useTimeline(pnu: string | null) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; data: TimelineData | null; error?: string }>({ status: "idle", data: null });
  useEffect(() => {
    if (!pnu) return setState({ status: "idle", data: null });
    let alive = true;
    setState({ status: "loading", data: null });
    fetch(`/api/timeline?pnu=${pnu}`)
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!j.ok) return setState({ status: "error", data: null, error: j.error });
        setState({ status: "ready", data: j });
      })
      .catch((e) => alive && setState({ status: "error", data: null, error: String(e) }));
    return () => {
      alive = false;
    };
  }, [pnu]);
  return state;
}

/** TML-01 필지 타임라인 — 연도순, 출처·기준일 링크. CHP-01 유형 필터(P1)는 간단 칩으로 포함. */
export function Timeline({ state }: { state: ReturnType<typeof useTimeline> }) {
  const requestFlyTo = useApp((s) => s.requestFlyTo);
  const [kinds, setKinds] = useState<Set<TimelineEvent["kind"]>>(new Set());

  if (state.status === "loading") return <p className="text-xs text-muted-foreground">이력 조립 중…</p>;
  if (state.status === "error") return <p className="text-xs text-red-600">이력 조회 실패: {state.error}</p>;
  if (!state.data) return null;
  const { events, notes, asof } = state.data;
  const shown = kinds.size ? events.filter((e) => kinds.has(e.kind)) : events;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(KIND) as TimelineEvent["kind"][]).map((k) => {
          const n = events.filter((e) => e.kind === k).length;
          if (!n) return null;
          const on = kinds.has(k);
          return (
            <button
              key={k}
              onClick={() => setKinds((s) => { const n2 = new Set(s); if (on) n2.delete(k); else n2.add(k); return n2; })}
              className={cn("chip", on && "border-ink bg-ink text-white")}
            >
              <i className={cn("size-1.5 rounded-full", KIND[k].color)} /> {KIND[k].label} {n}
            </button>
          );
        })}
      </div>
      {notes.map((n) => (
        <p key={n} className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{n}</p>
      ))}
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">기록된 이력 없음 · 데이터 기준일 {asof}</p>
      ) : (
        <ol className="relative ml-2 border-l border-border pl-3">
          {shown.map((e) => (
            <li key={e.id} className="relative pb-3 last:pb-0">
              <span className={cn("absolute -left-[17px] top-1 size-2.5 rounded-full ring-2 ring-paper", KIND[e.kind].color)} />
              <p className="tnum text-[11px] text-muted-foreground">
                {e.date}
                {e.approx && <span className="ml-1 rounded bg-muted px-1 text-[10px]">대략</span>}
                {e.distanceM != null && e.distanceM > 0 && <span className="ml-1 text-[10px]">· {e.distanceM}m</span>}
              </p>
              <p className="text-xs font-semibold leading-snug">{e.title}</p>
              {e.detail && <p className="text-[11px] text-foreground/75">{e.detail}</p>}
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                출처 {e.source} · 기준 {e.asOf}
                {e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-brand underline">
                    링크 <ExternalLink className="size-2.5" />
                  </a>
                )}
                {e.lon != null && e.lat != null && (
                  <button className="ml-1 underline" onClick={() => requestFlyTo(e.lon!, e.lat!, 17)}>지도</button>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
