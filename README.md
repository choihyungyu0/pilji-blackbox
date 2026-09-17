# 필지 블랙박스 — 안양시 위반건축물 우선조사·필지 이력

2026 안양시 공공데이터·AI 활용 대학생 경진대회 시제품. 안양 건물 **27,713동**의 공개 데이터를 AI로 분석해 **위반건축물 우선조사 후보**를 찾고, 필지별 **사고·위반·공사 이력 타임라인**을 한 화면에 보여주고, 담당 공무원이 결재할 **현장조사 기안문·사전통지서 초안(HWPX)** 까지 만드는 웹 서비스.

요구사항 기준 문서: `docs/01_기능명세서.md` > `CLAUDE.md` > `docs/02_아이디어설계서.docx`. 핸드오프 원문은 `docs/00_핸드오프_README.md`.

## 실행

```bash
npm install
cp .env.example .env.local   # 키 채우기 (없어도 앱은 뜬다 — 기능별 비활성 + 사유 표시)
npm run dev                  # http://localhost:3600
```

데이터 재생성(원본 `data/` → `public/data/`, `data/derived/`):

```bash
npm run data:vworld   # 브이월드 API: 개발제한구역·급경사지 필지·지오코딩 (VWORLD_KEY 필요, 1회)
npm run data          # 건물 GeoJSON(공개/담당자)·100m 격자·동별 집계·타임라인 원천
npm run templates     # HWPX 템플릿 (python-hwpx)
```

## 화면 (기능명세서 WF0~WF7)

| 경로 | 화면 | 모드 |
|---|---|---|
| `/` | WF0 모드 선택 — 공개로 보기 / 담당자 PIN (5회 오류 60초 잠금) | 공개 |
| `/map` | WF1 찾기 지도 + WF2 필지 패널 — 위성 배경·3D 건물·레이어·색상 기준·필터·지번 검색·타임라인·주변 현황 | 공개(격자) / 담당자(필지 후보·점수) |
| `/investigate` | WF4 조사 목록 — 동·등급·건수 → 점수 내림차순, CSV, 판정·메모·사진, 번호 핀 | 담당자 |
| `/agent` | WF5 결재 문서 — 에이전트 대화(도구 로그·근거 조문), 현장조사 기안·사전통지 초안 HWPX, 필수 기재사항 점검 | 담당자 |
| `/dashboard` | WF6 성과 — 누적 포착 곡선, 동별 현황, 검증 요약 | 공개 |
| `/about` | WF7 데이터·모델 — 모델 카드, 출처·기준일·라이선스(안양시 6종 포함), 작업 로그 | 공개 |

## 구현 범위

P0 전부 구현. P1 중 구현: TML-02 이벤트 유형 칩, PCL-03 주변 현황(위반·미연계·급경사지·시설), SEC-04 작업 로그(기기 보관 + Supabase 선택), DAT-09 시설 3종 지오코딩 레이어.
P1 미구현(데이터 미확보): DAT-06 도로굴착, DAT-07 지반침하, DAT-08 CCTV, SAT-01~03 위성, SIG-02 지목 불일치, SIG-03 사면(DEM), MDL-02 재학습, INV-03 동선, DOC-03 급경사지 점검 요청, MAP-06 연도 슬라이더. 레이어 토글은 "미적재"로 비활성 표시, 에이전트 도구는 `available:false` 로 응답.

## 스택 (CLAUDE.md 대비 변경·임시 결정)

- Next.js 15(App Router) + TypeScript + Tailwind 4 — Homepage 프로젝트 도구 설정·폰트(Pretendard)·UI 토큰 계승
- **지도: MapLibre GL JS 단독 (deck.gl 미사용)** — 27,713동 3D 돌출은 MapLibre 내장 `fill-extrusion`(높이 = 층수×3m → 높이 → 3m)이 의존성 없이 더 가볍고, `feature-state` 로 선택·판정 색을 즉시 반영하며 GeoJSON 소스가 타일 분할을 자동으로 한다. deck.gl 상호운용 층을 두는 이득이 없어 제외.
- **IS-01 임시 결정: PMTiles 대신 정적 GeoJSON** — Windows 작업환경에 tippecanoe 가 없어 `public/data/{public,officer}/buildings.geojson`(각 15.9/18.7MB, gzip 2.6/3.0MB)을 Vercel 정적 파일로 제공. 로컬 첫 로드 1.4초(캐시 후 ~0.2초). 좌표 6자리·NaN→null 정리.
- **IS-09 공개 범위: 파일 자체를 분리** — 공개 파일에는 `score/cand/grade/f_*` 컬럼이 없고, 담당자 파일(`/data/officer/*`)은 미들웨어가 세션 쿠키로 막는다. 화면 숨김이 아니라 네트워크에서 차단.
- **IS-07 LLM: OpenAI `gpt-4o-mini`(환경변수)** 도구 호출 8종. BR-A1 은 `lib/guard.ts` 로 답변 속 숫자를 도구 결과와 대조해 없는 문장을 삭제.
- **IS-08 법령 원문: 국가법령정보센터 현행 조문을 `data/laws/laws.json` 에 수록**(2026-09-17 조회) — 건축법 79·80, 행정절차법 14·21, 개발제한구역법 30·30의2, 급경사지법 시행령 2. 키워드 점수 검색(임베딩 없음).
- **IS-10 문서 서식: 표준 서식으로 자체 제작** (안양시 실제 서식 미확보). python-hwpx 로 만든 정품 HWPX 템플릿에 브라우저(JSZip)가 토큰만 치환. 사전통지서는 행정절차법 21조① 기재사항 순서, 당사자 칸은 항상 공란.
- **IS-11 서비스 이름: "필지 블랙박스"(가칭 유지)**.
- Supabase 는 선택 — 판정 저장 실패 시 기기(localStorage) 보관 + 재시도(ST-V3). 스키마 `supabase/schema.sql`.
- 브이월드 키: 개발키(2026-09-18 발급, 만료 2027-03-18), 서비스 URL `https://pilji-blackbox.vercel.app`. WMTS·2D데이터·지오코더 사용. 영상 타일은 조회만.

## 데이터 (기준 2026-09-09) — 확정 수치 재현 확인

건물 27,713 · 위반 표기 1,573 · 대장 미연계 4,112 · 후보 1,918(A 913 / B 1,005) · 1년 변화 신규 88·해제 64 · 공간 AUC 0.728 / 시간 AUC 0.698 · 상위 20% 포착 46.8% / 46.6%. `scripts/build_data.py` 가 적재 시 이 수치를 assert 한다.

추가 산출: 개발제한구역 31 폴리곤(건물 626동 내부) · 급경사지 47행 중 45행 위치화(필지 38개; 실패: 호계3동 안양교도소 지번 없음, 만안 안양 N10지구 연속지적도에 PNU 없음) · 사고 8건 중 좌표 3건(INC-04·06·07; 나머지는 지점 주소 없음, 목록만) · 시설 지오코딩 공공건축물 450/537, 대피시설 213/213, 급수시설 45/46.

## 폴더

```
app/            (map | investigate | agent | dashboard | about) · api/(auth|parcel|timeline|candidates|verdict|doc|laws|agent)
components/     map/ parcel/ investigate/ agent/ dashboard/ app/
lib/            data-server(정적 인덱스) · timeline · laws · docs · guard(BR-A1) · pii · session · hwpx · tools/(에이전트 도구 8종)
store/          app-store(모드·레이어·판정·조사목록·로그, 기기 보관) · buildings(건물 인덱스)
data/           핸드오프 원본 + derived/(빌드 산출) + laws/
public/data/    앱이 읽는 정적 파일 (officer/ 는 미들웨어 보호)
public/templates/ HWPX 템플릿 2종
scripts/        build_data.py · fetch_vworld_layers.py · make_hwpx_templates.py · analysis_reference/(모델 재현 코드)
docs/           기능명세서·설계서·데이터사전·시연 시나리오·리서치
```

## 원칙 (절대 금지 — CLAUDE.md)

소유자·거주자 정보 없음(메모 전화·주민번호 패턴 차단, 사진은 EXIF 제거 썸네일만 기기 보관) · 사전통지는 판정=위반일 때만 · 공개 모드 필지 단위 후보 없음 · 도구에 없는 수치 삭제 · 도구 실패 명시 · 박달동 축대 붕괴 원인 단정 없음 · 브이월드 타일 저장 없음 · 확정 수치 변경 없음.
