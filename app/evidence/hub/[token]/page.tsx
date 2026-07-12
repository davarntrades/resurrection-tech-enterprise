/** Runtime Governance — per-customer Evidence Hub (customer-facing, read-only).
 * Credential-free: one durable link aggregates all of a customer's audit packs,
 * reports and evidence, plus a timeline. No login, no operator surface. */
import type { Metadata } from "next";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Runtime Governance — Evidence",
  robots: { index: false, follow: false },
};

const C = {
  bg: "#08090b", panel: "#0f1216", inset: "#0b0d10", line: "rgba(255,255,255,.08)",
  ink: "#f3f5f7", ink2: "#aab2bd", ink3: "#6b7480", ink4: "#474e58",
  accent: "#6f97ff", ok: "#3fb27f", mono: "'Geist Mono',ui-monospace,'SF Mono',Menlo,monospace",
};
const SHAREABLE = /\.(pdf|html)$/i;
const STATUS_LABEL: Record<string, string> = { open: "Open", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved" };
const SEV_COLOR: Record<string, string> = { critical: "#e5484d", high: "#e5893f", medium: "#c9a227", low: "#6b7480" };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const kindLabel = (f: string) => (/enterprise-assessment/i.test(f) ? (/\.pdf$/i.test(f) ? "Enterprise assessment" : "Enterprise assessment (HTML)") : /executive/i.test(f) ? "Executive report" : /full-audit/i.test(f) ? (/\.pdf$/i.test(f) ? "48-Hour Audit" : "48-Hour Audit (HTML)") : /monthly-evidence/i.test(f) ? (/\.pdf$/i.test(f) ? "Monthly evidence" : "Monthly evidence (HTML)") : /\.pdf$/i.test(f) ? "Audit report" : /\.html$/i.test(f) ? "Report (HTML)" : "Evidence");

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.ink2, fontFamily: C.mono, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontSize: 26, color: C.accent, marginBottom: 10 }}>&#8475;(t)</div>
        <h1 style={{ color: C.ink, fontSize: 20, fontWeight: 560, margin: "0 0 8px" }}>{title}</h1>
        <p style={{ color: C.ink3, fontSize: 13, lineHeight: 1.6 }}>{body}</p>
      </div>
    </main>
  );
}

export default async function EvidenceHubPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res: any = await rt.hub.resolveHub(token);
  if (!res.ok) {
    return res.status === 410
      ? <Message title="Link revoked" body="This evidence hub has been revoked by Resurrection Tech. Please contact your engagement lead for an updated link." />
      : <Message title="Evidence hub not found" body="This link is invalid or has expired. Please contact your Resurrection Tech engagement lead." />;
  }

  const orgName: string = res.org?.name || "Your organisation";
  const packs: any[] = res.packs || [];
  const recommendations: any[] = res.recommendations || [];
  const timeline: any[] = res.timeline || [];
  const btn = { display: "inline-block", textDecoration: "none", fontFamily: C.mono, fontSize: 12, padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.line}`, color: C.ink2 } as const;
  const accentBtn = { ...btn, background: "rgba(76,125,255,.14)", borderColor: "rgba(76,125,255,.45)", color: C.ink } as const;
  const label = { fontFamily: C.mono, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C.ink3 } as const;

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.ink2, fontFamily: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 20, borderBottom: `1px solid ${C.line}`, marginBottom: 24 }}>
          <span style={{ color: C.accent, fontSize: 22, fontFamily: C.mono }}>&#8475;(t)</span>
          <div>
            <div style={{ color: C.ink, fontWeight: 560, fontSize: 16 }}>Resurrection Tech&trade; — Runtime Governance Evidence</div>
            <div style={{ ...label }}>{orgName}</div>
          </div>
        </header>

        <p style={{ color: C.ink3, fontSize: 13, lineHeight: 1.6, margin: "0 0 24px" }}>
          Your ongoing Runtime Governance evidence, in one place. Bookmark this secure link — new audits and
          reports appear here as they&rsquo;re published. Read-only; no account required.
        </p>

        {/* Evidence */}
        {!packs.length && (
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 14, padding: 40, textAlign: "center", color: C.ink3 }}>
            No evidence published yet. Your first Runtime Governance audit will appear here.
          </div>
        )}

        {packs.map((p) => {
          const files = (p.deliverables || []).filter((d: any) => SHAREABLE.test(d.filename));
          if (!files.length) return null;
          return (
            <section key={p.id} style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel, padding: "20px 22px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                <h2 style={{ color: C.ink, fontSize: 16, fontWeight: 560, margin: 0 }}>{p.name || "Runtime Governance Audit"}</h2>
                <span style={{ ...label }}>{p.reference ? `${p.reference} · ` : ""}{fmt(p.created_at)}</span>
              </div>
              {typeof p.summary?.assess_summary === "string" && p.summary.assess_summary.trim() && (
                <p style={{ color: C.ink3, fontSize: 12.5, margin: "0 0 10px" }}>{p.summary.assess_summary}</p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
                {files.map((d: any) => (
                  <li key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: C.inset, border: `1px solid ${C.line}`, borderRadius: 10 }}>
                    <div>
                      <div style={{ color: C.ink, fontSize: 13 }}>{kindLabel(d.filename)}</div>
                      <div style={{ ...label }}>{d.filename}{d.size ? ` · ${(d.size / 1024).toFixed(0)} KB` : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a style={accentBtn} href={`/api/runtime/hub/${token}/file?id=${encodeURIComponent(d.id)}&mode=preview`} target="_blank" rel="noopener noreferrer">Open</a>
                      <a style={btn} href={`/api/runtime/hub/${token}/file?id=${encodeURIComponent(d.id)}&mode=download`}>Download</a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <section style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel, padding: "20px 22px", marginTop: 8, marginBottom: 16 }}>
            <div style={{ ...label, marginBottom: 12 }}>Recommendations</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {recommendations.map((r) => {
                const resolved = r.status === "resolved";
                return (
                  <li key={r.id} style={{ padding: "12px 14px", background: C.inset, border: `1px solid ${C.line}`, borderRadius: 10, opacity: resolved ? 0.6 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: r.detail ? 6 : 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[r.severity] || C.ink3, flex: "0 0 8px" }} />
                      <span style={{ color: C.ink, fontSize: 13.5, textDecoration: resolved ? "line-through" : "none" }}>{r.title}</span>
                      <span style={{ ...label, marginLeft: "auto" }}>{r.severity} · {STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    {r.detail && <div style={{ color: C.ink3, fontSize: 12.5, lineHeight: 1.55, paddingLeft: 16 }}>{r.detail}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <section style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel, padding: "20px 22px", marginTop: 8 }}>
            <div style={{ ...label, marginBottom: 12 }}>Timeline</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {timeline.map((t, i) => (
                <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.ok, marginTop: 5, flex: "0 0 9px" }} />
                  <div>
                    <div style={{ color: C.ink2, fontSize: 13 }}>{t.label}{t.reference ? ` · ${t.reference}` : ""}</div>
                    <div style={{ ...label }}>{fmt(t.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.line}`, ...label }}>
          Patent GB2600765.8 · Morrison Runtime Governance&trade; · Confidential — shared with {orgName}
        </footer>
      </div>
    </main>
  );
}
