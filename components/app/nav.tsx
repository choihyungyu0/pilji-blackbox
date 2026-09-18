"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LockKeyhole, LogOut, Map as MapIcon, ClipboardList, FileText, BarChart3, Database, Home, FolderKanban, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mode } from "@/lib/types";

const TABS = [
  { href: "/work", label: "업무", icon: Home, officer: true },
  { href: "/map", label: "지도", icon: MapIcon, officer: false },
  { href: "/investigate", label: "조사 계획", icon: ClipboardList, officer: true },
  { href: "/cases", label: "사건", icon: FolderKanban, officer: true },
  { href: "/agent", label: "에이전트", icon: FileText, officer: true },
  { href: "/dashboard", label: "성과", icon: BarChart3, officer: false },
  { href: "/about", label: "데이터·모델", icon: Database, officer: false },
];

export function Nav({ mode }: { mode: Mode }) {
  const path = usePathname();
  const router = useRouter();
  const officer = mode === "officer";

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-1 sm:pr-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink text-[10px] font-black text-white">필</span>
          <span className="hidden text-sm font-bold tracking-tight whitespace-nowrap min-[400px]:inline">필지 블랙박스</span>
          <span className="hidden text-[11px] text-muted-foreground lg:inline">안양시 위반건축물 우선조사·필지 이력</span>
        </Link>
        <nav className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]" aria-label="주요 화면">
          {TABS.filter((t) => !t.officer || officer).map((t) => {
            const active = path === t.href || path.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap sm:px-2.5",
                  active ? "bg-ink text-white" : "text-foreground/80 hover:bg-accent"
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            className="btn btn-sm"
            onClick={() => window.dispatchEvent(new Event("pb:tour"))}
            title="이 화면 둘러보기 (처음 사용자 안내)"
            aria-label="이 화면 둘러보기"
          >
            <CircleHelp className="size-3.5" /> <span className="hidden sm:inline">둘러보기</span>
          </button>
          <span
            className={cn("chip whitespace-nowrap", officer ? "border-brand/40 bg-brand/10 text-brand" : "text-muted-foreground")}
            title={officer ? "필지 단위 후보·판정·문서 사용 가능" : "후보는 100m 격자로만 표시 (BR-P1)"}
          >
            {officer ? "담당자" : "공개"}<span className="hidden sm:inline"> 모드</span>
          </span>
          {officer ? (
            <button className="btn btn-sm" onClick={logout} aria-label="담당자 모드 종료">
              <LogOut className="size-3.5" /> <span className="hidden sm:inline">종료</span>
            </button>
          ) : (
            <Link href="/?officer=1" className="btn btn-sm">
              <LockKeyhole className="size-3.5" /> <span className="hidden sm:inline">담당자</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
