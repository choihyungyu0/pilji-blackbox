import { NextRequest, NextResponse } from "next/server";
import { candidates, DATA_ASOF } from "@/lib/data-server";
import { ADJ_ENABLED_SERVER, adjustAndSort, serverVerdictPoints } from "@/lib/adjust/server";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";

/**
 * INV-01 조사 목록 생성 — 담당자 전용(미들웨어). 최대 200건. 소유자 정보 없음.
 * 보정 켜짐(기본): 동·등급 후보 전체를 안양 여건 보정 × 서버 판정 가중으로 정렬해 상위 n건 (C1·대상아님 제외).
 * 보정 꺼짐(NEXT_PUBLIC_ADJ_ENABLED=false): 종전처럼 기본 점수 내림차순 상위 n건.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dong = sp.get("dong") || null;
  const grades = (sp.get("grades") || "A").split(",").filter((g): g is Grade => g === "A" || g === "B");
  const n = Math.max(1, Math.min(200, Number(sp.get("n") || 20)));
  const pool = candidates({ dong, grades, limit: 200 });
  let rows: ReturnType<typeof adjustAndSort>;
  let verdictsUsed = 0;
  if (ADJ_ENABLED_SERVER) {
    const verdicts = await serverVerdictPoints();
    verdictsUsed = verdicts.length;
    rows = adjustAndSort(pool, verdicts).slice(0, n);
  } else {
    rows = adjustAndSort(pool.slice(0, n), []);
  }
  // 기본 순위 = 같은 동·등급 후보 안에서 점수 내림차순 위치
  const baseRank = new Map(pool.map((b, i) => [b.id, i + 1]));
  return NextResponse.json({
    ok: true, asof: DATA_ASOF, dong, grades, n, count: rows.length, adjusted: ADJ_ENABLED_SERVER, verdictsUsed,
    items: rows.map((r, i) => ({
      rank: i + 1, rankBase: baseRank.get(r.b.id) ?? null, id: r.b.id, pnu: r.b.pnu, dong: r.b.dong, jibun: r.b.jibun, san: r.b.san, use: r.b.use, year: r.b.year,
      fl_up: r.b.fl_up, fl_dn: r.b.fl_dn, score: r.b.score, adj: r.adj, wCtx: r.wCtx, wVerdict: r.wVerdict, codes: r.codes, grade: r.b.grade, gb: r.b.gb, lon: r.b.lon, lat: r.b.lat,
    })),
  });
}
