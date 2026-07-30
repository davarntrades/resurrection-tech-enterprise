import { test, expect, type Page } from "@playwright/test";

/**
 * ACCEPTANCE: the Stage 8 "Get my recommended pathway" button.
 *
 * Covers the production blocker where a fully completed assessment failed
 * silently with nothing but "Please complete the required fields.":
 *   - a valid, fully completed assessment submits and reaches the success state
 *   - a genuinely missing answer is named ("Organisation — Company name") and
 *     links back to the stage that owns it
 *   - a failed submission keeps every answer
 *   - double-clicking the button sends exactly one submission
 * Runs at both desktop and mobile viewport sizes.
 *
 *   E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test assessment-submit
 *
 * Most tests stub /api/assessment and are safe anywhere. The few that exercise
 * the real endpoint would create a genuine lead and send genuine emails, so
 * they only run against a local or preview target — never the live site unless
 * E2E_ALLOW_LIVE_SUBMIT=1 is set deliberately.
 */

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const LIVE_SUBMIT_OK =
  process.env.E2E_ALLOW_LIVE_SUBMIT === "1" ||
  /^https?:\/\/(127\.0\.0\.1|localhost|[^/]*\.vercel\.app)([:/]|$)/.test(BASE);
const LIVE_SUBMIT_SKIP =
  "sends a real assessment — set E2E_ALLOW_LIVE_SUBMIT=1 to run against this target";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const TEXT: Record<string, string> = {
  "Full name": "Davarn Morrison",
  "Job title": "Chief Executive Officer",
  "Company name": "Resurrection Tech",
  "Email address": "assessment-e2e@resurrection-tech.example",
  "Phone number": "+44 7700 900000",
  "Exact agent count": "14",
  "Business units involved": "3",
};

/** Fill every question on the current stage. */
async function fillStage(page: Page) {
  const fields = page.locator(".rgq-fields .rgq-field");
  for (let i = 0; i < (await fields.count()); i++) {
    const field = fields.nth(i);
    const label = (await field.locator("> .rgq-label").first().textContent()) ?? "";
    const select = field.locator("select");
    if (await select.count()) {
      const values = await select.first().locator("option")
        .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      // Avoid the partner-only branch so the "hidden fields don't block" path
      // is exercised: never pick the partner intents.
      const pick = values.find((v) => v === "production_deploy") ?? values[Math.min(2, values.length - 1)];
      if (pick) await select.first().selectOption(pick);
      continue;
    }
    if (await field.locator("textarea").count()) {
      await field.locator("textarea").first().fill("Human approval on payments; allow-listed tools.");
      continue;
    }
    const input = field.locator("input");
    if (await input.count()) {
      const key = Object.keys(TEXT).find((k) => label.startsWith(k));
      await input.first().fill(key ? TEXT[key] : "Sample");
    }
  }
  const segments = page.locator(".rgq-seg");
  for (let i = 0; i < (await segments.count()); i++) await segments.nth(i).locator("button").first().click();
  const chipGroups = page.locator(".rgq-chips");
  for (let i = 0; i < (await chipGroups.count()); i++) {
    const chips = chipGroups.nth(i).locator("button");
    for (let j = 0; j < Math.min(2, await chips.count()); j++) await chips.nth(j).click();
  }
}

/**
 * Wait for React to hydrate. Until the handlers are attached, typed values sit
 * in the DOM without reaching form state, so a test would fill a stage that the
 * questionnaire still considers blank.
 */
async function waitForHydration(page: Page) {
  const chip = page.locator(".rgq-chips button").first();
  await chip.waitFor();
  await expect(async () => {
    await chip.click();
    await expect(chip).toHaveClass(/is-on/, { timeout: 500 });
  }).toPass({ timeout: 20_000 });
  await chip.click(); // leave the form as we found it
  await expect(chip).not.toHaveClass(/is-on/);
}

/** Complete stages 1–7 and land on the Stage 8 review. */
async function completeToReview(page: Page) {
  await page.goto("/assessment", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  for (let stage = 1; stage <= 7; stage++) {
    await fillStage(page);
    await page.getByRole("button", { name: /Continue/ }).click();
  }
  await expect(page.locator(".rgq-review")).toBeVisible();
}

const submitButton = (page: Page) => page.getByTestId("assessment-submit");
const summary = (page: Page) => page.getByTestId("assessment-error-summary");

for (const viewport of VIEWPORTS) {
  test.describe(`Assessment submission — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("a fully completed assessment submits and shows the recommended pathway", async ({ page }) => {
      test.skip(!LIVE_SUBMIT_OK, LIVE_SUBMIT_SKIP);
      await completeToReview(page);

      const button = submitButton(page);
      await expect(button).toBeVisible();
      await expect(button).toHaveText(/Get my recommended pathway/);
      await expect(button).toBeEnabled();

      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/assessment") && r.request().method() === "POST"),
        button.click(),
      ]);
      expect(response.status()).toBe(200);
      expect((await response.json()).ok).toBe(true);

      // Explicit success state, with the generated pathway and a reference.
      await expect(page.locator(".rgq-result")).toBeVisible();
      await expect(page.locator(".rgq-result-title")).not.toBeEmpty();
      await expect(page.locator(".rgq-why li").first()).toBeVisible();
      await expect(page.locator(".rgq-result-meta").last()).toContainText(/ASMT-/);
      // No submit button remains, so the submission cannot be repeated.
      await expect(submitButton(page)).toHaveCount(0);
      // Saved progress is cleared only on success.
      expect(await page.evaluate(() => localStorage.getItem("rt-assessment-v2"))).toBeNull();
    });

    test("hidden conditional questions do not block submission", async ({ page }) => {
      test.skip(!LIVE_SUBMIT_OK, LIVE_SUBMIT_SKIP);
      await completeToReview(page);
      // The commercial stage was answered with a non-partner intent, so the
      // partner-only questions were never shown — and must not be required.
      await page.locator('.rgq-rev-group[data-section="commercial"]').click();
      await expect(page.locator(".rgq-partner")).toHaveCount(0);
      await page.getByRole("button", { name: /Continue/ }).click();

      await submitButton(page).click();
      await expect(page.locator(".rgq-result")).toBeVisible();
      await expect(summary(page)).toHaveCount(0);
    });

    test("a missing required answer is named, linked to its stage, and keeps the button working", async ({ page }) => {
      await completeToReview(page);

      // Clear a required Stage 1 answer via the review's own edit affordance.
      await page.locator('.rgq-rev-group[data-section="organisation"]').click();
      await page.locator(".rgq-fields .rgq-field").nth(2).locator("input").fill("");
      for (let i = 0; i < 7; i++) {
        const cont = page.getByRole("button", { name: /Continue/ });
        if (await cont.count()) await cont.click(); else break;
      }
      // The Stage 1 gate stops us there and names the field.
      await expect(summary(page)).toBeVisible();
      await expect(summary(page)).toContainText("Organisation — Company name");
      await expect(summary(page)).not.toContainText("companyName");

      // Fixing it clears the message and lets the flow continue.
      await page.locator(".rgq-fields .rgq-field").nth(2).locator("input").fill("Resurrection Tech");
      await expect(summary(page)).toHaveCount(0);
    });

    test("the error summary links back to the offending stage and highlights its review section", async ({ page }) => {
      await completeToReview(page);

      // Force a server-side rejection that belongs to a later stage.
      await page.route("**/api/assessment", (route) =>
        route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "Please complete the required fields.",
            fieldErrors: { unsafePrevention: "String must contain at most 4000 character(s)" },
          }),
        }));

      await submitButton(page).click();

      const panel = summary(page);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Governance — How unsafe actions are prevented");
      await expect(panel).not.toContainText("unsafePrevention");
      // The button is not left looking broken: no generic-only message, and the
      // participant stays on the review stage with their answers intact.
      await expect(page.locator(".rgq-review")).toBeVisible();
      await expect(page.locator('.rgq-rev-group[data-section="governance"]')).toHaveClass(/is-invalid/);

      // Clicking the named field takes the participant straight to that stage.
      await panel.getByRole("button", { name: /Governance — How unsafe actions are prevented/ }).click();
      await expect(page.locator(".rgq-card-head h2")).toHaveText("Governance");
    });

    test("a failed submission preserves every answer", async ({ page }) => {
      await completeToReview(page);
      const before = await page.evaluate(() => localStorage.getItem("rt-assessment-v2"));

      await page.route("**/api/assessment", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Email delivery failed." }) }));
      await submitButton(page).click();
      await expect(page.locator(".rgq-error")).toBeVisible();

      // Answers still on screen, still saved, and the button is usable again.
      await expect(page.locator(".rgq-review")).toContainText("Resurrection Tech");
      const after = await page.evaluate(() => localStorage.getItem("rt-assessment-v2"));
      expect(after).not.toBeNull();
      expect(JSON.parse(after!).data.companyName).toBe("Resurrection Tech");
      expect(JSON.parse(after!).data.toolAccess.length).toBeGreaterThan(0);
      await expect(submitButton(page)).toBeEnabled();

      // Answers also survive a reload.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".rgq-review")).toContainText("Resurrection Tech");
      expect(before).not.toBeNull();
    });

    test("double-clicking creates exactly one submission", async ({ page }) => {
      await completeToReview(page);

      let posts = 0;
      await page.route("**/api/assessment", async (route) => {
        posts++;
        await new Promise((r) => setTimeout(r, 700)); // hold the request open
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            reference: "ASMT-E2E01-2026",
            recommendation: { id: "pilot", title: "Limited Pilot", tagline: "t", ctaLabel: "c", ctaHref: "/pilot", why: ["w"] },
            delivery: { emailed: true, stored: true },
          }),
        });
      });

      const button = submitButton(page);
      await button.click({ noWaitAfter: true });
      await button.click({ force: true, noWaitAfter: true }).catch(() => { /* already disabled */ });
      await button.click({ force: true, noWaitAfter: true }).catch(() => { /* already disabled */ });

      // Visible loading state while in flight.
      await expect(page.locator(".rgq-result")).toBeVisible({ timeout: 15_000 });
      expect(posts).toBe(1);
    });

    test("the button shows a loading state and is disabled while submitting", async ({ page }) => {
      await completeToReview(page);
      await page.route("**/api/assessment", async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true, reference: "ASMT-E2E02-2026",
            recommendation: { id: "pilot", title: "Limited Pilot", tagline: "t", ctaLabel: "c", ctaHref: "/pilot", why: ["w"] },
            delivery: { emailed: true, stored: true },
          }),
        });
      });

      const button = submitButton(page);
      await button.click({ noWaitAfter: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute("aria-busy", "true");
      await expect(button).toContainText("Generating recommendation");
      await expect(page.locator(".rgq-result")).toBeVisible({ timeout: 15_000 });
    });

    test("answers persisted before a refresh still validate and submit afterwards", async ({ page }) => {
      test.skip(!LIVE_SUBMIT_OK, LIVE_SUBMIT_SKIP);
      await completeToReview(page);
      await page.reload({ waitUntil: "domcontentloaded" });

      // Restored straight back onto the review stage with the answers intact.
      await expect(page.locator(".rgq-review")).toBeVisible();
      await expect(page.locator(".rgq-review")).toContainText("Resurrection Tech");

      await submitButton(page).click();
      await expect(page.locator(".rgq-result")).toBeVisible();
      await expect(summary(page)).toHaveCount(0);
    });
  });
}
