/* Shared mock Google OAuth + Gmail API for the Gmail integration test.
 * Serves the minimal read surface lib/ops/gmail.js uses:
 *   POST /token          authorization_code + refresh_token grants
 *   POST /revoke
 *   GET  /users/me/profile
 *   GET  /users/me/messages           (list)
 *   GET  /users/me/messages/{id}      (get; metadata or full)
 * Never talks to Google — hermetic. Seed messages via startMockGoogle({messages}). */
"use strict";
const http = require("node:http");

function messageResource(m) {
  return {
    id: m.id, threadId: m.threadId || `t_${m.id}`, snippet: m.snippet || "",
    internalDate: String(m.internalDate || Date.now()),
    labelIds: m.labelIds || ["INBOX", "UNREAD"],
    payload: { headers: [
      { name: "From", value: m.from || "" },
      { name: "To", value: m.to || "ops@resurrection.tech" },
      { name: "Subject", value: m.subject || "" },
      { name: "Date", value: new Date(Number(m.internalDate || Date.now())).toUTCString() },
    ] },
  };
}

function startMockGoogle({ messages = [], mailbox = "ops@resurrection.tech" } = {}) {
  const state = { messages: messages.slice(), mailbox };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      const p = url.pathname;

      if (req.method === "POST" && p === "/token") {
        let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
          const params = new URLSearchParams(body);
          const grant = params.get("grant_type");
          const base = { access_token: "mock-access-" + Math.random().toString(36).slice(2, 8), expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly", token_type: "Bearer" };
          if (grant === "authorization_code") base.refresh_token = "mock-refresh-token";
          send(200, base);
        });
        return;
      }
      if (req.method === "POST" && p === "/revoke") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => send(200, {})); return; }
      if (p === "/users/me/profile") return send(200, { emailAddress: state.mailbox, messagesTotal: state.messages.length });
      if (p === "/users/me/messages") return send(200, { messages: state.messages.map((m) => ({ id: m.id, threadId: m.threadId || `t_${m.id}` })), resultSizeEstimate: state.messages.length, historyId: "99001" });
      const mm = p.match(/^\/users\/me\/messages\/(.+)$/);
      if (mm) { const m = state.messages.find((x) => x.id === decodeURIComponent(mm[1])); return m ? send(200, messageResource(m)) : send(404, { error: "not found" }); }
      send(404, { error: "unhandled", path: p });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

module.exports = { startMockGoogle };
