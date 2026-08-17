"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const engine = require("../../lib/runtime/engine");

function transportResponse(statusCode, payload = {}) {
  return {
    request(_options, callback) {
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.write = () => {};
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = statusCode;
        queueMicrotask(() => {
          callback(res);
          queueMicrotask(() => {
            res.emit("data", Buffer.from(JSON.stringify(payload)));
            res.emit("end");
          });
        });
      };
      return req;
    },
  };
}

function transportError(code) {
  return {
    request() {
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.write = () => {};
      req.destroy = () => {};
      req.end = () => {
        const error = new Error(code);
        error.code = code;
        queueMicrotask(() => req.emit("error", error));
      };
      return req;
    },
  };
}

(async () => {
  assert.equal(engine.httpFailureCode(401), "GOVERNANCE_AUTH_FAILURE");
  assert.equal(engine.httpFailureCode(403), "GOVERNANCE_AUTH_FAILURE");
  assert.equal(engine.httpFailureCode(404), "GOVERNANCE_ENDPOINT_MISMATCH");
  assert.equal(engine.httpFailureCode(503), "GOVERNANCE_SERVICE_UNAVAILABLE");
  assert.equal(engine.transportFailureCode({ code: "ENOTFOUND" }), "GOVERNANCE_DNS_FAILURE");
  assert.equal(engine.transportFailureCode({ code: "ECONNREFUSED" }), "GOVERNANCE_CONNECTION_FAILURE");
  assert.equal(engine.transportFailureCode({ code: "ETIMEDOUT" }), "GOVERNANCE_TIMEOUT");
  assert.equal(engine.transportFailureCode({ code: "CERT_HAS_EXPIRED" }), "GOVERNANCE_TLS_FAILURE");

  const auth = await engine.request("GET", "/health", null, { transport: transportResponse(401) });
  assert.equal(auth.ok, false);
  assert.equal(auth.code, "GOVERNANCE_AUTH_FAILURE");
  assert.equal(auth.status, 401);

  const outage = await engine.request("GET", "/health", null, { transport: transportResponse(503) });
  assert.equal(outage.ok, false);
  assert.equal(outage.code, "GOVERNANCE_SERVICE_UNAVAILABLE");

  const dns = await engine.request("GET", "/health", null, { transport: transportError("ENOTFOUND") });
  assert.equal(dns.ok, false);
  assert.equal(dns.code, "GOVERNANCE_DNS_FAILURE");

  const config = engine.configuration();
  assert.ok(["environment", "hosted_default", "required_unset"].includes(config.endpoint_source));
  assert.equal(typeof config.bearer_token_configured, "boolean");
  assert.equal(typeof config.gateway_secret_configured, "boolean");

  console.log("PASS engine diagnostic failure classes");
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
