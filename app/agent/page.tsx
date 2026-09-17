import { Suspense } from "react";
import type { Metadata } from "next";
import { AgentScreen } from "@/components/agent/agent-screen";

export const metadata: Metadata = { title: "결재 문서 · 에이전트" };

/** WF5 결재 문서 — 담당자 전용 (미들웨어 보호) */
export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentScreen />
    </Suspense>
  );
}
