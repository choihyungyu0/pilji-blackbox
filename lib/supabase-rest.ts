/**
 * Supabase PostgREST 공용 헬퍼 — 서버 전용(service_role 키).
 * 추가 패키지 없이 fetch로 직접 호출한다. 클라이언트에서 import 금지.
 */

const baseUrl = () => process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const sbConfigured = () => Boolean(baseUrl() && serviceKey());

export async function sbRest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey()!,
      Authorization: `Bearer ${serviceKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
}
