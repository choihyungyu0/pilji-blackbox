# -*- coding: utf-8 -*-
"""
DOC-01 현장조사 계획 기안문 · DOC-02 처분 사전통지서 초안 — HWPX 템플릿 생성기 (python-hwpx, Apache-2.0).

정품 라이브러리로 유효한 HWPX 골격을 만들어 public/templates/ 에 둔다.
런타임(브라우저)은 Contents/section0.xml 의 {{TOKEN}} 만 치환한다 (lib/hwpx.ts).
표는 셀 병합 없이(기계판독), 당사자 성명·주소 칸은 항상 공란(SEC-02).
  python scripts/make_hwpx_templates.py
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
from hwpx.document import HwpxDocument

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "templates")
os.makedirs(OUT, exist_ok=True)

SURVEY_ROWS = 20
EVIDENCE_LINES = 8


def fill(table, data):
    for r, row in enumerate(data):
        for c, val in enumerate(row):
            table.set_cell_text(r, c, val)


def doc01():
    d = HwpxDocument.new()
    d.add_paragraph("{{HEADER}}  ·  생성 {{GEN_AT}}")
    d.add_paragraph("")
    d.add_paragraph("{{TITLE}}")
    d.add_paragraph("")
    t = d.add_table(3, 4)
    fill(t, [
        ["부서", "{{DEPT}}", "기안일", "{{TODAY}}"],
        ["기안자", "{{DRAFTER}}", "데이터 기준일", "{{DATA_ASOF}}"],
        ["조사 예정일", "{{PLAN_DATE}}", "조사반", "{{TEAM}}"],
    ])
    d.add_paragraph("")
    d.add_paragraph("1. 목적")
    d.add_paragraph("{{PURPOSE}}")
    d.add_paragraph("")
    d.add_paragraph("2. 조사 대상")
    d.add_paragraph("{{TARGET_SUMMARY}}")
    t2 = d.add_table(SURVEY_ROWS + 1, 8)
    header = ["순번", "법정동", "지번", "주용도", "사용승인", "AI 점수", "등급", "GB"]
    rows = [header] + [[f"{{{{R{i}C{j}}}}}" for j in range(1, 9)] for i in range(1, SURVEY_ROWS + 1)]
    fill(t2, rows)
    d.add_paragraph("{{CAUTION}}")
    d.add_paragraph("")
    d.add_paragraph("3. 일정")
    d.add_paragraph("조사 예정일 {{PLAN_DATE}} · 조사반 {{TEAM}}")
    d.add_paragraph("")
    d.add_paragraph("4. 선정 방법")
    d.add_paragraph("{{METHOD}}")
    d.add_paragraph("")
    d.add_paragraph("5. 근거")
    d.add_paragraph("{{BASIS}}")
    d.add_paragraph("")
    d.add_paragraph("6. 근거 자료")
    for i in range(1, EVIDENCE_LINES + 1):
        d.add_paragraph(f"{{{{EV{i}}}}}")
    d.add_paragraph("")
    d.add_paragraph("※ 본 문서는 정적 공공데이터와 사전 계산된 AI 점수로 만든 초안이며, 담당자 검토·결재 전에는 효력이 없습니다. 소유자·거주자 정보는 수록하지 않습니다.")
    return d


def doc02():
    d = HwpxDocument.new()
    d.add_paragraph("{{HEADER}}  ·  생성 {{GEN_AT}}")
    d.add_paragraph("")
    d.add_paragraph("처분 사전통지서 (초안)")
    d.add_paragraph("행정절차법 제21조제1항 각 호의 기재사항 순서로 작성")
    d.add_paragraph("")
    t = d.add_table(2, 4)
    fill(t, [
        ["처분청(부서)", "{{DEPT}}", "작성일", "{{TODAY}}"],
        ["담당자", "{{DRAFTER}}", "데이터 기준일", "{{DATA_ASOF}}"],
    ])
    d.add_paragraph("")
    t2 = d.add_table(10, 2)
    fill(t2, [
        ["1. 처분의 제목", "{{DISP_TITLE}}"],
        ["2. 당사자 성명(명칭)", "{{PARTY_NAME}}"],
        ["   당사자 주소", "{{PARTY_ADDR}}"],
        ["   대상 건축물 소재지", "{{SITE_ADDR}} (PNU {{PNU}})"],
        ["   건축물 개요", "{{BLDG_INFO}}"],
        ["3. 처분하려는 원인이 되는 사실", "{{FACT}}"],
        ["   처분의 내용", "{{CONTENT}}"],
        ["   법적 근거", "{{BASIS}}"],
        ["4. 의견제출 안내", "{{OPINION}}"],
        ["5. 의견제출기관", "{{ORG_NAME}} {{ORG_ADDR}}"],
    ])
    t3 = d.add_table(2, 2)
    fill(t3, [
        ["6. 의견제출기한", "{{DUE_DATE}} ({{DUE_DAYS}}일) — {{DUE_NOTE}}"],
        ["7. 그 밖에 필요한 사항", "{{ETC}}"],
    ])
    d.add_paragraph("")
    d.add_paragraph("근거 자료")
    for i in range(1, EVIDENCE_LINES + 1):
        d.add_paragraph(f"{{{{EV{i}}}}}")
    d.add_paragraph("")
    d.add_paragraph("※ 당사자 성명·주소 칸은 자동으로 채우지 않습니다(개인정보 비수집). 담당자가 발송 시 직접 기재합니다.")
    d.add_paragraph("※ 본 초안은 담당자의 현장 판정(위반)이 있는 필지에 한해 생성되었으며, AI 점수만으로는 생성되지 않습니다.")
    return d


def save(d, name):
    path = os.path.join(OUT, name)
    d.save_to_path(path)
    d2 = HwpxDocument.open(path)
    txt = d2.export_text()
    print(f"{name}: {os.path.getsize(path):,}B · 토큰 {txt.count('{{')}개 · 재개봉 OK")


if __name__ == "__main__":
    save(doc01(), "doc01_survey_plan.hwpx")
    save(doc02(), "doc02_prior_notice.hwpx")
    print("완료 →", os.path.abspath(OUT))
