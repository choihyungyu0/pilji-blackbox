# -*- coding: utf-8 -*-
"""
HWPX 템플릿 생성기 — data/doc-specs.json 의 블록을 python-hwpx(Apache-2.0)로 정품 HWPX 골격에 옮긴다.
런타임(브라우저)은 Contents/section0.xml 의 {{TOKEN}} 만 치환한다 (lib/hwpx.ts). PDF 인쇄 화면도 같은 spec 을 읽는다.
  python scripts/make_hwpx_templates.py

기안문 서식(행정업무 운영 규정 시행규칙 별지 1호)의 머리(행정기관명·수신·경유·제목)와 꼬리(기안자·검토자·결재권자·협조자·
시행·접수·주소·연락처·공개구분)는 head/seal/sign 블록으로 넣는다. 표는 셀 병합 없이(기계판독).
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
from hwpx.document import HwpxDocument

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "public", "templates")
os.makedirs(OUT, exist_ok=True)
SPEC = json.load(open(os.path.join(ROOT, "data", "doc-specs.json"), encoding="utf-8"))


def fill(table, rows):
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            table.set_cell_text(r, c, val)


def add_table(d, rows):
    ncol = max(len(r) for r in rows)
    t = d.add_table(len(rows), ncol)
    fill(t, [list(r) + [""] * (ncol - len(r)) for r in rows])
    return t


def build(name, spec):
    d = HwpxDocument.new()
    for b in spec["blocks"]:
        if "p" in b:
            d.add_paragraph(b["p"])
        elif "blank" in b:
            for _ in range(int(b["blank"])):
                d.add_paragraph("")
        elif "kv" in b:
            add_table(d, [[k, v] for k, v in b["kv"]])
        elif "table" in b:
            add_table(d, b["table"])
        elif b.get("head"):
            # 별지 1호: 행정기관명 / 수신 / (경유) / 제목 — 용어는 표시하지 않고 내용만 적는 것이 원칙이나
            # 초안 검토 편의를 위해 수신·제목 라벨은 남긴다
            d.add_paragraph("{{ORG_NAME}}")
            d.add_paragraph("수신  {{TO}}")
            d.add_paragraph("(경유)  {{VIA}}")
            d.add_paragraph("제목  {{TITLE}}")
            d.add_paragraph("")
        elif b.get("seal"):
            d.add_paragraph("{{SENDER}}   (직인)")
            d.add_paragraph("")
        elif b.get("sign"):
            add_table(d, [
                ["기안자 {{DRAFTER}}", "검토자 {{REVIEWER}}", "결재권자 {{APPROVER}}"],
                ["협조자 {{COOP}}", "", ""],
                ["시행 {{DOC_NO}}", "접수 {{RECV_NO}}", ""],
                ["우 {{ORG_ADDR}}", "{{ORG_WEB}}", ""],
                ["전화 {{ORG_TEL}}  팩스 {{ORG_FAX}}", "{{ORG_EMAIL}}", "공개 구분 {{OPEN_CLASS}}"],
            ])
    path = os.path.join(OUT, f"{name}.hwpx")
    d.save_to_path(path)
    d2 = HwpxDocument.open(path)
    t = d2.text.plain
    txt = t() if callable(t) else t
    print(f"{name}.hwpx: {os.path.getsize(path):,}B · 토큰 {txt.count('{{')}개 · 재개봉 OK · {spec['source'][:40]}…")


if __name__ == "__main__":
    for name, spec in SPEC["templates"].items():
        build(name, spec)
    print("완료 →", os.path.abspath(OUT))
