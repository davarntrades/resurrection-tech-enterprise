/* Runtime Governance platform — barrel export. Framework-agnostic core that
 * extends AROUND the existing engine (never modifies engine logic). */
"use strict";
const store = require("./store");
const admin = require("./admin");
const engine = require("./engine");
const manifests = require("./manifests");
const gateway = require("./gateway");
const metrics = require("./metrics");
const reports = require("./reports");
const log = require("./log");
const ratelimit = require("./ratelimit");
const adminauth = require("./adminauth");
const adminaudit = require("./adminaudit");
const preflight = require("./preflight");
const alerts = require("./alerts");
const deliverables = require("./deliverables");
const hub = require("./hub");
const notify = require("./notify");
const recommendations = require("./recommendations");
const engagement = require("./engagement");
const lifecycle = require("./lifecycle");
const customeradmin = require("./customeradmin");
const fullaudit = require("./fullaudit");
const enterpriseassessment = require("./enterpriseassessment");
const overview = require("./overview");

// Health + diagnostics: engine reachability, store backend, tenancy counts.
async function health() {
  const eng = await engine.health();
  return {
    status: eng.ok ? "ok" : "degraded",
    time: store.nowISO(),
    engine: {
      url: engine.ENGINE_URL, reachable: eng.ok,
      engine_commit: eng.ok && eng.json ? eng.json.engine_commit : null,
      live_sectors: eng.ok && eng.json ? eng.json.live_sectors : null,
      error: eng.ok ? null : (eng.error || `HTTP ${eng.status}`),
    },
    store: (() => {
      // A local file backend means two very different things. On cloud it is a
      // dev fallback that must be flagged. Under a sovereign profile it is the
      // DEPLOYMENT TARGET — chosen deliberately because state may not leave the
      // estate — so the warning becomes the (real, still-true) single-writer
      // caveat instead of "configure Supabase", which would be wrong advice.
      const prof = require("../sovereign/profiles").profileSafe();
      const local = store.backend() === "file";
      const intentional = local && prof.storage === "local";
      return {
        backend: store.backend(),
        durable: store.durable(),
        profile: prof.id,
        data_dir: local ? store.DATA_DIR : null,
        cloud_refused: store.cloudRefused(),
        cloud_error: store.cloudError(),
        warning: !local ? null
          // A cloud client that FAILED to construct outranks both other
          // messages: the deployment believes it is on Supabase and is not.
          : store.cloudError() ? `cloud store configured but UNAVAILABLE (${store.cloudError()}) — running on local disk`
            : intentional ? "local sovereign store — back up the data directory; run a single writer per data directory"
              : "non-durable dev file store — configure Supabase for live customer traffic",
      };
    })(),
    require_durable: /^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_DURABLE || "")),
    // Observability surface (L1): recent event counts for at-a-glance health.
    observability: { event_counts: log.counters(), rate_limiting: ratelimit.enabled() },
  };
}

module.exports = { store, admin, engine, manifests, gateway, metrics, reports, log, ratelimit, adminauth, adminaudit, preflight, alerts, deliverables, hub, notify, recommendations, engagement, lifecycle, customeradmin, fullaudit, enterpriseassessment, overview, health };
