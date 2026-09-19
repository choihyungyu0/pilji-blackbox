/** 결측 표기 원칙(BR-D1): null/undefined 는 "정보없음". 0 으로 바꾸지 않는다. */
export const NA = "정보없음";

export const fmt = {
  text: (v: string | null | undefined) => (v == null || v === "" ? NA : v),
  int: (v: number | null | undefined, unit = "") =>
    v == null ? NA : `${new Intl.NumberFormat("ko-KR").format(Math.round(v))}${unit}`,
  num: (v: number | null | undefined, digits = 1, unit = "") =>
    v == null ? NA : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v)}${unit}`,
  /** 연도 — 천 단위 쉼표 없이 (1,980년 ✗ → 1980년) */
  year: (v: number | null | undefined) => (v == null ? NA : String(Math.round(v))),
  score: (v: number | null | undefined) => (v == null ? NA : v.toFixed(3)),
  pct: (v: number | null | undefined, digits = 1) => (v == null ? NA : `${(v * 100).toFixed(digits)}%`),
  date: (v: string | null | undefined) => (v == null || v === "" ? NA : v),
  bool: (v: boolean | null | undefined, yes = "예", no = "아니오") => (v == null ? NA : v ? yes : no),
};

/** 층수 → 화면 표기 "지상 4 / 지하 1" */
export function floorsText(up: number | null | undefined, dn: number | null | undefined) {
  const u = up == null ? NA : `지상 ${up}`;
  const d = dn == null ? NA : `지하 ${dn}`;
  return `${u} · ${d}`;
}

/** 3D 돌출 높이(m): 층수×3, 없으면 높이, 둘 다 없으면 3 (설계서 스택 규칙) */
export function extrudeHeight(fl_up: number | null | undefined, h: number | null | undefined) {
  if (fl_up != null && fl_up > 0) return fl_up * 3;
  if (h != null && h > 0) return h;
  return 3;
}

export function nowKST(): string {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
}

export function addDaysKST(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** ISO 시각 → KST 날짜(YYYY-MM-DD). 판정·로그 표시용 */
export function kstDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
