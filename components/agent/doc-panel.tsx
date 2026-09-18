"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useCases } from "@/store/cases";
import { STAGES, STAGE_META, canAdvance, stageIndex } from "@/lib/stages";
import { caseForDoc, useDocGen } from "@/lib/client-docs";
import { VERDICT_LABEL, type Building } from "@/lib/types";
import { DocCard } from "./doc-card";
import { OrgForm } from "@/components/cases/org-form";

/**
 * 에이전트 화면 오른쪽 — 선택 사건의 단계와 지금 만들 수 있는 문서. 단계 전제가 안 맞으면 사유를 보여주고 사건 상세로 안내.
 * (문서의 발송·기한 기록은 사건 상세에서 한다 — 여기서는 초안 산출만)
 */
export function DocPanel({ selected }: { selected: Building | null }) {
  const list = useApp((s) => s.list);
  const c = useCases((s) => (selected ? s.cases[selected.id] : undefined));
  const cases = useCases((s) => s.cases);
  const { doc, busy, gen } = useDocGen();

  const listCases = list.map((x) => cases[x.id]).filter(Boolean).map((k) => caseForDoc(k!));
  const items: { key: string; label: string; enabled: boolean; why?: string; run: () => void }[] = [
    { key: "plan", label: "현장조사 계획 기안문", enabled: list.length > 0, why: list.length ? undefined : "조사 목록이 비어 있음", run: () => gen({ template: "survey_plan", ids: list.map((x) => x.id) }) },
    { key: "report", label: "현장조사 결과 보고", enabled: listCases.some((k) => k.survey), why: listCases.some((k) => k.survey) ? undefined : "판정된 사건 없음", run: () => gen({ template: "survey_report", cases: listCases }) },
  ];
  if (selected) {
    const g = (to: Parameters<typeof canAdvance>[1]) => (c ? canAdvance(c, to) : { ok: false, reason: "사건 미등록 — 조사 목록에 담거나 판정을 기록" });
    const has = (k: keyof NonNullable<typeof c>) => Boolean(c && c[k]);
    const gn = g("NOTICED"), go = g("ORDERED"), gw = g("WARNED"), gf = g("FINED");
    items.push(
      { key: "notice", label: "처분사전통지서", enabled: gn.ok || has("notice"), why: gn.ok || has("notice") ? undefined : gn.reason, run: () => c && gen({ template: "prior_notice", case: caseForDoc(c) }) },
      { key: "order", label: "시정명령서", enabled: go.ok || has("order"), why: go.ok || has("order") ? undefined : go.reason, run: () => c && gen({ template: "correction_order", case: caseForDoc(c) }) },
      { key: "warn", label: "이행강제금 계고서", enabled: has("warn"), why: has("warn") ? undefined : gw.ok ? "산정값 입력이 필요 — 사건 상세에서" : gw.reason, run: () => c && gen({ template: "fine_warning", case: caseForDoc(c) }) },
      { key: "fine", label: "이행강제금 부과 통지", enabled: has("fine") || (gf.ok && Boolean(c?.warn?.estimate.amount)), why: has("fine") || gf.ok ? undefined : gf.reason, run: () => c && gen({ template: "fine_imposition", case: caseForDoc(c) }) },
      { key: "ledger", label: "위반건축물관리대장", enabled: c?.survey?.verdict === "VIOLATION", why: c?.survey?.verdict === "VIOLATION" ? undefined : "위반 판정 사건만", run: () => c && gen({ template: "ledger", case: caseForDoc(c) }) },
    );
  }

  return (
    <div className="space-y-3">
      <OrgForm />
      <section className="card p-3 text-xs">
        <div className="flex items-center justify-between">
          <p className="font-semibold"><FileText className="mr-1 inline size-3.5" /> 문서 산출 (HWPX · PDF)</p>
          <span className="chip">{selected ? `${selected.dong} ${selected.jibun}` : "필지 미선택"}</span>
        </div>
        {selected && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {c ? <>단계 <b style={{ color: STAGE_META[c.stage].color }}>{STAGE_META[c.stage].label}</b>{c.survey ? ` · 판정 ${VERDICT_LABEL[c.survey.verdict]}` : " · 판정 없음"} · <Link href={`/cases/${c.id}`} className="underline">사건 상세 <ArrowRight className="inline size-3" /></Link></> : "사건 미등록"}
          </p>
        )}
        {c && (
          <ol className="mt-2 flex flex-wrap gap-1">
            {STAGES.map((s, i) => (
              <li key={s} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: i <= stageIndex(c.stage) ? STAGE_META[s].color : "#e5e7eb", color: i <= stageIndex(c.stage) ? "#fff" : "#6b7280" }}>{STAGE_META[s].short}</li>
            ))}
          </ol>
        )}
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-2">
              <button className="btn h-8 flex-1 justify-start" disabled={!it.enabled || busy} onClick={it.run} title={it.why}>{it.label}</button>
              {!it.enabled && <span className="max-w-[45%] truncate text-[10px] text-muted-foreground" title={it.why}>{it.why}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">단계 전제(BR-C1 등)가 안 맞으면 버튼이 잠깁니다. 발송일·기한·산정값 기록은 사건 상세에서.</p>
      </section>
      {doc && <DocCard doc={doc} />}
    </div>
  );
}
