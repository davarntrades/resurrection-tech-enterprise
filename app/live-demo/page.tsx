import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { LiveDemoClient } from "@/components/LiveDemoClient";

export const metadata: Metadata = {
  title: "Live Demo — Authorization Before Execution",
  description:
    "A working test instrument. Submit a proposed trajectory and see Morrison Runtime Governance evaluate it against an Admissible Operating Envelope before execution, with an ALLOW, ESCALATE or BLOCK verdict, the governing rule, measured latency and an evidence chain.",
  alternates: { canonical: "/live-demo" },
  openGraph: {
    title: "Live Demo — Authorization Before Execution",
    description:
      "Submit a proposed trajectory and see which transitions are permitted to cross into execution, which are held for approval, and which are terminated at the boundary.",
    url: "/live-demo",
  },
};

export default function Page() {
  return (
    <PageShell>
      {/* The instrument is framed, not decorated: an operational header line,
          then the console itself on its own dark ground. */}
      <section className="rt-section rt-section--first rt-instrument-intro" aria-labelledby="ld-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow">Live evaluation</span>
          <h1 id="ld-title" className="rt-display rt-instrument-title">
            A proposed transition
            <br />
            is not an authorized transition.
          </h1>
          <p className="rt-lede">
            Submit a proposed trajectory. It is evaluated against an Admissible Operating Envelope
            before execution, and returns the verdict, the governing rule, the layer that decided,
            measured latency and a replayable evidence chain.
          </p>
          <p className="rt-note">
            Nothing submitted here is executed. The console evaluates the proposed call as data.
          </p>
        </div>
      </section>

      <section
        className="rt-instrument"
        aria-label="Runtime Governance console"
      >
        <div className="rt-wrap">
          <div className="rt-instrument-frame">
            <div className="rt-instrument-bar" aria-hidden="true">
              <span className="rt-instrument-id">RUNTIME GOVERNANCE CONSOLE</span>
              <span className="rt-instrument-state">
                <span className="rt-instrument-pip" />
                LIVE
              </span>
            </div>
            <LiveDemoClient />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
