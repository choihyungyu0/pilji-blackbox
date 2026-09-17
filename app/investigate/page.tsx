import type { Metadata } from "next";
import { InvestigateScreen } from "@/components/investigate/investigate-screen";

export const metadata: Metadata = { title: "조사 목록" };

/** WF4 조사 목록 — 담당자 전용 (미들웨어 보호) */
export default function InvestigatePage() {
  return <InvestigateScreen />;
}
