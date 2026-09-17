"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Send, ExternalLink, Wrench, RotateCw } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import type { Citation, DocPayload, ToolCallLog } from "@/lib/types";
import { VERDICT_LABEL } from "@/lib/types";
import { DocCard } from "./doc-card";
import { DocPanel } from "./doc-panel";
import { MdLite } from "./md-lite";
import { VerdictEditor } from "@/components/investigate/verdict-editor";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; tools?: ToolCallLog[]; citations?: Citation[]; docs?: DocPayload[]; removed?: string[]; error?: boolean };

const STEPS = ["필지 조회", "이력 조립", "조문 검색", "문서 작성"];
const PRESETS = [
  "이 필지의 기본정보와 점수 근거를 정리해줘",
  "이 필지 타임라인을 출처와 함께 요약해줘",
  "위반건축물 시정명령과 이행강제금 근거 조문을 인용해줘",
  "현장조사 기안과 사전통지 초안을 만들어줘",
];

/** WF5 결재 문서 — CHT-03 에이전트 대화(도구 로그 접기) · BLK-01 근거블록 · DocPanel(BTN-04·05·LST-03) */
export function AgentScreen() {
  const sp = useSearchParams();
  const index = useBuildings((s) => s.index);
  const load = useBuildings((s) => s.load);
  const list = useApp((s) => s.list);
  const verdicts = useApp((s) => s.verdicts);
  const addLog = useApp((s) => s.addLog);
  const [selectedId, setSelectedId] = useState<number | null>(sp.get("id") ? Number(sp.get("id")) : null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void load("officer");
    fetch("/api/agent").then((r) => r.json()).then(setKeyStatus).catch(() => setKeyStatus({ configured: false, model: "" }));
  }, [load]);
  useEffect(() => {
    if (selectedId == null && list.length) setSelectedId(list[0].id);
  }, [list, selectedId]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 900);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const selected = selectedId != null ? index?.byId.get(selectedId) ?? null : null;
  const ctx = useMemo(
    () => ({
      id: selected?.id ?? null,
      pnu: selected?.pnu ?? null,
      listIds: list.map((x) => x.id),
      verdicts: Object.fromEntries(Object.values(verdicts).map((v) => [String(v.id), { verdict: v.verdict, memo: v.memo, at: v.at }])),
    }),
    [selected, list, verdicts]
  );

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setStep(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), context: ctx }),
        signal: ac.signal,
      });
      const j = await r.json();
      if (!j.ok) {
        setMsgs((m) => [...m, { role: "assistant", content: j.error ?? "실패", error: true }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: j.answer, tools: j.tools, citations: j.citations, docs: j.docs, removed: j.removed }]);
        addLog("agent", `${q.slice(0, 60)} → 도구 ${j.tools.length}회`);
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error && e.name === "AbortError" ? "취소됨" : `연결 실패: ${String(e)}`, error: true }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-3 p-3 lg:grid-cols-[1fr_420px] lg:p-4">
      <section className="flex min-h-[70dvh] flex-col">
        {/* 컨텍스트 */}
        <div className="card flex flex-wrap items-center gap-2 p-2.5 text-xs">
          <span className="label">컨텍스트</span>
          {index ? (
            <select className="input h-8 text-xs" value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)} aria-label="필지 선택">
              <option value="">필지 미선택</option>
              {(selected && !list.some((x) => x.id === selected.id) ? [{ id: selected.id, pnu: selected.pnu }, ...list] : list).map((it) => {
                const b = index.byId.get(it.id);
                return b ? <option key={it.id} value={it.id}>{b.dong} {b.jibun} {verdicts[b.id] ? `· ${VERDICT_LABEL[verdicts[b.id].verdict]}` : ""}</option> : null;
              })}
            </select>
          ) : (
            <span className="text-muted-foreground">건물 데이터 로딩…</span>
          )}
          <span className="chip">조사 목록 {list.length}건</span>
          {selected && <Link href={`/map?id=${selected.id}`} className="chip hover:bg-accent">지도에서 보기</Link>}
          {keyStatus && (
            <span className={cn("chip ml-auto", keyStatus.configured ? "text-green-700" : "text-amber-800")}>
              {keyStatus.configured ? `LLM ${keyStatus.model}` : "OPENAI_API_KEY 필요 — 대화 비활성"}
            </span>
          )}
        </div>
        {selected && (
          <div className="card mt-2 p-2.5 text-xs">
            <p className="font-semibold">{selected.dong} {selected.san === "산" ? "산 " : ""}{selected.jibun} <span className="font-normal text-muted-foreground">· {selected.use ?? "용도 정보없음"} · 점수 {selected.score == null ? "대상 아님" : selected.score.toFixed(3)} {selected.grade && selected.cand ? `(${selected.grade}등급 후보)` : ""}</span></p>
            <div className="mt-1.5"><VerdictEditor b={selected} compact /></div>
          </div>
        )}

        {/* 대화 */}
        <div className="card mt-2 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <div className="text-xs text-muted-foreground">
                <p>도구: parcel_lookup · timeline_build · signal_score · rules_rag · doc_render · doc_check · change_detect(미적재) · cctv_nearby(미적재)</p>
                <p className="mt-1">답변의 수치는 도구 결과에 있는 값만 남깁니다(BR-A1). 도구 실패는 답변에 그대로 표시합니다(BR-A2).</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button key={p} className="chip hover:bg-accent" onClick={() => send(p)} disabled={!keyStatus?.configured}>{p}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("max-w-[92%] text-sm", m.role === "user" ? "ml-auto" : "")}>
                <div className={cn("rounded-lg px-3 py-2 leading-relaxed", m.role === "user" ? "whitespace-pre-wrap bg-ink text-white" : m.error ? "whitespace-pre-wrap bg-red-50 text-red-800" : "bg-muted")}>
                  {m.role === "assistant" && !m.error ? <MdLite text={m.content} /> : m.content}
                </div>
                {m.tools && m.tools.length > 0 && (
                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground"><Wrench className="mr-1 inline size-3" />도구 호출 {m.tools.length}회 · 실패 {m.tools.filter((t) => !t.ok).length}</summary>
                    <ul className="mt-1 space-y-0.5 rounded bg-paper p-2 font-mono">
                      {m.tools.map((t, k) => (
                        <li key={k} className={t.ok ? "" : "text-red-700"}>
                          {t.ok ? "✓" : "✗"} {t.name}({JSON.stringify(t.args).slice(0, 80)}) → {t.note} · {t.ms}ms
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {m.citations.map((c) => (
                      <blockquote key={c.id} className="rounded border-l-2 border-brand bg-brand/5 px-2 py-1 text-[11px]">
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">{c.law} {c.article}({c.title}) <ExternalLink className="inline size-2.5" /></a>
                        <p className="mt-0.5 text-foreground/80">{c.excerpt}</p>
                      </blockquote>
                    ))}
                  </div>
                )}
                {m.docs?.map((d, k) => <div key={k} className="mt-1.5"><DocCard doc={d} /></div>)}
                {m.removed && m.removed.length > 0 && (
                  <details className="mt-1 text-[10px] text-muted-foreground"><summary className="cursor-pointer">삭제된 문장 {m.removed.length}</summary><ul className="list-disc pl-4">{m.removed.map((r, k) => <li key={k}>{r}</li>)}</ul></details>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RotateCw className="size-3.5 animate-spin" />
                {STEPS.map((s, i) => <span key={s} className={cn("rounded px-1.5 py-0.5", i === step ? "bg-ink text-white" : "bg-muted")}>{s}</span>)}
                <button className="ml-2 underline" onClick={() => abortRef.current?.abort()}>취소</button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form
            className="flex gap-1.5 border-t border-border p-2"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <input
              className="input h-9 flex-1"
              placeholder={keyStatus?.configured === false ? "OPENAI_API_KEY 가 없어 대화를 쓸 수 없습니다 — 오른쪽 문서 버튼은 동작합니다" : "요청 (예: 박달동 139-137 이력과 근거 조문, 사전통지 초안)"}
              value={input}
              maxLength={1000}
              disabled={busy || keyStatus?.configured === false}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn-primary h-9" disabled={busy || !input.trim() || keyStatus?.configured === false}><Send className="size-4" /></button>
          </form>
        </div>
      </section>

      <aside className="lg:sticky lg:top-16 lg:self-start">
        <DocPanel selected={selected} />
      </aside>
    </div>
  );
}
