"use strict";

class EvidenceStoreError extends Error {
  constructor(code, message) { super(message); this.name = "EvidenceStoreError"; this.code = code; }
}

class EvidenceStoreRegistry {
  constructor() { this.stores = new Map(); }
  register(name, store) {
    if (!name || !store || typeof store.write !== "function" || typeof store.find !== "function")
      throw new EvidenceStoreError("EVIDENCE_STORE_INVALID", "evidence store must implement write and find");
    this.stores.set(String(name), store); return this;
  }
  get(name) {
    const store = this.stores.get(String(name));
    if (!store) throw new EvidenceStoreError("EVIDENCE_STORE_UNAVAILABLE", `evidence store ${name} is not configured`);
    return store;
  }
}

function localRuntimeStore(runtimeStore) {
  return {
    async write(collection, record, context = {}) {
      if (!record || record.org_id !== context.org_id || record.environment_id !== context.environment_id)
        throw new EvidenceStoreError("EVIDENCE_OWNERSHIP_MISMATCH", "evidence ownership could not be verified");
      return runtimeStore.insert(collection, record);
    },
    async find(collection, query, context = {}) {
      return runtimeStore.find(collection, { ...query, org_id: context.org_id, environment_id: context.environment_id });
    },
    boundary: "deployment-local",
  };
}

function evidenceDeliveryDefaults(deploymentPolicy) {
  return Object.freeze({
    external_export_enabled: !deploymentPolicy.sovereign && deploymentPolicy.external_evidence_delivery,
    webhook_delivery_enabled: !deploymentPolicy.sovereign,
    remote_replication_enabled: false,
  });
}

module.exports = { EvidenceStoreError, EvidenceStoreRegistry, localRuntimeStore, evidenceDeliveryDefaults };
