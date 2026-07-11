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
const OP_PASSWORD = process.env.RUNTIME_OPERATOR_PASSWORD || process.env.RUNTIME_ADMIN_KEY || "";
const CUSTOMER = process.env.E2E_CUSTOMER || "Dry Run Customer";

test.describe("Control Room — Audit pack → Preview (production)", () => {
  test.skip(!OP_PASSWORD, "set RUNTIME_ADMIN_KEY or RUNTIME_OPERATOR_PASSWORD to run");

  test("Preview of audit.pdf serves application/pdf, not the 404 page", async ({ page }) => {
    // 1) Open the Control Room (HTTP Basic Auth comes from httpCredentials).
    await page.goto("/admin/runtime", { waitUntil: "domcontentloaded" });

    // 2) Wait for the client to resolve the session (login form OR the tab nav),
    //    then operator sign-in via the real login form if it's shown.
    await page
      .locator('input[placeholder="Operator password"], nav.radmin-tabs')
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    const pw = page.getByPlaceholder("Operator password");
    if (await pw.isVisible().catch(() => false)) {
      await pw.fill(OP_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
    }

    // 3) Customers tab (exact — avoids matching an overview "View customers →" button).
    await page.getByRole("button", { name: "Customers", exact: true }).click();

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

    // 6) The audit-pack UI is now shown (diagnostics banner confirms the panel + build).
    await expect(page.getByText(/Control Room diagnostics/)).toBeVisible();

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
});
