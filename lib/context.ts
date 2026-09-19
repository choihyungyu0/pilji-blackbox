import "server-only";
import facilitiesJson from "@/data/derived/facilities.json";
import floodJson from "@/data/derived/flood_supplies.json";
import hjdJson from "@/data/derived/hjd.json";
import { buildingsByPnu, haversine, laws, nearby, timelineSources, excavationSources, DATA_ASOF } from "./data-server";
import type { Building, ParcelContext, ParcelFact } from "./types";

/**
 * 필지 여건 (PCL-04) — 한 필지에 대해 안양시 공공데이터·행안부·브이월드·법령을 한 번에 대조한다.
 * 타임라인은 "그 필지에서 일어난 일"만 담아서 대부분의 필지가 건물통합정보 행만 남는데, 여건은 어느 필지든
 * 행정동·수방자재·개발제한구역·급경사지·공공건축물·대피/급수시설·공동주택·착공신고·사고·이웃 위반·적용 법령을 채운다.
 * 원칙: 출처·기준일 없는 사실은 만들지 않는다(BR-T1). 거리 기반 사실은 반경을 표기한다.
 */

type Facility = {
  kind: "public_building" | "shelter" | "water" | "apartment"; name: string; address: string; source: string; asof: string;
  lon?: number; lat?: number; area?: string; capacity?: string; use?: string; acquired?: string;
  hjd?: string; built?: string | null; blocks?: string | null; units?: string | null;
};
const facilities = (facilitiesJson as { items: Facility[] }).items.filter((f) => f.lon != null && f.lat != null);
const flood = floodJson as { source: string; asof: string; rows: { hjd: string; items: Record<string, number | string> }[] };
const hjd = hjdJson as unknown as { features: { properties: { adm_nm: string; sggnm?: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } }[] };

// 행정동 이름 캐시: "경기도 안양시만안구 안양1동" → "안양1동"
const hjdFeatures = hjd.features.map((f) => ({ name: f.properties.adm_nm.split(" ").pop() ?? f.properties.adm_nm, sgg: f.properties.sggnm ?? "", geom: f.geometry }));

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(x: number, y: number, poly: number[][][]): boolean {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}
/** 행정동 (점-폴리곤). 경계 밖이면 null */
export function hjdOf(lon: number, lat: number): { name: string; sgg: string } | null {
  for (const f of hjdFeatures) {
    const polys = f.geom.type === "Polygon" ? [f.geom.coordinates as number[][][]] : (f.geom.coordinates as number[][][][]);
    if (polys.some((p) => inPolygon(lon, lat, p))) return { name: f.name, sgg: f.sgg.replace("안양시", "") };
  }
  return null;
}

const fmtM = (d: number) => `${Math.round(d)}m`;

export function buildContext(pnu: string): ParcelContext | null {
  const bs = buildingsByPnu(pnu);
  const b: Building | undefined = bs[0];
  if (!b) return null;
  const facts: ParcelFact[] = [];
  const lawIds = new Set<string>(["bldg-79", "bldg-dec-115", "bldg-80", "proc-21"]);
  const BLDG = "국토교통부 GIS건물통합정보(브이월드, CC BY)";

  // 행정동 + 수방자재
  const h = hjdOf(b.lon, b.lat);
  if (h) {
    facts.push({ key: "hjd", label: "행정동", value: `${h.sgg} ${h.name}`, source: "행정동 경계(통계청 SGIS 기반, 안양시 31개)", asof: "2026-09-17" });
    const fs = flood.rows.find((r) => r.hjd === h.name);
    if (fs) {
      const it = fs.items;
      const parts = [["수중펌프", it["수중펌프"]], ["엔진펌프", it["엔진펌프"]], ["마대", it["마대"]], ["워터댐(개)", it["워터댐(개)"]], ["발전기(대)", it["발전기(대)"]]]
        .filter(([, v]) => typeof v === "number" && v > 0)
        .map(([k, v]) => `${String(k).replace(/\(.*\)/, "")} ${v}`);
      facts.push({ key: "flood", label: "수방자재(행정동 보유)", value: parts.length ? parts.join(" · ") : "보유 수량 0", source: flood.source, asof: flood.asof, note: "침수 대응 여력 참고" });
    }
  }

  // 개발제한구역
  if (b.gb != null) {
    facts.push({ key: "gb", label: "개발제한구역", value: b.gb ? "내부 — 개발제한구역법 30조(시정명령)·30조의2(이행강제금) 병행 검토" : "외부", source: "국토교통부 브이월드 2D 데이터 API(LT_C_UD801)", asof: "2026-09-18 조회" });
    if (b.gb) { lawIds.add("gb-30"); lawIds.add("gb-30-2"); }
  }

  // 급경사지 (행안부) — 필지 일치 또는 300m
  const slopeHere = timelineSources.slopes.find((s) => s.pnu === pnu);
  const slopeNear = timelineSources.slopes.map((s) => ({ s, d: haversine(s.lon, s.lat, b.lon, b.lat) })).filter((x) => x.d <= 300).sort((x, y) => x.d - y.d)[0];
  if (slopeHere) {
    facts.push({ key: "slope", label: "급경사지", value: `이 필지 등재: ${slopeHere.names.join(", ")}`, source: slopeHere.source, asof: slopeHere.asof });
    lawIds.add("slope-dec-2");
  } else if (slopeNear) {
    facts.push({ key: "slope", label: "급경사지", value: `${fmtM(slopeNear.d)} 거리 ${slopeNear.s.names.join(", ")} (${slopeNear.s.dong} ${slopeNear.s.jibun})`, source: slopeNear.s.source, asof: slopeNear.s.asof });
    if (slopeNear.d <= 100) lawIds.add("slope-dec-2");
  } else {
    facts.push({ key: "slope", label: "급경사지", value: "반경 300m 내 등재 급경사지 없음 (공개 47곳 기준)", source: "행정안전부 급경사지 현황(공공데이터포털 15083292)", asof: "2026-06-30" });
  }

  // 사고 이력 (언론) — 필지 일치 또는 500m
  const incs = timelineSources.incidents
    .map((i) => ({ i, d: i.pnu === pnu ? 0 : i.lon != null && i.lat != null ? haversine(i.lon, i.lat, b.lon, b.lat) : null }))
    .filter((x) => x.d != null && x.d <= 500)
    .sort((x, y) => (x.d ?? 0) - (y.d ?? 0));
  if (incs.length) {
    const top = incs[0];
    facts.push({ key: "incident", label: "사고 이력(보도)", value: `${incs.length}건 · 가장 가까운: ${top.i.date} [${top.i.type}] ${top.i.title} (${top.d === 0 ? "이 필지" : fmtM(top.d ?? 0)})`, source: top.i.source, asof: top.i.date, url: top.i.url ?? undefined, note: "원인·소유 관계는 공식 미확인" });
  }

  // 안양시 공공데이터 — 공공건축물·대피시설·급수시설·공동주택 (반경)
  const near = (kind: Facility["kind"], r: number) => facilities.filter((f) => f.kind === kind).map((f) => ({ f, d: haversine(f.lon!, f.lat!, b.lon, b.lat) })).filter((x) => x.d <= r).sort((x, y) => x.d - y.d);
  const pub = near("public_building", 300);
  facts.push({
    key: "public", label: "공공건축물(반경 300m)",
    value: b.public_parcel ? `이 필지가 공공건축물 지번과 일치${pub[0] ? ` · 가장 가까운 ${pub[0].f.name}` : ""}` : pub.length ? `${pub.length}동 · 가장 가까운 ${pub[0].f.name} (${fmtM(pub[0].d)})` : "없음",
    source: "경기도 안양시_공공건축물현황(공공데이터포털 15114534)", asof: "2026-06-30",
  });
  const sh = near("shelter", 500);
  const wa = near("water", 500);
  facts.push({
    key: "civil", label: "대피·급수시설(반경 500m)",
    value: `${sh.length ? `비상대피시설 ${sh.length}곳 · 가장 가까운 ${sh[0].f.name} ${fmtM(sh[0].d)}${sh[0].f.capacity ? ` (수용 ${sh[0].f.capacity}명)` : ""}` : "비상대피시설 없음"} / ${wa.length ? `급수시설 ${wa.length}곳 · ${wa[0].f.name} ${fmtM(wa[0].d)}` : "급수시설 없음"}`,
    source: "경기도 안양시_비상대피시설 현황(3045138) · 민방위 급수시설 현황(3045178)", asof: "2025-12-26 · 2026-03-07",
  });
  const apt = near("apartment", 150);
  if (apt.length) {
    const a = apt[0];
    facts.push({
      key: "apartment", label: "공동주택 단지(반경 150m)",
      value: `${apt.length}단지 · 가장 가까운 ${a.f.name}${a.f.units ? ` ${Number(a.f.units).toLocaleString()}세대` : ""}${a.f.blocks ? ` ${a.f.blocks}개동` : ""}${a.f.built ? ` · 준공 ${a.f.built}` : ""} (${fmtM(a.d)})`,
      source: a.f.source, asof: a.f.asof, note: "80조① 단서(세대 면적 기준)·시행령 115조의3②3(세대수 증가) 검토 시 참고",
    });
  }

  // 착공신고 (안양시) — 반경 200m
  const cons = timelineSources.construction.map((c) => ({ c, d: haversine(c.lon, c.lat, b.lon, b.lat) })).filter((x) => x.d <= 200).sort((x, y) => (x.c.date < y.c.date ? 1 : -1));
  if (cons.length) {
    facts.push({ key: "construction", label: "건축착공신고(반경 200m)", value: `${cons.length}건 · 최근 ${cons[0].c.date} ${cons[0].c.use} (${fmtM(cons[0].d)})`, source: cons[0].c.source, asof: "2026-05-31" });
  }

  // 도로굴착 (안양시 API) — 반경 100m, 진행중·예정 우선
  const exc = excavationSources.excavation.items.filter((e) => e.lon != null && e.lat != null).map((e) => ({ e, d: haversine(e.lon!, e.lat!, b.lon, b.lat) })).filter((x) => x.d <= 100).sort((x, y) => x.d - y.d);
  const excActive = exc.filter((x) => x.e.status !== "완료");
  facts.push({
    key: "excavation", label: "도로굴착(반경 100m)",
    value: exc.length ? `${exc.length}건(진행중·예정 ${excActive.length}) · 가장 가까운 ${exc[0].e.name} ${exc[0].e.status} ${exc[0].e.start ?? ""}~${exc[0].e.end ?? ""} (${fmtM(exc[0].d)})` : "없음",
    source: excavationSources.excavation.source, asof: excavationSources.excavation.asof, note: excActive.length ? "현장 확인 겸행 가능 — 위험도 아님" : undefined,
  });

  // 지반침하 사고 (국토부 지하안전정보) — 반경 300m
  const subs = excavationSources.subsidence.items.filter((s) => s.lon != null && s.lat != null).map((s) => ({ s, d: s.pnu === pnu ? 0 : haversine(s.lon!, s.lat!, b.lon, b.lat) })).filter((x) => x.d <= 300).sort((x, y) => x.d - y.d);
  if (subs.length) {
    facts.push({ key: "subsidence", label: "지반침하 사고(반경 300m)", value: `${subs.length}건 · 가장 가까운 ${subs[0].s.date} ${subs[0].s.dong} ${subs[0].s.jibun} ${subs[0].s.reason} (${subs[0].d === 0 ? "이 필지" : fmtM(subs[0].d)}) · 복구 ${subs[0].s.restore || "정보없음"}`, source: excavationSources.subsidence.source, asof: excavationSources.subsidence.asof });
  }

  // 이웃 위반·대장 미연계 (건물통합정보) — 반경 100m
  const nb = nearby(b.lon, b.lat, 100).filter((x) => x.b.id !== b.id);
  const nbViol = nb.filter((x) => x.b.viol === "Y").length;
  const nbNoLedger = nb.filter((x) => !x.b.ledger).length;
  facts.push({ key: "neighbors", label: "이웃 건물(반경 100m)", value: `${nb.length}동 · 위반 표기 ${nbViol}동 · 대장 미연계 ${nbNoLedger}동`, source: BLDG, asof: DATA_ASOF });

  // 위반 표기 변화 (두 스냅숏) — 이 필지
  const ch = timelineSources.changes.items.filter((c) => c.pnu === pnu);
  if (ch.length) {
    facts.push({ key: "changes", label: "위반 표기 변화(1년)", value: ch.map((c) => (c.type === "viol_added" ? "신규 표기" : c.type === "viol_cleared" ? "표기 해제" : "건물 신규")).join(", "), source: ch[0].source, asof: timelineSources.changes.snapshots[1] });
  }

  const applicable = laws.filter((l) => lawIds.has(l.id)).map((l) => ({ id: l.id, law: l.law, article: l.article, title: l.title, url: l.url }));
  return { pnu, buildingId: b.id, facts, laws: applicable, asof: DATA_ASOF };
}
