import "server-only";
import stdJson from "@/data/derived/std_value.json";

/**
 * 안양시_일반건축물_시가표준액(공공데이터포털 15080551) — 필지(PNU)별 ㎡당 시가표준액. 빌드 시 전처리(scripts/fetch_std_value.py), 런타임 계산 없음.
 * 이행강제금(건축법 80조①1호: 1㎡ 시가표준액 × 50% × 위반면적 × 비율)의 **참고 산정**에만 쓴다. 부과 시점 시가표준액이 아니므로 확정 금액이 아니다.
 */
export type StdValue = { v: number; y: number; t: number; a: number; n: number };
const std = stdJson as unknown as { source: string; asof: string; note: string; generated: string; stats: Record<string, unknown>; items: Record<string, StdValue> };
export const STD_SOURCE = std.source;
export const STD_NOTE = std.note;
export const stdStats = std.stats;
export const stdValueOf = (pnu: string): StdValue | null => std.items[pnu] ?? null;
