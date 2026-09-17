/**
 * 담당자 모드 세션 (SEC-01) — `${만료ms}.${HMAC-SHA256(secret, 만료ms)}`.
 * Web Crypto 만 쓰므로 Edge 미들웨어와 Node 라우트 양쪽에서 동작한다 (Homepage admin-session 패턴).
 */
export const OFFICER_COOKIE = "pb_officer";
export const SESSION_MAX_AGE_S = 60 * 60 * 12; // 12시간

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE_S * 1000;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return (await hmacHex(secret, expStr)) === token.slice(dot + 1);
}

/** 세션 서명 비밀 — SESSION_SECRET 없으면 ADMIN_PIN 파생(개발 편의). 둘 다 없으면 담당자 모드 비활성. */
export function sessionSecret(): string | undefined {
  return process.env.SESSION_SECRET || (process.env.ADMIN_PIN ? `pin:${process.env.ADMIN_PIN}` : undefined);
}
