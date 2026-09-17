import { NextRequest, NextResponse } from "next/server";
import { candidates, DATA_ASOF } from "@/lib/data-server";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";

/** INV-01 조사 목록 생성 — 담당자 전용(미들웨어). 점수 내림차순, 최대 200건. 소유자 정보 없음. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dong = sp.get("dong") || null;
  const grades = (sp.get("grades") || "A").split(",").filter((g): g is Grade => g === "A" || g === "B");
  const n = Math.max(1, Math.min(200, Number(sp.get("n") || 20)));
  const rows = candidates({ dong, grades, limit: n });
  return NextResponse.json({
    ok: true, asof: DATA_ASOF, dong, grades, n, count: rows.length,
    items: rows.map((b, i) => ({ rank: i + 1, id: b.id, pnu: b.pnu, dong: b.dong, jibun: b.jibun, san: b.san, use: b.use, year: b.year, fl_up: b.fl_up, fl_dn: b.fl_dn, score: b.score, grade: b.grade, gb: b.gb, lon: b.lon, lat: b.lat })),
  });
}
