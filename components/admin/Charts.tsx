"use client";
/**
 * Runtime Governance — Control Room charts (inline SVG, no dependencies).
 * Theme-consistent with the radmin dark style; all data comes from props.
 */
import type { ReactNode } from "react";

const C = { allow: "#3fb27f", escalate: "#d9a441", block: "#e5484d", accent: "#6f97ff", grid: "#6b7480", panel: "#14181d" };

function Empty({ h = 90 }: { h?: number }) {
  return <div className="radmin-chart-empty" style={{ height: h }}>No data in this window</div>;
}
function ChartCard({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div className="radmin-chart">
      <div className="radmin-chart-head"><span className="radmin-chart-title">{title}</span>{legend}</div>
      {children}
    </div>
  );
}

type Bucket = { bucket: string; ALLOW?: number; ESCALATE?: number; BLOCK?: number; total?: number; avg_engine_compute_ms?: number | null };

// Decision volume over time — stacked bars (ALLOW / ESCALATE / BLOCK). Doubles
// as the activity timeline.
export function VolumeChart({ series }: { series?: Bucket[] }) {
  const data = (series || []).filter(Boolean);
  const max = Math.max(1, ...data.map((d) => d.total || (d.ALLOW || 0) + (d.ESCALATE || 0) + (d.BLOCK || 0)));
  const legend = (
    <span className="radmin-legend">
      <i style={{ background: C.allow }} />Allow <i style={{ background: C.escalate }} />Escalate <i style={{ background: C.block }} />Block
    </span>
  );
  if (!data.length) return <ChartCard title="Decision volume over time" legend={legend}><Empty /></ChartCard>;
  const W = 320, H = 96, n = data.length, gap = n > 1 ? 2 : 0, bw = (W - gap * (n - 1)) / n;
  return (
    <ChartCard title="Decision volume over time" legend={legend}>
      <svg className="radmin-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Decision volume over time">
        {data.map((d, i) => {
          const a = d.ALLOW || 0, e = d.ESCALATE || 0, b = d.BLOCK || 0;
          const x = i * (bw + gap);
          const ha = (a / max) * H, he = (e / max) * H, hb = (b / max) * H;
          let y = H;
          const rects: ReactNode[] = [];
          for (const [val, h, col] of [[a, ha, C.allow], [e, he, C.escalate], [b, hb, C.block]] as Array<[number, number, string]>) {
            if (val > 0) { y -= h; rects.push(<rect key={col} x={x} y={y} width={bw} height={Math.max(0.5, h)} fill={col} />); }
          }
          return <g key={i}>{rects}</g>;
        })}
      </svg>
      <div className="radmin-axis"><span>{data[0]?.bucket}</span><span>{data[data.length - 1]?.bucket}</span></div>
    </ChartCard>
  );
}

// ALLOW / ESCALATE / BLOCK ratio — a segmented horizontal bar.
export function RatioBar({ allow = 0, escalate = 0, block = 0 }: { allow?: number; escalate?: number; block?: number }) {
  const total = allow + escalate + block;
  if (!total) return <ChartCard title="ALLOW / BLOCK ratio"><Empty h={54} /></ChartCard>;
  const pct = (x: number) => (x / total) * 100;
  const seg = (v: number, col: string, label: string) => v > 0 ? <div className="radmin-seg" style={{ width: `${pct(v)}%`, background: col }} title={`${label} ${Math.round(pct(v))}%`} /> : null;
  return (
    <ChartCard title="ALLOW / BLOCK ratio">
      <div className="radmin-ratio">{seg(allow, C.allow, "Allow")}{seg(escalate, C.escalate, "Escalate")}{seg(block, C.block, "Block")}</div>
      <div className="radmin-ratio-legend">
        <span style={{ color: C.allow }}>Allow {Math.round(pct(allow))}%</span>
        <span style={{ color: C.escalate }}>Escalate {Math.round(pct(escalate))}%</span>
        <span style={{ color: C.block }}>Block {Math.round(pct(block))}%</span>
      </div>
    </ChartCard>
  );
}

// Latency trend — sparkline of avg engine compute ms per bucket.
export function LatencySpark({ series }: { series?: Bucket[] }) {
  const pts = (series || []).map((d) => d.avg_engine_compute_ms).filter((v): v is number => typeof v === "number");
  if (pts.length < 2) return <ChartCard title="Latency trend (engine compute)"><Empty h={70} /></ChartCard>;
  const W = 320, H = 70, min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / rng) * (H - 10) - 5}`).join(" ");
  return (
    <ChartCard title="Latency trend (engine compute)" legend={<span className="radmin-muted">{min.toFixed(2)}–{max.toFixed(2)}ms</span>}>
      <svg className="radmin-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Latency trend">
        <polyline fill="none" stroke={C.accent} strokeWidth={1.5} points={path} vectorEffect="non-scaling-stroke" />
      </svg>
    </ChartCard>
  );
}

// Frequency bars — rules / Ω domains.
export function FreqBars({ title, rows, color = C.accent }: { title: string; rows?: Array<{ key: string; count: number; pct: number }>; color?: string }) {
  const data = (rows || []).slice(0, 6);
  if (!data.length) return <ChartCard title={title}><Empty h={54} /></ChartCard>;
  const max = Math.max(...data.map((r) => r.pct || r.count));
  return (
    <ChartCard title={title}>
      <div className="radmin-fbars">
        {data.map((r, i) => (
          <div key={i} className="radmin-fbar">
            <span className="radmin-fbar-k" title={r.key}>{r.key}</span>
            <span className="radmin-fbar-track"><span className="radmin-fbar-fill" style={{ width: `${Math.max(3, ((r.pct || r.count) / max) * 100)}%`, background: color }} /></span>
            <span className="radmin-fbar-v">{r.count} · {r.pct}%</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
