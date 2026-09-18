"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useApp } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { useCases } from "@/store/cases";

/**
 * 처음 방문자 온보딩 투어 — 화면을 어둡게 하고 요소를 하나씩 확대·강조하며 넘어간다 (driver.js, MIT).
 * - 첫 방문(로컬 플래그 없음)이면 랜딩(/)에서 자동 시작. 완료·닫기 후에는 다시 뜨지 않는다.
 * - 화면마다 투어가 있고 마지막 단계에서 다음 화면으로 이어진다(?tour=1). 상단 "둘러보기" 로 언제든 다시 볼 수 있다.
 * - 지도 투어는 시연 필지(박달동 139-137)를 직접 선택해 필지 패널·타임라인까지 보여준다.
 */
export const TOUR_DONE_KEY = "pb-tour-done";
export const VISITED_KEY = "pb-visited";
const DEMO_BUILDING_ID = 4523; // 박달동 139-137 (5.21 축대 붕괴 이력)

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

type TourCtx = { officer: boolean; go: (path: string) => void; restart: (step?: number) => void };

function stepsFor(path: string, t: TourCtx): DriveStep[] {
  const el = (k: string) => `[data-tour="${k}"]`;
  if (path === "/") {
    return [
      { element: el("title"), popover: { title: "필지 블랙박스", description: "안양 건물 27,713동의 공개 데이터로 위반건축물 우선조사 후보를 찾고, 필지 이력과 결재 문서까지 한 흐름으로 처리하는 담당자용 도구입니다." } },
      { element: el("stats"), popover: { title: "확정 수치", description: "위반 표기 1,573동 · 대장 미연계 4,112동 · AI 후보 1,918동(A 913·B 1,005). 모든 화면의 숫자는 이 기준(2026-09-09)과 같습니다." } },
      { element: el("public-btn"), popover: { title: "공개 모드", description: "로그인 없이 3D 지도·성과·데이터 출처를 볼 수 있습니다. AI 후보는 낙인 방지를 위해 100m 격자 개수로만 표시됩니다." } },
      { element: el("officer-card"), popover: { title: "담당자 모드", description: "버튼 하나로 들어옵니다(시연용, 비밀번호 없음). 필지 단위 후보·점수, 현장 판정, 법정 서식 7종(HWPX·PDF) 생성이 열립니다." } },
      { element: el("status"), popover: { title: "연동 상태", description: "브이월드 위성·담당자 모드·OpenAI·Supabase 연결 여부를 보여줍니다. 키 값은 표시하지 않습니다." } },
      { popover: { title: "지도로 가 볼까요?", description: "다음을 누르면 3D 지도에서 시연 필지(박달동 139-137)까지 안내합니다.", nextBtnText: "지도 둘러보기 →", onNextClick: () => t.go("/map?tour=1") } },
    ];
  }
  if (path === "/map") {
    const steps: DriveStep[] = [
      { element: el("search"), popover: { title: "지번 검색", description: "\"박달동 139-137\"처럼 입력하면 1초 안에 그 필지로 이동합니다. 일치가 없으면 가까운 지번 3개를 제안합니다." } },
      { element: el("layers"), popover: { title: "레이어·색상", description: "위반 표기(빨강)·AI 후보(주황)·대장 미연계(파랑)·개발제한구역·급경사지 47곳·공공시설을 켜고 끕니다. 색상 기준은 점수/위반/연수/용도." } },
      { element: el("filter"), popover: { title: "필터", description: "법정동·용도·점수 구간·경과연수·개발제한구역으로 좁히면 건수 배지가 바로 갱신됩니다." } },
      {
        element: el("map"),
        popover: {
          title: "3D 건물 지도",
          description: "위성 배경 위에 층수×3m로 돌출된 건물 27,713동. 드래그·회전·확대가 됩니다. 건물을 클릭하면 필지 패널이 열립니다. 다음을 누르면 시연 필지(박달동 139-137)로 이동해 패널을 엽니다.",
          nextBtnText: "시연 필지 열기 →",
          // 다음 → 시연 필지 선택·이동 후 패널 단계로 (패널은 선택 뒤에야 DOM 에 생긴다)
          onNextClick: (_el, _step, { driver }) => {
            const b = useBuildings.getState().index?.byId.get(DEMO_BUILDING_ID);
            if (b) {
              useApp.getState().select(b.id);
              useApp.getState().requestFlyTo(b.lon, b.lat, 17.5);
            }
            setTimeout(() => driver.moveNext(), b ? 450 : 0);
          },
        },
      },
      { element: el("panel"), popover: { title: "필지 패널", description: "기본정보(결측은 \"정보없음\"), 필지 타임라인(사용승인·위반 표기 변화·사고 보도·착공·급경사지), 주변 현황. 박달동 139-137은 2026-05-21 축대 붕괴 이력이 있고 공개 급경사지 목록에는 없습니다." } },
    ];
    if (t.officer) {
      steps.push(
        { element: el("score"), popover: { title: "AI 점수·근거", description: "점수·등급(A/B)과 신호 기여(이웃 위반 비율·경과연수 등). 등급은 조사 순서이지 위반 판정이 아닙니다 — 항상 \"후보(현장 확인 전)\"." } },
        { element: el("panel-actions"), popover: { title: "사건으로 넘기기", description: "\"조사 목록\"에 담아 계획 기안을 만들거나 \"사건 등록\"으로 바로 8단계 처리 흐름을 시작합니다." } },
        { popover: { title: "담당자 업무 홈으로", description: "실제 업무 순서(조사 계획 → 현장조사 → 사전통지 → 시정명령 → 계고·부과 → 종결)를 이어서 안내합니다.", nextBtnText: "업무 홈 →", onNextClick: () => t.go("/work?tour=1") } }
      );
    } else {
      steps.push({ popover: { title: "여기까지가 공개 모드", description: "담당자 모드에서는 필지 단위 후보·점수·판정·결재 문서가 열립니다. 첫 화면의 담당자 카드에서 버튼만 누르면 됩니다.", nextBtnText: "담당자 모드로 →", onNextClick: () => t.go("/?officer=1") } });
    }
    return steps;
  }
  if (path === "/work") {
    return [
      { element: el("pipeline"), popover: { title: "사건 8단계 파이프라인", description: "후보 → 조사 계획 → 현장조사 → 사전통지 → 시정명령 → 계고 → 부과 → 종결. 단계마다 나가는 법정 서식이 적혀 있고, 전제가 안 맞으면 다음 문서는 만들어지지 않습니다." } },
      { element: el("todos"), popover: { title: "오늘 할 일", description: "기한이 지난 사건이 맨 위, 그다음 임박·미조사 순. 행을 열면 사건 상세로 갑니다." } },
      { element: el("quick"), popover: { title: "시작하기", description: "지도에서 후보를 고르거나, 조사 계획 화면에서 동·등급·건수로 후보를 한 번에 뽑습니다." } },
      { popover: { title: "조사 계획으로", description: "실제 업무의 첫 단계입니다.", nextBtnText: "조사 계획 →", onNextClick: () => t.go("/investigate?tour=1") } },
    ];
  }
  if (path === "/investigate") {
    const hasRows = useApp.getState().list.length > 0;
    const steps: DriveStep[] = [
      { element: el("pick"), popover: { title: "① 조사 대상 뽑기", description: "법정동·등급(A/A+B)·건수를 고르고 \"목록 생성\"을 누르면 AI 점수 내림차순으로 후보가 뽑히고 사건(후보 단계)으로 등록됩니다." } },
    ];
    if (hasRows) {
      steps.push(
        { element: el("org"), popover: { title: "기관·결재선", description: "한 번만 입력하면 모든 문서의 기안자·검토자·결재권자·주소·연락처에 들어갑니다. 당사자(건축주) 정보는 어디에도 입력하지 않습니다." } },
        { element: el("plan"), popover: { title: "② 현장조사 계획 기안", description: "조사 예정일·조사반을 넣고 기안문(HWPX·PDF)을 만들면 목록의 사건이 모두 \"조사 계획\" 단계가 됩니다. 일반기안문 서식(별지 1호)입니다." } },
        { element: el("survey-table"), popover: { title: "③ 현장 판정", description: "현장에서 행마다 위반/정상/대상아님/보류를 누르고 위반 내용·사진(EXIF 제거)을 기록합니다. \"상세\"에서 위반 유형·면적까지 입력하면 사전통지서의 원인 사실이 됩니다." } },
        { element: el("report"), popover: { title: "④ 결과 보고", description: "판정이 쌓이면 현장조사 결과 보고(붙임 조사표)를 만듭니다. 위반 건은 사건 상세에서 사전통지 → 시정명령 → 계고·부과로 이어집니다." } },
        { popover: { title: "사건 상세로", description: "첫 번째 사건을 열어 단계별 처리 화면을 봅니다.", nextBtnText: "사건 열기 →", onNextClick: () => t.go(`/cases/${useApp.getState().list[0].id}?tour=1`) } }
      );
    } else {
      steps.push({
        popover: {
          title: "목록을 만들어 볼까요?",
          description: "다음을 누르면 위 조건(법정동·등급·건수)으로 후보 목록을 생성하고, 기안·판정·보고 단계를 이어서 안내합니다.",
          nextBtnText: "목록 생성 →",
          onNextClick: () => {
            const btn = document.querySelector<HTMLButtonElement>('[data-tour="pick"] button.btn-primary');
            btn?.click();
            // 목록이 생기면(사건 등록까지 끝나면) 기관·결재선 단계부터 다시 시작
            const t0 = Date.now();
            const poll = () => {
              if (useApp.getState().list.length > 0) t.restart(1);
              else if (Date.now() - t0 < 6000) setTimeout(poll, 200);
              else t.restart(0);
            };
            setTimeout(poll, 300);
          },
        },
      });
    }
    return steps;
  }
  if (/^\/cases\/\d+$/.test(path)) {
    return [
      { element: el("case-head"), popover: { title: "사건 헤더", description: "필지·건물 정보, 현재 단계, 현장 판정, 다음 할 일. 지도·에이전트로 바로 이동할 수 있습니다." } },
      { element: el("stepper"), popover: { title: "8단계 스테퍼", description: "현재 단계와 바로 다음 단계만 열립니다. 각 단계에 법정 전제가 있어 순서를 건너뛸 수 없습니다 — 예: 판정이 '위반'이어야 사전통지, 의견제출기한(10일 이상) 경과 후 시정명령." } },
      { element: el("stage-panel"), popover: { title: "단계 패널", description: "입력 → 문서 생성(HWPX·PDF) → 발송일·기한 기록. 계고 단계에는 이행강제금 계산기(건축법 80조·시행령 별표15·안양시 조례 37조)가 있습니다." } },
      { element: el("side"), popover: { title: "근거·이력", description: "AI 점수 근거, 필지 타임라인, 사건 이력이 항상 옆에 있습니다. 관리대장(별지 29호)은 종결 단계에서 산출합니다." } },
      { popover: { title: "투어 끝", description: "상단 \"둘러보기\"로 언제든 다시 볼 수 있습니다. 에이전트 화면에서는 자연어로 문서·조문·단계를 물어볼 수 있습니다.", doneBtnText: "완료" } },
    ];
  }
  if (path === "/agent") {
    return [
      { element: el("agent-ctx"), popover: { title: "컨텍스트", description: "어느 사건을 두고 대화할지 고릅니다. 판정 버튼도 여기서 바로 누를 수 있습니다." } },
      { element: el("agent-chat"), popover: { title: "에이전트 대화", description: "\"이 사건 다음 할 일\", \"시정명령 근거 조문\", \"사전통지 초안\"처럼 물으면 도구(필지 조회·이력·조문·사건 상태·문서)를 호출해 답합니다. 도구 결과에 없는 숫자는 자동 삭제되고, 도구 실패는 답변에 명시됩니다." } },
      { element: el("agent-docs"), popover: { title: "문서 산출", description: "현재 단계에서 만들 수 있는 문서만 활성화됩니다. 전제가 안 맞으면 사유가 옆에 보입니다.", doneBtnText: "완료" } },
    ];
  }
  return [];
}

export function Tour() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const mode = useApp((s) => s.mode);
  const bStatus = useBuildings((s) => s.status);
  const listLen = useApp((s) => s.list.length);
  const caseCount = useCases((s) => Object.keys(s.cases).length);
  const drv = useRef<Driver | null>(null);
  const startedFor = useRef<string | null>(null);

  const start = useCallback((stepIndex = 0) => {
    const ctx: TourCtx = {
      officer: mode === "officer",
      go: (p) => { drv.current?.destroy(); router.push(p); },
      restart: (step) => { drv.current?.destroy(); setTimeout(() => start(step ?? 0), 350); },
    };
    const steps = stepsFor(path, ctx);
    if (!steps.length) return;
    drv.current?.destroy();
    drv.current = driver({
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: "다음",
      prevBtnText: "이전",
      doneBtnText: "완료",
      overlayOpacity: 0.74,
      stagePadding: 8,
      stageRadius: 10,
      allowClose: true,
      smoothScroll: true,
      popoverClass: "pb-tour",
      steps,
      onDestroyStarted: () => {
        ls.set(TOUR_DONE_KEY, "1");
        drv.current?.destroy();
      },
    });
    drv.current.drive(Math.min(stepIndex, steps.length - 1));
  }, [mode, path, router]);

  // 자동 시작: 랜딩 첫 방문, 또는 ?tour=1 로 이어진 화면. 지도는 건물 로드 후.
  useEffect(() => {
    const chained = sp.get("tour") === "1";
    const first = !ls.get(TOUR_DONE_KEY);
    const key = `${path}?${chained ? 1 : 0}`;
    if (startedFor.current === key) return;
    const shouldAuto = (path === "/" && first) || chained;
    if (!shouldAuto) return;
    if (path === "/map" && bStatus !== "ready") return;
    if (path === "/investigate" && chained && bStatus !== "ready") return;
    if (/^\/cases\/\d+$/.test(path) && (bStatus !== "ready" || caseCount === 0)) return;
    // 타이머 안에서 표시 — 의존값이 바뀌어 정리(clearTimeout)되면 다음 실행이 다시 예약된다
    const t = setTimeout(() => {
      startedFor.current = key;
      ls.set(TOUR_DONE_KEY, "1"); // 자동 시작은 한 번만 — 중간에 다른 곳으로 가도 다시 뜨지 않는다 (둘러보기 버튼으로 재실행)
      start(0);
    }, path === "/map" ? 1200 : 700);
    return () => clearTimeout(t);
  }, [path, sp, bStatus, caseCount, listLen, start]);

  // 상단 "둘러보기" 버튼 → 커스텀 이벤트
  useEffect(() => {
    const h = (e: Event) => start((e as CustomEvent<{ step?: number }>).detail?.step ?? 0);
    window.addEventListener("pb:tour", h);
    return () => window.removeEventListener("pb:tour", h);
  }, [start]);

  useEffect(() => () => drv.current?.destroy(), []);
  return null;
}

/** 처음 방문자는 어느 주소로 들어와도 랜딩(/)부터 — 투어 후 원래 가려던 화면으로 보낸다 */
export function FirstVisitGate() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const visited = ls.get(VISITED_KEY);
    if (path === "/") { ls.set(VISITED_KEY, "1"); return; }
    if (visited) return;
    if (path.startsWith("/print")) return;
    ls.set(VISITED_KEY, "1");
    router.replace(`/?next=${encodeURIComponent(path)}`);
  }, [path, router]);
  return null;
}
