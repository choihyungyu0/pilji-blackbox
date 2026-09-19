import { NextRequest, NextResponse } from "next/server";
import { listVerdicts } from "@/lib/db";
import { buildingById } from "@/lib/data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 판정 기반 재순위용 판정 좌표 목록 — 담당자 전용(미들웨어). 건물 id·판정·좌표만 (메모·개인정보 없음).
 * ?bbox=minLon,minLat,maxLon,maxLat 로 좁힐 수 있다. Supabase 미설정·실패면 빈 목록(ok:true, items:[]) — 로컬 판정만으로 계산.
 */
export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get("bbox")?.split(",").map(Number);
  const box = bbox && bbox.length === 4 && bbox.every((v) => Number.isFinite(v)) ? bbox : null;
  const r = await listVerdicts();
  const items = r.rows
    .map((v) => {
      const b = buildingById(v.building_id);
      return b ? { id: b.id, verdict: v.verdict, lon: b.lon, lat: b.lat, at: v.decided_at } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .filter((x) => !box || (x.lon >= box[0] && x.lon <= box[2] && x.lat >= box[1] && x.lat <= box[3]));
  return NextResponse.json({ ok: true, source: r.ok ? "supabase" : "none", reason: r.reason ?? null, count: items.length, items });
}
