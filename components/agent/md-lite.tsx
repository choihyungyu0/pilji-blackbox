import { Fragment } from "react";

/** LLM 답변용 최소 마크다운 — 제목(#)·굵게(**)·목록(-,1.)만. 외부 렌더러 없이 XSS 위험 없는 텍스트 노드로만 그린다. */
export function MdLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const h = line.match(/^#{1,6}\s+(.*)$/);
        if (h) return <p key={i} className="mt-1 font-bold">{inline(h[1])}</p>;
        const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (li) return <p key={i} className="pl-3 before:mr-1.5 before:content-['·']">{inline(li[1])}</p>;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}
