"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DocPayload } from "@/lib/types";
import { PrintDoc, PRINT_CSS } from "./print-doc";

export const PRINT_KEY_PREFIX = "pb-print:";

export function PrintScreen() {
  const sp = useSearchParams();
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRINT_KEY_PREFIX + (sp.get("k") ?? ""));
      if (!raw) return setErr("인쇄할 문서가 없습니다 — 문서 카드의 PDF 버튼으로 다시 여세요");
      setDoc(JSON.parse(raw));
    } catch {
      setErr("문서를 읽을 수 없습니다");
    }
  }, [sp]);
  useEffect(() => {
    if (doc && sp.get("auto") === "1") setTimeout(() => window.print(), 400);
  }, [doc, sp]);
  return (
    <div className="mx-auto max-w-[200mm] bg-white px-4 py-6 text-black">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2 text-xs text-foreground">
        <span>브라우저 인쇄 → 대상 “PDF로 저장”. 여백·머리글은 인쇄 옵션에서 끄세요.</span>
        <button className="btn btn-sm ml-auto" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        <button className="btn btn-sm" onClick={() => window.close()}>닫기</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {doc && <PrintDoc template={doc.template} tokens={doc.tokens} />}
    </div>
  );
}
