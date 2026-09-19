import { verdictWeight, VERDICT_RADIUS_M } from "./rules";
import type { Verdict } from "@/lib/types";

/** 판정 좌표 → 반경 200m 이웃 가중 (서버·클라이언트 공용, 순수) */
export type VerdictPoint = { id: number; verdict: Verdict; lon: number; lat: number; at?: string; local?: boolean };
export type VerdictEffect = { w: number; nViol: number; nNorm: number; selfNotTarget: boolean };

export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 자기 자신의 판정은 이웃 계산에서 빼고, 자신이 NOT_TARGET 이면 그 건물만 제외(이웃 영향 없음). HOLD 는 세지 않는다. */
export function verdictEffect(b: { id: number; lon: number; lat: number }, verdicts: VerdictPoint[]): VerdictEffect {
  let nViol = 0, nNorm = 0, selfNotTarget = false;
  for (const v of verdicts) {
    if (v.id === b.id) { if (v.verdict === "NOT_TARGET") selfNotTarget = true; continue; }
    if (v.verdict !== "VIOLATION" && v.verdict !== "NORMAL") continue;
    if (haversineM(v.lon, v.lat, b.lon, b.lat) > VERDICT_RADIUS_M) continue;
    if (v.verdict === "VIOLATION") nViol++; else nNorm++;
  }
  return { w: verdictWeight(nViol, nNorm), nViol, nNorm, selfNotTarget };
}
