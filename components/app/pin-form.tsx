"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/app-store";

/**
 * INP-00 담당자 모드 진입.
 *  - 열린 모드(기본, 시연·심사용): 비밀번호 없음. 직위를 적으면(선택) 문서의 기안자 칸에 미리 들어간다. 비워도 진입.
 *  - 잠금 모드(OFFICER_PIN_REQUIRED=1): 비밀번호 6자리 이상, 5회 오류 시 60초 잠금 카운트다운 (ST-S1).
 */
export function PinForm({ next, autoFocus, locked }: { next: string; autoFocus?: boolean; locked?: boolean }) {
  const router = useRouter();
  const addLog = useApp((s) => s.addLog);
  const org = useApp((s) => s.org);
  const setOrg = useApp((s) => s.setOrg);
  const [value, setValue] = useState("");
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
    if (locked && value.length < 6) return setErr("6자리 이상 입력");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locked ? { pin: value } : {}) });
      const j = await r.json();
      if (j.ok) {
        const title = value.trim();
        if (!locked && title && !org.drafter) setOrg({ drafter: title.slice(0, 40) });
        addLog("auth", `담당자 모드 진입${!locked && title ? ` (${title.slice(0, 40)})` : ""}`);
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
      <label className="label" htmlFor="officer-entry">
        {locked ? "담당자 비밀번호" : "직위 (선택 — 아무거나, 비워도 됩니다)"}
      </label>
      <input
        id="officer-entry"
        type={locked ? "password" : "text"}
        inputMode="text"
        autoComplete="off"
        autoFocus={autoFocus}
        className="input w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={lock > 0 || busy}
        placeholder={locked ? "6자리 이상" : "예: 건축과 주무관 → 문서의 기안자 칸에 들어갑니다"}
        maxLength={locked ? 64 : 40}
      />
      <button className="btn-primary w-full" disabled={lock > 0 || busy}>
        {lock > 0 ? `잠금 — ${lock}초 후 재시도` : busy ? "진입 중…" : "담당자 모드로 진입 →"}
      </button>
      {!locked && <p className="text-[11px] text-muted-foreground">비밀번호 없이 바로 들어갑니다. 담당자 모드는 화면 구분일 뿐 접근 통제가 아니며, 실제 도입 시 시청 SSO·PIN으로 잠급니다.</p>}
      {err && (
        <p className="text-xs text-red-600" role="alert">
          {err}
          {remaining != null && remaining > 0 ? ` (남은 시도 ${remaining}회)` : ""}
        </p>
      )}
    </form>
  );
}
