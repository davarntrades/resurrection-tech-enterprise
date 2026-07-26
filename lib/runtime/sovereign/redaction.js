"use strict";

const SECRET_KEYS = /(^|_)(secret|token|password|credential|private[_-]?key|access[_-]?key|session[_-]?key|api[_-]?key|client[_-]?secret|authorization|cookie|signature)($|_)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const AWS_KEY = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g;
const PRIVATE_KEY = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g;
const GENERIC_ASSIGNMENT = /\b(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["']?[^\s,"'}]+/gi;

function redactString(value) {
  return String(value)
    .replace(PRIVATE_KEY, "[REDACTED_PRIVATE_KEY]")
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(AWS_KEY, "[REDACTED_AWS_ACCESS_KEY]")
    .replace(GENERIC_ASSIGNMENT, (match, name) => `${name}=[REDACTED]`);
}

function redact(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Buffer.isBuffer(value)) return "[REDACTED_BINARY]";
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = SECRET_KEYS.test(key) ? "[REDACTED]" : redact(item, seen);
  return output;
}

function safeError(error, fallback = "operation failed") {
  return {
    name: error && error.name ? String(error.name) : "Error",
    code: error && error.code ? String(error.code) : null,
    message: redactString(error && error.message ? error.message : fallback).slice(0, 500),
  };
}

function safeSerialize(value) { return JSON.stringify(redact(value)); }

module.exports = { SECRET_KEYS, redactString, redact, safeError, safeSerialize };
