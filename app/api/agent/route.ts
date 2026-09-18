import { NextRequest, NextResponse } from "next/server";
import { openAiTools, runTool, type AgentContext } from "@/lib/tools";
import { guardNumbers } from "@/lib/guard";
import { findPII } from "@/lib/pii";
import { writeLog } from "@/lib/db";
import type { Citation, DocPayload, ToolCallLog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AGT-01 공간 AI 에이전트 — OpenAI 도구 호출 루프(최대 8회). 응답에 사용 도구·출처·근거 조문·문서 토큰을 붙인다.
 * AGT-03/BR-A1: 도구 결과에 없는 수치가 든 문장은 삭제하고 removed 로 알린다.
 * BR-A2: 도구 실패는 tools 로그에 남기고 답변에 명시하도록 지시한다.
 */
const SYSTEM = `당신은 안양시 건축과·도시계획과 담당 공무원을 돕는 "필지 블랙박스" 공간 AI 에이전트다.
규칙:
1. 필지 속성·점수·이력·조문·사건 단계는 반드시 도구(parcel_lookup, signal_score, timeline_build, rules_rag, case_status, doc_render, doc_check)로 조회한 결과만 쓴다. 도구 결과에 없는 수치·사건·날짜를 만들지 않는다.
0. 담당자 업무 순서: 후보 → 조사 계획(기안·결재) → 현장조사(판정) → 처분사전통지(행정절차법 21조, 의견제출기한 10일 이상) → 시정명령(건축법 79조①) → 이행강제금 계고(80조③) → 부과(80조④, 안양시 조례 연 1회) → 종결. 단계를 건너뛰는 문서는 만들지 않는다 — case_status 로 지금 단계와 가능한 다음 단계를 확인한 뒤 안내한다.
2. 도구가 실패하거나 미적재(available:false)이면 답변에 "조회 실패(도구명)" 또는 "미적재"라고 그대로 밝힌다. 숨기지 않는다.
3. AI 점수·등급은 "후보(현장 확인 전)"이며 위반 판정이 아니다. 등급은 조사 순서라고 설명한다.
4. 처분 사전통지 초안은 담당자 판정이 '위반'인 필지에서만 만든다(doc_render 가 거부하면 그 사유를 전한다). AI 점수만으로 처분 문서를 만들지 않는다.
5. 소유자·거주자 이름·연락처 등 개인정보는 묻지도 쓰지도 않는다.
6. 박달동 축대 붕괴(2026-05-21)의 원인·소유 관계는 공식 미확인이므로 단정하지 않는다.
7. 법령을 인용할 때는 rules_rag 결과의 법령명·조문 번호를 그대로 쓴다.
8. 문장은 짧고 딱딱하게. 불필요한 설명·인사말 금지. 한국어. 마크다운 굵게(**)는 쓰지 않는다.
9. 사용자가 문서를 요청하면 doc_render 를 호출한다(survey_plan·survey_report: 조사 목록, prior_notice·correction_order·fine_warning·fine_imposition·ledger: 선택 필지 사건). 반환된 checklist 의 누락 항목을 답변에 적는다. 단계 전제가 안 맞아 거부되면 그 사유와 먼저 할 일을 안내한다.
10. 결측값(null)은 "정보없음"이라고 쓴다. 0으로 바꾸지 않는다.`;

/** 키 설정 여부 — 화면에서 "키 필요" 안내용 (키 값은 절대 반환하지 않는다) */
export async function GET() {
  return NextResponse.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-4o-mini" });
}

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string };

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정 — 에이전트 대화를 쓸 수 없습니다. 문서 생성 버튼은 키 없이 동작합니다." }, { status: 503 });

  let body: { messages?: { role: string; content: string }[]; context?: AgentContext };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 1000) }));
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) return NextResponse.json({ ok: false, error: "요청 내용을 입력해 주세요" }, { status: 400 });
  const pii = findPII(last.content);
  if (pii) return NextResponse.json({ ok: false, error: `개인정보는 입력할 수 없어요 (${pii})` }, { status: 400 });

  const ctx: AgentContext = body.context ?? {};
  const ctxLine = [
    ctx.id ? `선택 건물 id=${ctx.id}` : null,
    ctx.pnu ? `선택 필지 pnu=${ctx.pnu}` : null,
    ctx.listIds?.length ? `조사 목록 ${ctx.listIds.length}건 (id: ${ctx.listIds.slice(0, 30).join(",")})` : "조사 목록 없음",
    ctx.cases && Object.keys(ctx.cases).length ? `등록 사건 ${Object.keys(ctx.cases).length}건 (단계: ${Object.values(ctx.cases).map((c) => c.stage).join(",").slice(0, 120)})` : "등록 사건 없음",
  ].filter(Boolean).join(" · ");

  const messages: Msg[] = [{ role: "system", content: `${SYSTEM}\n\n[현재 컨텍스트] ${ctxLine}` }, ...history];
  const tools = openAiTools();
  const logs: ToolCallLog[] = [];
  const toolTexts: string[] = [];
  const citations: Citation[] = [];
  const docs: DocPayload[] = [];
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  let answer = "";
  try {
    for (let round = 0; round < 8; round++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 900 }),
      });
      if (!res.ok) {
        const t = await res.text();
        return NextResponse.json({ ok: false, error: `LLM 오류 ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
      }
      const data = (await res.json()) as { choices: { message: Msg & { tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
      const msg = data.choices[0].message;
      if (msg.tool_calls?.length) {
        messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }
          const { result, log } = await runTool(tc.function.name, args, ctx);
          logs.push(log);
          const r = result as Record<string, unknown>;
          if (tc.function.name === "rules_rag" && Array.isArray(r.citations)) citations.push(...(r.citations as Citation[]));
          if (tc.function.name === "doc_render" && r.template && r.tokens) docs.push(r as unknown as DocPayload);
          // 문서 토큰은 길어서 LLM 에는 요약만 넘긴다 (파일은 클라이언트가 만든다)
          const forLlm =
            tc.function.name === "doc_render" && r.tokens
              ? { template: r.template, filename: r.filename, checklist: r.checklist, missing: r.missing, evidence: r.evidence, generatedAt: r.generatedAt, note: "문서 토큰은 화면에 전달됨 — 다운로드 버튼으로 HWPX 생성" }
              : result;
          const text = JSON.stringify(forLlm).slice(0, 12000);
          toolTexts.push(text);
          messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: text });
        }
        continue;
      }
      answer = msg.content ?? "";
      break;
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: `LLM 호출 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
  if (!answer) answer = "도구 호출이 반복되어 답변을 만들지 못했습니다. 요청을 나눠서 다시 시도해 주세요.";

  // BR-A1 수치 검증 — 도구 결과·사용자 입력·컨텍스트에 있는 숫자만 허용
  const guarded = guardNumbers(answer, [...toolTexts, ...history.map((m) => m.content), ctxLine]);
  const failed = logs.filter((l) => !l.ok);
  let finalText = guarded.text;
  if (failed.length && !failed.every((f) => finalText.includes(f.name) || finalText.includes("조회 실패"))) {
    finalText += `\n\n조회 실패: ${failed.map((f) => `${f.name}(${f.note})`).join(", ")}`;
  }
  if (guarded.removed.length) finalText += `\n\n※ 도구 결과에 없는 수치가 포함된 문장 ${guarded.removed.length}개를 삭제했습니다 (BR-A1).`;

  void writeLog({ kind: "agent", summary: `${last.content.slice(0, 80)} → 도구 ${logs.length}회, 삭제 ${guarded.removed.length}` });
  const uniqCites = citations.filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
  return NextResponse.json({ ok: true, answer: finalText, tools: logs, citations: uniqCites, docs, removed: guarded.removed, model });
}
