"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { useApp } from "@/store/app-store";
import { emptyEstimate, useCases } from "@/store/cases";
import { addDays, canAdvance, daysUntil, estimateFine, fmtWon, todayISO } from "@/lib/stages";
import { caseForDoc, useDocGen } from "@/lib/client-docs";
import type { Building, Case, FineEstimate } from "@/lib/types";
import { DocCard } from "@/components/agent/doc-card";
import { cn } from "@/lib/utils";

/** 단계 전제 표시 — ok 면 초록, 아니면 잠금 + 사유 */
export function GuardNote({ g }: { g: ReturnType<typeof canAdvance> }) {
  if (g.ok) return g.warn ? <p className="flex items-start gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {g.warn}</p> : null;
  return <p className="flex items-start gap-1 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" /> {g.reason}</p>;
}

const DateRecord = ({ label, value, onChange, hint }: { label: string; value?: string; onChange: (v: string) => void; hint?: string }) => (
  <label className="flex flex-wrap items-center gap-1.5 text-[11px]">
    <span className="w-24 text-muted-foreground">{label}</span>
    <input type="date" className="input h-7 text-[11px]" value={value ?? ""} max={todayISO()} onChange={(e) => onChange(e.target.value)} />
    {value ? <CheckCircle2 className="size-3.5 text-green-600" /> : <span className="text-amber-800">{hint ?? "발송 후 기록"}</span>}
  </label>
);

// ───────────────────────────────────────────── 사전통지
export function NoticePanel({ c, b }: { c: Case; b: Building }) {
  const setNotice = useCases((s) => s.setNotice);
  const update = useCases((s) => s.update);
  const { doc, busy, gen } = useDocGen();
  const [dueDays, setDueDays] = useState(10);
  const [content, setContent] = useState(c.notice?.content ?? "");
  const g = canAdvance(c, "NOTICED");
  const done = Boolean(c.notice);

  async function make() {
    const d = await gen({ template: "prior_notice", case: caseForDoc(c), dueDays, content });
    if (!d) return;
    if (!done) setNotice(c.id, { generatedAt: new Date().toISOString(), dueDate: d.tokens.DUE_DATE, content: content || d.tokens.CONTENT });
  }
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">행정절차법 21조① 기재사항(별지 8호서식) — 당사자 성명·주소는 시스템이 채우지 않음. 의견제출기한은 10일 이상(21조③).</p>
      <GuardNote g={g} />
      {(g.ok || done) && (
        <>
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            <span className="text-muted-foreground">의견제출 기한</span>
            <div className="flex items-center gap-1"><input type="number" min={10} max={30} className="input h-8 w-20 text-xs" value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} /> 일 → {addDays(todayISO(), Math.max(10, dueDays))}</div>
          </div>
          <textarea className="input h-16 w-full py-1.5 text-xs" placeholder="처분하고자 하는 내용 (예: 옥상 무단 증축 부분 철거 및 원상복구) — 비우면 '담당자 확정 필요'로 표기" value={content} onChange={(e) => setContent(e.target.value)} />
          <button className="btn-primary h-8" disabled={busy} onClick={make}>{busy ? "생성 중…" : done ? "사전통지서 다시 생성" : "처분사전통지서 생성 → 사전통지 단계"}</button>
          {doc && <DocCard doc={doc} />}
        </>
      )}
      {done && c.notice && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <p className="font-semibold">사전통지 기록 · 의견제출기한 {c.notice.dueDate} ({daysUntil(c.notice.dueDate) >= 0 ? `${daysUntil(c.notice.dueDate)}일 남음` : `${-daysUntil(c.notice.dueDate)}일 경과`})</p>
          <DateRecord label="발송일" value={c.notice.sentAt} onChange={(v) => update(c.id, { notice: { ...c.notice!, sentAt: v } }, `사전통지서 발송 ${v}`)} />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="w-24 text-muted-foreground">의견제출 결과</span>
            {(["none", "received"] as const).map((o) => (
              <button key={o} onClick={() => update(c.id, { notice: { ...c.notice!, opinion: o } }, `의견제출 결과: ${o === "none" ? "없음" : "접수"}`)} className={cn("h-7 rounded border px-2", c.notice?.opinion === o ? "border-ink bg-ink text-white" : "border-border bg-paper")}>
                {o === "none" ? "기한 내 의견 없음" : "의견 제출됨"}
              </button>
            ))}
          </div>
          {c.notice.opinion === "received" && (
            <input className="input h-8 w-full text-xs" placeholder="의견 요지·검토 결과 (개인정보 제외)" value={c.notice.opinionNote ?? ""} onChange={(e) => update(c.id, { notice: { ...c.notice!, opinionNote: e.target.value } })} />
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── 시정명령
export function OrderPanel({ c }: { c: Case; b: Building }) {
  const setOrder = useCases((s) => s.setOrder);
  const update = useCases((s) => s.update);
  const { doc, busy, gen } = useDocGen();
  const [deadline, setDeadline] = useState(c.order?.deadline ?? addDays(todayISO(), 30));
  const [content, setContent] = useState(c.order?.content ?? c.notice?.content ?? "");
  const [docNo, setDocNo] = useState(c.order?.docNo ?? "");
  const g = canAdvance(c, "ORDERED");
  const done = Boolean(c.order);
  const dl = daysUntil(deadline);
  async function make() {
    const d = await gen({ template: "correction_order", case: caseForDoc(c), content, deadline });
    if (!d) return;
    if (!done) setOrder(c.id, { generatedAt: new Date().toISOString(), deadline: d.tokens.ORDER_DEADLINE, content: content || d.tokens.ORDER_CONTENT, docNo: docNo || undefined });
  }
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">건축법 79조① 시정명령 — 상당한 시정기간, 불이행 시 이행강제금(80조)·대장 기재(79조④) 안내, 불복 절차 고지(행정절차법 26조).</p>
      <GuardNote g={g} />
      {(g.ok || done) && (
        <>
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            <span className="text-muted-foreground">시정기한</span>
            <div className="flex items-center gap-1.5"><input type="date" min={todayISO()} className="input h-8 text-xs" value={deadline} onChange={(e) => setDeadline(e.target.value)} /> <span className={cn("text-[11px]", dl < 7 ? "text-amber-800" : "text-muted-foreground")}>{dl}일 — 79조① "상당한 기간" (관행 30일 내외)</span></div>
          </div>
          <textarea className="input h-16 w-full py-1.5 text-xs" placeholder="시정명령 내용 (예: 옥상 증축 부분 철거·원상복구, 창고 용도 사용 중지)" value={content} onChange={(e) => setContent(e.target.value)} />
          <input className="input h-8 w-full text-xs" placeholder="시행 문서번호 (예: 건축과-12345) — 있으면 계고서·대장에 인용" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
          <button className="btn-primary h-8" disabled={busy} onClick={make}>{busy ? "생성 중…" : done ? "시정명령서 다시 생성" : "시정명령서 생성 → 시정명령 단계"}</button>
          {doc && <DocCard doc={doc} />}
        </>
      )}
      {done && c.order && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <p className="font-semibold">시정명령 기록 · 시정기한 {c.order.deadline} ({daysUntil(c.order.deadline) >= 0 ? `${daysUntil(c.order.deadline)}일 남음` : `${-daysUntil(c.order.deadline)}일 경과`})</p>
          <DateRecord label="발송일" value={c.order.sentAt} onChange={(v) => update(c.id, { order: { ...c.order!, sentAt: v } }, `시정명령서 발송 ${v}`)} />
          <p className="text-[10px] text-muted-foreground">79조④: 시정명령 시 건축물대장에 위반내용 기재 — 건축행정시스템(세움터)에서 처리. 관리대장은 종결 단계에서 산출.</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── 이행강제금 산정
const RATIOS_1 = [
  { v: 100, label: "허가 없이 건축 100%" },
  { v: 70, label: "신고 없이 건축 70%" },
  { v: 80, label: "건폐율 초과 80%" },
  { v: 90, label: "용적률 초과 90%" },
];
const RATIOS_2 = [
  { v: 10, label: "무단 용도변경·대수선·구조·피난 등 10%" },
  { v: 2, label: "사용승인 없이 사용 2%" },
  { v: 3, label: "그 밖의 위반 3%" },
];

export function FineCalc({ b, value, onChange }: { b: Building; c: Case; value: FineEstimate; onChange: (e: FineEstimate) => void }) {
  const set = (patch: Partial<FineEstimate>) => onChange(estimateFine({ ...value, ...patch }));
  const residential = /주택/.test(b.use ?? "");
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2 text-[11px]">
      <p className="font-semibold">이행강제금 산정 (건축법 80조① · 시행령 115조의3·별표15 · 안양시 건축 조례 37조) — 값은 담당자 입력</p>
      <div className="flex gap-1">
        {(["80-1-1", "80-1-2"] as const).map((k) => (
          <button key={k} onClick={() => set({ basis: k, ratio: k === "80-1-1" ? 100 : 10 })} className={cn("h-7 rounded border px-2", value.basis === k ? "border-ink bg-ink text-white" : "border-border bg-paper")}>
            {k === "80-1-1" ? "1호: 무허가·무신고·건폐율·용적률 (1㎡ 시가표준액×50%×면적×비율)" : "2호: 그 밖의 위반 (시가표준액×별표15 비율)"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {value.basis === "80-1-1" ? (
          <>
            <label className="block"><span className="text-muted-foreground">1㎡ 시가표준액(원) *</span><input type="number" className="input mt-0.5 h-8 w-full text-xs" value={value.stdPricePerM2 ?? ""} onChange={(e) => set({ stdPricePerM2: e.target.value === "" ? null : Number(e.target.value) })} placeholder="지방세법 시가표준액" /></label>
            <label className="block"><span className="text-muted-foreground">위반면적(㎡) *</span><input type="number" step="0.1" className="input mt-0.5 h-8 w-full text-xs" value={value.area ?? ""} onChange={(e) => set({ area: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="block sm:col-span-2"><span className="text-muted-foreground">비율(시행령 115조의3①)</span>
              <select className="input mt-0.5 h-8 w-full text-xs" value={value.ratio} onChange={(e) => set({ ratio: Number(e.target.value) })}>{RATIOS_1.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select>
            </label>
          </>
        ) : (
          <>
            <label className="block sm:col-span-2"><span className="text-muted-foreground">건축물(위반 부분) 시가표준액(원) *</span><input type="number" className="input mt-0.5 h-8 w-full text-xs" value={value.stdPriceTotal ?? ""} onChange={(e) => set({ stdPriceTotal: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="block sm:col-span-2"><span className="text-muted-foreground">비율(별표15)</span>
              <select className="input mt-0.5 h-8 w-full text-xs" value={value.ratio} onChange={(e) => set({ ratio: Number(e.target.value) })}>{RATIOS_2.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select>
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1"><input type="checkbox" checked={value.halved} onChange={(e) => set({ halved: e.target.checked })} /> 1/2 감경(60㎡ 이하 주거용 등, 조례 37조①){residential && b.gfa != null && b.gfa <= 60 ? <span className="text-green-700">· 대장 연면적 {b.gfa}㎡ 해당 가능</span> : null}</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={value.aggravated} onChange={(e) => set({ aggravated: e.target.checked })} /> 영리·상습 가중 30%(80조②, 조례 37조②, 시행령 115조의3②)</label>
        <label className="flex items-center gap-1">80조의2 감경 <select className="input h-7 text-[11px]" value={value.reduction} onChange={(e) => set({ reduction: Number(e.target.value) })}><option value={0}>없음</option><option value={0.2}>20% (농업용 500㎡ 이하)</option><option value={0.5}>50%</option><option value={0.75}>75% (상한)</option></select></label>
      </div>
      <p className="tnum rounded bg-muted px-2 py-1">산식: {value.formula || "—"} → <b>{value.amount == null ? "입력 필요" : `${fmtWon(value.amount)}원`}</b></p>
      <p className="text-[10px] text-muted-foreground">감경은 최초 시정명령일부터 1년 이내 시정한 경우만(조례 37조④). 부과 연 1회(조례 37조③), 시정 시까지 반복(80조⑤). 실제 부과액은 시가표준액 조회 후 확정.</p>
    </div>
  );
}

// ───────────────────────────────────────────── 계고
export function WarnPanel({ c, b }: { c: Case; b: Building }) {
  const setWarn = useCases((s) => s.setWarn);
  const update = useCases((s) => s.update);
  const { doc, busy, gen } = useDocGen();
  const [deadline, setDeadline] = useState(c.warn?.deadline ?? addDays(todayISO(), 15));
  const [note, setNote] = useState(c.warn?.noncomplianceNote ?? "");
  const dl = daysUntil(deadline);
  const [est, setEst] = useState<FineEstimate>(c.warn?.estimate ?? estimateFine({ ...emptyEstimate(), area: c.survey?.area ?? null, basis: c.survey?.violationType === "무단용도변경" ? "80-1-2" : "80-1-1", ratio: c.survey?.violationType === "무단용도변경" ? 10 : 100 }));
  const g = canAdvance(c, "WARNED");
  const done = Boolean(c.warn);
  async function make() {
    const draft = { ...caseForDoc(c), warn: c.warn ?? { generatedAt: new Date().toISOString(), deadline, estimate: est } };
    if (c.warn) draft.warn = { ...c.warn, estimate: est };
    const d = await gen({ template: "fine_warning", case: draft, deadline, noncomplianceNote: note });
    if (!d) return;
    if (!done) setWarn(c.id, { generatedAt: new Date().toISOString(), deadline: d.tokens.WARN_DEADLINE, estimate: est, noncomplianceNote: note || undefined });
    else update(c.id, { warn: { ...c.warn!, estimate: est, noncomplianceNote: note || c.warn!.noncomplianceNote } }, "이행강제금 산정값 갱신");
  }
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">건축법 80조③ — 부과 전 문서로 계고. 시정기한 경과·미이행 확인이 전제.</p>
      <GuardNote g={g} />
      {(g.ok || done) && (
        <>
          <FineCalc b={b} c={c} value={est} onChange={setEst} />
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            <span className="text-muted-foreground">이행 기한</span>
            <div className="flex items-center gap-1.5"><input type="date" min={todayISO()} className="input h-8 text-xs" value={deadline} onChange={(e) => setDeadline(e.target.value)} /> <span className={cn("text-[11px]", dl < 7 ? "text-amber-800" : "text-muted-foreground")}>{dl}일 — 80조① "상당한 이행기한"</span></div>
          </div>
          <input className="input h-8 w-full text-xs" placeholder="미이행 확인 근거 (예: 2026-10-20 재방문, 증축부 존치 확인·사진)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary h-8" disabled={busy} onClick={make}>{busy ? "생성 중…" : done ? "계고서 다시 생성" : "이행강제금 계고서 생성 → 계고 단계"}</button>
          {doc && <DocCard doc={doc} />}
        </>
      )}
      {done && c.warn && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <p className="font-semibold">계고 기록 · 이행기한 {c.warn.deadline} · 예정액 {c.warn.estimate.amount == null ? "미산정" : `${fmtWon(c.warn.estimate.amount)}원`}</p>
          <DateRecord label="발송일" value={c.warn.sentAt} onChange={(v) => update(c.id, { warn: { ...c.warn!, sentAt: v } }, `계고서 발송 ${v}`)} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── 부과
export function FinePanel({ c, b }: { c: Case; b: Building }) {
  const setFine = useCases((s) => s.setFine);
  const update = useCases((s) => s.update);
  const { doc, busy, gen } = useDocGen();
  const [payDays, setPayDays] = useState(30);
  const [payOrg, setPayOrg] = useState("");
  const [est, setEst] = useState<FineEstimate>(c.fine?.estimate ?? c.warn?.estimate ?? emptyEstimate());
  const g = canAdvance(c, "FINED");
  const done = Boolean(c.fine);
  async function make() {
    const draft = { ...caseForDoc(c), fine: { generatedAt: new Date().toISOString(), payDue: addDays(todayISO(), payDays), estimate: est } };
    const d = await gen({ template: "fine_imposition", case: draft, payDays, payOrg });
    if (!d) return;
    if (!done) setFine(c.id, { generatedAt: new Date().toISOString(), payDue: d.tokens.PAY_DUE, estimate: est });
  }
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">건축법 80조④ — 금액·부과 사유·납부기한·수납기관·이의제기 방법·기관을 문서로. 안양시 조례 37조③ 연 1회.</p>
      <GuardNote g={g} />
      {(g.ok || done) && (
        <>
          <FineCalc b={b} c={c} value={est} onChange={setEst} />
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            <span className="text-muted-foreground">납부기한</span>
            <div className="flex items-center gap-1"><input type="number" min={15} max={60} className="input h-8 w-20 text-xs" value={payDays} onChange={(e) => setPayDays(Number(e.target.value))} /> 일 → {addDays(todayISO(), Math.max(15, payDays))}</div>
          </div>
          <input className="input h-8 w-full text-xs" placeholder="수납기관 (비우면 '안양시 금고 및 전 금융기관 — 고지서 기재')" value={payOrg} onChange={(e) => setPayOrg(e.target.value)} />
          <button className="btn-primary h-8" disabled={busy || est.amount == null} onClick={make}>{busy ? "생성 중…" : done ? "부과 통지 다시 생성" : "이행강제금 부과 통지 생성 → 부과 단계"}</button>
          {doc && <DocCard doc={doc} />}
        </>
      )}
      {done && c.fine && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <p className="font-semibold">부과 기록 · {fmtWon(c.fine.estimate.amount)}원 · 납부기한 {c.fine.payDue}</p>
          <DateRecord label="부과(발송)일" value={c.fine.imposedAt} onChange={(v) => update(c.id, { fine: { ...c.fine!, imposedAt: v } }, `이행강제금 부과 ${v}`)} />
          <p className="text-[10px] text-muted-foreground">미납 시 지방행정제재·부과금의 징수 등에 관한 법률에 따라 징수(80조⑦). 시정되지 않으면 다음 해 다시 계고·부과(80조⑤).</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── 종결 · 관리대장
export function ClosePanel({ c }: { c: Case; b: Building }) {
  const close = useCases((s) => s.close);
  const reopen = useCases((s) => s.reopen);
  const { doc, busy, gen } = useDocGen();
  const [reason, setReason] = useState<NonNullable<Case["closed"]>["reason"]>(c.survey?.verdict === "NORMAL" ? "정상" : c.survey?.verdict === "NOT_TARGET" ? "대상아님" : "시정완료");
  const [note, setNote] = useState("");
  const g = canAdvance(c, "CLOSED");
  const ledgerOk = c.survey?.verdict === "VIOLATION";
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">시정 완료 확인(재방문·사진) 후 종결. 위반 사건은 위반건축물관리대장(별지 29호)에 조치 이력을 옮긴다 (시행령 115조⑤).</p>
      {ledgerOk && (
        <div className="space-y-1.5">
          <button className="btn h-8" disabled={busy} onClick={() => gen({ template: "ledger", case: caseForDoc(c) })}>{busy ? "생성 중…" : "위반건축물관리대장 (HWPX/PDF)"}</button>
          {doc && <DocCard doc={doc} />}
        </div>
      )}
      {c.stage === "CLOSED" && c.closed ? (
        <div className="rounded-md border border-border p-2">
          <p className="font-semibold">종결 · {c.closed.reason} · {c.closed.at.slice(0, 10)}{c.closed.note ? ` — ${c.closed.note}` : ""}</p>
          <button className="btn btn-sm mt-1" onClick={() => reopen(c.id)}>종결 취소(재개)</button>
        </div>
      ) : (
        <>
          <GuardNote g={g} />
          {g.ok && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select className="input h-8 text-xs" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                <option value="시정완료">시정 완료 확인</option><option value="정상">정상(위반 없음)</option><option value="대상아님">대상 아님</option><option value="기타">기타</option>
              </select>
              <input className="input h-8 flex-1 text-xs" placeholder="확인 내용 (예: 2026-11-02 재방문, 증축부 철거 확인)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary h-8" onClick={() => close(c.id, reason, note)}>종결</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
