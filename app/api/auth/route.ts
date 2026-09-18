import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, OFFICER_COOKIE, SESSION_MAX_AGE_S, sessionSecret, verifySessionToken } from "@/lib/session";
import { sbConfigured, sbRest } from "@/lib/supabase-rest";
import { writeLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SEC-01 담당자 모드 PIN 인증. 5회 오류 → 60초 잠금 (ST-S1).
 * 서버리스(Vercel)는 인스턴스마다 메모리가 달라 메모리 카운터만으로는 잠금이 새므로 세 겹으로 센다:
 *  ① 인스턴스 메모리(빠른 경로) ② 서명된 잠금 쿠키(같은 브라우저) ③ Supabase pb_logs 의 최근 60초 실패 횟수(IP 해시, 인스턴스 무관)
 * PIN 미설정이면 담당자 모드 비활성 + 사유.
 */
const fails = new Map<string, { n: number; lockedUntil: number }>();
const LOCK_MS = 60_000;
const MAX_FAILS = 5;
const LOCK_COOKIE = "pb_lock";
const enc = new TextEncoder();

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** IP 는 저장하지 않고 비밀키 HMAC 해시만 (SEC-02) */
async function ipHash(secret: string, ip: string) {
  return (await hmacHex(secret, `ip:${ip}`)).slice(0, 24);
}

/** 서명 쿠키 `${n}.${lockedUntil}.${sig}` */
async function readLockCookie(req: NextRequest, secret: string): Promise<{ n: number; lockedUntil: number }> {
  const v = req.cookies.get(LOCK_COOKIE)?.value;
  if (!v) return { n: 0, lockedUntil: 0 };
  const [n, until, sig] = v.split(".");
  if (!n || !until || !sig || (await hmacHex(secret, `${n}.${until}`)) !== sig) return { n: 0, lockedUntil: 0 };
  return { n: Number(n) || 0, lockedUntil: Number(until) || 0 };
}
async function lockCookieValue(secret: string, n: number, lockedUntil: number) {
  return `${n}.${lockedUntil}.${await hmacHex(secret, `${n}.${lockedUntil}`)}`;
}

/** Supabase: 최근 60초 실패 횟수 (미설정·오류면 null → 다른 겹에 맡긴다) */
async function recentFailsDb(hash: string): Promise<number | null> {
  if (!sbConfigured()) return null;
  try {
    const since = new Date(Date.now() - LOCK_MS).toISOString();
    const r = await sbRest(`pb_logs?select=id&kind=eq.auth_fail&payload->>ip=eq.${hash}&created_at=gte.${encodeURIComponent(since)}&limit=${MAX_FAILS + 1}`, undefined, 2500);
    if (!r.ok) return null;
    return ((await r.json()) as unknown[]).length;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const configured = Boolean(process.env.ADMIN_PIN && process.env.ADMIN_PIN.length >= 6);
  const officer = await verifySessionToken(req.cookies.get(OFFICER_COOKIE)?.value, sessionSecret());
  return NextResponse.json({ ok: true, configured, officer, reason: configured ? null : "ADMIN_PIN 미설정(6자리 이상 필요)" });
}

export async function POST(req: NextRequest) {
  const pin = process.env.ADMIN_PIN;
  if (!pin || pin.length < 6) return NextResponse.json({ ok: false, error: "담당자 모드가 설정되지 않았습니다 (ADMIN_PIN)" }, { status: 503 });
  const secret = sessionSecret()!;
  const key = clientKey(req);
  const now = Date.now();
  const mem = fails.get(key);
  const ck = await readLockCookie(req, secret);
  const hash = await ipHash(secret, key);

  // 잠금 판정 — 셋 중 하나라도 잠금이면 잠금. 오류 응답도 200 (데모 콘솔에 네트워크 오류가 남지 않게, ok:false 로 구분)
  const lockedUntil = Math.max(mem?.lockedUntil ?? 0, ck.lockedUntil);
  if (lockedUntil > now) {
    return NextResponse.json({ ok: false, locked: true, retryAfter: Math.ceil((lockedUntil - now) / 1000), error: "5회 오류 — 60초 후 다시 시도" });
  }
  const dbFails = await recentFailsDb(hash);
  if (dbFails != null && dbFails >= MAX_FAILS) {
    const res = NextResponse.json({ ok: false, locked: true, retryAfter: LOCK_MS / 1000, error: "5회 오류 — 60초 후 다시 시도" });
    res.cookies.set(LOCK_COOKIE, await lockCookieValue(secret, 0, now + LOCK_MS), { httpOnly: true, sameSite: "lax", path: "/", maxAge: LOCK_MS / 1000 });
    return res;
  }

  let input = "";
  try {
    input = String((await req.json())?.pin ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  if (input !== pin) {
    // 세 겹 중 가장 큰 실패 횟수 기준
    const prevMem = mem && mem.lockedUntil <= now ? mem.n : 0;
    const prevCk = ck.lockedUntil <= now ? ck.n : 0;
    const n = Math.max(prevMem, prevCk, dbFails ?? 0) + 1;
    const locked = n >= MAX_FAILS;
    const until = locked ? now + LOCK_MS : 0;
    fails.set(key, { n: locked ? 0 : n, lockedUntil: until });
    await writeLog({ kind: "auth_fail", summary: "담당자 PIN 오류", payload: { ip: hash } });
    const res = NextResponse.json({ ok: false, locked, remaining: locked ? 0 : MAX_FAILS - n, retryAfter: locked ? LOCK_MS / 1000 : 0, error: locked ? "5회 오류 — 60초 잠금" : "비밀번호가 맞지 않아요" });
    res.cookies.set(LOCK_COOKIE, await lockCookieValue(secret, locked ? 0 : n, until), { httpOnly: true, sameSite: "lax", path: "/", maxAge: locked ? LOCK_MS / 1000 : 600 });
    return res;
  }

  fails.delete(key);
  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OFFICER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_S });
  res.cookies.set(LOCK_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OFFICER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
