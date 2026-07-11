"use strict";
/* ============================================================================
 * Client-safe, pure builder for the operator "deliverable file" URL.
 *
 * INTENTIONALLY RELATIVE (same-origin). The Control Room may be served from the
 * canonical host (e.g. https://www.resurrection-tech.com); the apex host issues
 * a 307 canonical redirect to it. A Preview/Download must therefore stay on the
 * SAME origin the operator is already on — a relative URL keeps the browser on
 * the canonical host and preserves the operator session cookie. Never hard-code
 * an absolute host here (https://resurrection-tech.com/...): that would cross
 * the apex→www 307 on a new-tab navigation and can break inline PDF preview /
 * auth on iPad Safari.
 *
 * Pure and dependency-free so it is unit-testable without a browser or bundler.
 * ============================================================================ */

// Build the relative API URL that streams a deliverable's bytes.
//   id   — deliverable id (URL-encoded)
//   mode — "preview" (inline) or "download" (attachment); anything else → preview
function deliverableFileUrl(id, mode) {
  const m = mode === "download" ? "download" : "preview";
  return `/api/runtime/admin/deliverables/file?id=${encodeURIComponent(id)}&mode=${m}`;
}

module.exports = { deliverableFileUrl };
