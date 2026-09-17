import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { OFFICER_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";
import { MapScreen } from "@/components/map/map-screen";

export const metadata: Metadata = { title: "찾기 지도" };

/** WF1 찾기 지도 — 공개 URL. 모드는 세션 쿠키로 판정 (SEC-01). */
export default async function MapPage() {
  const jar = await cookies();
  const officer = await verifySessionToken(jar.get(OFFICER_COOKIE)?.value, sessionSecret());
  return (
    <Suspense fallback={null}>
      <MapScreen mode={officer ? "officer" : "public"} />
    </Suspense>
  );
}
