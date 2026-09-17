import "server-only";
import { laws } from "./data-server";
import type { Citation, LawItem } from "./types";

/**
 * AGT-02 rules.rag — 국가법령정보센터 현행 조문(data/laws/laws.json)에서 키워드 점수로 검색.
 * 임베딩 없이 결정적으로 동작한다(키 불필요). 결과 없음 → "근거 조문 확인 필요".
 */
const STOP = new Set(["의", "및", "에", "를", "을", "이", "가", "은", "는", "으로", "로", "에서", "과", "와", "대한", "관한", "하는", "합니다", "해", "해줘", "주세요", "초안", "문서"]);

function tokens(q: string): string[] {
  return q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export function searchLaws(query: string, limit = 3): Citation[] {
  const toks = tokens(query);
  const scored = laws.map((item) => {
    let score = 0;
    const hay = `${item.law} ${item.article} ${item.title} ${item.keywords.join(" ")} ${item.paragraphs.join(" ")}`;
    for (const t of toks) {
      if (item.keywords.some((k) => k.includes(t) || t.includes(k))) score += 3;
      if (item.title.includes(t) || item.law.includes(t)) score += 2;
      if (hay.includes(t)) score += 1;
    }
    // 조문 번호 직접 언급
    const artMatch = query.match(/제\s?(\d+)\s?조(의\s?(\d+))?/g);
    if (artMatch && artMatch.some((a) => a.replace(/\s/g, "") === item.article)) score += 6;
    return { item, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => toCitation(item));
}

export function lawById(id: string): LawItem | null {
  return laws.find((l) => l.id === id) ?? null;
}

export function toCitation(item: LawItem, paragraphIdx = 0): Citation {
  const p = item.paragraphs[paragraphIdx] ?? item.paragraphs[0];
  return {
    id: item.id, law: item.law, article: item.article, title: item.title, url: item.url,
    excerpt: p.length > 220 ? p.slice(0, 220) + "…" : p,
  };
}

export function allLawsBrief() {
  return laws.map((l) => ({ id: l.id, law: l.law, article: l.article, title: l.title, url: l.url, enforced: l.enforced }));
}
