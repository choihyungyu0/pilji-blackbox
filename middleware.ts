import { NextRequest, NextResponse } from "next/server";
import { OFFICER_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";

/**
 * SEC-01 공개/담당자 모드 분리.
 * 담당자 전용: /investigate, /agent, /api/agent, /api/doc, /api/verdict, /api/candidates, /data/officer/*
 * 공개 URL 은 로그인 없이 열린다 (/, /map, /dashboard, /about, /data/public/*).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ok = await verifySessionToken(req.cookies.get(OFFICER_COOKIE)?.value, sessionSecret());
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/") || pathname.startsWith("/data/officer/")) {
    return NextResponse.json({ ok: false, error: "담당자 모드가 필요합니다" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/investigate/:path*", "/agent/:path*", "/api/agent/:path*", "/api/doc/:path*", "/api/verdict/:path*", "/api/candidates/:path*", "/data/officer/:path*"],
};
