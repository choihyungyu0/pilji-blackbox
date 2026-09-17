import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Shell } from "@/components/app/shell";

// Self-hosted Pretendard Variable (OFL) — Homepage 와 같은 전역 단일 폰트
const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
  preload: true,
});

const SITE = "필지 블랙박스";
const DESC = "안양시 건물 27,713동의 공개 데이터를 AI로 분석해 위반건축물 우선조사 후보를 찾고, 필지별 사고·위반·공사 이력을 한 화면에 보여주며, 현장조사 기안문·사전통지서 초안(HWPX)까지 만드는 담당자용 도구.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VWORLD_DOMAIN || "https://pilji-blackbox.vercel.app"),
  title: { default: `${SITE} — 안양시 위반건축물 우선조사·필지 이력`, template: `%s · ${SITE}` },
  description: DESC,
  applicationName: SITE,
  robots: { index: true, follow: false },
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE, title: SITE, description: DESC },
};

export const viewport: Viewport = { themeColor: "#0b0b0c", colorScheme: "light", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
