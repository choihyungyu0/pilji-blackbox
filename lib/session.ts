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

/** 담당자 모드 잠금 여부 — 기본은 열림(시연·심사용). 실제 도입 시 OFFICER_PIN_REQUIRED=1 + ADMIN_PIN(6자리 이상)로 잠근다. */
export function pinRequired(): boolean {
  return process.env.OFFICER_PIN_REQUIRED === "1" && Boolean(process.env.ADMIN_PIN && process.env.ADMIN_PIN.length >= 6);
}

/** 세션 서명 비밀 — SESSION_SECRET > ADMIN_PIN 파생 > 내장 기본값(열린 모드 전용; 세션 위조가 아니라 모드 구분용이라 허용). */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET || (process.env.ADMIN_PIN ? `pin:${process.env.ADMIN_PIN}` : "pilji-blackbox-open-demo");
}
