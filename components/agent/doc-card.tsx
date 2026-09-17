"use client";

import { useState } from "react";
import { Download, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { DocPayload } from "@/lib/types";
import { downloadHwpx } from "@/lib/hwpx";
import { useApp } from "@/store/app-store";

/**
 * ST-D1/D2 — LST-03 필수 기재사항 체크리스트 + 워터마크 안내 + HWPX 다운로드.
 * 누락 1건 이상이면 다운로드 전 경고 모달(BR-C2). "그대로 다운로드" 허용(초안이므로), 수정은 입력 칸으로.
 */
export function DocCard({ doc, onRevise }: { doc: DocPayload; onRevise?: () => void }) {
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
  const title = doc.template === "doc01_survey_plan" ? "현장조사 계획 기안문" : "처분 사전통지서 초안";

  async function download() {
    setBusy(true);
    try {
      const size = await downloadHwpx(doc.template, doc.tokens, doc.filename);
      setDone(size);
      addLog("doc", `${title} 다운로드 (${doc.filename}, ${Math.round(size / 1024)}KB, 누락 ${doc.missing.length})`);
      showToast("HWPX 생성 완료 — 한글에서 열어 확인하세요", "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "HWPX 생성 실패", "error");
    } finally {
      setBusy(false);
      setWarn(false);
    }
  }

  return (
    <div className="card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="label">{title}</p>
          <p className="mt-0.5 font-semibold">{doc.tokens.TITLE ?? doc.tokens.DISP_TITLE}</p>
          <p className="text-[10px] text-muted-foreground">머리말 "초안 — 담당자 검토 필요" · 생성 {doc.generatedAt}</p>
        </div>
        <button className="btn-primary h-8 shrink-0" disabled={busy} onClick={() => (doc.missing.length ? setWarn(true) : download())}>
          <Download className="size-3.5" /> HWPX
        </button>
      </div>

      <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
        {doc.checklist.map((c) => (
          <li key={c.key} className="flex items-start gap-1">
            {c.ok ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 size-3 shrink-0 text-amber-600" />}
            <span>
              {c.label}
              {c.note && <span className="text-muted-foreground"> — {c.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-muted-foreground">근거 목록 {doc.evidence.length}건</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px]">
          {doc.evidence.map((e) => <li key={e}>{e}</li>)}
        </ol>
      </details>
      {done != null && <p className="mt-1 text-[11px] text-green-700">다운로드됨 · {Math.round(done / 1024)}KB · {doc.filename}</p>}

      {warn && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-paper p-4 shadow-2xl">
            <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="size-4 text-amber-600" /> 필수 기재사항 누락 {doc.missing.length}건</p>
            <ul className="mt-2 list-disc pl-5 text-sm">{doc.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-2 text-[11px] text-muted-foreground">초안 워터마크가 들어가며, 누락 항목은 한글에서 직접 채워야 합니다 (BR-C2).</p>
            <div className="mt-3 flex justify-end gap-2">
              {onRevise && <button className="btn" onClick={() => { setWarn(false); onRevise(); }}>수정</button>}
              <button className="btn" onClick={() => setWarn(false)}>닫기</button>
              <button className="btn-primary" onClick={download} disabled={busy}>그대로 다운로드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
