"use client";

import { useState } from "react";
import Link from "next/link";
import { IntegrationTile } from "./IntegrationTile";
import { SignalTrack } from "./SignalTrack";
import {
  ALL_INTEGRATIONS,
  GROUPS,
  STATUS_LABEL,
  STATUS_NOTE,
  type Integration,
} from "./integrations-data";

/* ============================================================
   The integration matrix.

   Not a logo wall: a grid of surfaces with one authority layer
   stated across the top, and a detail panel that says, for the
   selected surface, where the boundary sits and what backs the
   claim in this repository.

   The status tier is the honest part. "Reference guard" and
   "Governed execution" mean something specific and different, and
   "Destination class" explicitly means no vendor adapter exists.
   ============================================================ */

const DEFAULT_ID = "mcp";

export function IntegrationMatrix() {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_ID);
  const selected: Integration =
    ALL_INTEGRATIONS.find((i) => i.id === selectedId) ?? ALL_INTEGRATIONS[0];

  return (
    <div className="im">
      {/* The constant. Everything below it changes; this does not. */}
      <div className="im-authority">
        <span className="im-authority-k">One authority layer</span>
        <strong>Morrison Runtime Governance™</strong>
        <span className="im-authority-contract">
          identity → policy → verdict → approval → execution → evidence
        </span>
      </div>

      <div className="im-groups">
        {GROUPS.map((group, gi) => (
          <section className="im-group" key={group.id} aria-labelledby={`im-${group.id}`}>
            <header className="im-group-head">
              <h3 id={`im-${group.id}`} className="im-group-title">
                {group.title}
              </h3>
              <p className="im-group-note">{group.note}</p>
            </header>

            <div className="im-grid-wrap">
              <div
                className="im-grid"
                style={{ ["--im-cells" as string]: group.items.length }}
              >
                {group.items.map((item) => (
                  <IntegrationTile
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
              <SignalTrack cells={group.items.length} delay={gi * 900} />
            </div>
          </section>
        ))}
      </div>

      {/* Detail panel. Live region so a keyboard user hears the change
          as they move across the grid. */}
      <div className="im-detail" id="im-detail" aria-live="polite">
        <div className="im-detail-head">
          <span className={`im-detail-status im-detail-status--${selected.status}`}>
            <span className="im-detail-mark" aria-hidden="true" />
            {STATUS_LABEL[selected.status]}
          </span>
          <span className="im-detail-name">{selected.label}</span>
        </div>

        <dl className="im-detail-rows">
          <div>
            <dt>Boundary</dt>
            <dd>{selected.boundary}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{STATUS_NOTE[selected.status]}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>
              <span className="im-detail-ev">{selected.evidence}</span>
              {selected.href && (
                <>
                  {" "}
                  <Link className="im-detail-link" href={selected.href}>
                    View →
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <p className="im-claim">
        Status describes what exists in the governance repository today. A destination class
        means the boundary is placed in front of that kind of action over the generic contract —
        it does not claim a vendor-specific adapter, a partnership or an endorsement.
      </p>
    </div>
  );
}
