"use strict";

const SECRET_KEYS = /(^|_)(secret|token|password|credential|private_key|access_key|session_key|api_key)($|_)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const AWS_KEY = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g;

function redactString(value) {
  return String(value)
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(AWS_KEY, "[REDACTED_AWS_ACCESS_KEY]");
}

function redact(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEYS.test(key) ? "[REDACTED]" : redact(item, seen);
  }
  return output;
}

function safeError(error, fallback = "operation failed") {
  return {
    name: error && error.name ? String(error.name) : "Error",
    code: error && error.code ? String(error.code) : null,
    message: redactString(error && error.message ? error.message : fallback).slice(0, 500),
  };
}

module.exports = { SECRET_KEYS, redactString, redact, safeError };
