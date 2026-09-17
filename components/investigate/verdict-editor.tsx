"use client";

import { useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { useApp, VERDICT_ORDER } from "@/store/app-store";
import { VERDICT_LABEL, type Building, type Verdict, type VerdictRecord } from "@/lib/types";
import { findPII } from "@/lib/pii";
import { stripExifThumbnail } from "@/lib/photo";
import { cn } from "@/lib/utils";

/**
 * SEG-02 판정 + INP-02 메모·사진 (INV-02).
 * 저장: 스토어(기기) 즉시 반영 → /api/verdict 로 서버 저장 시도 → 실패 시 synced=false + 토스트 "저장 실패, 기기에 임시 보관" + 재시도 (ST-V3).
 */
export async function saveVerdict(rec: VerdictRecord): Promise<boolean> {
  const st = useApp.getState();
  st.setVerdict({ ...rec, synced: false });
  try {
    const r = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rec.id, verdict: rec.verdict, memo: rec.memo ?? "", at: rec.at }),
    });
    const j = await r.json();
    if (r.status === 400) {
      st.showToast(j.error ?? "저장 거부", "error");
      return false;
    }
    if (j.ok) {
      st.markSynced(rec.id, true);
      st.showToast("판정 저장됨", "ok");
      return true;
    }
    st.showToast(`저장 실패, 기기에 임시 보관 (${j.reason ?? "서버"})`, "error");
    return false;
  } catch {
    st.showToast("저장 실패, 기기에 임시 보관 (네트워크)", "error");
    return false;
  }
}

export function VerdictEditor({ b, compact }: { b: Building; compact?: boolean }) {
  const rec = useApp((s) => s.verdicts[b.id]);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
  const [memo, setMemo] = useState(rec?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function choose(v: Verdict) {
    const pii = findPII(memo);
    if (pii) return setErr(`개인정보는 입력할 수 없어요 (${pii})`);
    setErr(null);
    setBusy(true);
    const next: VerdictRecord = { id: b.id, pnu: b.pnu, verdict: v, memo: memo.slice(0, 500), photo: rec?.photo ?? null, at: new Date().toISOString(), synced: false };
    const ok = await saveVerdict(next);
    addLog("verdict", `${b.dong} ${b.jibun} → ${VERDICT_LABEL[v]}${ok ? "" : " (기기 보관)"}`);
    setBusy(false);
  }

  async function retry() {
    if (!rec) return;
    setBusy(true);
    await saveVerdict(rec);
    setBusy(false);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const thumb = await stripExifThumbnail(f);
      const base: VerdictRecord = rec ?? { id: b.id, pnu: b.pnu, verdict: "HOLD", at: new Date().toISOString(), synced: false };
      useApp.getState().setVerdict({ ...base, photo: thumb });
      showToast("사진 저장(EXIF 제거·축소, 기기 보관)", "ok");
    } catch (er) {
      showToast(er instanceof Error ? er.message : "사진 처리 실패", "error");
    }
  }

  return (
    <div className={cn("space-y-1.5", compact ? "text-[11px]" : "text-xs")}>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="판정">
        {VERDICT_ORDER.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={rec?.verdict === v}
            disabled={busy}
            onClick={() => choose(v)}
            className={cn(
              "h-7 rounded border px-2 font-medium",
              rec?.verdict === v
                ? v === "VIOLATION" ? "border-red-800 bg-red-800 text-white" : v === "NORMAL" ? "border-green-700 bg-green-700 text-white" : v === "NOT_TARGET" ? "border-zinc-600 bg-zinc-600 text-white" : "border-violet-700 bg-violet-700 text-white"
                : "border-border bg-paper hover:bg-accent"
            )}
          >
            {VERDICT_LABEL[v]}
          </button>
        ))}
        {rec && !rec.synced && (
          <button className="chip text-amber-800" onClick={retry} disabled={busy} title="서버 저장 재시도">
            <RefreshCw className="size-3" /> 기기 보관 · 재시도
          </button>
        )}
      </div>
      <div className="flex gap-1">
        <input
          className="input h-7 flex-1 text-[11px]"
          placeholder="메모 (소유자·연락처 등 개인정보 입력 금지, 500자)"
          value={memo}
          maxLength={500}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => rec && memo !== (rec.memo ?? "") && !findPII(memo) && saveVerdict({ ...rec, memo })}
        />
        <label className="btn btn-sm cursor-pointer" title="현장 사진 — EXIF 제거 후 256px 썸네일만 기기 보관">
          <Camera className="size-3.5" />
          <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPhoto} />
        </label>
        {rec?.photo && <img src={rec.photo} alt="현장 사진 썸네일" className="size-7 rounded object-cover" />}
      </div>
      {err && <p className="text-red-600">{err}</p>}
    </div>
  );
}
