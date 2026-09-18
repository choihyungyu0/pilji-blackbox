import { cookies } from "next/headers";
import Link from "next/link";
import { OFFICER_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";
import { PinForm } from "@/components/app/pin-form";
import { DATA_ASOF, dongStats } from "@/lib/data-server";
import { IntegrationStatus } from "@/components/app/integration-status";

/** WF0 모드 선택 — 공개 모드는 입력 없이 진입, 담당자 모드는 PIN (SEC-01). */
export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; officer?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const officer = await verifySessionToken(jar.get(OFFICER_COOKIE)?.value, sessionSecret());
  const pinConfigured = Boolean(process.env.ADMIN_PIN && process.env.ADMIN_PIN.length >= 6);
  const t = dongStats.total;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1.2fr_1fr] md:py-16">
      <section>
        <p className="kicker text-muted-foreground">2026 안양시 공공데이터·AI 활용 대학생 경진대회 · 시제품</p>
        <h1 data-tour="title" className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">필지 블랙박스</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-foreground/80">
          안양 건물 <b className="tnum">27,713</b>동의 공개 데이터를 AI로 분석해 위반건축물 우선조사 후보를 찾고, 필지별 사고·위반·공사 이력을 한 화면에
          보여주며, 담당 공무원이 결재할 현장조사 기안문·사전통지서 초안(HWPX)까지 만듭니다.
        </p>
        <dl data-tour="stats" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="건물" value="27,713동" note={`기준 ${DATA_ASOF}`} />
          <Stat label="위반 표기" value={`${t.viol_Y.toLocaleString()}동`} note="대장 있는 23,558동의 6.7%" />
          <Stat label="대장 미연계" value={`${t.ledger_false.toLocaleString()}동`} note="14.8%" />
          <Stat label="AI 후보" value={`${t.cand.toLocaleString()}동`} note={`A ${t.A} · B ${t.B.toLocaleString()}`} />
        </dl>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/map" data-tour="public-btn" className="btn-primary h-10 px-4">
            공개로 보기 →
          </Link>
          <Link href="/dashboard" className="btn h-10 px-4">
            성과 보기
          </Link>
          <Link href="/about" className="btn h-10 px-4">
            데이터·모델 정보
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          공개 모드는 AI 후보를 100m 격자 개수로만 표시합니다. 필지 단위 후보·판정·문서는 담당자 모드에서만 열립니다. 모든 후보는 "현장 확인 전"
          입니다.
        </p>
      </section>

      <section data-tour="officer-card" className="card p-5 md:mt-10">
        <h2 className="text-base font-bold">담당자 모드</h2>
        <p className="mt-1 text-xs text-muted-foreground">안양시 건축과·도시계획과 담당자용. 데모 비밀번호(6자리 이상)로 진입합니다.</p>
        {officer ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="rounded-md bg-brand/10 px-3 py-2 text-brand">담당자 모드로 로그인되어 있습니다.</p>
            <Link href={sp.next || "/work"} className="btn-primary w-full">
              업무 홈으로 이동
            </Link>
          </div>
        ) : pinConfigured ? (
          <PinForm next={sp.next || "/work"} autoFocus={sp.officer === "1"} />
        ) : (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            담당자 모드 비활성 — 서버에 ADMIN_PIN(6자리 이상)이 설정되지 않았습니다.
          </p>
        )}
        <div data-tour="status" className="mt-4 rounded-md border border-border p-2.5">
          <p className="label mb-1">연동 상태</p>
          <IntegrationStatus compact />
        </div>
        <ul className="mt-4 space-y-1 text-[11px] text-muted-foreground">
          <li>· 위반 표기 1,573동(빨강) · AI 후보 1,918동(주황) 필지 단위 표시</li>
          <li>· 조사 계획 기안 → 현장조사 판정 → 사전통지 → 시정명령 → 계고·부과 → 종결</li>
          <li>· 법정 서식 7종 HWPX·PDF, 관리대장 CSV, 에이전트 대화</li>
          <li>· 5회 오류 시 60초 잠금</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="tnum mt-0.5 text-lg font-bold">{value}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}
