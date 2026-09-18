import type { Metadata } from "next";
import { WorkHome } from "@/components/work/work-home";

export const metadata: Metadata = { title: "업무 홈" };

/** 담당자 업무 홈 — 담당자 전용 (미들웨어 보호) */
export default function WorkPage() {
  return <WorkHome />;
}
