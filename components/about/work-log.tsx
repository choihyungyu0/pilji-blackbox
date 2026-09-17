"use client";

import { useApp } from "@/store/app-store";

/** TBL-03 작업 로그 (SEC-04, P1 최소 구현) — 기기 보관 300건. 담당자 모드에서만 표시. */
export function WorkLog() {
  const log = useApp((s) => s.log);
  const mode = useApp((s) => s.mode);
  if (mode !== "officer") return null;
  return (
    <section className="card p-4 text-xs">
      <h2 className="text-sm font-bold">작업 로그 (TBL-03) <span className="text-[11px] font-normal text-muted-foreground">기기 보관 · 서버 저장은 Supabase 설정 시 pb_logs</span></h2>
      {log.length === 0 ? (
        <p className="mt-1 text-muted-foreground">기록 없음</p>
      ) : (
        <table className="mt-2 w-full">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="py-1">시각</th><th className="py-1">유형</th><th className="py-1">내용</th></tr></thead>
          <tbody>
            {log.slice(0, 60).map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="tnum whitespace-nowrap py-1 pr-3">{new Date(l.at).toLocaleString("ko-KR", { hour12: false })}</td>
                <td className="py-1 pr-3">{l.kind}</td>
                <td className="py-1">{l.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
