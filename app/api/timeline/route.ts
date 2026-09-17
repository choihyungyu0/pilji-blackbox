import { NextRequest, NextResponse } from "next/server";
import { buildTimeline, nearbySlopes } from "@/lib/timeline";
import { buildingById, DATA_ASOF } from "@/lib/data-server";

export const runtime = "nodejs";

/** TML-01 필지 타임라인 (공개·담당자 공통 — 사고·위반 표기는 공개 데이터) */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let pnu = sp.get("pnu");
  if (!pnu && sp.get("id")) pnu = buildingById(Number(sp.get("id")))?.pnu ?? null;
  if (!pnu) return NextResponse.json({ ok: false, error: "pnu 또는 id 필요" }, { status: 400 });
  const t = buildTimeline(pnu);
  if (!t.building) return NextResponse.json({ ok: false, error: "필지를 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true, asof: DATA_ASOF, pnu, events: t.events, notes: t.notes, nearbySlopes: nearbySlopes(t.building) });
}
