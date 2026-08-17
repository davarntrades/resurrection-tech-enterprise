/* Runtime Governance platform — barrel export. Framework-agnostic core that
 * extends AROUND the existing engine (never modifies engine logic). */
"use strict";
const store = require("./store");
const tenantStore = require("./tenant-store");
const productionReadiness = require("./production-readiness");
const deploymentProfiles = require("./deployment-profiles");
const admin = require("./admin");
const engine = require("./engine");
const manifests = require("./manifests");
const gateway = require("./gateway");
const metrics = require("./metrics");
const reports = require("./reports");
const connectorAudit = require("./connector-audit");
const log = require("./log");
const ratelimit = require("./ratelimit");
const adminauth = require("./adminauth");
const adminaudit = require("./adminaudit");
const preflight = require("./preflight");
const alerts = require("./alerts");
const assurance = require("./assurance");
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
const startup = require("./startup");
const baseIntegrationGateway = require("./integration-gateway");
const productionBaseIntegrationGateway = require("./production-gateway-runtime").wrapProductionGateway(baseIntegrationGateway, store);
const sovereign = require("./sovereign");
const integrationGateway = require("./sovereign/integration-gateway-runtime").wrapIntegrationGateway(productionBaseIntegrationGateway, store);
const approvedBedrock = require("./bedrock-approved-invocation");
integrationGateway.executeApprovedBedrockInvocation = (input, dependencies) => approvedBedrock.executeApprovedBedrockInvocation(input, integrationGateway, dependencies);
const approvedCommunication = require("./communication-approved-send");
integrationGateway.executeApprovedCommunication = (input, dependencies) => approvedCommunication.executeApprovedCommunication(input, integrationGateway, dependencies);
const communicationRuns = require("./communication-runs");
const communicationAdapters = require("./communication-adapters");
const bedrockInvocationRuns = require("./bedrock-invocation-runs");
const customerSupportWorkflow = require("./customer-support-production-workflow");

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
        fault: store.storageFault(),
        warning: !local ? null
          : store.cloudError() ? `cloud store configured but UNAVAILABLE (${store.cloudError()}) — running on local disk`
            : intentional ? "local sovereign store — back up the data directory; run a single writer per data directory"
              : "non-durable dev file store — configure Supabase for live customer traffic",
      };
    })(),
    require_durable: /^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_DURABLE || "")),
    observability: { event_counts: log.counters(), rate_limiting: ratelimit.enabled() },
  };
}

module.exports = {
  store, tenantStore, productionReadiness, deploymentProfiles,
  startup, admin, engine, manifests, gateway, integrationGateway, connectorAudit,
  bedrockInvocationRuns, communicationRuns, communicationAdapters, customerSupportWorkflow,
  sovereign, metrics, reports, log, ratelimit, adminauth, adminaudit, preflight, alerts,
  assurance, deliverables, hub, notify, recommendations, engagement, lifecycle,
  customeradmin, fullaudit, enterpriseassessment, overview, health,
};
