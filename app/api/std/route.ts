import { NextRequest, NextResponse } from "next/server";
import { buildingById } from "@/lib/data-server";
import { STD_NOTE, STD_SOURCE, stdValueOf } from "@/lib/std-value";

export const runtime = "nodejs";

/** ㎡당 시가표준액 조회 (공개 데이터, 참고 산정용). ?pnu= 또는 ?id= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let pnu = sp.get("pnu");
  if (!pnu && sp.get("id")) pnu = buildingById(Number(sp.get("id")))?.pnu ?? null;
  if (!pnu) return NextResponse.json({ ok: false, error: "pnu 또는 id 필요" }, { status: 400 });
  const v = stdValueOf(pnu);
  return NextResponse.json({ ok: true, pnu, found: Boolean(v), value: v, source: STD_SOURCE, note: STD_NOTE });
}
