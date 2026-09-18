import { cookies } from "next/headers";
import { OFFICER_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";
import { Nav } from "./nav";
import { ModeSync } from "./mode-sync";
import { Toast } from "./toast";
import { Suspense } from "react";
import { Tour, FirstVisitGate } from "./tour";
import type { Mode } from "@/lib/types";

/** 전역 틀 — 세션 쿠키로 모드를 판정해 상단 바와 스토어에 넘긴다 (SEC-01). */
export async function Shell({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const officer = await verifySessionToken(jar.get(OFFICER_COOKIE)?.value, sessionSecret());
  const mode: Mode = officer ? "officer" : "public";
  return (
    <div className="flex min-h-dvh flex-col">
      <ModeSync mode={mode} />
      <Nav mode={mode} />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
      <Toast />
      <Suspense fallback={null}>
        <FirstVisitGate />
        <Tour />
      </Suspense>
    </div>
  );
}
