"use client";

import { useState } from "react";
import { Camera, RefreshCw, Save } from "lucide-react";
import { useApp, VERDICT_ORDER } from "@/store/app-store";
import { useCases } from "@/store/cases";
import { VERDICT_LABEL, VIOLATION_TYPES, type Building, type CaseSurvey, type Verdict, type ViolationType } from "@/lib/types";
import { findPII } from "@/lib/pii";
import { stripExifThumbnail } from "@/lib/photo";
import { syncSurvey } from "@/lib/client-docs";
import { cn } from "@/lib/utils";

const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 현장조사 판정 (INV-02 + 시행규칙 40조 기록). 위반이면 유형·면적·층·내용을 받아 사전통지·시정명령·관리대장의 원인 사실이 된다.
 * compact=true 는 목록 표용(판정 4버튼 + 내용 한 줄). 저장 → 사건 스토어(기기) → 서버 동기화 시도.
 */
export function SurveyForm({ b, compact }: { b: Building; compact?: boolean }) {
  const c = useCases((s) => s.cases[b.id]);
  const ensure = useCases((s) => s.ensure);
  const setSurvey = useCases((s) => s.setSurvey);
  const addLog = useApp((s) => s.addLog);
  const showToast = useApp((s) => s.showToast);
  const sv = c?.survey;
  const [verdict, setVerdict] = useState<Verdict | null>(sv?.verdict ?? null);
  const [at, setAt] = useState(sv?.at ? sv.at.slice(0, 16) : nowLocal());
  const [vtype, setVtype] = useState<ViolationType | "">(sv?.violationType ?? "");
  const [area, setArea] = useState<string>(sv?.area == null ? "" : String(sv.area));
  const [floor, setFloor] = useState(sv?.floor ?? "");
  const [useBefore, setUseBefore] = useState(sv?.useBefore ?? "");
  const [useAfter, setUseAfter] = useState(sv?.useAfter ?? "");
  const [findings, setFindings] = useState(sv?.findings ?? "");
  const [surveyor, setSurveyor] = useState(sv?.surveyor ?? "");
  const [photo, setPhoto] = useState<string | null>(sv?.photo ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(v?: Verdict) {
    const vv = v ?? verdict;
    if (!vv) return setErr("판정을 선택해 주세요");
    const pii = findPII(findings);
    if (pii) return setErr(`개인정보는 입력할 수 없어요 (${pii})`);
    if (vv === "VIOLATION" && !findings.trim() && !compact) return setErr("위반 판정은 위반 내용(원인 사실)을 적어야 합니다");
    setErr(null);
    setBusy(true);
    if (v) setVerdict(v);
    ensure(b, c?.origin ?? (b.cand ? "ai" : "manual"));
    const survey: CaseSurvey = {
      at: new Date(at || nowLocal()).toISOString(),
      verdict: vv,
      violationType: vv === "VIOLATION" ? (vtype || "기타") : null,
      area: area === "" ? null : Number(area),
      floor: floor || undefined,
      useBefore: useBefore || undefined,
      useAfter: useAfter || undefined,
      findings: findings.slice(0, 500),
      photo,
      surveyor: surveyor || undefined,
    };
    setSurvey(b.id, survey);
    addLog("verdict", `${b.dong} ${b.jibun} → ${VERDICT_LABEL[vv]}${survey.violationType ? ` · ${survey.violationType}` : ""}`);
    const next = useCases.getState().cases[b.id];
    if (next) await syncSurvey(next);
    setBusy(false);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const thumb = await stripExifThumbnail(f, 320);
      setPhoto(thumb);
      showToast("사진 처리(EXIF 제거·축소) — 저장 시 기기에 보관", "ok");
    } catch (er) {
      showToast(er instanceof Error ? er.message : "사진 처리 실패", "error");
    }
  }

  const VerdictButtons = (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="판정">
      {VERDICT_ORDER.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={verdict === v}
          disabled={busy}
          onClick={() => (compact ? save(v) : setVerdict(v))}
          className={cn(
            "h-7 rounded border px-2 text-[11px] font-medium",
            verdict === v
              ? v === "VIOLATION" ? "border-red-800 bg-red-800 text-white" : v === "NORMAL" ? "border-green-700 bg-green-700 text-white" : v === "NOT_TARGET" ? "border-zinc-600 bg-zinc-600 text-white" : "border-violet-700 bg-violet-700 text-white"
              : "border-border bg-paper hover:bg-accent"
          )}
        >
          {VERDICT_LABEL[v]}
        </button>
      ))}
      {c?.survey && c.synced === false && (
        <button className="chip text-amber-800" onClick={() => syncSurvey(c)} disabled={busy} title="서버 저장 재시도"><RefreshCw className="size-3" /> 기기 보관 · 재시도</button>
      )}
    </div>
  );

  if (compact)
    return (
      <div className="space-y-1 text-[11px]">
        {VerdictButtons}
        <div className="flex gap-1">
          <input className="input h-7 flex-1 text-[11px]" placeholder="위반 내용 / 메모 (개인정보 금지)" value={findings} maxLength={500} onChange={(e) => setFindings(e.target.value)} onBlur={() => verdict && findings !== (sv?.findings ?? "") && save()} />
          <label className="btn btn-sm cursor-pointer" title="현장 사진 — EXIF 제거"><Camera className="size-3.5" /><input type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPhoto} /></label>
          {photo && <img src={photo} alt="" className="size-7 rounded object-cover" />}
        </div>
        {err && <p className="text-red-600">{err}</p>}
      </div>
    );

  return (
    <div className="space-y-2 text-xs">
      <div className="grid gap-1.5 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="label mb-1">판정</p>
          {VerdictButtons}
        </div>
        <label className="block">
          <span className="text-[10px] text-muted-foreground">조사 일시</span>
          <input type="datetime-local" className="input mt-0.5 h-8 text-xs" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
      </div>
      {verdict === "VIOLATION" && (
        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-red-200 bg-red-50/40 p-2 sm:grid-cols-4">
          <label className="block"><span className="text-[10px] text-muted-foreground">위반 유형 *</span>
            <select className="input mt-0.5 h-8 w-full text-xs" value={vtype} onChange={(e) => setVtype(e.target.value as ViolationType)}>
              <option value="">선택</option>
              {VIOLATION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[10px] text-muted-foreground">위반 면적(㎡)</span><input type="number" step="0.1" min={0} className="input mt-0.5 h-8 w-full text-xs" value={area} onChange={(e) => setArea(e.target.value)} /></label>
          <label className="block"><span className="text-[10px] text-muted-foreground">위반 층</span><input className="input mt-0.5 h-8 w-full text-xs" placeholder="옥상·2층" value={floor} onChange={(e) => setFloor(e.target.value)} /></label>
          <label className="block"><span className="text-[10px] text-muted-foreground">조사자(직위)</span><input className="input mt-0.5 h-8 w-full text-xs" value={surveyor} onChange={(e) => setSurveyor(e.target.value)} /></label>
          {vtype === "무단용도변경" && (
            <>
              <label className="block sm:col-span-2"><span className="text-[10px] text-muted-foreground">변경 전 용도</span><input className="input mt-0.5 h-8 w-full text-xs" placeholder={b.use ?? ""} value={useBefore} onChange={(e) => setUseBefore(e.target.value)} /></label>
              <label className="block sm:col-span-2"><span className="text-[10px] text-muted-foreground">변경 후 용도</span><input className="input mt-0.5 h-8 w-full text-xs" value={useAfter} onChange={(e) => setUseAfter(e.target.value)} /></label>
            </>
          )}
        </div>
      )}
      <label className="block">
        <span className="text-[10px] text-muted-foreground">{verdict === "VIOLATION" ? "위반 내용 — 처분의 원인이 되는 사실 (행정절차법 21조①3) *" : "현장 확인 사항 / 메모"} · 개인정보 입력 금지, 500자</span>
        <textarea className="input mt-0.5 h-20 w-full py-1.5 text-xs" value={findings} maxLength={500} onChange={(e) => setFindings(e.target.value)} placeholder="예: 옥상에 경량철골조 약 30㎡ 무단 증축, 창고로 사용 중. 대장상 2층 대비 현황 3층." />
      </label>
      <div className="flex items-center gap-2">
        <label className="btn h-8 cursor-pointer" title="현장 사진 — EXIF(위치·기기) 제거 후 320px 썸네일만 기기 보관"><Camera className="size-3.5" /> 사진<input type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPhoto} /></label>
        {photo && <img src={photo} alt="현장 사진 썸네일" className="h-12 rounded object-cover" />}
        <button className="btn-primary ml-auto h-8" disabled={busy || !verdict} onClick={() => save()}><Save className="size-3.5" /> {busy ? "저장 중…" : "판정 저장"}</button>
      </div>
      {err && <p className="text-red-600" role="alert">{err}</p>}
      {sv && <p className="text-[10px] text-muted-foreground">마지막 저장 {new Date(sv.at).toLocaleString("ko-KR")} · {c?.synced ? "서버 저장" : "기기 보관"}</p>}
    </div>
  );
}
