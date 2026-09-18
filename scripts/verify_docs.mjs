/**
 * 결재 문서 7종 종단 검증 — 담당자 모드 로그인 → /api/doc 7회 → JSZip 으로 HWPX 조립 → out/ 에 저장.
 * 이어서 python 으로 python-hwpx 재개봉 검증: python scripts/verify_docs.py
 *   node scripts/verify_docs.mjs <case.json> [baseUrl]
 * case.json: { case, org, ids, cases } — 브라우저 localStorage 의 사건 스토어에서 뽑은 값 (사진 제외)
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const [, , caseFile, base = "http://localhost:3600"] = process.argv;
const input = JSON.parse(fs.readFileSync(caseFile, "utf-8"));
const out = path.resolve("out");
fs.mkdirSync(out, { recursive: true });

const auth = await fetch(`${base}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: process.env.ADMIN_PIN ?? "anyang2026" }) });
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("로그인 실패");

const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const jobs = [
  ["survey_plan", { ids: input.ids, planDate: input.case.plan?.planDate, team: input.case.plan?.team }],
  ["survey_report", { cases: input.cases, team: input.case.plan?.team }],
  ["prior_notice", { case: input.case }],
  ["correction_order", { case: input.case }],
  ["fine_warning", { case: input.case }],
  ["fine_imposition", { case: input.case }],
  ["ledger", { case: input.case }],
];
for (const [template, body] of jobs) {
  const r = await fetch(`${base}/api/doc`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ template, ...body, org: input.org }) });
  const j = await r.json();
  if (!j.ok) { console.log(`✗ ${template}: ${j.error}`); continue; }
  const doc = j.doc;
  const zip = await JSZip.loadAsync(fs.readFileSync(`public/templates/${doc.template}.hwpx`));
  let xml = await zip.file("Contents/section0.xml").async("string");
  for (const [k, v] of Object.entries(doc.tokens)) xml = xml.replaceAll(`{{${k}}}`, esc(v));
  xml = xml.replace(/\{\{[A-Za-z0-9_]+\}\}/g, "");
  const z = new JSZip();
  z.file("mimetype", await zip.file("mimetype").async("uint8array"), { compression: "STORE" });
  for (const name of Object.keys(zip.files)) {
    if (name === "mimetype" || zip.files[name].dir) continue;
    z.file(name, name === "Contents/section0.xml" ? xml : await zip.files[name].async("uint8array"), { compression: "DEFLATE" });
  }
  const buf = await z.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(path.join(out, doc.filename), buf);
  console.log(`✓ ${template} → ${doc.filename} (${buf.length}B) 누락: ${doc.missing.join(", ") || "없음"}`);
}
