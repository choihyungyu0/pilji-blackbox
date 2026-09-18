"use client";

import specs from "@/data/doc-specs.json";
import type { DocTemplate } from "@/lib/types";

/**
 * PDF 인쇄 화면 — HWPX 템플릿과 같은 data/doc-specs.json 블록을 A4 로 그린다.
 * 브라우저 "PDF로 저장"이 곧 PDF 산출. 한글 폰트 임베딩 문제가 없고 서식이 HWPX 와 1:1 로 맞는다.
 */
type Block =
  | { p: string; style?: string }
  | { kv: [string, string][] }
  | { table: string[][] }
  | { head: true }
  | { seal: true }
  | { sign: true }
  | { blank: number };

type Spec = { title: string; source: string; blocks: Block[] };
const SPECS = (specs as { templates: Record<string, Spec> }).templates;

const fill = (text: string, tokens: Record<string, string>) => text.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, k) => tokens[k] ?? "");

export function PrintDoc({ template, tokens }: { template: DocTemplate; tokens: Record<string, string> }) {
  const spec = SPECS[template];
  if (!spec) return <p>알 수 없는 템플릿</p>;
  const t = (x: string) => fill(x, tokens);
  return (
    <article className="doc">
      {spec.blocks.map((b, i) => {
        if ("p" in b) {
          const st = b.style ?? "body";
          const text = t(b.p);
          if (!text.trim() && st !== "blank") return null;
          return <p key={i} className={`p-${st}`}>{text}</p>;
        }
        if ("blank" in b) return <div key={i} style={{ height: `${b.blank * 10}mm` }} />;
        if ("kv" in b)
          return (
            <table key={i} className="kv">
              <tbody>
                {b.kv.map(([k, v], j) => (
                  <tr key={j}><th>{t(k)}</th><td>{t(v)}</td></tr>
                ))}
              </tbody>
            </table>
          );
        if ("table" in b) {
          const rows = b.table.map((r) => r.map(t)).filter((r, j) => j === 0 || r.some((c) => c.trim()));
          return (
            <table key={i} className="grid">
              <thead><tr>{rows[0].map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
            </table>
          );
        }
        if ("head" in b)
          return (
            <header key={i} className="head">
              <p className="org">{t("{{ORG_NAME}}")}</p>
              <p><span className="lbl">수신</span>{t("{{TO}}") || <span className="fillin">(담당자 기재)</span>}</p>
              <p><span className="lbl">(경유)</span>{t("{{VIA}}")}</p>
              <p className="title"><span className="lbl">제목</span>{t("{{TITLE}}")}</p>
            </header>
          );
        if ("seal" in b)
          return (
            <p key={i} className="seal">{t("{{SENDER}}")} <span className="stamp">직인</span></p>
          );
        if ("sign" in b)
          return (
            <footer key={i} className="sign">
              <table>
                <tbody>
                  <tr><td>기안자 {t("{{DRAFTER}}")}</td><td>검토자 {t("{{REVIEWER}}")}</td><td>결재권자 {t("{{APPROVER}}")}</td></tr>
                  <tr><td colSpan={3}>협조자 {t("{{COOP}}")}</td></tr>
                  <tr><td colSpan={2}>시행 {t("{{DOC_NO}}")}</td><td>접수 {t("{{RECV_NO}}")}</td></tr>
                  <tr><td colSpan={2}>우 {t("{{ORG_ADDR}}")}</td><td>{t("{{ORG_WEB}}")}</td></tr>
                  <tr><td>전화 {t("{{ORG_TEL}}")} / 팩스 {t("{{ORG_FAX}}")}</td><td>{t("{{ORG_EMAIL}}")}</td><td>공개 구분 {t("{{OPEN_CLASS}}")}</td></tr>
                </tbody>
              </table>
            </footer>
          );
        return null;
      })}
      <p className="p-small src">서식 출처: {spec.source}</p>
    </article>
  );
}

export const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
html, body { background: #fff; }
.doc { font-family: var(--font-pretendard), "Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif; color: #000; font-size: 11.5pt; line-height: 1.55; max-width: 178mm; margin: 0 auto; }
.doc p { margin: 0 0 3mm; word-break: keep-all; }
.p-watermark { color: #b45309; font-size: 9.5pt; border: 1px dashed #b45309; padding: 2mm 3mm; text-align: center; }
.p-title { font-size: 18pt; font-weight: 800; text-align: center; margin: 6mm 0 5mm; letter-spacing: 0.1em; }
.p-h2 { font-weight: 700; margin-top: 5mm; }
.p-note { font-size: 10pt; color: #333; }
.p-small { font-size: 8.5pt; color: #444; }
.head { border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 3mm 0; margin-bottom: 4mm; }
.head .org { font-size: 20pt; font-weight: 800; text-align: center; margin-bottom: 3mm; letter-spacing: 0.25em; }
.head .lbl { display: inline-block; width: 16mm; font-weight: 600; }
.head .title { font-weight: 700; }
.fillin { color: #999; }
.kv, .grid, .sign table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 10.5pt; }
.kv th, .kv td, .grid th, .grid td, .sign td { border: 1px solid #000; padding: 1.6mm 2mm; vertical-align: top; text-align: left; }
.kv th { width: 34%; background: #f3f4f6; font-weight: 600; }
.grid th { background: #f3f4f6; font-weight: 600; text-align: center; font-size: 9.5pt; }
.grid td { font-size: 9.5pt; }
.seal { text-align: center; font-size: 17pt; font-weight: 800; letter-spacing: 0.3em; margin: 8mm 0 6mm; }
.seal .stamp { display: inline-block; width: 16mm; height: 16mm; border: 1.5px solid #dc2626; border-radius: 50%; color: #dc2626; font-size: 8pt; letter-spacing: 0; line-height: 16mm; vertical-align: middle; margin-left: 4mm; }
.sign td { font-size: 9pt; }
.src { margin-top: 6mm; border-top: 1px solid #ccc; padding-top: 2mm; }
@media print { .no-print { display: none !important; } }
`;
