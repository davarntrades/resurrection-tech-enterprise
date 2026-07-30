/* Hermetic Gmail provider for governed communication tests.
 * Mirrors the Google OAuth token endpoint and the Gmail send/draft/profile
 * endpoints the Integration Gateway connector uses, so the suites exercise the
 * real connector boundary (MIME assembly, token refresh, error mapping) with no
 * network. Records every delivery so a test can assert exactly-once sending. */
"use strict";
const http = require("node:http");

function startMockGmail({ mailbox = "governed@resurrection.tech", failWith = null } = {}) {
  const state = {
    sent: [], drafts: [], revoked: [], tokenRequests: 0, sendRequests: 0,
    inbox: [{
      id: "gmailmsg_inbox_1", threadId: "gmailthread_inbox_1", labelIds: ["INBOX"],
      snippet: "Quarterly governance review request",
      sizeEstimate: 2048,
      payload: {
        headers: [
          { name: "From", value: "customer@example.com" },
          { name: "To", value: mailbox },
          { name: "Subject", value: "Quarterly governance review" },
          { name: "Date", value: "Thu, 30 Jul 2026 09:00:00 +0000" },
        ],
        body: { data: Buffer.from("Full inbound body text.", "utf8").toString("base64url") },
      },
    }],
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname;
      const json = (status, payload) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (path === "/token") {
        state.tokenRequests += 1;
        const params = new URLSearchParams(body);
        if (!params.get("client_id") || !params.get("client_secret") || !params.get("refresh_token")) {
          return json(400, { error: { message: "invalid_grant" } });
        }
        return json(200, { access_token: `mock-access-${state.tokenRequests}`, expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send" });
      }
      if (path === "/revoke") {
        const params = new URLSearchParams(body);
        const token = params.get("token");
        if (!token) return json(400, { error: { message: "missing token" } });
        state.revoked.push(token);
        return json(200, {});
      }
      if (!/^Bearer mock-access-/.test(String(req.headers.authorization || ""))) {
        return json(401, { error: { message: "Request had invalid authentication credentials" } });
      }
      if (/\/profile$/.test(path)) {
        return json(200, { emailAddress: mailbox, messagesTotal: 42 });
      }
      if (/\/messages$/.test(path) && req.method === "GET") {
        const ids = state.inbox.map((m) => ({ id: m.id, threadId: m.threadId }));
        return json(200, { messages: ids.slice(0, Number(url.searchParams.get("maxResults") || 25)), resultSizeEstimate: ids.length });
      }
      const detail = path.match(/\/messages\/([^/?]+)$/);
      if (detail && req.method === "GET") {
        const found = state.inbox.find((m) => m.id === decodeURIComponent(detail[1]));
        if (!found) return json(404, { error: { message: "not found" } });
        return json(200, found);
      }
      if (/\/messages\/send$/.test(path)) {
        state.sendRequests += 1;
        if (failWith) return json(failWith.status || 500, { error: { message: failWith.message || "provider failure" } });
        const payload = JSON.parse(body || "{}");
        const raw = Buffer.from(String(payload.raw || ""), "base64url").toString("utf8");
        const record = { id: `gmailmsg_${state.sent.length + 1}`, threadId: payload.threadId || `gmailthread_${state.sent.length + 1}`, raw };
        state.sent.push(record);
        return json(200, { id: record.id, threadId: record.threadId, labelIds: ["SENT"] });
      }
      if (/\/drafts$/.test(path)) {
        if (failWith) return json(failWith.status || 500, { error: { message: failWith.message || "provider failure" } });
        const payload = JSON.parse(body || "{}");
        const raw = Buffer.from(String(payload.message && payload.message.raw || ""), "base64url").toString("utf8");
        const record = { id: `gmaildraft_${state.drafts.length + 1}`, raw };
        state.drafts.push(record);
        return json(200, { id: record.id, message: { id: `gmailmsg_draft_${state.drafts.length}`, threadId: `gmailthread_draft_${state.drafts.length}`, labelIds: ["DRAFT"] } });
      }
      return json(404, { error: { message: `unexpected path ${path}` } });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.state = state;
      server.oauthBase = `http://127.0.0.1:${port}`;
      server.apiBase = `http://127.0.0.1:${port}/gmail/v1`;
      resolve(server);
    });
  });
}

module.exports = { startMockGmail };
