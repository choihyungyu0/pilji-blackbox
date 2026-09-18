import { NextResponse } from "next/server";
import { pinRequired } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 연동 상태 — 키 값은 절대 반환하지 않고 설정 여부·도달 여부만. 배포 후 환경변수 점검용 (공개).
 */
async function probeSupabase(): Promise<{ configured: boolean; reachable: boolean | null; tables: boolean | null; note: string }> {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!/^https?:\/\//.test(url) || key.length <= 20) return { configured: false, reachable: null, tables: null, note: "SUPABASE_URL·SERVICE_ROLE_KEY 미설정 — 판정은 기기 보관" };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`${url}/rest/v1/pb_verdicts?select=building_id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) return { configured: true, reachable: true, tables: true, note: "연결됨 · pb_verdicts 사용 가능" };
    if (r.status === 404 || r.status === 400) return { configured: true, reachable: true, tables: false, note: `연결됨 · 테이블 없음(${r.status}) — supabase/schema.sql 실행 필요` };
    return { configured: true, reachable: true, tables: false, note: `응답 ${r.status} — 키·권한 확인` };
  } catch (e) {
    return { configured: true, reachable: false, tables: null, note: `도달 불가(${e instanceof Error ? e.name : "오류"}) — 프로젝트 정지/삭제 여부 확인` };
  }
}

export async function GET() {
  const sb = await probeSupabase();
  return NextResponse.json({
    ok: true,
    vworld: { configured: Boolean(process.env.NEXT_PUBLIC_VWORLD_KEY || process.env.VWORLD_KEY), note: process.env.NEXT_PUBLIC_VWORLD_KEY ? "위성 배경·하이브리드 사용" : "키 없음 — OpenStreetMap 폴백" },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-4o-mini", note: process.env.OPENAI_API_KEY ? "에이전트 대화 사용 가능" : "키 없음 — 대화 비활성(문서 생성은 동작)" },
    supabase: sb,
    pin: { configured: true, note: pinRequired() ? "PIN 잠금 (OFFICER_PIN_REQUIRED=1)" : "열림 — 비밀번호 없이 진입 (시연·심사용)" },
    env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
  });
}
