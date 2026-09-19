/**
 * SEC-03 데이터 출처·기준일·라이선스 — 사업계획서 3장 표(제공기관 | 데이터명 | URL)와 같은 목록.
 * 안양시 공공데이터 6종이 포함되어야 공공데이터 항목 25점 만점 대상 (docs/03).
 */
export type SourceRow = {
  group: "안양시 공공데이터" | "국가 공간정보" | "공공데이터포털(전국)" | "브이월드 API" | "법령" | "기타";
  provider: string;
  name: string;
  url: string;
  asof: string;
  license: string;
  use: string;
  limit?: string;
};

export const SOURCES: SourceRow[] = [
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_공공건축물현황", url: "https://www.data.go.kr/data/15114534/fileData.do", asof: "2026-06-30", license: "공공누리(포털 표기)", use: "공공 필지 표시·대상아님 힌트, 주변 현황(지오코딩 450/537)", limit: "지번 주소 134건만 필지 직접 매칭, 나머지는 지오코더 좌표" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_건축착공신고현황(건축사 사무소별)", url: "https://www.data.go.kr/data/15114531/fileData.do", asof: "2026-05-31", license: "공공누리(포털 표기)", use: "타임라인 착공 이벤트 47건 (가까운 건물 매칭, 중앙값 7.4m)" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_비상대피시설 현황", url: "https://www.data.go.kr/data/3045138/fileData.do", asof: "2025-12-26", license: "공공누리(포털 표기)", use: "필지 주변 현황(반경 300m), 지도 시설 레이어 (213/213 지오코딩)" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_민방위 급수시설 현황", url: "https://www.data.go.kr/data/3045178/fileData.do", asof: "2026-03-07", license: "공공누리(포털 표기)", use: "필지 주변 현황, 지도 시설 레이어 (45/46 지오코딩)" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_수방자재 현황", url: "https://www.data.go.kr/data/15085817/fileData.do", asof: "2025-12-30", license: "공공누리(포털 표기)", use: "필지 여건 — 해당 행정동 보유 수방자재(수중펌프·마대·워터댐 등)" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_공동주택 현황", url: "https://www.data.go.kr/data/3045074/fileData.do", asof: "2025-09-22", license: "공공누리(포털 표기)", use: "필지 여건·주변 현황 — 반경 150m 공동주택 단지(세대수·동수·준공년도, 도로명주소 지오코딩 176/180)" },
  { group: "국가 공간정보", provider: "국토교통부 (브이월드 공간정보 다운로드)", name: "GIS건물통합정보 — 경기도 전체본 2026-09-09·2025-09-04", url: "https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?dsId=30561", asof: "2026-09-09", license: "공공누리 제1유형(출처표시)", use: "건물 27,713동 도형·속성, 위반 표기(A20), 1년 변화(신규 88·해제 64), AI 점수 학습 데이터", limit: "제공기관 원문: \"전국단위로 구축기관이 상이하여 데이터는 참고용으로 활용 바랍니다\" · 대장 미연계 4,112동은 용도·구조 없음. 높이 0·이상치는 정보없음 처리" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_일반건축물_시가표준액", url: "https://www.data.go.kr/data/15080551/fileData.do", asof: "2024-12-31 판 (과세년도 2017~2023)", license: "이용허락범위 제한 없음", use: "이행강제금 참고 산정 — 필지(PNU)별 ㎡당 시가표준액을 계고·부과 문서의 80조①1호 산식에 자동 입력(위반면적은 담당자 입력). 조인 13,611/27,713동(49.1%), AI 후보 1,566/1,918", limit: "798,333행 중 안양 건물 필지와 붙는 9,186필지만. 부과 시점 시가표준액이 아니므로 확정 금액이 아님(과세년도 2023 최신). 동·호 합산 ÷ 연면적 합산" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털)", name: "안양시_일반 정비사업 추진현황", url: "https://www.data.go.kr/data/15150142/fileData.do", asof: "2025-04-30 판", license: "이용허락범위 제한 없음", use: "조사 순위 보정 C8 — 조합설립인가 이후·준공 전 구역(11곳) 지번 반경 200m 후보 −0.30 (곧 철거), 필지 여건 표시", limit: "42구역 전부 위치(지번)·경도·위도 제공. 구역 경계(폴리곤)는 없어 대표점 반경으로 대체" },
  { group: "안양시 공공데이터", provider: "경기도 안양시 (공공데이터포털 오픈API)", name: "안양시_도로굴착 공사현황 정보", url: "https://www.data.go.kr/data/15152770/openapi.do", asof: "2026-09-19 조회", license: "이용허락범위 제한 없음", use: "필지 타임라인(50m)·여건(100m)·지도 레이어·여건 보정 C7(진행 중·예정 굴착 +0.10). 빌드 시 1회 캐시, 런타임 호출 없음", limit: "진행예정·진행 중 55건만 제공(완료 이력 없음). 원본 EPSG:5186 → 4326 변환(55/55), 업체 연락처는 싣지 않음" },
  { group: "공공데이터포털(전국)", provider: "국토교통부", name: "지하안전정보 — 지반침하사고", url: "https://www.data.go.kr/data/15041891/openapi.do", asof: "2026-09-19 조회 (2018~)", license: "공공누리(포털 표기)", use: "안양 관내 지반침하사고 6건 → 필지 타임라인(50m)·여건(300m)·지도 레이어", limit: "좌표 미제공(0) → 지번으로 필지 매칭 2건, 브이월드 지오코더 4건. 착공후지하안전조사·중점관리대상은 안양 0건" },
  { group: "공공데이터포털(전국)", provider: "행정안전부", name: "급경사지 현황", url: "https://www.data.go.kr/data/15083292/fileData.do", asof: "2026-06-30", license: "공공누리(포털 표기)", use: "안양 47행 → 연속지적도 필지 위치화 45행(필지 38개)", limit: "시 발표 59곳과 12곳 차이. 호계3동 안양교도소는 지번 없음" },
  { group: "브이월드 API", provider: "국토교통부 브이월드", name: "WMTS 위성·하이브리드 배경지도", url: "https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do", asof: "실시간 조회", license: "브이월드 오픈API 이용약관", use: "지도 배경 (조회만, 타일 저장·가공 없음)", limit: "인증키 없거나 실패 시 OpenStreetMap 폴백" },
  { group: "브이월드 API", provider: "국토교통부 브이월드", name: "2D 데이터 API — LT_C_UD801 개발제한구역", url: "https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do", asof: "2026-09-18 조회", license: "브이월드 오픈API 이용약관", use: "개발제한구역 레이어(안양 bbox 31 폴리곤), 건물 GB 내부 여부 626동" },
  { group: "브이월드 API", provider: "국토교통부 브이월드", name: "2D 데이터 API — LP_PA_CBND_BUBUN 연속지적도", url: "https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do", asof: "2026-09-18 조회", license: "브이월드 오픈API 이용약관", use: "급경사지 PNU → 필지 도형" },
  { group: "브이월드 API", provider: "국토교통부 브이월드", name: "지오코더 API", url: "https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do", asof: "2026-09-18 조회", license: "브이월드 오픈API 이용약관", use: "사고 주소·공공건축물·대피시설·급수시설 좌표화" },
  { group: "기타", provider: "행정동 경계(통계청 SGIS 기반)", name: "안양시 행정동 31개 경계", url: "https://sgis.kostat.go.kr/", asof: "핸드오프 2026-09-17", license: "공공누리", use: "지도 경계선·동 이름 라벨" },
  { group: "기타", provider: "언론 보도·안양시 2026 주요업무보고", name: "안양 관내 사고 이력 8건 (2022.8~2026.7)", url: "https://www.anyang.go.kr/", asof: "각 기사 일자", license: "출처 링크 인용", use: "타임라인 사고 이벤트 (박달동 139-137 등)", limit: "지점 좌표 3건만. 박달동 축대 붕괴 원인·소유 관계는 공식 미확인" },
  { group: "법령", provider: "법제처 국가법령정보센터", name: "건축법 79·80·80조의2, 건축법 시행령 115·115조의2·115조의3, 시행규칙 40조, 행정절차법 14·21·26·27조, 개발제한구역법 30조·30조의2, 급경사지법 시행령 2조, 안양시 건축 조례 37조 (15개 조문)", url: "https://www.law.go.kr/", asof: "2026-09-17 조회", license: "공공저작물", use: "근거 조문 RAG·문서 초안 인용" },
];
