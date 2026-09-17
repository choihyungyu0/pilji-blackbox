# CLAUDE.md — 필지 블랙박스 개발 지침

이 폴더의 문서가 요구사항의 기준이다. 충돌 시 우선순위: `docs/01_기능명세서.md` > `CLAUDE.md` > `docs/02_아이디어설계서.docx`.

## 목표

- 2026-09-20(일) 밤까지 **배포 URL**에서 P0 기능 30개가 전부 동작.
- 9/21(월)은 사업계획서 작성·제출만. 코드 작업은 버그 수정만.
- 심사 배점: 공공데이터 25 / AI 혁신성 20 / 독창성 15 / 완성도 20 / 발전가능성 20. **"치명적 오류 없이 작동"이 완성도 기준.** 기능 수보다 안정성 우선.

## 스택 (변경 시 이유를 README에 기록)

- Next.js(App Router) + TypeScript + Tailwind
- MapLibre GL JS + deck.gl (`GeoJsonLayer` extruded, 높이 = `fl_up × 3m`, 층수 없으면 `h`, 둘 다 없으면 3m)
- 배경: 브이월드 WMTS 위성 `https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg` — 키 없으면 OSM 래스터로 폴백하고 배너 표시
- Supabase(Postgres): 판정(verdict), 조사 목록, 작업 로그만 저장. 건물 데이터는 정적 파일
- LLM: OpenAI 도구 호출(function calling). 모델명은 환경변수
- HWPX: 템플릿 XML에 값 치환 후 zip (사각119 방식). 한글에서 열리는지 확인
- 배포: Vercel

## 데이터 사용 원칙

1. `data/anyang_bldg_scored_20260909_4326.geojson`(19MB)은 빌드 시 `tippecanoe`로 PMTiles 변환을 먼저 시도. 실패하면 gzip GeoJSON을 `public/`에 두고 클라이언트 로드. 첫 표시 3초 목표.
2. 점수는 **사전 계산값을 그대로 사용**. 앱 안에서 모델을 다시 돌리지 않는다(재학습은 P1, IS-05).
3. 결측은 `null` → 화면에 "정보없음". 0으로 바꾸지 않는다.
4. 모든 레이어·카드에 출처와 기준일 표시 (`docs/04_데이터사전.md`의 출처 열 그대로).
5. 좌표계: `data/`는 EPSG:4326. `raw/`와 안양시 굴착 API는 EPSG:5186 → `proj4`로 변환.

## 절대 금지

- 소유자·거주자 이름, 연락처, 주민번호 등 개인정보 수집·표시·저장
- AI 점수만으로 처분 문서 생성 — 사전통지서는 판정=`VIOLATION`일 때만 (BR-C1)
- 공개 모드에서 필지 단위 AI 후보 노출 — 100m 격자 개수로만 (BR-P1)
- 도구 결과에 없는 수치·사건을 LLM이 문서·답변에 쓰는 것 (BR-A1). 도구 실패는 숨기지 않음 (BR-A2)
- 박달동 축대 붕괴의 원인·소유 관계 단정 (공식 미확인)
- 브이월드 영상 타일 저장·가공 (조회만)
- 확정 수치 임의 변경 (README "확정된 숫자" 표)

## 화면 문구 원칙

- 후보 표시에는 항상 "후보(현장 확인 전)" 배지
- 등급은 조사 순서이지 위반 판정이 아님을 툴팁으로 명시
- 문서 초안 머리말: "초안 — 담당자 검토 필요" + 생성 시각 + 근거 목록
- 짧고 딱딱하게. 설명형 긴 문장 금지

## 구현 순서 (기능ID는 명세서 기준)

| 단계 | 기능 | 완료 기준 |
|---|---|---|
| 1 | DAT-01, MAP-01~05, SEC-01 | 공개/담당자 모드로 3D 지도 표시, 레이어·색상·필터·지번 검색 동작 |
| 2 | PCL-01·02, TML-01, DAT-02·05·09 | 건물 클릭 → 기본정보·점수 근거·타임라인(변화·사고·착공) |
| 3 | SIG-01, MDL-01·03, INV-01·02, SEC-02 | 조사 목록 생성·CSV·판정 저장, 모델 카드 |
| 4 | AGT-01~03, DOC-01·02·04 | 에이전트 대화 → HWPX 기안문·사전통지 초안, 필수항목 점검 |
| 5 | DSH-01·02, SEC-03, DAT-03·04 | 성과 대시보드, 출처 페이지, 개발제한구역·급경사지 레이어 |
| 6 (P1) | SAT-*, MDL-02, SIG-02·03, DAT-06~08, INV-03, PCL-03, TML-02, DOC-03, SEC-04, MAP-06 | 여유 시 |

각 단계 끝에 `docs/05_시연시나리오_검수체크리스트.md`의 해당 항목을 점검하고 결과를 커밋 메시지에 적는다.

## 에이전트 도구 (AGT-01)

| 도구 | 입력 | 출력 | 구현 |
|---|---|---|---|
| parcel.lookup | pnu 또는 좌표 | 건물 속성 | 정적 데이터 인덱스 |
| timeline.build | pnu, 좌표 | 이벤트 배열(날짜·유형·출처) | changes·incidents·construction_events·slopes, 반경 규칙 BR-T2 |
| signal.score | pnu | score, grade, f_* 기여값 | geojson 속성 |
| change.detect | pnu | 위성 지수 연도별 | P1, 없으면 "위성 데이터 미적재" 반환 |
| rules.rag | 질의 | 조문 발췌 + 링크 | 건축법 79·80조, 행정절차법 14·21조, 개발제한구역법 시정명령·이행강제금, 급경사지법 시행령 2조 원문을 `data/laws/`에 저장 후 검색 (IS-08) |
| doc.render | 템플릿ID, 값 | HWPX | templates/ |
| doc.check | 초안 | 누락 항목 | BR-C2 체크리스트 |
| cctv.nearby | 좌표 | CCTV 위치 목록 | P1(DAT-08) |

응답에는 사용한 도구 목록과 출처를 접어서 표시한다.

## 환경변수 (`.env.example`)

`VWORLD_KEY`, `VWORLD_DOMAIN`, `DATA_GO_KR_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PIN`

키가 없어도 앱은 떠야 한다 (각 기능은 비활성 + 사유 표시).

## 막히면

- 결정이 필요한 항목은 `docs/01_기능명세서.md` 8장 이슈논의(IS-01~11)에 있다. 임의로 정하지 말고 기본안을 적용한 뒤 README에 "임시 결정"으로 기록.
- 데이터 의미가 불분명하면 `docs/04_데이터사전.md` → `scripts/README.md` 순서로 확인.
