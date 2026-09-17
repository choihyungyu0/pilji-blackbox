import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, OFFICER_COOKIE, SESSION_MAX_AGE_S, sessionSecret, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SEC-01 담당자 모드 PIN 인증. 5회 오류 → 60초 잠금 (ST-S1). 잠금 상태는 인스턴스 메모리(데모 규모).
 * PIN 미설정이면 담당자 모드 비활성 + 사유.
 */
const fails = new Map<string, { n: number; lockedUntil: number }>();
const LOCK_MS = 60_000;
const MAX_FAILS = 5;

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function GET(req: NextRequest) {
  const configured = Boolean(process.env.ADMIN_PIN && process.env.ADMIN_PIN.length >= 6);
  const officer = await verifySessionToken(req.cookies.get(OFFICER_COOKIE)?.value, sessionSecret());
  return NextResponse.json({ ok: true, configured, officer, reason: configured ? null : "ADMIN_PIN 미설정(6자리 이상 필요)" });
}

export async function POST(req: NextRequest) {
  const pin = process.env.ADMIN_PIN;
  if (!pin || pin.length < 6) return NextResponse.json({ ok: false, error: "담당자 모드가 설정되지 않았습니다 (ADMIN_PIN)" }, { status: 503 });
  const key = clientKey(req);
  const st = fails.get(key);
  const now = Date.now();
  if (st && st.lockedUntil > now) {
    // 오류 응답도 200 — 데모 콘솔에 네트워크 오류가 남지 않게 (ok:false 로 구분)
    return NextResponse.json({ ok: false, locked: true, retryAfter: Math.ceil((st.lockedUntil - now) / 1000), error: "5회 오류 — 60초 후 다시 시도" });
  }
  let input = "";
  try {
    input = String((await req.json())?.pin ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (input !== pin) {
    const n = (st && st.lockedUntil <= now ? 0 : st?.n ?? 0) + 1;
    const locked = n >= MAX_FAILS;
    fails.set(key, { n: locked ? 0 : n, lockedUntil: locked ? now + LOCK_MS : 0 });
    return NextResponse.json({ ok: false, locked, remaining: locked ? 0 : MAX_FAILS - n, retryAfter: locked ? LOCK_MS / 1000 : 0, error: locked ? "5회 오류 — 60초 잠금" : "비밀번호가 맞지 않아요" });
  }
  fails.delete(key);
  const secret = sessionSecret()!;
  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OFFICER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_S });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OFFICER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
