"use client";

import JSZip from "jszip";
import type { DocTemplate } from "./types";

/**
 * DOC-01·02 HWPX 내보내기 — python-hwpx 로 만든 정품 템플릿(public/templates/*.hwpx)의
 * Contents/section0.xml 안 {{TOKEN}} 만 브라우저에서 치환한다. 문서는 서버를 거치지 않는다 (사각119 방식).
 * HWPX(OWPML, KS X 6101)는 ZIP 컨테이너 — mimetype 항목은 비압축(STORE)·선두 유지.
 */

const esc = (v: string) =>
  v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export async function buildHwpxBlob(template: DocTemplate, tokens: Record<string, string>): Promise<Blob> {
  const res = await fetch(`/templates/${template}.hwpx`);
  if (!res.ok) throw new Error(`템플릿 로드 실패 (${res.status})`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sectionPath = "Contents/section0.xml";
  const file = zip.file(sectionPath);
  if (!file) throw new Error("템플릿 구조 오류: section0.xml 없음");
  let xml = await file.async("string");
  for (const [k, v] of Object.entries(tokens)) xml = xml.replaceAll(`{{${k}}}`, esc(v ?? ""));
  // 값이 안 들어온 토큰은 공란 — 문서에 토큰 문자열을 남기지 않는다
  xml = xml.replace(/\{\{[A-Za-z0-9_]+\}\}/g, "");

  const out = new JSZip();
  const mime = zip.file("mimetype");
  if (mime) out.file("mimetype", await mime.async("uint8array"), { compression: "STORE" });
  for (const name of Object.keys(zip.files)) {
    if (name === "mimetype" || zip.files[name].dir) continue;
    if (name === sectionPath) out.file(name, xml, { compression: "DEFLATE" });
    else out.file(name, await zip.files[name].async("uint8array"), { compression: "DEFLATE" });
  }
  return out.generateAsync({ type: "blob", mimeType: "application/hwp+zip" });
}

export async function downloadHwpx(template: DocTemplate, tokens: Record<string, string>, filename: string): Promise<number> {
  const blob = await buildHwpxBlob(template, tokens);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".hwpx") ? filename : `${filename}.hwpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob.size;
}
