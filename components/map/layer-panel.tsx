"use client";

import { useApp, type ColorMode, type LayerKey } from "@/store/app-store";
import { useBuildings } from "@/store/buildings";
import { cn } from "@/lib/utils";
import { COLORS, USE_COLORS } from "./map-style";
import type { Mode } from "@/lib/types";

type LayerDef = { key: LayerKey; label: string; color: string; officerOnly?: boolean; publicOnly?: boolean; count?: (c: Record<string, number>) => string; hint: string; disabled?: string };

const P1_LAYERS = [
  { label: "도로굴착", why: "안양시 도로굴착 API(15152770) 활용신청 후 적재 (P1)" },
  { label: "지반침하", why: "국토부 지하안전정보 API(15041891) 활용신청 후 적재 (P1)" },
  { label: "CCTV 위치", why: "경기데이터드림 CCTV 현황 미적재 (P1)" },
  { label: "위성 변화 구역", why: "Sentinel-2 지수 사전계산 미완료 (P1)" },
];

/** LYR-01~08 레이어 토글 + SEG-01 색상 기준 + 범례 (MAP-02·03) */
export function LayerPanel({ mode }: { mode: Mode }) {
  const layers = useApp((s) => s.layers);
  const toggle = useApp((s) => s.toggleLayer);
  const colorMode = useApp((s) => s.colorMode);
  const setColorMode = useApp((s) => s.setColorMode);
  const counts = useBuildings((s) => s.index?.counts);
  const officer = mode === "officer";

  const defs: LayerDef[] = [
    { key: "viol", label: "위반 표기", color: COLORS.viol, count: (c) => `${c.viol_Y.toLocaleString()}동`, hint: "건물통합정보 A20=Y (공개 데이터)" },
    officer
      ? { key: "cand", label: "AI 후보", color: COLORS.candA, count: (c) => `${c.cand.toLocaleString()}동`, hint: "후보(현장 확인 전). A ≥0.222 진한 주황, B ≥0.165 연한 주황" }
      : { key: "grid", label: "AI 후보 (100m 격자)", color: COLORS.candA, count: (c) => `${c.cand.toLocaleString()}동`, hint: "공개 모드는 격자 개수로만 표시 (BR-P1)" },
    { key: "ledger", label: "대장 미연계", color: COLORS.ledger, count: (c) => `${c.ledger_false.toLocaleString()}동`, hint: "용도·구조가 빈 건물 — 부속건물·가설물일 수 있음 (S1)" },
    { key: "gb", label: "개발제한구역", color: COLORS.gb, hint: "브이월드 LT_C_UD801 · 초록 반투명" },
    { key: "slopes", label: "급경사지 (공개 47곳)", color: COLORS.slope, hint: "행안부 급경사지 현황 → 연속지적도 필지 외곽선. 시 발표 59곳과 12곳 차이" },
    { key: "facilities", label: "공공건축물·대피·급수시설", color: "#a855f7", hint: "안양시 공공데이터 3종 지오코딩 (줌 14 이상)" },
    { key: "hjd", label: "행정동 경계", color: "#ffffff", hint: "행정동 31개" },
  ];

  const modes: { key: ColorMode; label: string; officerOnly?: boolean }[] = [
    { key: "score", label: "AI 점수", officerOnly: true },
    { key: "viol", label: "위반 표기" },
    { key: "age", label: "경과연수" },
    { key: "use", label: "용도" },
  ];

  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="label mb-1.5">레이어</p>
        <ul className="space-y-1">
          {defs.map((d) => (
            <li key={d.key} title={d.hint}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={layers[d.key]} onChange={() => toggle(d.key)} className="accent-ink" />
                <span className="inline-block size-2.5 rounded-sm border border-black/20" style={{ background: d.color }} />
                <span className="flex-1">{d.label}</span>
                {counts && d.count && <span className="tnum text-muted-foreground">{d.count(counts)}</span>}
              </label>
            </li>
          ))}
          {P1_LAYERS.map((p) => (
            <li key={p.label} title={p.why} className="flex items-center gap-2 text-muted-foreground/70">
              <input type="checkbox" disabled className="accent-ink" />
              <span className="inline-block size-2.5 rounded-sm border border-dashed border-black/20" />
              <span className="flex-1">{p.label}</span>
              <span className="text-[10px]">미적재</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="label mb-1.5">색상 기준</p>
        <div className="grid grid-cols-4 gap-1">
          {modes.filter((m) => !m.officerOnly || officer).map((m) => (
            <button
              key={m.key}
              onClick={() => setColorMode(m.key)}
              className={cn("h-7 rounded border text-[11px] font-medium", colorMode === m.key ? "border-ink bg-ink text-white" : "border-border bg-paper hover:bg-accent")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Legend mode={colorMode} officer={officer} />
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        회색 = 정보없음(결측). 판정 색: 위반 <i className="inline-block size-2 rounded-sm" style={{ background: COLORS.verdict.VIOLATION }} /> 정상{" "}
        <i className="inline-block size-2 rounded-sm" style={{ background: COLORS.verdict.NORMAL }} /> 대상아님{" "}
        <i className="inline-block size-2 rounded-sm" style={{ background: COLORS.verdict.NOT_TARGET }} /> 보류{" "}
        <i className="inline-block size-2 rounded-sm" style={{ background: COLORS.verdict.HOLD }} />
      </p>
    </div>
  );
}

function Legend({ mode, officer }: { mode: ColorMode; officer: boolean }) {
  if (mode === "score" && officer)
    return (
      <div className="mt-1.5">
        <div className="h-2 rounded" style={{ background: "linear-gradient(90deg,#e5e7eb,#fde68a 20%,#fb923c 35%,#ef4444 45%,#991b1b 70%,#450a0a)" }} />
        <div className="tnum mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>0</span><span>0.165 B</span><span>0.222 A</span><span>0.75</span>
        </div>
      </div>
    );
  if (mode === "viol")
    return (
      <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
        <span><i className="mr-1 inline-block size-2 rounded-sm" style={{ background: COLORS.viol }} />Y 위반</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm" style={{ background: COLORS.neutral }} />N</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm" style={{ background: COLORS.na }} />정보없음</span>
      </div>
    );
  if (mode === "age")
    return (
      <div className="mt-1.5">
        <div className="h-2 rounded" style={{ background: "linear-gradient(90deg,#dbeafe,#93c5fd,#3b82f6,#1d4ed8,#1e3a8a)" }} />
        <div className="tnum mt-0.5 flex justify-between text-[10px] text-muted-foreground"><span>0년</span><span>30년</span><span>70년+</span></div>
      </div>
    );
  if (mode === "use")
    return (
      <ul className="mt-1.5 grid grid-cols-2 gap-x-2 text-[10px] text-muted-foreground">
        {USE_COLORS.map(([u, c]) => (
          <li key={u} className="truncate"><i className="mr-1 inline-block size-2 rounded-sm" style={{ background: c }} />{u}</li>
        ))}
        <li><i className="mr-1 inline-block size-2 rounded-sm" style={{ background: "#a3a3a3" }} />기타</li>
      </ul>
    );
  return null;
}
