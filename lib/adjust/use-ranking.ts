"use client";

import { useEffect, useMemo } from "react";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";
import { ADJ_ENABLED, mergeVerdicts, rankAll, useAdjust, type Adjusted, type VerdictPoint } from "./context";

/**
 * 화면 공용 훅 — 보정 점수·전역 순위·판정 효과.
 * 판정(로컬 사건 저장소)이 바뀌면 즉시 다시 계산되어 목록·지도·패널이 곧바로 재정렬된다.
 * 꺼져 있거나 준비 전이면 enabled=false / ready=false 로 알려 화면이 종전 그대로 그리게 한다.
 */
export function useRanking() {
  const index = useBuildings((s) => s.index);
  const cases = useCases((s) => s.cases);
  const ctx = useAdjust((s) => s.ctx);
  const status = useAdjust((s) => s.status);
  const remote = useAdjust((s) => s.remote);
  const load = useAdjust((s) => s.load);
  const loadVerdicts = useAdjust((s) => s.loadVerdicts);

  useEffect(() => {
    if (!ADJ_ENABLED) return;
    void load();
    if (index?.mode === "officer") void loadVerdicts();
  }, [load, loadVerdicts, index?.mode]);

  const local = useMemo<VerdictPoint[]>(() => {
    if (!index) return [];
    const out: VerdictPoint[] = [];
    for (const c of Object.values(cases)) {
      if (!c.survey) continue;
      const b = index.byId.get(c.id);
      if (b) out.push({ id: b.id, verdict: c.survey.verdict, lon: b.lon, lat: b.lat, at: c.survey.at, local: true });
    }
    return out;
  }, [cases, index]);

  const verdicts = useMemo(() => mergeVerdicts(remote, local), [remote, local]);
  const enabled = ADJ_ENABLED && index?.mode === "officer";
  const ready = enabled && status === "ready" && Boolean(ctx);

  const map = useMemo<Map<number, Adjusted>>(() => {
    if (!ready || !index) return new Map();
    return rankAll(index.list, ctx, verdicts);
  }, [ready, index, ctx, verdicts]);

  // 판정 반영 요약 — affected: 판정 반경 200m 안에 들어 보정 점수가 바뀐 후보 수, moved: 그로 인해 전역 순위가 바뀐 후보 수
  const summary = useMemo(() => {
    if (!ready || !index) return { verdicts: 0, affected: 0, moved: 0 };
    let affected = 0;
    for (const a of map.values()) if (a.wVerdict !== 0 || a.excludedBy === "NOT_TARGET") affected++;
    const neutral = verdicts.length ? rankAll(index.list, ctx, []) : map;
    let moved = 0;
    for (const [id, a] of map) if (a.rankAdj !== neutral.get(id)?.rankAdj) moved++;
    return { verdicts: verdicts.length, affected, moved };
  }, [ready, index, ctx, verdicts, map]);

  // 참조 안정화 — 의존하는 effect(지도 feature-state 등)가 렌더마다 돌지 않게
  return useMemo(() => ({ enabled, ready, ctx, verdicts, adjOf: (id: number) => map.get(id), summary, stats: ctx?.stats ?? null }), [enabled, ready, ctx, verdicts, map, summary]);
}
