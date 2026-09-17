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

export type DocTemplate = "doc01_survey_plan" | "doc02_prior_notice";

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
