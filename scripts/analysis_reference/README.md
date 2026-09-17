# 분석 스크립트 (재현용)

실행 순서와 입출력. 경로는 작성 환경 기준이므로 실행 전 상단 경로 변수를 이 폴더 구조에 맞게 바꿀 것.

| 순서 | 파일 | 입력 | 출력 |
|---|---|---|---|
| 1 | 01_extract_anyang_from_vworld_zip.py | raw/AL_D010_41_20260909.zip (브이월드 경기도 전체본) | raw/anyang_bldg_20260909_5186.geojson (27,713동) |
| 1b | 같은 스크립트 | raw/AL_D010_41_20250904.zip | raw/anyang_bldg_20250904_5186.geojson (27,712동) |
| 2 | 02_load_features.py / 02b_load_features_2025.py | 위 GeoJSON | bldg.pkl / bldg_old.pkl (중심점 좌표·속성 표) |
| 3 | 03_model_spatial_cv.py | bldg.pkl | labeled_oof.pkl, bldg_feat.pkl, model_full.pkl — 공간 5-fold AUC 0.728 |
| 4 | 04_stats_candidates.py | 위 결과 | 동별 통계, 후보 1,918동 |
| 5 | 05_temporal_validation.py | bldg_old.pkl + bldg.pkl | 시간 검증 AUC 0.698, temporal_scores.pkl |
| 6 | 06_export_handoff_data.py | 위 전부 | data/ 폴더의 GeoJSON·CSV·JSON |
| 7 | 07_charts.py | 위 전부 | assets/img/ 그림 |

필요 패키지: pandas, numpy, scikit-learn, pyproj, shapely, pyshp, matplotlib
주의: 02 스크립트는 중심점 x,y 열 이름이 03에서 cx,cy로 바뀜(라벨 열 y와 충돌 방지).
