"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type S = { configured: boolean; note: string; reachable?: boolean | null; tables?: boolean | null; model?: string };
type Status = { vworld: S; openai: S; supabase: S; pin: S; env: string };

/** 연동 상태 — 배포 후 환경변수가 들어갔는지 화면에서 바로 확인 (키 값은 표시하지 않음) */
export function IntegrationStatus({ compact }: { compact?: boolean }) {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  const rows: { label: string; ok: boolean | "warn"; note: string }[] = [
    { label: "브이월드 위성", ok: s.vworld.configured, note: s.vworld.note },
    { label: "담당자 PIN", ok: s.pin.configured, note: s.pin.note },
    { label: `OpenAI ${s.openai.model}`, ok: s.openai.configured, note: s.openai.note },
    { label: "Supabase", ok: s.supabase.configured ? (s.supabase.tables ? true : "warn") : false, note: s.supabase.note },
  ];
  return (
    <ul className={compact ? "space-y-0.5 text-[11px]" : "space-y-1 text-xs"}>
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-1.5">
          {r.ok === true ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" /> : r.ok === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" />}
          <span><b>{r.label}</b> <span className="text-muted-foreground">— {r.note}</span></span>
        </li>
      ))}
      <li className="text-[10px] text-muted-foreground">환경 {s.env} · 키 값은 표시하지 않습니다</li>
    </ul>
  );
}
