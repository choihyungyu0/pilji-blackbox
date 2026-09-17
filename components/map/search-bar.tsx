"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useBuildings, searchJibun } from "@/store/buildings";
import type { Building } from "@/lib/types";

/** INP-01 지번 검색 (MAP-05) — "박달동 139-137". 일치 없음 → 유사 지번 3개 제안. 1초 내 이동. */
export function SearchBar() {
  const index = useBuildings((s) => s.index);
  const select = useApp((s) => s.select);
  const requestFlyTo = useApp((s) => s.requestFlyTo);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sugg, setSugg] = useState<Building[]>([]);

  function go(b: Building) {
    select(b.id);
    requestFlyTo(b.lon, b.lat);
    setSugg([]);
    setMsg(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!index) return setMsg("건물 데이터 로딩 중");
    const r = searchJibun(index, q);
    if (!r.parsed) return setMsg('"박달동 139-137"처럼 입력해 주세요');
    if (r.exact.length) return go(r.exact[0]);
    setSugg(r.suggestions);
    setMsg(r.suggestions.length ? "일치하는 지번이 없어요 — 가까운 지번" : "일치하는 지번이 없어요");
  }

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex h-9 items-center gap-1 rounded-md border border-border bg-paper/95 pl-2 pr-1 shadow-sm backdrop-blur">
        <Search className="size-4 text-muted-foreground" />
        <input
          className="h-full w-full bg-transparent text-sm outline-none"
          placeholder="지번 검색 — 박달동 139-137"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="지번 검색"
        />
        <button className="btn btn-sm">이동</button>
      </div>
      {(msg || sugg.length > 0) && (
        <div className="absolute left-0 right-0 top-10 z-20 rounded-md border border-border bg-paper p-2 text-xs shadow-lg">
          {msg && <p className="text-muted-foreground">{msg}</p>}
          {sugg.map((b) => (
            <button key={b.id} type="button" onClick={() => go(b)} className="mt-1 block w-full rounded px-2 py-1 text-left hover:bg-accent">
              {b.dong} {b.san === "산" ? "산 " : ""}{b.jibun} <span className="text-muted-foreground">· {b.use ?? "용도 정보없음"}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
