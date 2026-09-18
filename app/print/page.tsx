import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintScreen } from "@/components/docs/print-screen";

export const metadata: Metadata = { title: "문서 인쇄(PDF)" };

/** PDF 산출 — sessionStorage 로 전달된 문서 토큰을 A4 로 그리고 인쇄 대화상자를 연다 */
export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintScreen />
    </Suspense>
  );
}
