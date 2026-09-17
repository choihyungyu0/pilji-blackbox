"use client";

import { useState } from "react";
import { FileText, FileWarning } from "lucide-react";
import { useApp } from "@/store/app-store";
import { kstDate } from "@/lib/format";
import { VERDICT_LABEL, type Building, type DocPayload } from "@/lib/types";
import { DocCard } from "./doc-card";

/**
 * BTN-04 현장조사 기안 생성 (DOC-01) · BTN-05 사전통지 초안 생성 (DOC-02, 판정=위반일 때만 BR-C1).
 * 키(OpenAI) 없이도 동작 — 값은 정적 데이터·판정에서만 온다.
 */
export function DocPanel({ selected }: { selected: Building | null }) {
  const list = useApp((s) => s.list);
  const verdict = useApp((s) => (selected ? s.verdicts[selected.id] : undefined));
  const showToast = useApp((s) => s.showToast);
  const [planDate, setPlanDate] = useState("");
  const [team, setTeam] = useState("");
  const [drafter, setDrafter] = useState("");
  const [dept, setDept] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dueDays, setDueDays] = useState(10);
  const [content, setContent] = useState("");
  const [orgAddr, setOrgAddr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [survey, setSurvey] = useState<DocPayload | null>(null);
  const [notice, setNotice] = useState<DocPayload | null>(null);

  const ids = list.length ? list.map((x) => x.id) : selected ? [selected.id] : [];
  const canNotice = Boolean(selected && verdict?.verdict === "VIOLATION");

  async function makeSurvey() {
    setBusy("survey");
    try {
      const r = await fetch("/api/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: "survey_plan", ids, planDate, team, drafter, dept, purpose }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setSurvey(j.doc);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "생성 실패", "error");
    } finally {
      setBusy(null);
    }
  }
  async function makeNotice() {
    if (!selected || !verdict) return;
    setBusy("notice");
    try {
      const r = await fetch("/api/doc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: "prior_notice", id: selected.id, verdict: verdict.verdict, memo: verdict.memo, verdictAt: verdict.at, dueDays, content, drafter, dept }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      const doc: DocPayload = j.doc;
      if (orgAddr.trim()) {
        doc.tokens.ORG_ADDR = orgAddr.trim();
        doc.checklist = doc.checklist.map((c) => (c.key === "org" ? { ...c, ok: true, note: undefined } : c));
        doc.missing = doc.checklist.filter((c) => !c.ok).map((c) => c.label);
      }
      setNotice(doc);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "생성 실패", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <section className="card p-3 text-xs">
        <p className="label">공통 입력</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <input className="input h-8 text-xs" placeholder="부서 (기본 안양시 건축과)" value={dept} onChange={(e) => setDept(e.target.value)} />
          <input className="input h-8 text-xs" placeholder="기안자 (직위만, 이름 선택)" value={drafter} onChange={(e) => setDrafter(e.target.value)} />
        </div>
      </section>

      {/* DOC-01 */}
      <section className="card p-3 text-xs">
        <div className="flex items-center justify-between">
          <p className="font-semibold"><FileText className="mr-1 inline size-3.5" /> 현장조사 계획 기안문</p>
          <span className="chip">{list.length ? `조사 목록 ${list.length}건` : selected ? "선택 필지 1건" : "대상 없음"}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <input className="input h-8 text-xs" type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} aria-label="조사 예정일" />
          <input className="input h-8 text-xs" placeholder="조사반 (예: 건축과 2인)" value={team} onChange={(e) => setTeam(e.target.value)} />
        </div>
        <textarea className="input mt-1.5 h-16 w-full py-1.5 text-xs" placeholder="목적 (비우면 자동 문안)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        <button className="btn-primary mt-2 h-8 w-full" disabled={!ids.length || busy === "survey"} onClick={makeSurvey}>
          {busy === "survey" ? "생성 중…" : "현장조사 기안 생성"}
        </button>
        {survey && <div className="mt-2"><DocCard doc={survey} /></div>}
      </section>

      {/* DOC-02 */}
      <section className="card p-3 text-xs">
        <div className="flex items-center justify-between">
          <p className="font-semibold"><FileWarning className="mr-1 inline size-3.5" /> 처분 사전통지서 초안</p>
          <span className="chip">{selected ? `${selected.dong} ${selected.jibun}` : "필지 미선택"}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selected
            ? verdict
              ? `현장 판정: ${VERDICT_LABEL[verdict.verdict]} (${kstDate(verdict.at)})`
              : "현장 판정 없음"
            : "지도 패널 → 에이전트에게 묻기, 또는 조사 목록에서 필지를 고르세요"}
        </p>
        <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-1.5">
          <label className="text-muted-foreground">의견제출 기한</label>
          <div className="flex items-center gap-1"><input className="input h-8 w-20 text-xs" type="number" min={10} max={30} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} /> 일 (10~30, 행정절차법 21조③)</div>
        </div>
        <input className="input mt-1.5 h-8 w-full text-xs" placeholder="의견제출기관 주소 (비우면 누락 경고)" value={orgAddr} onChange={(e) => setOrgAddr(e.target.value)} />
        <textarea className="input mt-1.5 h-14 w-full py-1.5 text-xs" placeholder="처분 내용 (비우면 '담당자 확정 필요' 문구 + 누락 경고)" value={content} onChange={(e) => setContent(e.target.value)} />
        <button
          className="btn-primary mt-2 h-8 w-full"
          disabled={!canNotice || busy === "notice"}
          onClick={makeNotice}
          title={canNotice ? "" : "현장 판정 후 생성 — 판정이 '위반'인 필지만 (BR-C1)"}
        >
          {busy === "notice" ? "생성 중…" : "사전통지 초안 생성"}
        </button>
        {!canNotice && <p className="mt-1 text-[10px] text-muted-foreground">판정 ≠ 위반 → 비활성. AI 점수만으로 처분 문서를 만들지 않습니다.</p>}
        {notice && <div className="mt-2"><DocCard doc={notice} /></div>}
      </section>
    </div>
  );
}
