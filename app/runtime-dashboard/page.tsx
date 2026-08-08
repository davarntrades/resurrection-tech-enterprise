"use client";
/**
 * Runtime Governance — hosted live dashboard (production path).
 *
 * Reads the authenticated /api/runtime/metrics + /api/runtime/decisions
 * endpoints with a viewer/ingest API key. The zero-dependency standalone twin
 * is scripts/runtime/dashboard.html (served by the gateway). Metadata only —
 * never customer payloads.
 */
import { useCallback, useEffect, useState } from "react";

type Freq = { key: string; count: number; pct: number };
type Summary = {
  total: number;
  verdicts: { ALLOW: number; ESCALATE: number; BLOCK: number; allow_pct: number; escalate_pct: number; block_pct: number };
  would_block: number;
  latency: { engine_compute_ms: { mean: number | null; p95: number | null } };
  rule_frequency: Freq[];
  omega_frequency: Freq[];
};
type Decision = { created_at: string; verdict: string; engine_verdict: string; omega_domain?: string; rule?: string; engine_compute_ms?: number; decision_time_ms?: number; engine_time_ms?: number; environment_kind?: string; mode?: string };

export default function RuntimeDashboard() {
  const [key, setKey] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Decision[]>([]);
  const [err, setErr] = useState("");
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const h = { authorization: `Bearer ${key}` };
      const [m, d] = await Promise.all([
        fetch("/api/runtime/metrics", { headers: h }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))),
        fetch("/api/runtime/decisions?limit=20", { headers: h }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setSummary(m); setRecent(d); setErr("");
    } catch (e: any) { setErr(e.message || "load failed"); }
  }, [key]);

  useEffect(() => { if (!auto) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [auto, load]);

  const v = summary?.verdicts;
  const kpi = (val: React.ReactNode, label: string, color?: string) => (
    <div style={{ background: "#141922", border: "1px solid #232a36", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: color || "#e7ecf3" }}>{val}</div>
      <div style={{ color: "#8a929c", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </div>
  );

  return (
    <main style={{ background: "#0b0e13", color: "#e7ecf3", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>◆ Runtime Governance — Live Dashboard</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key (viewer/ingest)" type="password"
            style={{ background: "#141922", border: "1px solid #232a36", color: "#e7ecf3", borderRadius: 8, padding: "8px 10px", width: 280 }} />
          <button onClick={load} style={{ background: "#58a6ff", color: "#04101f", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Connect</button>
          <button onClick={() => setAuto((a) => !a)} style={{ background: "#141922", color: "#e7ecf3", border: "1px solid #232a36", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Auto: {auto ? "5s" : "off"}</button>
        </div>
        {err && <div style={{ color: "#f85149", marginBottom: 14 }}>● {err}</div>}
        {summary && v && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 20 }}>
              {kpi(summary.total, "Governed")}
              {kpi(v.ALLOW, `Allow (${v.allow_pct}%)`, "#3fb950")}
              {kpi(v.ESCALATE, `Escalate (${v.escalate_pct}%)`, "#d29922")}
              {kpi(v.BLOCK, `Block (${v.block_pct}%)`, "#f85149")}
              {kpi((summary.latency.engine_compute_ms.mean ?? "—") + "ms", "Avg service handler")}
              {kpi(summary.would_block, "Would-block (shadow)")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <FreqCard title="Ω-domain frequency" rows={summary.omega_frequency} />
              <FreqCard title="Rule frequency" rows={summary.rule_frequency} />
            </div>
            <div style={{ background: "#141922", border: "1px solid #232a36", borderRadius: 14, padding: 16 }}>
              <h2 style={{ fontSize: 13, color: "#8a929c", textTransform: "uppercase" }}>Recent governed decisions</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #232a36" }}>
                      <td style={{ padding: "6px 8px", color: "#8a929c" }}>{(r.created_at || "").slice(11, 19)}</td>
                      <td style={{ padding: "6px 8px", color: r.verdict === "BLOCK" ? "#f85149" : r.verdict === "ESCALATE" ? "#d29922" : "#3fb950", fontWeight: 600 }}>{r.verdict}</td>
                      <td style={{ padding: "6px 8px" }}>{r.omega_domain || ""}</td>
                      <td style={{ padding: "6px 8px", color: "#8a929c" }}>{r.rule || ""}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.engine_compute_ms != null ? r.engine_compute_ms + "ms" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!summary && !err && <div style={{ color: "#8a929c" }}>Enter an API key and Connect. The zero-dependency gateway also serves this at its own URL.</div>}
      </div>
    </main>
  );
}

function FreqCard({ title, rows }: { title: string; rows: Freq[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ background: "#141922", border: "1px solid #232a36", borderRadius: 14, padding: 16 }}>
      <h2 style={{ fontSize: 13, color: "#8a929c", textTransform: "uppercase" }}>{title}</h2>
      {!rows.length && <div style={{ color: "#8a929c" }}>No data yet.</div>}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <div style={{ flex: 1, fontSize: 13 }}>{r.key}</div>
          <div style={{ width: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.count}</div>
          <div style={{ width: "35%", height: 8, background: "#232a36", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${Math.round((r.count / max) * 100)}%`, height: "100%", background: "#58a6ff" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
