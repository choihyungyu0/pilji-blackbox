import { NextRequest, NextResponse } from "next/server";
import { allLawsBrief, searchLaws } from "@/lib/laws";

export const runtime = "nodejs";

/** AGT-02 조문 검색 (공개) */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ ok: true, items: allLawsBrief() });
  const citations = searchLaws(q, 5);
  return NextResponse.json({ ok: true, citations, message: citations.length ? null : "근거 조문 확인 필요" });
}
