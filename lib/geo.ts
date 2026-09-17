/** 두 좌표 사이 거리(m) — 하버사인. 안양 규모(10km)에서는 오차 무시 가능. */
export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 안양 시청 부근 — 초기 뷰 */
export const ANYANG_CENTER: [number, number] = [126.9407, 37.3943];
export const ANYANG_BOUNDS: [[number, number], [number, number]] = [
  [126.86, 37.34],
  [127.01, 37.46],
];

/**
 * 지번 검색어 파싱 (MAP-05). "박달동 139-137" / "139-137" / "박달동 산 27-12" / "산27-12" / "박달동 139".
 * 동명이 없으면 dong=null → 전체 동 검색.
 */
export function parseJibunQuery(q: string): { dong: string | null; san: boolean; bon: number; bu: number } | null {
  const s = q.trim().replace(/\s+/g, " ");
  if (!s) return null;
  const m = s.match(/^(?:([가-힣]+동)\s*)?(산)?\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?(?:번지)?$/);
  if (!m) return null;
  return { dong: m[1] ?? null, san: Boolean(m[2]), bon: Number(m[3]), bu: m[4] ? Number(m[4]) : 0 };
}

export function jibunOf(bon: number, bu: number): string {
  return bu ? `${bon}-${bu}` : String(bon);
}
