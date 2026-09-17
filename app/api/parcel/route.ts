import { NextRequest, NextResponse } from "next/server";
import { buildingById, buildingsByPnu, findByJibun, DATA_ASOF } from "@/lib/data-server";
import { parseJibunQuery, jibunOf } from "@/lib/geo";
import { OFFICER_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";
import type { Building } from "@/lib/types";

export const runtime = "nodejs";

/** PCL-01 필지·건물 기본정보. 공개 모드 응답에는 점수·후보·근거값을 넣지 않는다 (BR-P1). */
const PUBLIC_DROP = ["score", "cand", "grade", "f_nbv", "f_age", "f_footratio", "f_nb50", "f_nl30"] as const;

function strip(b: Building, officer: boolean): Partial<Building> {
  if (officer) return b;
  const o: Record<string, unknown> = { ...b };
  for (const k of PUBLIC_DROP) delete o[k];
  return o as Partial<Building>;
}

export async function GET(req: NextRequest) {
  const officer = await verifySessionToken(req.cookies.get(OFFICER_COOKIE)?.value, sessionSecret());
  const sp = req.nextUrl.searchParams;
  let list: Building[] = [];
  if (sp.get("id")) {
    const b = buildingById(Number(sp.get("id")));
    list = b ? [b] : [];
  } else if (sp.get("pnu")) {
    list = buildingsByPnu(sp.get("pnu")!);
  } else if (sp.get("q")) {
    const p = parseJibunQuery(sp.get("q")!);
    if (!p) return NextResponse.json({ ok: false, error: '"박달동 139-137"처럼 입력해 주세요' }, { status: 400 });
    list = findByJibun(p.dong, jibunOf(p.bon, p.bu), p.san);
  }
  if (!list.length) return NextResponse.json({ ok: false, error: "해당 건물이 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true, asof: DATA_ASOF, source: "국토교통부 GIS건물통합정보(브이월드, CC BY)", buildings: list.map((b) => strip(b, officer)) });
}
