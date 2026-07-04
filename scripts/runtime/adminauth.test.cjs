#!/usr/bin/env node
/* Runtime Governance — operator auth unit test (no engine / network needed).
 * Validates password check, session issue/verify, tamper + wrong-secret
 * rejection, expiry, and the authorize() guard (session vs x-admin-key). */
"use strict";
const assert = require("node:assert");
const path = require("node:path");

// Fresh env for deterministic behaviour.
for (const k of ["RUNTIME_ADMIN_KEY", "RUNTIME_OPERATOR_PASSWORD", "RUNTIME_SESSION_SECRET", "RUNTIME_SESSION_TTL_SEC"]) delete process.env[k];
const auth = require(path.join("..", "..", "lib", "runtime", "adminauth.js"));

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

// 1. Unconfigured → login refused, guard closed.
ok(auth.configured() === false, "unconfigured: configured() is false");
ok(auth.login("anything").ok === false, "unconfigured: login refused");
ok(auth.authorize({ sessionToken: "x.y" }).ok === false, "unconfigured: bogus session rejected");

// 2. Configured via RUNTIME_ADMIN_KEY (bootstrap password + derived secret).
process.env.RUNTIME_ADMIN_KEY = "admin-secret-123";
ok(auth.configured() === true, "configured() true once RUNTIME_ADMIN_KEY set");
ok(auth.login("wrong").ok === false, "wrong password rejected");
const good = auth.login("admin-secret-123");
ok(good.ok === true && typeof good.token === "string", "correct password mints a token");
ok(good.maxAgeSec > 0 && good.maxAgeSec <= 43200, "session maxAge within default TTL");

// 3. verifyToken + authorize via session.
const payload = auth.verifyToken(good.token);
ok(payload && payload.sub === "operator" && typeof payload.exp === "number", "verifyToken returns payload");
ok(auth.authorize({ sessionToken: good.token }).via === "session", "authorize accepts valid session");

// 4. Tamper + wrong-secret rejection.
const [p, s] = good.token.split(".");
ok(auth.verifyToken(`${p}x.${s}`) === null, "tampered payload rejected");
ok(auth.verifyToken(`${p}.${s.slice(0, -2)}AA`) === null, "tampered signature rejected");
process.env.RUNTIME_SESSION_SECRET = "an-entirely-different-secret";
ok(auth.verifyToken(good.token) === null, "token from a different secret rejected");
delete process.env.RUNTIME_SESSION_SECRET;

// 5. x-admin-key path (curl/CLI back-compat), independent of session.
ok(auth.authorize({ adminKey: "admin-secret-123" }).via === "admin-key", "authorize accepts correct x-admin-key");
ok(auth.authorize({ adminKey: "nope" }).ok === false, "authorize rejects wrong x-admin-key");
ok(auth.authorize({}).ok === false, "authorize rejects empty");

// 6. Expiry — a valid token is rejected once its exp has passed (advance the clock).
process.env.RUNTIME_SESSION_TTL_SEC = "60";
const shortLived = auth.issueToken("operator");
ok(auth.verifyToken(shortLived.token) !== null, "token valid before expiry");
const realNow = Date.now;
Date.now = () => realNow() + 61 * 1000;      // jump past the 60s TTL
ok(auth.verifyToken(shortLived.token) === null, "expired token rejected");
Date.now = realNow;
delete process.env.RUNTIME_SESSION_TTL_SEC;

// 7. Distinct operator password: admin key is NOT a valid login password, but the
//    x-admin-key HEADER still authorizes (they are separate mechanisms).
process.env.RUNTIME_OPERATOR_PASSWORD = "operator-pw-xyz";
ok(auth.login("operator-pw-xyz").ok === true, "distinct operator password logs in");
ok(auth.login("admin-secret-123").ok === false, "admin key is not the login password when OPERATOR_PASSWORD set");
ok(auth.authorize({ adminKey: "admin-secret-123" }).via === "admin-key", "x-admin-key header still authorizes");
delete process.env.RUNTIME_OPERATOR_PASSWORD;

console.log(`\nadminauth unit test: ${pass} passed, ${fail} failed`);
if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
process.exit(fail ? 1 : 0);
