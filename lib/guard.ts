/**
 * AGT-03 · BR-A1 사실 생성 금지 — LLM 답변의 수치가 도구 결과·사용자 입력에 없으면
 * 그 문장을 삭제하고 로그를 남긴다. 환각 차단은 "삭제"로만 하고 값을 고쳐 쓰지 않는다.
 */

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;

/** 텍스트에서 숫자 토큰 집합 (쉼표 제거, 정규화) */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(NUM_RE) ?? []) {
    const n = m.replace(/,/g, "");
    out.add(n);
    // 0.7402 → "0.740", "74" 같은 반올림 표기도 허용
    if (n.includes(".")) {
      const f = parseFloat(n);
      if (Number.isFinite(f)) {
        out.add(f.toFixed(3));
        out.add(f.toFixed(2));
        out.add(f.toFixed(1));
        out.add(String(Math.round(f)));
        out.add(String(Math.round(f * 100))); // 비율→퍼센트
        out.add((f * 100).toFixed(1));
      }
    }
  }
  return out;
}

/** 조문 번호·목차·연도 등 — 도구 결과 없이도 허용되는 숫자 */
const ALWAYS_OK = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "2025", "2026"]);

export type GuardResult = { text: string; removed: string[] };

export function guardNumbers(answer: string, allowedSources: string[]): GuardResult {
  const allowed = new Set<string>(ALWAYS_OK);
  for (const s of allowedSources) for (const t of numberTokens(s)) allowed.add(t);

  const removed: string[] = [];
  const keep: string[] = [];
  // 문장 단위 — 줄바꿈과 마침표를 경계로. 조문 표기("제79조")·번호 목록("1.")·일자는 검사 제외
  const lines = answer.split(/\n/);
  for (const line of lines) {
    const sentences = line.split(/(?<=[.!?。])\s+/);
    const kept: string[] = [];
    for (const s of sentences) {
      const probe = s
        .replace(/제\s?\d+\s?조(?:의\s?\d+)?(?:\s?제\s?\d+\s?항)?(?:\s?제\s?\d+\s?호)?/g, " ")
        .replace(/^\s*\d+[.)]\s/g, " ")
        .replace(/\d{4}-\d{2}-\d{2}/g, " ")
        .replace(/\d{4}\.\s?\d{1,2}\.?(\s?\d{1,2}\.?)?/g, " ")
        .replace(/\d{4}년/g, " ")
        .replace(/\d{1,2}월|\d{1,2}일/g, " ");
      const nums = [...(probe.match(NUM_RE) ?? [])].map((m) => m.replace(/,/g, ""));
      const bad = nums.filter((n) => !allowed.has(n) && !allowed.has(n.replace(/\.0+$/, "")));
      if (bad.length) removed.push(s.trim());
      else kept.push(s);
    }
    keep.push(kept.join(" "));
  }
  return { text: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}
