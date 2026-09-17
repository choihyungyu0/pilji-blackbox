/**
 * CHT-02 누적 포착 곡선 (DSH-02) — 공간 5-fold · 시간 검증. 인라인 SVG, 의존성 없음.
 * "상위 20% 조사 → 위반 46.8%(공간) / 46.6%(시간)" 지점을 표시. 값은 model_metrics.json 그대로.
 */
export function GainsChart({ spatial, temporal }: { spatial: [number, number][]; temporal: [number, number][] }) {
  const W = 560, H = 360, P = { l: 48, r: 16, t: 16, b: 40 };
  const x = (v: number) => P.l + v * (W - P.l - P.r);
  const y = (v: number) => H - P.b - v * (H - P.t - P.b);
  const path = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" ");
  const at = (pts: [number, number][], v: number) => pts.find(([a]) => Math.abs(a - v) < 1e-6)?.[1] ?? 0;
  const s20 = at(spatial, 0.2), t20 = at(temporal, 0.2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="누적 포착 곡선 — 상위 조사 비율 대비 위반 포착 비율">
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={y(0)} y2={y(1)} stroke="#e5e7eb" />
          <line x1={x(0)} x2={x(1)} y1={y(v)} y2={y(v)} stroke="#e5e7eb" />
          <text x={x(v)} y={H - P.b + 16} fontSize="11" textAnchor="middle" fill="#6b7280">{Math.round(v * 100)}%</text>
          <text x={P.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#6b7280">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#9ca3af" strokeDasharray="4 4" />
      <path d={path(spatial)} fill="none" stroke="#ea580c" strokeWidth="2.5" />
      <path d={path(temporal)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
      <line x1={x(0.2)} x2={x(0.2)} y1={y(0)} y2={y(Math.max(s20, t20))} stroke="#0b0b0c" strokeDasharray="2 3" />
      <circle cx={x(0.2)} cy={y(s20)} r="4.5" fill="#ea580c" stroke="#fff" strokeWidth="1.5" />
      <circle cx={x(0.2)} cy={y(t20)} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
      <text x={x(0.2) + 8} y={y(s20) - 8} fontSize="12" fontWeight="700" fill="#ea580c">상위 20% → {(s20 * 100).toFixed(1)}% 포착 (공간)</text>
      <text x={x(0.2) + 8} y={y(t20) + 16} fontSize="12" fontWeight="700" fill="#2563eb">상위 20% → {(t20 * 100).toFixed(1)}% (시간)</text>
      <text x={W / 2} y={H - 4} fontSize="11" textAnchor="middle" fill="#374151">점수 상위 조사 비율</text>
      <text x={12} y={H / 2} fontSize="11" textAnchor="middle" fill="#374151" transform={`rotate(-90 12 ${H / 2})`}>위반 포착 비율</text>
      <g transform={`translate(${W - 210},${P.t + 4})`} fontSize="11">
        <rect width="200" height="44" fill="#fff" stroke="#e5e7eb" rx="4" />
        <line x1="8" x2="28" y1="14" y2="14" stroke="#ea580c" strokeWidth="2.5" /><text x="34" y="18" fill="#111">공간 5-fold · AUC 0.728</text>
        <line x1="8" x2="28" y1="32" y2="32" stroke="#2563eb" strokeWidth="2.5" /><text x="34" y="36" fill="#111">시간 검증 · AUC 0.698</text>
      </g>
    </svg>
  );
}
