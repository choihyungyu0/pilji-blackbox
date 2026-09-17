import "server-only";
import { buildingsByPnu, haversine, timelineSources, DATA_ASOF } from "./data-server";
import type { Building, TimelineEvent } from "./types";

const BLDG_SRC = "국토교통부 GIS건물통합정보(브이월드, CC BY)";

/**
 * TML-01 필지 타임라인 조립.
 * 규칙: BR-T1 출처·기준일 없는 이벤트 제외 / BR-T2 사고·굴착 좌표는 필지 경계 50m(대략 위치는 100m) 이내만.
 * 굴착·지반침하·위성 변화는 P1 — 데이터 미적재 시 항목을 만들지 않는다.
 */
export function buildTimeline(pnu: string): { events: TimelineEvent[]; building: Building | null; notes: string[] } {
  const bs = buildingsByPnu(pnu);
  const b = bs[0] ?? null;
  const events: TimelineEvent[] = [];
  const notes: string[] = [];
  if (!b) return { events, building: null, notes: ["해당 PNU 의 건물이 없습니다"] };

  // 사용승인 · 대장 변경 — 필지 내 모든 건물
  for (const x of bs) {
    if (x.approve) {
      events.push({
        id: `approve-${x.id}`, date: x.approve, sortDate: x.approve, kind: "building",
        title: `사용승인 (${x.use ?? "용도 정보없음"})`,
        detail: `건물 ${x.id} · 지상 ${x.fl_up ?? "정보없음"}층`,
        source: BLDG_SRC, asOf: DATA_ASOF, reliability: "공식",
      });
    }
    if (x.chg) {
      events.push({
        id: `chg-${x.id}`, date: x.chg, sortDate: x.chg, kind: "building",
        title: "건물통합정보 데이터 변경일", detail: `건물 ${x.id}`,
        source: BLDG_SRC, asOf: DATA_ASOF, reliability: "공식",
      });
    }
  }

  // 위반 표기 신규/해제 (두 스냅숏 비교, 정확한 일자 아님)
  const { snapshots, items } = timelineSources.changes;
  const range = `${snapshots[0]}~${snapshots[1]}`;
  for (const c of items) {
    if (c.pnu !== pnu) continue;
    const title =
      c.type === "viol_added" ? "위반건축물 표기 신규(N→Y)" : c.type === "viol_cleared" ? "위반건축물 표기 해제(Y→N)" : "건물 신규 등재";
    events.push({
      id: `chg-${c.type}-${c.id}`, date: `${range} 사이`, sortDate: snapshots[1], kind: c.type === "new_building" ? "building" : "violation",
      title, detail: `건물 ${c.id} · ${c.use ?? "용도 정보없음"}`, source: c.source, asOf: snapshots[1], reliability: "공식", approx: true,
    });
  }
  // 현재 위반 표기 상태
  for (const x of bs) {
    if (x.viol === "Y") {
      events.push({
        id: `viol-now-${x.id}`, date: DATA_ASOF, sortDate: DATA_ASOF, kind: "violation",
        title: "위반건축물 표기 있음(A20=Y)", detail: `건물 ${x.id} · 기준일 현재`,
        source: BLDG_SRC, asOf: DATA_ASOF, reliability: "공식",
      });
    }
  }

  // 사고 보도 — pnu 직접 매칭 또는 반경 규칙 (BR-T2)
  for (const inc of timelineSources.incidents) {
    let d: number | null = null;
    let hit = inc.pnu === pnu;
    if (!hit && inc.lon != null && inc.lat != null) {
      d = haversine(inc.lon, inc.lat, b.lon, b.lat);
      hit = d <= (inc.approx ? 100 : 50);
    }
    if (!hit) continue;
    if (!inc.source) continue; // BR-T1
    events.push({
      id: `inc-${inc.id}`, date: inc.date, sortDate: inc.date, kind: "disaster",
      title: `[${inc.type}] ${inc.title}`,
      detail: [inc.address, inc.note, inc.managing ? `관리 주체: ${inc.managing}` : null].filter(Boolean).join(" · "),
      source: inc.source, asOf: inc.date, url: inc.url, approx: inc.approx, distanceM: inc.pnu === pnu ? 0 : d,
      lon: inc.lon, lat: inc.lat, reliability: "공식",
    });
  }

  // 착공신고 — 가장 가까운 건물 매칭 또는 50m 이내
  for (const ev of timelineSources.construction) {
    const d = haversine(ev.lon, ev.lat, b.lon, b.lat);
    const hit = ev.nearest_pnu === pnu || d <= 50;
    if (!hit) continue;
    events.push({
      id: `constr-${ev.date}-${ev.nearest_building_id}`, date: ev.date, sortDate: ev.date, kind: "construction",
      title: `건축착공신고 (${ev.use})`, detail: `${ev.address} · 매칭 거리 ${ev.nearest_m}m`,
      source: ev.source, asOf: "2026-05-31", distanceM: Math.round(d), lon: ev.lon, lat: ev.lat, reliability: "공식",
      approx: ev.nearest_m > 30,
    });
  }

  // 급경사지 등재 — 필지 일치
  for (const s of timelineSources.slopes) {
    if (s.pnu !== pnu) continue;
    events.push({
      id: `slope-${s.pnu}`, date: s.asof, sortDate: s.asof, kind: "disaster",
      title: `급경사지 관리 목록 등재: ${s.names.join(", ")}`, detail: `행안부 급경사지 현황(안양 47곳) · 지목 ${s.jimok ?? "정보없음"}`,
      source: s.source, asOf: s.asof, reliability: "공식",
    });
  }

  // 사고 지점(박달동 139-137 등)이 공개 급경사지 목록에 없는 경우 안내
  const incHere = timelineSources.incidents.find((i) => i.pnu === pnu && i.type === "사면");
  if (incHere && !timelineSources.slopes.some((s) => s.pnu === pnu)) {
    notes.push("이 필지는 공개 급경사지 목록(47곳)에 없음 — 사고 원인·소유 관계는 공식 미확인");
  }

  events.sort((a, b) => (a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : 0));
  return { events, building: b, notes };
}

/** 같은 법정동 급경사지 (거리순) — 필지 패널 주변 현황 */
export function nearbySlopes(b: Building, limit = 5) {
  return timelineSources.slopes
    .map((s) => ({ ...s, d: Math.round(haversine(s.lon, s.lat, b.lon, b.lat)) }))
    .filter((s) => s.dong === b.dong || s.d <= 1000)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
}
