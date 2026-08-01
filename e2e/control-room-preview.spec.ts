import { test, expect } from "@playwright/test";

/**
 * ACCEPTANCE (production): Customers → Dry Run Customer → Audit pack → Preview.
 * The Preview of audit.pdf MUST return application/pdf (200/206). If it opens
 * anything else (the branded 404, an HTML error, a redirect), this test — and
 * therefore the build — fails. Runs on WebKit (the Safari engine).
 *
 * Env:
 *   E2E_BASE_URL              e.g. https://www.resurrection-tech.com (playwright.config)
 *   ADMIN_USER / ADMIN_PASSWORD   HTTP Basic Auth for /admin/* (playwright.config httpCredentials)
 *   RUNTIME_ADMIN_KEY (or RUNTIME_OPERATOR_PASSWORD)   operator login password
 *   E2E_CUSTOMER              customer card name (default "Dry Run Customer")
 */
// TWO different credentials, deliberately kept apart.
//   OP_PASSWORD — the operator sign-in inside the Control Room UI. Mirrors the
//     server's own order: RUNTIME_OPERATOR_PASSWORD, else RUNTIME_ADMIN_KEY.
//   ADMIN_KEY   — the x-admin-key header on /api/runtime/admin/*, which is only
//     ever RUNTIME_ADMIN_KEY (adminauth compares it to exactly that).
// Collapsing them into one constant works right up until a deployment sets an
// operator password, at which point the API calls start 401ing.
const OP_PASSWORD = process.env.RUNTIME_OPERATOR_PASSWORD || process.env.RUNTIME_ADMIN_KEY || "";
const ADMIN_KEY = process.env.RUNTIME_ADMIN_KEY || "";
const CUSTOMER = process.env.E2E_CUSTOMER || "Dry Run Customer";

test.describe("Control Room — Audit pack → Preview (production)", () => {
  test.skip(!OP_PASSWORD, "set RUNTIME_ADMIN_KEY or RUNTIME_OPERATOR_PASSWORD to run");

  test("Preview of audit.pdf serves application/pdf, not the 404 page", async ({ page }) => {
    // 1) Open the Control Room (HTTP Basic Auth comes from httpCredentials).
    await page.goto("/admin/runtime", { waitUntil: "domcontentloaded" });

    // 2) The deployment may already have an authenticated operator session. Wait for
    //    either the real login field or the authenticated Control Room shell, and only
    //    submit credentials when the login field is actually present.
    const password = page.getByPlaceholder("Operator password");
    const controlRoom = page.getByRole("heading", { name: "Operator Control Room" });
    try {
      await password.or(controlRoom).first().waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      // A bare locator timeout here says nothing about WHY. Report the state the
      // page actually settled in — still checking the session, an error shell, or
      // markup that no longer matches — so the next failure is diagnosable from
      // the CI log alone. Control Room chrome is non-secret; truncated regardless.
      const visible = (await page.locator("body").innerText().catch(() => ""))
        .replace(/\s+/g, " ").trim().slice(0, 300);
      // The commonest cause is the /admin/* Basic Auth gate (proxy.ts) rejecting
      // the browser, which renders its 401 body as the page. Name it, and say
      // whether credentials were supplied at all — never what they were.
      if (/Authentication required/i.test(visible)) {
        const supplied = Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD);
        throw new Error(
          "Blocked by the /admin/* HTTP Basic Auth gate — the Control Room never rendered. " +
          `ADMIN_USER/ADMIN_PASSWORD supplied to this run: ${supplied ? "yes" : "no"}. ` +
          (supplied
            ? "They do not match the values the deployment is configured with."
            : "Set them to the values the deployment is configured with."),
        );
      }
      throw new Error(
        "Control Room reached neither the operator login form nor the authenticated " +
        `shell within 20s. Visible page text: ${visible || "<empty>"}`,
      );
    }

    if (await password.isVisible().catch(() => false)) {
      await password.fill(OP_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      // Wait for the sign-in to RESOLVE either way — the authenticated heading,
      // or the login form's own error. Asserting only on the heading cannot tell
      // "credentials rejected" apart from "signed in, but this deployment
      // predates the heading", and those need opposite fixes.
      const loginError = page.locator(".radmin-err");
      const tabNav = page.locator("nav.radmin-tabs");
      await controlRoom.or(loginError).or(tabNav).first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => { /* fall through to the explicit report below */ });

      if (await loginError.isVisible().catch(() => false)) {
        throw new Error(
          "Operator sign-in was REJECTED by the deployment: " +
          `${(await loginError.innerText().catch(() => "")).trim() || "no message"}. ` +
          "RUNTIME_ADMIN_KEY reaches the admin API, so the deployment likely sets " +
          "RUNTIME_OPERATOR_PASSWORD to a different value than this run supplies.",
        );
      }
      if (!(await controlRoom.isVisible().catch(() => false))) {
        const shell = await tabNav.isVisible().catch(() => false);
        throw new Error(
          shell
            ? "Signed in — the authenticated Control Room shell rendered — but it has no " +
              "'Operator Control Room' heading. The deployment predates the <h1> fix; redeploy main."
            : "Sign-in neither succeeded nor reported an error within 20s. Visible page text: " +
              `${(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300) || "<empty>"}`,
        );
      }
    }

    // 3) Customers tab (exact — avoids matching an overview "View customers →" button).
    const customersTab = page.getByRole("button", { name: "Customers", exact: true });
    await expect(customersTab).toBeVisible({ timeout: 20_000 });
    await customersTab.click();

    // 4) The Dry Run Customer card → ensure expanded → its PRODUCTION environment.
    const card = page.locator(".radmin-card", { hasText: CUSTOMER }).first();
    await expect(card, `customer card "${CUSTOMER}" not found`).toBeVisible();
    const prodEnv = card.locator(".radmin-env", { hasText: "production" }).first();
    if (!(await prodEnv.isVisible().catch(() => false))) {
      await card.locator(".radmin-cust-head").click(); // expand
    }
    await expect(prodEnv, "production environment row not visible").toBeVisible();

    // 5) Click Audit pack for that environment.
    await prodEnv.getByRole("button", { name: "Audit pack" }).click();

    // 6) The audit-pack panel is now shown.
    //
    // This used to assert on a "Control Room diagnostics" banner. That banner was
    // TEMPORARY — added in 39ac9d9 for a deployed-site nav investigation and
    // deliberately deleted in f89886a ("Remove temporary Audit-pack diagnostics —
    // production-ready Control Room"). The assertion was left behind, so it has
    // been unsatisfiable ever since: it required debug scaffolding that a
    // production-ready Control Room is specifically not supposed to render.
    //
    // Assert the panel itself instead — a real, permanent element. This is not a
    // relaxation: the banner proved nothing about the audit pack, and the hard
    // gate below (audit.pdf row → href shape → application/pdf) is untouched.
    await expect(
      page.locator(".radmin-pack").first(),
      "audit-pack panel did not open for this environment",
    ).toBeVisible({ timeout: 20_000 });

    // 7) The audit.pdf deliverable's Preview link.
    const row = page.locator(".radmin-deliv-row", { hasText: "audit.pdf" }).first();
    await expect(row, "audit.pdf deliverable row not found — pack missing/empty").toBeVisible();
    const preview = row.getByRole("link", { name: "Preview" });
    const href = await preview.getAttribute("href");

    // 8) Destination must be the relative API route (no invented page/route).
    expect(href, "Preview href missing").toBeTruthy();
    expect(href!, "Preview points at the wrong URL").toMatch(
      /^\/api\/runtime\/admin\/deliverables\/file\?id=.+&mode=preview$/,
    );

    // 9) HARD GATE: that URL must serve a PDF, not the 404 / an HTML error page.
    const res = await page.request.get(href!, { headers: { range: "bytes=0-1" } });
    expect([200, 206], `Preview HTTP ${res.status()}`).toContain(res.status());
    expect(res.headers()["content-type"] || "", "Preview did not return a PDF").toContain("application/pdf");
  });

  test("Gmail Validate reaches Google and persists a terminal health result", async ({ request }) => {
    const orgId = process.env.E2E_ORG_ID || "";
    test.skip(!orgId, "set E2E_ORG_ID to validate Gmail");
    const headers = { "x-admin-key": ADMIN_KEY, "content-type": "application/json" };

    const beforeResponse = await request.get(
      `/api/runtime/admin/integration-gateway?org_id=${encodeURIComponent(orgId)}`,
      { headers },
    );
    expect(beforeResponse.status(), "Integration Gateway inventory request failed").toBe(200);
    const before = await beforeResponse.json();
    const connector = (before.connectors || []).find((item: any) => item.type === "gmail");
    test.skip(!connector, "no Gmail connector exists for the configured organisation");

    const validationResponse = await request.post("/api/runtime/admin/integration-gateway", {
      headers,
      data: { operation: "gmail.credentials.check", org_id: orgId, connector_id: connector.id },
    });
    const validation = await validationResponse.json();
    expect(validationResponse.status(), JSON.stringify(validation)).toBe(200);
    expect(typeof validation.ok).toBe("boolean");
    expect(validation.result?.connector_id).toBe(connector.id);

    const afterResponse = await request.get(
      `/api/runtime/admin/integration-gateway?org_id=${encodeURIComponent(orgId)}`,
      { headers },
    );
    expect(afterResponse.status()).toBe(200);
    const after = await afterResponse.json();
    const persisted = (after.connectors || []).find((item: any) => item.id === connector.id);
    expect(persisted, "validated Gmail connector disappeared from the organisation projection").toBeTruthy();
    expect(persisted.health, "Validate must never leave connector health unknown").not.toBe("unknown");
    if (validation.ok) expect(persisted.health).toBe("healthy");
    else expect(["down", "degraded"]).toContain(persisted.health);

    // Non-secret receipt for the workflow log. OAuth material is never returned
    // by either endpoint and therefore cannot enter this output.
    console.log(JSON.stringify({
      event: "gmail_validation_acceptance",
      http_status: validationResponse.status(),
      connector_id: connector.id,
      ok: validation.ok,
      code: validation.result?.code || null,
      google_api_response: validation.ok
        ? { mailbox: validation.result?.mailbox || null, latency_ms: validation.result?.latency_ms ?? null }
        : { error: validation.result?.error || null },
      persisted_health: persisted.health,
      persisted_last_error: persisted.last_error || null,
      persisted_last_checked_at: persisted.last_checked_at || null,
    }));
  });

  /**
   * Runtime Assurance Status — read-only, against the deployed build.
   *
   * Asserted at the API rather than through the UI on purpose: this is a
   * contract about what the deployment reports, and routing it through a tab
   * click would make a genuine contract failure indistinguishable from a
   * rendering hiccup.
   *
   * The states themselves are NOT asserted — they legitimately differ per
   * deployment (a preview has no Supabase, production does). What is asserted is
   * that every control reports one of the five defined states, that the endpoint
   * is read-only, and that nothing that could be a secret crosses the boundary.
   */
  test("Runtime assurance status is read-only, complete, and leaks no secret", async ({ request }) => {
    const headers = { "x-admin-key": ADMIN_KEY };

    const res = await request.get("/api/runtime/admin/assurance", { headers });
    // 503 is a legitimate answer (the panel refuses to imply health it cannot
    // establish); anything else means the route is missing or unauthorised.
    expect([200, 503], `assurance endpoint returned HTTP ${res.status()}`).toContain(res.status());
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.error, "a 503 must say what failed").toBeTruthy();
      return;
    }

    const body = await res.json();
    const STATES = ["active", "inactive", "verified", "degraded", "unknown"];
    const ids = (body.controls || []).map((c: any) => c.id);

    for (const id of ["require_record", "require_durable", "append_only", "evidence_hash", "report_verification"]) {
      expect(ids, `assurance is missing the ${id} control`).toContain(id);
    }
    for (const c of body.controls || []) {
      expect(STATES, `${c.id} reported an undefined state "${c.state}"`).toContain(c.state);
      expect(c.summary, `${c.id} reported no summary`).toBeTruthy();
    }

    // The panel must name the gateway-vs-report distinction, so an operator
    // cannot read the Integration Gateway event list as an integrity check.
    const notes = (body.notes || []).join(" ");
    expect(notes, "the gateway/report distinction is not stated").toMatch(/stored evidence hash only/i);
    expect(notes, "the panel does not say verification happens in reports").toMatch(/report/i);

    // Nothing resembling a credential may cross this boundary. The switches are
    // reported as derived states; their VALUES must never appear.
    const raw = JSON.stringify(body);
    expect(raw, "an environment variable value was echoed").not.toMatch(/"value"\s*:/);
    for (const secret of [ADMIN_KEY, OP_PASSWORD, process.env.SUPABASE_SERVICE_ROLE_KEY || ""]) {
      if (secret && secret.length > 8) {
        expect(raw.includes(secret), "a secret appeared in the assurance payload").toBe(false);
      }
    }

    // Read-only: the route must reject writes rather than quietly accept them.
    for (const method of ["post", "put", "delete"] as const) {
      const w = await request[method]("/api/runtime/admin/assurance", { headers, data: {} });
      expect(
        w.status(),
        `${method.toUpperCase()} to the assurance endpoint returned ${w.status()} — it must not be writable`,
      ).toBeGreaterThanOrEqual(400);
    }

    // Unauthenticated access must be refused.
    const anon = await request.get("/api/runtime/admin/assurance");
    expect(anon.status(), "the assurance endpoint is readable without operator auth").toBe(401);

    console.log(JSON.stringify({
      event: "assurance_status_acceptance",
      http_status: res.status(),
      store: body.store,
      counts: body.counts,
      controls: (body.controls || []).map((c: any) => ({ id: c.id, state: c.state })),
    }));
  });
});
