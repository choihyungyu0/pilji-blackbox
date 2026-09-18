/**
 * Supabase PostgREST 공용 헬퍼 — 서버 전용(service_role 키).
 * 추가 패키지 없이 fetch로 직접 호출한다. 클라이언트에서 import 금지.
 * 프로젝트가 정지·삭제돼 DNS 가 없을 때 요청이 함수 시간제한까지 매달리지 않도록 5초 타임아웃을 건다.
 */

const baseUrl = () => process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const sbConfigured = () => Boolean(baseUrl() && serviceKey());

export async function sbRest(path: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl()}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey()!,
        Authorization: `Bearer ${serviceKey()}`,
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
      cache: "no-store",
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
