/** 건물 속성 — docs/04_데이터사전.md 1번 표. 결측은 null (BR-D1: 화면에서 "정보없음"). */
export type Building = {
  id: number;
  pnu: string;
  dong: Dong;
  jibun: string;
  san: "일반" | "산";
  use: string | null;
  struct: string | null;
  year: number | null;
  approve: string | null;
  fl_up: number | null;
  fl_dn: number | null;
  h: number | null;
  gfa: number | null;
  viol: "Y" | "N" | null;
  ledger: boolean;
  chg: string | null;
  /** 담당자 모드에서만 존재 (공개 파일에는 없음, BR-P1) */
  score?: number | null;
  cand?: boolean;
  grade?: Grade | null;
  f_nbv?: number | null;
  f_age?: number | null;
  f_footratio?: number | null;
  f_nb50?: number | null;
  f_nl30?: number | null;
  public_parcel: boolean;
  lon: number;
  lat: number;
  /** 개발제한구역 내부 여부 (gb.geojson 점-폴리곤). null = 경계 미적재 */
  gb: boolean | null;
};

export type Dong = "안양동" | "석수동" | "박달동" | "비산동" | "관양동" | "평촌동" | "호계동";
export const DONGS: Dong[] = ["안양동", "석수동", "박달동", "비산동", "관양동", "평촌동", "호계동"];

export type Grade = "A" | "B" | "C";

export type Mode = "public" | "officer";

/** INV-02 판정 코드 */
export type Verdict = "VIOLATION" | "NORMAL" | "NOT_TARGET" | "HOLD";
export const VERDICT_LABEL: Record<Verdict, string> = {
  VIOLATION: "위반",
  NORMAL: "정상",
  NOT_TARGET: "대상 아님",
  HOLD: "보류",
};

export type VerdictRecord = {
  pnu: string;
  id: number;
  verdict: Verdict;
  memo?: string;
  /** EXIF 제거·축소한 썸네일(dataURL). 기기 보관 전용 */
  photo?: string | null;
  at: string; // ISO
  /** 서버 저장 여부 — false 면 기기에 임시 보관(ST-V3) */
  synced: boolean;
};

/** TML-01 이벤트. source·asOf 없는 이벤트는 만들지 않는다 (BR-T1). */
export type TimelineEvent = {
  id: string;
  date: string; // YYYY-MM-DD 또는 "2025-09-04~2026-09-09"
  /** 정렬용 대표 일자 */
  sortDate: string;
  kind: "building" | "violation" | "disaster" | "construction" | "satellite";
  title: string;
  detail?: string;
  source: string;
  asOf: string;
  url?: string | null;
  /** 대략 위치·기간 표기 등 */
  approx?: boolean;
  /** 필지 경계로부터 거리(m). 직접 매칭이면 0 */
  distanceM?: number | null;
  lon?: number | null;
  lat?: number | null;
  /** 데이터 신뢰도 등급 (코드정의) */
  reliability: "공식" | "판정" | "추정" | "정보없음";
};

/** PCL-04 필지 여건 — 안양시 공공데이터·행안부·브이월드·법령을 한 필지에 대조한 사실 목록. 출처·기준일 필수(BR-T1). */
export type ParcelFact = { key: string; label: string; value: string; source: string; asof: string; url?: string; note?: string };
export type ParcelContext = {
  pnu: string; buildingId: number; facts: ParcelFact[];
  laws: { id: string; law: string; article: string; title: string; url: string }[];
  asof: string;
};

export type LawItem = {
  id: string;
  law: string;
  article: string;
  title: string;
  enforced: string;
  url: string;
  keywords: string[];
  paragraphs: string[];
};

export type Citation = { id: string; law: string; article: string; title: string; url: string; excerpt: string };

export type ToolCallLog = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  /** 요약(성공) 또는 실패 사유 */
  note: string;
};

export type DocTemplate =
  | "doc01_survey_plan"      // 현장조사 계획 기안문 (일반기안문 서식)
  | "doc02_prior_notice"     // 처분사전통지서(의견제출통지) — 행정절차법 시행규칙 별지 제8호서식
  | "doc03_survey_report"    // 현장조사 결과 보고 (기안문 + 붙임 조사표)
  | "doc04_correction_order" // 시정명령서 (건축법 79조①)
  | "doc05_fine_warning"     // 이행강제금 부과 계고서 (건축법 80조③)
  | "doc06_fine_imposition"  // 이행강제금 부과 (건축법 80조④)
  | "doc07_ledger";          // 위반건축물관리대장 — 건축법 시행규칙 별지 제29호서식

/** 사건 단계 — 담당자 업무 순서 그대로. 화살표는 stages.ts 의 규칙으로만 넘어간다. */
export type Stage = "CANDIDATE" | "PLANNED" | "SURVEYED" | "NOTICED" | "ORDERED" | "WARNED" | "FINED" | "CLOSED";

export type ViolationType = "무허가건축" | "무단증축" | "무단용도변경" | "무단대수선" | "위법시공" | "기타";
export const VIOLATION_TYPES: ViolationType[] = ["무허가건축", "무단증축", "무단용도변경", "무단대수선", "위법시공", "기타"];

/** 이행강제금 산정 — 건축법 80조①, 시행령 115조의2·115조의3·별표15, 안양시 건축 조례 37조. 값은 담당자 입력. */
export type FineEstimate = {
  basis: "80-1-1" | "80-1-2";
  /** 1호: 1㎡ 시가표준액 × 위반면적 × 50% × 비율 / 2호: 건축물 시가표준액 × 별표15 비율 */
  stdPricePerM2: number | null;
  stdPriceTotal: number | null;
  area: number | null;
  ratio: number;
  halved: boolean;
  aggravated: boolean;
  reduction: number;
  amount: number | null;
  formula: string;
};

export type CaseSurvey = {
  at: string;
  verdict: Verdict;
  violationType?: ViolationType | null;
  area?: number | null;
  floor?: string;
  useBefore?: string;
  useAfter?: string;
  findings: string;
  photo?: string | null;
  surveyor?: string;
};

export type CaseHistory = { at: string; action: string };

export type Case = {
  id: number;
  pnu: string;
  stage: Stage;
  origin: "ai" | "manual" | "complaint";
  createdAt: string;
  updatedAt: string;
  plan?: { planDate?: string; team?: string; docNo?: string; approvedAt?: string; batchAt?: string };
  survey?: CaseSurvey;
  notice?: { generatedAt: string; sentAt?: string; dueDate: string; content: string; opinion?: "none" | "received"; opinionNote?: string };
  order?: { generatedAt: string; sentAt?: string; deadline: string; content: string; docNo?: string };
  warn?: { generatedAt: string; sentAt?: string; deadline: string; estimate: FineEstimate; noncomplianceNote?: string };
  fine?: { generatedAt: string; imposedAt?: string; payDue: string; estimate: FineEstimate; docNo?: string };
  closed?: { at: string; reason: "시정완료" | "정상" | "대상아님" | "기타"; note?: string };
  history: CaseHistory[];
  synced?: boolean;
};

export type DocPayload = {
  template: DocTemplate;
  filename: string;
  tokens: Record<string, string>;
  /** DOC-04 필수 기재사항 점검 (BR-C2) */
  checklist: { key: string; label: string; ok: boolean; note?: string }[];
  missing: string[];
  evidence: string[];
  generatedAt: string;
};
