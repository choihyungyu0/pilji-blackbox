"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/app-store";

/** INP-00 담당자 비밀번호 — 5회 오류 시 60초 잠금 카운트다운 (ST-S1) */
export function PinForm({ next, autoFocus }: { next: string; autoFocus?: boolean }) {
  const router = useRouter();
  const addLog = useApp((s) => s.addLog);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lock, setLock] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lock <= 0) return;
    const t = setInterval(() => setLock((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [lock]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 6) return setErr("6자리 이상 입력");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await r.json();
      if (j.ok) {
        addLog("auth", "담당자 모드 진입");
        router.push(next);
        router.refresh();
        return;
      }
      if (j.locked) setLock(j.retryAfter ?? 60);
      setRemaining(j.remaining ?? null);
      setErr(j.error ?? "실패");
    } catch {
      setErr("서버에 연결할 수 없습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <label className="label" htmlFor="pin">
        담당자 비밀번호
      </label>
      <input
        id="pin"
        type="password"
        inputMode="text"
        autoComplete="off"
        autoFocus={autoFocus}
        className="input w-full"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        disabled={lock > 0 || busy}
        placeholder="6자리 이상"
      />
      <button className="btn-primary w-full" disabled={lock > 0 || busy}>
        {lock > 0 ? `잠금 — ${lock}초 후 재시도` : busy ? "확인 중…" : "담당자 모드로 진입"}
      </button>
      {err && (
        <p className="text-xs text-red-600" role="alert">
          {err}
          {remaining != null && remaining > 0 ? ` (남은 시도 ${remaining}회)` : ""}
        </p>
      )}
    </form>
  );
}
