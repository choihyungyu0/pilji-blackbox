import type { Metadata } from "next";
import { CaseDetail } from "@/components/cases/case-detail";

export const metadata: Metadata = { title: "사건" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail id={Number(id)} />;
}
