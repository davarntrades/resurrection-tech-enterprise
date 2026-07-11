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
    store: {
      backend: store.backend(),
      durable: store.durable(),
      data_dir: store.backend() === "file" ? store.DATA_DIR : null,
      warning: store.durable() ? null : "non-durable dev file store — configure Supabase for live customer traffic",
    },
    require_durable: /^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_DURABLE || "")),
    // Observability surface (L1): recent event counts for at-a-glance health.
    observability: { event_counts: log.counters(), rate_limiting: ratelimit.enabled() },
  };
}

module.exports = { store, admin, engine, manifests, gateway, metrics, reports, log, ratelimit, adminauth, adminaudit, preflight, alerts, deliverables, hub, overview, health };
