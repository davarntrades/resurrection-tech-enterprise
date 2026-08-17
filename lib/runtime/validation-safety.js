"use strict";

const KNOWN_PRODUCTION_PROJECT_REFS = Object.freeze([
  "vnyosaazlrjferxyesdf", // resurrection-tech-prod
  "vqwumjgognhuvaioccig", // trajectory-prod
]);
const VALIDATION_MARKER = "LEVEL2_DISPOSABLE_VALIDATION";

class ValidationTargetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ValidationTargetError";
    this.code = code;
  }
}

function normalise(value) {
  return String(value == null ? "" : value).trim();
}

function projectRefFromUrl(value) {
  const text = normalise(value);
  const match = text.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i) || text.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function targetMetadata(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VALIDATION_SUPABASE_URL || "";
  const databaseUrl = env.VALIDATION_DATABASE_URL || "";
  const explicitRef = normalise(env.VALIDATION_PROJECT_REF);
  const inferredRef = projectRefFromUrl(url) || projectRefFromUrl(databaseUrl);
  return {
    target: normalise(env.RUNTIME_VALIDATION_TARGET).toLowerCase(),
    classification: normalise(env.VALIDATION_ENVIRONMENT_CLASSIFICATION).toUpperCase(),
    project_ref: explicitRef || inferredRef || null,
    explicit_project_ref: explicitRef || null,
    inferred_project_ref: inferredRef || null,
    supabase_url: normalise(url) || null,
    database_host: (() => {
      try { return databaseUrl ? new URL(databaseUrl).hostname : null; } catch { return null; }
    })(),
    destructive_ack: normalise(env.ALLOW_DESTRUCTIVE_VALIDATION),
    empty_target_attestation: normalise(env.VALIDATION_TARGET_EMPTY),
    marker: normalise(env.VALIDATION_DATA_MARKER),
  };
}

function assertNonProductionTarget(env = process.env, { destructive = true } = {}) {
  const meta = targetMetadata(env);

  if (meta.target !== "disposable") {
    throw new ValidationTargetError("TARGET_NOT_DISPOSABLE", "RUNTIME_VALIDATION_TARGET must equal disposable");
  }
  if (meta.classification !== "DISPOSABLE") {
    throw new ValidationTargetError("CLASSIFICATION_NOT_DISPOSABLE", "VALIDATION_ENVIRONMENT_CLASSIFICATION must equal DISPOSABLE");
  }
  if (!meta.project_ref) {
    throw new ValidationTargetError("PROJECT_REF_REQUIRED", "VALIDATION_PROJECT_REF or an inferable Supabase project ref is required");
  }
  if (KNOWN_PRODUCTION_PROJECT_REFS.includes(meta.project_ref)) {
    throw new ValidationTargetError("PRODUCTION_PROJECT_FORBIDDEN", `project ref ${meta.project_ref} is a known production target and destructive validation is forbidden`);
  }
  if (meta.explicit_project_ref && meta.inferred_project_ref && meta.explicit_project_ref !== meta.inferred_project_ref) {
    throw new ValidationTargetError("PROJECT_REF_MISMATCH", `explicit project ref ${meta.explicit_project_ref} does not match target URL ref ${meta.inferred_project_ref}`);
  }
  if (meta.marker !== VALIDATION_MARKER) {
    throw new ValidationTargetError("VALIDATION_MARKER_REQUIRED", `VALIDATION_DATA_MARKER must equal ${VALIDATION_MARKER}`);
  }

  if (destructive) {
    if (meta.destructive_ack !== "1") {
      throw new ValidationTargetError("DESTRUCTIVE_ACK_REQUIRED", "ALLOW_DESTRUCTIVE_VALIDATION=1 is required");
    }
    if (meta.empty_target_attestation !== "1") {
      throw new ValidationTargetError("EMPTY_TARGET_ATTESTATION_REQUIRED", "VALIDATION_TARGET_EMPTY=1 is required to attest that the disposable target contains no customer data");
    }
  }

  return Object.freeze({
    ok: true,
    destructive: !!destructive,
    target: meta.target,
    classification: meta.classification,
    project_ref: meta.project_ref,
    supabase_url: meta.supabase_url,
    database_host: meta.database_host,
    marker: VALIDATION_MARKER,
  });
}

function printTarget(meta, writer = console.error) {
  writer("LEVEL-2 VALIDATION TARGET");
  writer(`  classification: ${meta.classification}`);
  writer(`  project_ref: ${meta.project_ref}`);
  writer(`  supabase_url: ${meta.supabase_url || "not supplied"}`);
  writer(`  database_host: ${meta.database_host || "not supplied"}`);
  writer(`  destructive: ${meta.destructive ? "YES" : "NO"}`);
  writer(`  marker: ${meta.marker}`);
}

module.exports = {
  KNOWN_PRODUCTION_PROJECT_REFS,
  VALIDATION_MARKER,
  ValidationTargetError,
  projectRefFromUrl,
  targetMetadata,
  assertNonProductionTarget,
  printTarget,
};
