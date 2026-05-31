import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: "24px" }}>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24, color: "var(--ink)" }}>
          <Logo height={30} />
        </div>
        <p className="mono" style={{ color: "var(--accent-bright)", letterSpacing: "0.16em", fontSize: 13, textTransform: "uppercase" }}>
          404 · State unreachable
        </p>
        <h1 style={{ fontSize: "clamp(28px,5vw,44px)", letterSpacing: "-0.03em", marginTop: 16 }}>
          This trajectory leads nowhere.
        </h1>
        <p style={{ color: "var(--ink-2)", marginTop: 16 }}>
          The page you requested is outside the permitted set. Return to a reachable state.
        </p>
        <div style={{ marginTop: 30, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" className="btn btn--primary">Return home <span className="arr">→</span></Link>
          <Link href="/request-audit" className="btn btn--ghost">Request audit</Link>
        </div>
      </div>
    </main>
  );
}
