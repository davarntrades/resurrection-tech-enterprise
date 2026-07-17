"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { PrintButton } from "@/components/PrintButton";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";
import {
  score, labelsFor,
  AI_MATURITY, AI_MATURITY_TARGET, STAGES, TIMELINES, TOOL_ACCESS, CONTROLS, COMPLIANCE,
  SUCCESS_CRITERIA, ENGAGEMENT_INTENTS, PARTNER_TYPES, CUSTOMER_REACH, CUSTOMER_REACH_POTENTIAL,
  REGIONS, CUSTOMERS_CURRENT, CUSTOMERS_FUTURE, REVENUE_EXPOSURE, REVENUE_EXPOSURE_FUTURE,
  EXECUTION_PERMISSIONS, DEPLOYMENT_MODELS, CLOUD_PROVIDERS, MODEL_STACK, AGENT_STACK,
  PROTECTED_ENVIRONMENTS, AGENTS_EXPECTED, GOVERNANCE_OPS, GOVERNANCE_TARGETS,
  EVIDENCE_REQUIREMENTS, EXEC_OVERSIGHT, EXEC_NEED,
  type AssessmentData, type Recommendation, type Scores, type Option, type Band, type YesNo,
} from "@/lib/assessment";
import { deriveInsights, REPORT_STORAGE_KEY, type StoredReport, type HeatMap, type Priority } from "@/lib/assessmentReport";

const bandChip = (b: Band): string =>
  b === "Low" ? "rgr-chip--ok" : b === "Moderate" ? "rgr-chip--info" : b === "High" ? "rgr-chip--warn" : "rgr-chip--crit";
const fillFor = (b: Band): string =>
  b === "Low" ? "rgr-fill--ok" : b === "Moderate" ? "rgr-fill--info" : b === "High" ? "rgr-fill--warn" : "rgr-fill--crit";
const prioClass = (p: Priority): string =>
  p === "Critical" ? "rgr-prio--crit" : p === "High" ? "rgr-prio--high" : "rgr-prio--med";
const prioDot = (p: Priority): string =>
  p === "Critical" ? "🔴" : p === "High" ? "🟠" : "🟡";

export function AssessmentReportClient() {
  const [report, setReport] = useState<StoredReport | null | "loading">("loading");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORT_STORAGE_KEY);
      setReport(raw ? (JSON.parse(raw) as StoredReport) : null);
    } catch {
      setReport(null);
    }
  }, []);

  if (report === "loading") {
    return (
      <PageShell>
        <section className="rep" aria-busy="true"><div className="wrap" /></section>
      </PageShell>
    );
  }

  if (!report) {
    return (
      <PageShell>
        <section className="rep">
          <div className="wrap" style={{ maxWidth: 720, textAlign: "center" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>Executive report</span>
            <h1 style={{ margin: "16px 0" }}>No assessment found on this device.</h1>
            <p style={{ color: "var(--ink-2)", lineHeight: 1.6 }}>
              The executive report is generated from your completed Runtime Governance
              Assessment and stored on the device where you completed it. Complete the
              assessment to generate yours.
            </p>
            <div className="hero-actions" style={{ marginTop: 28, justifyContent: "center" }}>
              <Link href="/assessment" className="btn btn--primary">Start the assessment <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  const { data: d, recommendation: rec, reference, submittedAt } = report;
  // Presentation-only: recompute the engine's scores with the same shared
  // module the API uses — identical inputs, identical outputs, no new logic.
  const s = score(d);
  const ins = deriveInsights(d, s, rec);
  const dateStr = new Date(submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <PageShell>
      <section className="rep" aria-label="Runtime Governance Assessment — Executive Report">
        <div className="wrap">
          <div className="rgr-toolbar">
            <span className="rgr-toolbar-note">Reference <b>{reference}</b> · generated {dateStr}</span>
            <PrintButton label="Download / Print PDF" />
          </div>

          <div className="rep-doc">
            {/* ── Cover band ── */}
            <div className="rep-band">
              <span className="rep-band-k">Runtime Governance Assessment · Executive Report</span>
              <h1 className="rep-band-title">{d.companyName || "Your organisation"}</h1>
              <p className="rep-band-sub">
                Prepared for {d.fullName}{d.jobTitle ? `, ${d.jobTitle}` : ""} · {dateStr}
              </p>
              <div className="rep-meta">
                <div><span className="rep-meta-k">Reference</span><span className="rep-meta-v">{reference}</span></div>
                <div><span className="rep-meta-k">Industry</span><span className="rep-meta-v">{d.industry || "—"}</span></div>
                <div><span className="rep-meta-k">Prepared by</span><span className="rep-meta-v">Resurrection Tech™</span></div>
                <div><span className="rep-meta-k">Classification</span><span className="rep-meta-v">Confidential</span></div>
              </div>
            </div>

            {/* ── 1 · Executive summary ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">01 · Executive summary</span>
              <h2 className="rep-h2">Assessment at a glance</h2>
              {rec.summary && <p className="rep-p">{rec.summary}</p>}
              <div className="rgr-status" style={{ marginTop: 16 }}>
                <div className="rgr-card is-lead">
                  <span className="rgr-card-k">Recommended pathway</span>
                  <span className="rgr-card-v">{rec.title}</span>
                  <span className="rgr-card-s">{rec.band ? `Indicative engagement scale: ${rec.band}` : rec.tagline}</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">AI programme maturity</span>
                  <span className="rgr-card-v">{ins.maturityLabel}</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">Governance maturity</span>
                  <span className="rgr-card-v">{s.maturityBand}</span>
                  <span className={`rgr-chip ${s.maturityBand === "Low" ? "rgr-chip--warn" : "rgr-chip--ok"}`}>{s.maturity}/100</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">Ω exposure</span>
                  <span className="rgr-card-v">{s.exposureBand}</span>
                  <span className={`rgr-chip ${bandChip(s.exposureBand)}`}>{s.exposure}/100</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">Operational complexity</span>
                  <span className="rgr-card-v">{s.complexity}/100</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">Recommendation confidence</span>
                  <span className="rgr-card-v">{ins.confidence}</span>
                </div>
                <div className="rgr-card">
                  <span className="rgr-card-k">Programme stage</span>
                  <span className="rgr-card-v">{ins.stageLabel}</span>
                </div>
              </div>
            </div>

            {/* ── 2 · Recommendation ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">02 · Recommendation</span>
              <h2 className="rep-h2">{rec.title}</h2>
              <p className="rep-p">{rec.tagline}</p>

              <div className="rgr-impact">
                <span className="rgr-impact-k">Business impact</span>
                <p className="rgr-impact-v">{ins.businessImpact}</p>
              </div>

              <p className="rep-p" style={{ marginTop: 14 }}><b style={{ color: "var(--ink)" }}>Expected business outcome.</b> {ins.outcome}</p>

              <div className="rgr-cols" style={{ marginTop: 14 }}>
                <div>
                  <div className="rgr-col-h">Why this pathway</div>
                  <ul className="rgr-list">
                    {rec.why.map((w, i) => (
                      <li key={i}><span className="rgr-dot rgr-dot--ok" aria-hidden="true" />{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="rgr-col-h">What drove this recommendation</div>
                  <ul className="rgr-list">
                    {ins.drivers.map((w, i) => (
                      <li key={i}><span className="rgr-dot rgr-dot--ok" style={{ background: "var(--accent-bright)" }} aria-hidden="true" />{w}</li>
                    ))}
                  </ul>
                  <p className="rgr-score-why" style={{ marginTop: 10 }}>
                    Confidence: <b style={{ color: "var(--ink)" }}>{ins.confidence}</b>. {ins.confidenceNote}
                  </p>
                </div>
              </div>
            </div>

            {/* ── 3 · Key findings ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">03 · Key findings</span>
              <h2 className="rep-h2">What your responses tell us</h2>
              <ol className="rgr-find">
                {ins.findings.map((f, i) => (
                  <li key={i}><span className="rgr-find-n">{String(i + 1).padStart(2, "0")}</span>{f}</li>
                ))}
              </ol>
            </div>

            {/* ── 4 · Strengths & gaps ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">04 · Position</span>
              <h2 className="rep-h2">Current strengths &amp; current gaps</h2>
              <div className="rgr-cols">
                <div>
                  <div className="rgr-col-h"><span className="rgr-chip rgr-chip--ok">Strengths</span></div>
                  <ul className="rgr-list">
                    {ins.strengths.map((t, i) => (
                      <li key={i}><span className="rgr-dot rgr-dot--ok" aria-hidden="true" />{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="rgr-col-h"><span className="rgr-chip rgr-chip--warn">Gaps · by priority</span></div>
                  {ins.priorityGaps.length ? (
                    <div className="rgr-gaps">
                      {ins.priorityGaps.map((g, i) => (
                        <div className="rgr-gap" key={i}>
                          <span className={`rgr-prio ${prioClass(g.priority)}`}>{prioDot(g.priority)} {g.priority}</span>
                          <div className="rgr-gap-t">{g.title}</div>
                          <p className="rgr-gap-d">{g.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rep-p">No high-value gaps surfaced from your responses — the engagement will validate this directly against your environment.</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── 5 · Governance scorecard ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">05 · Scorecard</span>
              <h2 className="rep-h2">Governance scorecard</h2>
              <div className="rgr-scores">
                <div className="rgr-score">
                  <div className="rgr-score-head">
                    <span className="rgr-score-k">Governance maturity</span>
                    <span className="rgr-score-v">{s.maturity}/100 · {s.maturityBand}</span>
                  </div>
                  <div className="rgr-track"><span className={`rgr-fill ${s.maturity >= 55 ? "rgr-fill--ok" : s.maturity >= 30 ? "rgr-fill--info" : "rgr-fill--warn"}`} style={{ width: `${Math.max(3, s.maturity)}%` }} /></div>
                  <span className="rgr-score-why">How much protective capability exists today — controls and governance operations. Higher is better; it directly reduces reachable exposure.</span>
                </div>
                <div className="rgr-score">
                  <div className="rgr-score-head">
                    <span className="rgr-score-k">Operational complexity</span>
                    <span className="rgr-score-v">{s.complexity}/100</span>
                  </div>
                  <div className="rgr-track"><span className="rgr-fill rgr-fill--info" style={{ width: `${Math.max(3, s.complexity)}%` }} /></div>
                  <span className="rgr-score-why">How much surface there is to govern — agents, environments, integrations, and coordination. Not a risk in itself, but it sizes the engagement.</span>
                </div>
                <div className="rgr-score">
                  <div className="rgr-score-head">
                    <span className="rgr-score-k">Ω exposure</span>
                    <span className="rgr-score-v">{s.exposure}/100 · {s.exposureBand}</span>
                  </div>
                  <div className="rgr-track"><span className={`rgr-fill ${fillFor(s.exposureBand)}`} style={{ width: `${Math.max(3, s.exposure)}%` }} /></div>
                  <span className="rgr-score-why">How reachable catastrophic states are today, after credit for existing controls. This is the number governance exists to drive down.</span>
                </div>
              </div>

              {ins.exposureDrivers.length > 0 && (
                <div className="rgr-drivers">
                  <span className="rgr-drivers-k">Ω exposure drivers</span>
                  <span className="rgr-drivers-s">The factors in your responses that raise reachable exposure:</span>
                  <div className="rgr-driver-chips">
                    {ins.exposureDrivers.map((t) => (
                      <span className="rgr-driver" key={t}><span className="rgr-driver-tick" aria-hidden="true">✓</span>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 6 · Risk heat map ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">06 · Risk profile</span>
              <h2 className="rep-h2">Capability risk heat map</h2>
              <p className="rep-p">
                Where your highest-consequence capabilities sit today, by impact and likelihood.
                A visual aid derived from your responses — not a precise calculation.
              </p>
              <HeatMapGrid m={ins.heatMap} />
            </div>

            {/* ── 7 · Engagement roadmap ── */}
            <div className="rep-sec">
              <span className="rep-eyebrow">07 · Engagement</span>
              <h2 className="rep-h2">Your engagement roadmap</h2>
              <p className="rep-p">
                The typical shape of the {rec.title} engagement. Every stage produces evidence you
                keep — findings, verdicts, and executive reporting — so progress is demonstrable to
                your board and regulators at each step, not only at the end.
              </p>
              <ol className="rgr-road">
                {ins.timeline.map((t, i) => (
                  <li className={`rgr-road-step${i === 0 ? " is-now" : ""}`} key={t}>
                    <span className="rgr-road-node">{String(i + 1).padStart(2, "0")}</span>
                    <span className="rgr-road-label">{t}{i === 0 && <span className="rgr-road-now">Starts here</span>}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* ── 8 · Executive verdict ── */}
            <div className="rep-sec rgr-verdict-sec">
              <span className="rep-eyebrow">08 · Executive verdict</span>
              <h2 className="rep-h2">{ins.verdict.headline}</h2>
              <p className="rgr-verdict-body">{ins.verdict.body}</p>
            </div>

            {/* ── 9 · Appendix — full responses ── */}
            <Appendix d={d} />

            {/* ── Disclaimer ── */}
            <div className="rep-disc">
              This report is generated from your assessment responses and constitutes a
              recommendation, not a contract. {rec.band ? `Indicative engagement scale (${rec.band}) mirrors the public Enterprise Pathways ladder. ` : ""}
              All figures are indicative and non-binding; final commercial terms follow assessment,
              deployment review, and commercial qualification. Confidential — prepared for{" "}
              {d.companyName || "the recipient"}.
            </div>
          </div>

          <div className="rgr-toolbar" style={{ marginTop: 18, justifyContent: "center" }}>
            <Link href={rec.ctaHref} className="btn btn--primary">{rec.ctaLabel} <span className="arr">→</span></Link>
            <Link href="/book#assessment" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
          </div>
          <div style={{ maxWidth: 880, margin: "14px auto 0" }}>
            <PricingDisclaimer variant="short" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/* ── Risk heat map: impact × likelihood matrix ─────────────────────────── */
function HeatMapGrid({ m }: { m: HeatMap }) {
  const Cell = ({ items, tone, label }: { items: string[]; tone: string; label: string }) => (
    <div className={`rgr-hm-cell ${tone}`}>
      <span className="rgr-hm-tag">{label}</span>
      {items.length ? (
        <div className="rgr-hm-items">
          {items.map((t) => <span className="rgr-hm-item" key={t}>{t}</span>)}
        </div>
      ) : (
        <span className="rgr-hm-empty">—</span>
      )}
    </div>
  );
  return (
    <div className="rgr-hm">
      <div className="rgr-hm-yaxis" aria-hidden="true"><span>Likelihood →</span></div>
      <div className="rgr-hm-grid">
        <div className="rgr-hm-ylab rgr-hm-ylab--hi" aria-hidden="true">High</div>
        <Cell items={m.lh} tone="is-amber" label="Watch" />
        <Cell items={m.hh} tone="is-crit" label="Critical" />
        <div className="rgr-hm-ylab rgr-hm-ylab--lo" aria-hidden="true">Low</div>
        <Cell items={m.ll} tone="is-ok" label="Contained" />
        <Cell items={m.hl} tone="is-orange" label="Elevated" />
        <div className="rgr-hm-corner" aria-hidden="true" />
        <div className="rgr-hm-xlab" aria-hidden="true">Low impact</div>
        <div className="rgr-hm-xlab" aria-hidden="true">High impact</div>
      </div>
    </div>
  );
}

/* ── Appendix: every captured data point, grouped by assessment stage ───── */
function Appendix({ d }: { d: AssessmentData }) {
  const yn = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const list = (vals: string[], opts: Option[]) => (vals?.length ? labelsFor(opts, vals).join(", ") : "—");
  const one = (opts: Option[], val: string) => opts.find((o) => o.value === val)?.label ?? "—";
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="rep-ev-row"><span className="rep-ev-k">{k}</span><span className="rep-ev-v">{v || "—"}</span></div>
  );
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 18 }}>
      <div className="rgr-col-h" style={{ marginBottom: 6 }}>{title}</div>
      <div className="rep-ev">{children}</div>
    </div>
  );
  return (
    <div className="rep-sec">
      <span className="rep-eyebrow">09 · Appendix</span>
      <h2 className="rep-h2">Assessment responses in full</h2>
      <p className="rep-p">The complete record of your qualification, as submitted.</p>

      <Group title="Organisation">
        <Row k="Company" v={d.companyName} />
        <Row k="Contact" v={`${d.fullName}${d.jobTitle ? ` · ${d.jobTitle}` : ""}`} />
        <Row k="Industry / size" v={[d.industry, d.companySize].filter(Boolean).join(" · ")} />
        <Row k="HQ country" v={d.country} />
        <Row k="Operating regions" v={list(d.operatingRegions, REGIONS)} />
        <Row k="AI deployment regions" v={list(d.deploymentRegions, REGIONS)} />
      </Group>

      <Group title="AI programme — current vs target">
        <Row k="Maturity today" v={one(AI_MATURITY, d.aiMaturityCurrent)} />
        <Row k="Target (12–18 mo)" v={one(AI_MATURITY_TARGET, d.aiMaturityTarget)} />
        <Row k="Agents deployed" v={yn(d.agentsDeployed)} />
        <Row k="Customer-facing" v={yn(d.customerFacing)} />
        <Row k="Connected to tools" v={yn(d.connectedToTools)} />
        <Row k="Acts without human in loop" v={yn(d.canTakeActions)} />
        <Row k="Multiple agents" v={yn(d.multipleAgents)} />
        <Row k="In production" v={yn(d.inProduction)} />
      </Group>

      <Group title="Runtime risk">
        <Row k="Tool access" v={list(d.toolAccess, TOOL_ACCESS)} />
        <Row k="Execution permissions" v={list(d.executionPermissions, EXECUTION_PERMISSIONS)} />
        <Row k="Business-critical systems" v={yn(d.criticalSystems)} />
        <Row k="Downstream automation" v={yn(d.downstreamAutomation)} />
        <Row k="End customers today" v={one(CUSTOMERS_CURRENT, d.customersCurrent)} />
        <Row k="End customers at target scale" v={one(CUSTOMERS_FUTURE, d.customersFuture)} />
        <Row k="Revenue exposure today" v={one(REVENUE_EXPOSURE, d.revenueExposureCurrent)} />
        <Row k="Revenue exposure at target" v={one(REVENUE_EXPOSURE_FUTURE, d.revenueExposureFuture)} />
      </Group>

      <Group title="Technical architecture">
        <Row k="Deployment model" v={list(d.deploymentModel, DEPLOYMENT_MODELS)} />
        <Row k="Cloud providers" v={list(d.cloudProviders, CLOUD_PROVIDERS)} />
        <Row k="Model stack" v={list(d.modelStack, MODEL_STACK)} />
        <Row k="Agent stack" v={list(d.agentStack, AGENT_STACK)} />
        <Row k="Protected environments" v={one(PROTECTED_ENVIRONMENTS, d.protectedEnvironments)} />
        <Row k="Agents today" v={d.numAgents} />
        <Row k="Expected agents (12–18 mo)" v={one(AGENTS_EXPECTED, d.agentsExpected)} />
        <Row k="Exact agent count" v={d.agentCount ?? ""} />
        <Row k="Business units" v={d.businessUnits ?? ""} />
        <Row k="Shared memory" v={yn(d.sharedMemory)} />
        <Row k="Shared tools" v={yn(d.sharedTools)} />
        <Row k="Autonomous coordination" v={yn(d.autonomousCoordination)} />
        <Row k="Cross-agent communication" v={yn(d.crossAgentComm)} />
      </Group>

      <Group title="Governance — current vs target">
        <Row k="Technical controls" v={list(d.controls, CONTROLS)} />
        <Row k="Governance operations" v={list(d.governanceOps, GOVERNANCE_OPS)} />
        <Row k="Governance target (12 mo)" v={one(GOVERNANCE_TARGETS, d.governanceTarget)} />
      </Group>
      {d.unsafePrevention && (
        <div className="rgr-free"><div className="rgr-free-k">How unsafe actions are prevented today</div><p className="rgr-free-v">{d.unsafePrevention}</p></div>
      )}
      {d.incidents && (
        <div className="rgr-free"><div className="rgr-free-k">Incidents / near misses</div><p className="rgr-free-v">{d.incidents}</p></div>
      )}

      <div style={{ height: 18 }} />
      <Group title="Compliance & oversight">
        <Row k="Compliance regimes" v={list(d.compliance, COMPLIANCE)} />
        <Row k="Evidence consumers" v={list(d.evidenceRequirements, EVIDENCE_REQUIREMENTS)} />
        <Row k="AI risk owner today" v={one(EXEC_OVERSIGHT, d.execOversight)} />
        <Row k="Executive leadership need" v={one(EXEC_NEED, d.execNeed)} />
      </Group>

      <Group title="Commercial qualification">
        <Row k="Engagement objective" v={one(ENGAGEMENT_INTENTS, d.intent)} />
        {d.partnerType && <Row k="Partner organisation type" v={one(PARTNER_TYPES, d.partnerType)} />}
        {d.customerReach && <Row k="Partner customers today" v={one(CUSTOMER_REACH, d.customerReach)} />}
        {d.customerReachPotential && <Row k="Partner potential reach" v={one(CUSTOMER_REACH_POTENTIAL, d.customerReachPotential)} />}
        <Row k="Engagement readiness" v={one(STAGES, d.stage)} />
        <Row k="Timeline" v={one(TIMELINES, d.timeline)} />
        <Row k="Success criteria" v={list(d.successCriteria, SUCCESS_CRITERIA)} />
      </Group>
      {d.customerBase && (
        <div className="rgr-free"><div className="rgr-free-k">Partner customer base</div><p className="rgr-free-v">{d.customerBase}</p></div>
      )}
      {d.successNotes && (
        <div className="rgr-free"><div className="rgr-free-k">Goals &amp; constraints</div><p className="rgr-free-v">{d.successNotes}</p></div>
      )}
    </div>
  );
}
