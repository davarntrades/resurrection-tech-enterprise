import { test, expect } from "@playwright/test";

/**
 * Acceptance: Customers → Dry Run Customer → Audit pack → Preview audit.pdf
 * must reach the audit-pack UI and the Preview must serve application/pdf
 * (200/206) — NOT the branded 404 page. Runs on WebKit (Safari engine).
 *
 * Requires (env): RUNTIME_OPERATOR_PASSWORD or RUNTIME_ADMIN_KEY (operator login),
 * and ADMIN_USER/ADMIN_PASSWORD (Basic Auth for /admin/*, via playwright.config).
 */
const OP_PASSWORD = process.env.RUNTIME_OPERATOR_PASSWORD || process.env.RUNTIME_ADMIN_KEY || "";
const CUSTOMER = process.env.E2E_CUSTOMER || "Dry Run Customer";

test.describe("Control Room — Audit pack → Preview", () => {
  test.skip(!OP_PASSWORD, "set RUNTIME_OPERATOR_PASSWORD or RUNTIME_ADMIN_KEY to run");

  test("Audit pack opens the pack UI; Preview serves application/pdf, not 404", async ({ page, request }) => {
    // 1) Mint the operator session cookie. The /api/* login is not behind Basic Auth.
    const login = await request.post("/api/runtime/admin/login", { data: { password: OP_PASSWORD } });
    expect(login.ok(), `operator login failed: HTTP ${login.status()}`).toBeTruthy();

    // 2) Open the Control Room (Basic Auth supplied via httpCredentials in config).
    await page.goto("/admin/runtime", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Customers" }).click();

    // 3) Expand the customer and open its Audit pack panel.
    await page.getByText(CUSTOMER, { exact: false }).first().click();
    await page.getByRole("button", { name: "Audit pack" }).first().click();

    // 4) Assert the next view IS the audit-pack UI (diagnostics banner + a Preview link).
    await expect(page.getByText(/Control Room diagnostics/)).toBeVisible();
    const preview = page.getByRole("link", { name: "Preview" }).first();
    await expect(preview).toBeVisible();

    // 5) The Preview destination is the relative same-origin API URL — not an
    //    invented route, undefined pathname, or missing dynamic segment.
    const href = await preview.getAttribute("href");
    expect(href, "Preview href is missing").toBeTruthy();
    expect(href!).toMatch(/^\/api\/runtime\/admin\/deliverables\/file\?id=.+&mode=preview$/);

    // 6) Fetching that URL (with the operator cookie) returns a PDF, not the 404 page.
    const res = await page.request.get(href!);
    expect([200, 206]).toContain(res.status());
    expect(res.headers()["content-type"] || "").toContain("application/pdf");
  });
});
