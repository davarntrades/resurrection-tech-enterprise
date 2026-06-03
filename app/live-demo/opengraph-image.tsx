import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Runtime Governance Console — test it yourself";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dedicated share preview for /live-demo. Renders a console-style card —
 * scenario selection, trajectory, and a BLOCK verdict — so links shared on
 * LinkedIn / WhatsApp / Slack / email show the product, not the homepage.
 */
export default function OgImage() {
  const ink = "#f3f5f7";
  const ink2 = "#aab2bd";
  const ink3 = "#6b7480";
  const accent = "#6f97ff";
  const omega = "#e5484d";
  const ok = "#3fb27f";
  const amber = "#e0a32e";
  const line = "rgba(255,255,255,0.10)";
  const panel = "#0f1216";

  const chip = (label: string, color: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderRadius: 100,
        border: `1px solid ${color}55`,
        background: `${color}1a`,
        color,
        fontSize: 22,
        fontFamily: "monospace",
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 12, background: color, display: "flex" }} />
      {label}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#08090b",
          backgroundImage:
            "radial-gradient(900px 500px at 80% -10%, rgba(76,125,255,0.16), transparent 60%)",
          padding: 64,
          color: ink,
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: ink3, fontSize: 22, letterSpacing: 4, fontFamily: "monospace" }}>
              RESURRECTION TECH™ · RUNTIME GOVERNANCE
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: accent, fontSize: 26, fontFamily: "monospace" }}>
            <div style={{ width: 14, height: 14, borderRadius: 14, background: accent, display: "flex" }} />
            LIVE
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: 70, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>
            Runtime Governance Console
          </div>
          <div style={{ display: "flex", fontSize: 34, color: ink2, marginTop: 16 }}>
            Don&rsquo;t take our word for it — test it yourself.
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
          {chip("ALLOW", ok)}
          {chip("ESCALATE", amber)}
          {chip("BLOCK", omega)}
        </div>

        {/* Verdict card */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            marginTop: "auto",
            padding: 32,
            borderRadius: 18,
            border: `1px solid ${line}`,
            background: panel,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", paddingRight: 32, borderRight: `1px solid ${line}` }}>
            <div style={{ display: "flex", color: ink3, fontSize: 20, letterSpacing: 3, fontFamily: "monospace" }}>FINAL VERDICT</div>
            <div style={{ display: "flex", color: omega, fontSize: 76, fontWeight: 700, fontFamily: "monospace" }}>BLOCK</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", color: ink, fontSize: 30 }}>
              transfer() → Ω · Financial Loss reachable
            </div>
            <div style={{ display: "flex", color: ink2, fontSize: 25, marginTop: 10 }}>
              Unsafe action stopped before execution · £145,000 exposure avoided
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: 28, color: ink3, fontSize: 24, fontFamily: "monospace" }}>
          resurrection-tech.com/live-demo
        </div>
      </div>
    ),
    size,
  );
}
