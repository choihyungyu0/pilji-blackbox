"use client";

import { useState } from "react";
import { useApp } from "@/store/app-store";
import { useCases } from "@/store/cases";
import type { Case, DocPayload } from "./types";

/** /api/doc 호출 — 사건·기관 정보를 붙여 문서 토큰을 받는다 */
export async function requestDoc(body: Record<string, unknown>): Promise<DocPayload> {
  const org = useApp.getState().org;
  const r = await fetch("/api/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, org }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? "문서 생성 실패");
  return j.doc as DocPayload;
}

export function useDocGen() {
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  async function gen(body: Record<string, unknown>): Promise<DocPayload | null> {
    setBusy(true);
    try {
      const d = await requestDoc(body);
      setDoc(d);
      return d;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "문서 생성 실패", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { doc, setDoc, busy, gen };
}

/** 현장 판정 서버 동기화 (INV-02) — 실패 시 기기 보관 유지 + 토스트 (ST-V3) */
export async function syncSurvey(c: Case): Promise<boolean> {
  const app = useApp.getState();
  const cases = useCases.getState();
  if (!c.survey) return false;
  try {
    const r = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, verdict: c.survey.verdict, memo: c.survey.findings ?? "", at: c.survey.at }),
    });
    const j = await r.json();
    if (r.status === 400) {
      app.showToast(j.error ?? "저장 거부", "error");
      return false;
    }
    if (j.ok) {
      cases.markSynced(c.id, true);
      app.showToast("판정 저장됨(서버)", "ok");
      return true;
    }
    app.showToast(`저장 실패, 기기에 임시 보관 (${j.reason ?? "서버"})`, "error");
    return false;
  } catch {
    app.showToast("저장 실패, 기기에 임시 보관 (네트워크)", "error");
    return false;
  }
}

/** 문서 API 에 넘길 사건 페이로드 — 사진(dataURL)은 제외 (크기·개인정보) */
export function caseForDoc(c: Case) {
  const { survey, ...rest } = c;
  return { ...rest, survey: survey ? { ...survey, photo: undefined } : undefined };
}
