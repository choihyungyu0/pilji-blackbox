"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Building, Case, CaseSurvey, FineEstimate, Stage } from "@/lib/types";
import { canAdvance } from "@/lib/stages";

/**
 * 사건(케이스) 저장소 — 담당자 업무의 단위. 기기(localStorage) 보관이 기본, 판정은 /api/verdict 로 서버 동기화 시도.
 * 모든 단계 전이는 canAdvance() 를 통과해야 한다 (BR-C1 등 법정 전제).
 * 개인정보(당사자 성명·주소·연락처)는 저장하지 않는다 (SEC-02).
 */
const now = () => new Date().toISOString();

type State = {
  cases: Record<number, Case>;
  ensure: (b: Building, origin?: Case["origin"]) => Case;
  update: (id: number, patch: Partial<Case>, action?: string) => void;
  advance: (id: number, to: Stage, action?: string) => { ok: boolean; reason?: string };
  setPlan: (ids: number[], plan: NonNullable<Case["plan"]>) => void;
  setSurvey: (id: number, survey: CaseSurvey) => void;
  setNotice: (id: number, notice: NonNullable<Case["notice"]>) => void;
  setOrder: (id: number, order: NonNullable<Case["order"]>) => void;
  setWarn: (id: number, warn: NonNullable<Case["warn"]>) => void;
  setFine: (id: number, fine: NonNullable<Case["fine"]>) => void;
  close: (id: number, reason: NonNullable<Case["closed"]>["reason"], note?: string) => void;
  reopen: (id: number) => void;
  remove: (id: number) => void;
  markSynced: (id: number, synced: boolean) => void;
};

export const useCases = create<State>()(
  persist(
    (set, get) => ({
      cases: {},
      ensure: (b, origin = "ai") => {
        const cur = get().cases[b.id];
        if (cur) return cur;
        const t = now();
        const c: Case = { id: b.id, pnu: b.pnu, stage: "CANDIDATE", origin, createdAt: t, updatedAt: t, history: [{ at: t, action: `사건 생성 (${origin === "ai" ? "AI 후보" : origin === "manual" ? "담당자 추가" : "민원"})` }] };
        set((s) => ({ cases: { ...s.cases, [b.id]: c } }));
        return c;
      },
      update: (id, patch, action) =>
        set((s) => {
          const c = s.cases[id];
          if (!c) return {};
          const t = now();
          return { cases: { ...s.cases, [id]: { ...c, ...patch, updatedAt: t, history: action ? [...c.history, { at: t, action }] : c.history } } };
        }),
      advance: (id, to, action) => {
        const c = get().cases[id];
        if (!c) return { ok: false, reason: "사건 없음" };
        const g = canAdvance(c, to);
        if (!g.ok) return g;
        get().update(id, { stage: to }, action ?? `단계 전이 → ${to}`);
        return { ok: true };
      },
      setPlan: (ids, plan) => {
        for (const id of ids) {
          const c = get().cases[id];
          if (!c) continue;
          const patch: Partial<Case> = { plan: { ...c.plan, ...plan } };
          if (c.stage === "CANDIDATE") patch.stage = "PLANNED";
          get().update(id, patch, `조사 계획 기안 (예정 ${plan.planDate ?? "미정"}, ${plan.team ?? "조사반 미정"})`);
        }
      },
      setSurvey: (id, survey) => {
        const c = get().cases[id];
        if (!c) return;
        const patch: Partial<Case> = { survey, synced: false };
        if (c.stage === "CANDIDATE" || c.stage === "PLANNED") patch.stage = "SURVEYED";
        get().update(id, patch, `현장조사 판정: ${survey.verdict}${survey.violationType ? ` · ${survey.violationType}` : ""}`);
      },
      setNotice: (id, notice) => get().update(id, { notice, stage: "NOTICED" }, `처분사전통지서 생성 (의견제출기한 ${notice.dueDate})`),
      setOrder: (id, order) => get().update(id, { order, stage: "ORDERED" }, `시정명령서 생성 (시정기한 ${order.deadline})`),
      setWarn: (id, warn) => get().update(id, { warn, stage: "WARNED" }, `이행강제금 계고서 생성 (이행기한 ${warn.deadline})`),
      setFine: (id, fine) => get().update(id, { fine, stage: "FINED" }, `이행강제금 부과 (${fine.estimate.amount == null ? "금액 미산정" : fine.estimate.amount.toLocaleString() + "원"})`),
      close: (id, reason, note) => get().update(id, { closed: { at: now(), reason, note }, stage: "CLOSED" }, `종결: ${reason}${note ? ` — ${note}` : ""}`),
      reopen: (id) => {
        const c = get().cases[id];
        if (!c || c.stage !== "CLOSED") return;
        const back: Stage = c.fine ? "FINED" : c.warn ? "WARNED" : c.order ? "ORDERED" : c.notice ? "NOTICED" : c.survey ? "SURVEYED" : c.plan ? "PLANNED" : "CANDIDATE";
        get().update(id, { closed: undefined, stage: back }, "종결 취소(재개)");
      },
      remove: (id) => set((s) => { const c = { ...s.cases }; delete c[id]; return { cases: c }; }),
      markSynced: (id, synced) => set((s) => (s.cases[id] ? { cases: { ...s.cases, [id]: { ...s.cases[id], synced } } } : {})),
    }),
    { name: "pilji-cases-v1" }
  )
);

export const emptyEstimate = (): FineEstimate => ({ basis: "80-1-1", stdPricePerM2: null, stdPriceTotal: null, area: null, ratio: 100, halved: false, aggravated: false, reduction: 0, amount: null, formula: "" });

/** 판정 맵 (지도 색·집계용) — survey.verdict 만 꺼낸다 */
export function verdictMap(cases: Record<number, Case>): Record<number, { verdict: CaseSurvey["verdict"]; at: string; memo?: string }> {
  const out: Record<number, { verdict: CaseSurvey["verdict"]; at: string; memo?: string }> = {};
  for (const c of Object.values(cases)) if (c.survey) out[c.id] = { verdict: c.survey.verdict, at: c.survey.at, memo: c.survey.findings };
  return out;
}
