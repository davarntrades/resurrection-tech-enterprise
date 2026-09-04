"use client";

import Link from "next/link";
import { KIND_LABEL, type EvidenceRecord } from "./evidence-data";

/* ============================================================
   One evidence record, rendered as an artifact rather than a
   testimonial: a header block that reads like a filing line, the
   source statement set apart, and the architectural reading
   attributed separately so it is never mistaken for the source's
   own words.

   Every kind uses the same frame. A case study added later drops
   into the same card with metrics filled in.
   ============================================================ */

export function EvidenceCard({ record, index }: { record: EvidenceRecord; index: number }) {
  const external = record.source?.href.startsWith("http");
  const label = KIND_LABEL[record.kind];

  return (
    <article
      className={`ev-card ev-card--${record.kind}`}
      aria-labelledby={`${record.id}-org`}
      id={`ev-${record.id}`}
    >
      <header className="ev-card-head">
        <span className="ev-card-headline">
          <span className="ev-card-idx" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="ev-card-date">
            <time dateTime={record.date}>{record.dateLabel}</time>
          </span>
        </span>
        <span className="ev-card-kind">{label}</span>
      </header>

      <div className="ev-card-org">
        <h3 id={`${record.id}-org`} className="ev-card-name">
          {record.org}
        </h3>
        {record.unit && <span className="ev-card-unit">{record.unit}</span>}
      </div>

      <p className="ev-card-code">{record.code}</p>

      {/* The source's own words. Quoted, but without the decorative
          punctuation a testimonial section would use. */}
      <blockquote className="ev-card-statement">
        <p>{record.statement}</p>
      </blockquote>

      <p className="ev-card-body">{record.body}</p>

      {record.sequence && (
        <ol className="ev-seq" aria-label="Reported sequence">
          {record.sequence.map((step, i) => (
            <li
              key={step}
              className={i === record.sequenceBreak ? "is-terminal" : undefined}
            >
              <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {record.metrics && (
        <dl className="ev-metrics">
          {record.metrics.map((m) => (
            <div key={m.k}>
              <dt>{m.k}</dt>
              <dd>{m.v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="ev-card-reading">
        <span className="ev-card-reading-k">Control reading</span>
        <p>{record.reading}</p>
      </div>

      {record.source && (
        <footer className="ev-card-foot">
          {external ? (
            <a href={record.source.href} target="_blank" rel="noopener noreferrer">
              {record.source.label}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href={record.source.href}>
              {record.source.label}
              <span aria-hidden="true"> →</span>
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}
