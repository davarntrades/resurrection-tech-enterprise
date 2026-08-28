/** Runtime Governance — per-customer Evidence Hub (customer-facing, read-only).
 * Credential-free: one durable link aggregates all of a customer's audit packs,
 * reports and evidence, plus a timeline. No login, no operator surface. */
import type { Metadata } from "next";
import * as rt from "@/lib/runtime";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Runtime Governance — Evidence",
  robots: { index: false, follow: false },
};

const SHAREABLE = /\.(pdf|html)$/i;
const OPEN_STATES = new Set(["open", "acknowledged", "in_progress"]);
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
};
const fmt = (iso?: string | null) => iso
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
  : "—";
const kindLabel = (filename: string) => (
  /enterprise-assessment/i.test(filename) ? "Enterprise assessment"
    : /executive/i.test(filename) ? "Executive report"
      : /full-audit/i.test(filename) ? "48-Hour Audit"
        : /monthly-evidence/i.test(filename) ? "Monthly evidence"
          : /\.pdf$/i.test(filename) ? "Audit report"
            : /\.html$/i.test(filename) ? "Interactive report"
              : "Evidence"
);

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className={styles.messagePage}>
      <div className={styles.messageCard}>
        <div className={styles.mark} aria-hidden="true">&#8475;(t)</div>
        <p className={styles.eyebrow}>Runtime Governance Evidence</p>
        <h1>{title}</h1>
        <p>{body}</p>
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
  const packs: any[] = (res.packs || []).map((pack: any) => ({
    ...pack,
    shareable: (pack.deliverables || []).filter((item: any) => SHAREABLE.test(item.filename)),
  })).filter((pack: any) => pack.shareable.length > 0);
  const recommendations: any[] = res.recommendations || [];
  const timeline: any[] = res.timeline || [];
  const openRecommendations = recommendations.filter((item) => OPEN_STATES.has(item.status));
  const resolvedRecommendations = recommendations.filter((item) => item.status === "resolved");
  const documentCount = packs.reduce((total, pack) => total + pack.shareable.length, 0);
  const latestPublication = timeline[0]?.at || packs[0]?.created_at || null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">&#8475;(t)</span>
            <span>
              <strong>Resurrection Tech</strong>
              <small>Morrison Runtime Governance&trade;</small>
            </span>
          </div>
          <div className={styles.accessBadge}>
            <span aria-hidden="true" />
            Read-only evidence portal
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="hub-title">
          <div>
            <p className={styles.eyebrow}>Customer Evidence Hub</p>
            <h1 id="hub-title">Runtime governance evidence for <span>{orgName}</span></h1>
            <p className={styles.lede}>
              Published audits, executive reports and tracked governance actions in one durable view.
              New evidence appears here as it is released.
            </p>
          </div>
          <div className={styles.accessNote}>
            <strong>Private link access</strong>
            <span>No account required</span>
            <span>Bookmark this page</span>
          </div>
        </section>

        <section className={styles.summary} aria-label="Evidence summary">
          <div className={styles.metric}>
            <span>Published audits</span>
            <strong>{packs.length}</strong>
            <small>Evidence packs available</small>
          </div>
          <div className={styles.metric}>
            <span>Documents</span>
            <strong>{documentCount}</strong>
            <small>Reports ready to review</small>
          </div>
          <div className={`${styles.metric} ${openRecommendations.length ? styles.attentionMetric : ""}`}>
            <span>Open actions</span>
            <strong>{openRecommendations.length}</strong>
            <small>{openRecommendations.length ? "Require attention" : "No outstanding actions"}</small>
          </div>
          <div className={styles.metric}>
            <span>Last published</span>
            <strong className={styles.metricDate}>{fmt(latestPublication)}</strong>
            <small>Most recent evidence update</small>
          </div>
        </section>

        <nav className={styles.sectionNav} aria-label="Evidence Hub sections">
          <a href="#evidence-library">Evidence library <span>{packs.length}</span></a>
          <a href="#action-register">Action register <span>{recommendations.length}</span></a>
          <a href="#activity">Activity <span>{timeline.length}</span></a>
        </nav>

        <div className={styles.contentGrid}>
          <section id="evidence-library" className={styles.library} aria-labelledby="evidence-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Assurance record</p>
                <h2 id="evidence-heading">Evidence library</h2>
              </div>
              <p>Open a report in your browser or download a retained copy.</p>
            </div>

            {!packs.length && (
              <div className={styles.emptyState}>
                <span aria-hidden="true">&#8475;</span>
                <h3>No evidence published yet</h3>
                <p>Your first Runtime Governance audit will appear here when it is released.</p>
              </div>
            )}

            <div className={styles.packList}>
              {packs.map((pack) => (
                <article key={pack.id} className={styles.pack}>
                  <div className={styles.packHeader}>
                    <div>
                      <div className={styles.packMeta}>
                        <span>Published</span>
                        {pack.reference && <code>{pack.reference}</code>}
                      </div>
                      <h3>{pack.name || "Runtime Governance Audit"}</h3>
                    </div>
                    <time dateTime={pack.created_at || undefined}>{fmt(pack.created_at)}</time>
                  </div>
                  {typeof pack.summary?.assess_summary === "string" && pack.summary.assess_summary.trim() && (
                    <p className={styles.packSummary}>{pack.summary.assess_summary}</p>
                  )}
                  <ul className={styles.fileList}>
                    {pack.shareable.map((file: any) => {
                      const format = /\.pdf$/i.test(file.filename) ? "PDF" : "HTML";
                      return (
                        <li key={file.id} className={styles.fileRow}>
                          <span className={styles.fileType} aria-hidden="true">{format}</span>
                          <div className={styles.fileInfo}>
                            <strong>{kindLabel(file.filename)}</strong>
                            <span>{file.filename}{file.size ? ` · ${Math.max(1, Math.round(file.size / 1024))} KB` : ""}</span>
                          </div>
                          <div className={styles.fileActions}>
                            <a className={styles.openButton} href={`/api/runtime/hub/${token}/file?id=${encodeURIComponent(file.id)}&mode=preview`} target="_blank" rel="noopener noreferrer">
                              Open <span className={styles.srOnly}>{kindLabel(file.filename)}</span>
                            </a>
                            <a className={styles.downloadButton} href={`/api/runtime/hub/${token}/file?id=${encodeURIComponent(file.id)}&mode=download`}>
                              Download <span className={styles.srOnly}>{kindLabel(file.filename)}</span>
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <aside className={styles.sidebar}>
            <section id="action-register" className={styles.sidePanel} aria-labelledby="actions-heading">
              <div className={styles.sideHeading}>
                <div>
                  <p className={styles.eyebrow}>Tracked remediation</p>
                  <h2 id="actions-heading">Action register</h2>
                </div>
                <span className={openRecommendations.length ? styles.countWarn : styles.countOk}>{openRecommendations.length} open</span>
              </div>

              {!recommendations.length && (
                <p className={styles.compactEmpty}>No governance actions have been raised.</p>
              )}
              <ul className={styles.actionList}>
                {[...openRecommendations, ...resolvedRecommendations].map((item) => {
                  const resolved = item.status === "resolved";
                  return (
                    <li key={item.id} className={`${styles.actionItem} ${resolved ? styles.resolved : ""}`}>
                      <div className={styles.actionTopline}>
                        <span className={`${styles.severity} ${styles[`severity_${item.severity}`] || ""}`}>{item.severity}</span>
                        <span className={styles.status}>{STATUS_LABEL[item.status] || item.status}</span>
                      </div>
                      <h3>{item.title}</h3>
                      {item.detail && <p>{item.detail}</p>}
                      {item.source && <code>Source: {item.source}</code>}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section id="activity" className={styles.sidePanel} aria-labelledby="activity-heading">
              <div className={styles.sideHeading}>
                <div>
                  <p className={styles.eyebrow}>Publication history</p>
                  <h2 id="activity-heading">Recent activity</h2>
                </div>
              </div>
              {!timeline.length && <p className={styles.compactEmpty}>No publication activity yet.</p>}
              <ol className={styles.timeline}>
                {timeline.map((item, index) => (
                  <li key={`${item.at || "event"}-${index}`}>
                    <span className={styles.timelineDot} aria-hidden="true" />
                    <div>
                      <strong>{item.label}</strong>
                      {item.reference && <code>{item.reference}</code>}
                      <time dateTime={item.at || undefined}>{fmt(item.at)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>

        <footer className={styles.footer}>
          <div>
            <span className={styles.mark} aria-hidden="true">&#8475;(t)</span>
            <span>Confidential evidence shared with <strong>{orgName}</strong></span>
          </div>
          <span>Patent GB2600765.8 · Morrison Runtime Governance&trade;</span>
        </footer>
      </div>
    </main>
  );
}
