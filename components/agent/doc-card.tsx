"use client";

import { useState } from "react";
import { Download, AlertTriangle, CheckCircle2, XCircle, Printer } from "lucide-react";
import type { DocPayload } from "@/lib/types";
import { downloadHwpx } from "@/lib/hwpx";
import { useApp } from "@/store/app-store";
import { PRINT_KEY_PREFIX } from "@/components/docs/print-screen";

const TITLE: Record<DocPayload["template"], string> = {
  doc01_survey_plan: "현장조사 계획 기안문",
  doc02_prior_notice: "처분사전통지서(의견제출통지)",
  doc03_survey_report: "현장조사 결과 보고",
  doc04_correction_order: "시정명령서",
  doc05_fine_warning: "이행강제금 부과 계고서",
  doc06_fine_imposition: "이행강제금 부과 통지",
  doc07_ledger: "위반건축물관리대장",
};

/**
 * ST-D1/D2 — LST-03 필수 기재사항 체크리스트 + 워터마크 안내 + HWPX 다운로드 + PDF(인쇄) + 근거 목록.
 * 누락 1건 이상이면 산출 전 경고 모달(BR-C2). "그대로 산출" 허용(초안이므로) — 누락 항목은 한글·인쇄 화면에서 담당자가 채운다.
 */
export function DocCard({ doc, onIssued, compact }: { doc: DocPayload; onIssued?: (kind: "hwpx" | "pdf") => void; compact?: boolean }) {
  const [warn, setWarn] = useState<null | "hwpx" | "pdf">(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
  const title = TITLE[doc.template];

  async function hwpx() {
    setBusy(true);
    try {
      const size = await downloadHwpx(doc.template, doc.tokens, doc.filename);
      setDone(`HWPX ${Math.round(size / 1024)}KB · ${doc.filename}`);
      addLog("doc", `${title} HWPX (${doc.filename}, 누락 ${doc.missing.length})`);
      showToast("HWPX 생성 완료 — 한글에서 열어 확인하세요", "ok");
      onIssued?.("hwpx");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "HWPX 생성 실패", "error");
    } finally {
      setBusy(false);
      setWarn(null);
    }
  }
  function pdf() {
    const k = `${doc.template}-${Date.now()}`;
    try {
      sessionStorage.setItem(PRINT_KEY_PREFIX + k, JSON.stringify(doc));
      window.open(`/print?k=${encodeURIComponent(k)}&auto=1`, "_blank", "noopener");
      addLog("doc", `${title} PDF 인쇄 화면`);
      onIssued?.("pdf");
    } catch {
      showToast("인쇄 화면을 열 수 없습니다", "error");
    }
    setWarn(null);
  }
  const go = (kind: "hwpx" | "pdf") => (doc.missing.length ? setWarn(kind) : kind === "hwpx" ? hwpx() : pdf());

  return (
    <div className="card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label">{title}</p>
          <p className="mt-0.5 truncate font-semibold">{doc.tokens.TITLE ?? doc.tokens.DISP_TITLE}</p>
          <p className="text-[10px] text-muted-foreground">머리말 "초안 — 담당자 검토 필요" · 생성 {doc.generatedAt}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="btn h-8" disabled={busy} onClick={() => go("pdf")} title="브라우저 인쇄 → PDF 저장"><Printer className="size-3.5" /> PDF</button>
          <button className="btn-primary h-8" disabled={busy} onClick={() => go("hwpx")}><Download className="size-3.5" /> HWPX</button>
        </div>
      </div>

      {!compact && (
        <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
          {doc.checklist.map((c) => (
            <li key={c.key} className="flex items-start gap-1">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 size-3 shrink-0 text-amber-600" />}
              <span>{c.label}{c.note && <span className="text-muted-foreground"> — {c.note}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {compact && doc.missing.length > 0 && <p className="mt-1 text-[11px] text-amber-800">누락 {doc.missing.length}: {doc.missing.join(", ")}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-muted-foreground">근거 목록 {doc.evidence.length}건</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px]">{doc.evidence.map((e, i) => <li key={i}>{e}</li>)}</ol>
      </details>
      {done && <p className="mt-1 text-[11px] text-green-700">{done}</p>}

      {warn && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-paper p-4 shadow-2xl">
            <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="size-4 text-amber-600" /> 필수 기재사항 누락 {doc.missing.length}건</p>
            <ul className="mt-2 list-disc pl-5 text-sm">{doc.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-2 text-[11px] text-muted-foreground">초안 워터마크가 들어가며, 누락 항목은 한글/인쇄본에서 담당자가 직접 채웁니다 (BR-C2). 당사자 정보는 시스템이 채우지 않습니다.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn" onClick={() => setWarn(null)}>닫기</button>
              <button className="btn-primary" onClick={warn === "hwpx" ? hwpx : pdf} disabled={busy}>그대로 산출</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
