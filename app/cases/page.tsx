import type { Metadata } from "next";
import { CaseList } from "@/components/cases/case-list";

export const metadata: Metadata = { title: "사건 목록" };

export default function CasesPage() {
  return <CaseList />;
}
