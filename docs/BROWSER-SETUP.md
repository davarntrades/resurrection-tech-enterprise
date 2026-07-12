# Browser setup — Chromium for report / PDF generation

Report and audit-pack PDF generation renders HTML to PDF with a headless
**Chromium**. That browser is **Playwright's managed Chromium** — the one
`@playwright/test` (already declared in `package.json`) knows how to download.
There is **no dependency on apt, snap, or any Codespace-specific browser path**.

## One-time install

```bash
npm run browser:install       # → playwright install chromium
```

That downloads Chromium into Playwright's browser cache
(`PLAYWRIGHT_BROWSERS_PATH`, or the default `~/.cache/ms-playwright`). Run it
once per machine / container.

Prefer the wrapper when you also want the headless system libraries and a render
self-test in one step:

```bash
npm run audit:chrome:install  # playwright install (--with-deps when sudo) + smoke test
```

## Verify it works

```bash
npm run browser:smoke
```

This resolves the browser exactly the way generation does and renders a real PDF
headlessly, then exits `0`. Expected output:

```
✓ chromium smoke test PASSED
  binary:  /…/ms-playwright/chromium-<rev>/chrome-linux64/chrome
  version: Chromium <version>
  render:  headless PDF <n> bytes (valid %PDF header)
```

## How the browser is resolved

`scripts/lib/resolve-chromium.cjs` is the single source of truth. Resolution
order:

1. **`CHROME_BIN`** — explicit override, if set and the file exists (e.g. a
   deploy image that ships its own Chrome).
2. **Playwright's managed Chromium** — `chromium.executablePath()`. This honours
   `PLAYWRIGHT_BROWSERS_PATH` and always returns the revision Playwright actually
   installed, so a Playwright upgrade never leaves a stale hard-coded path.
3. **Playwright browser-cache scan** — if the exact expected revision isn't on
   disk (e.g. a pre-provisioned image whose Chromium revision differs from this
   Playwright build's default), scan `PLAYWRIGHT_BROWSERS_PATH` /
   `~/.cache/ms-playwright` for any installed `chromium-*` build. Still
   Playwright-managed — never `apt`, `snap`, or a hard-coded path.

`scripts/gen-pdfs.cjs` and `scripts/delivery-kit.cjs` both call this helper — no
hard-coded paths, no `apt`/`snap`, no PATH scanning.

## Environment matrix

| Environment | Setup |
|---|---|
| **GitHub Codespaces** | Chromium is pre-provisioned under `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. If missing, `npm run browser:install`. |
| **Local development** | `npm run browser:install` once. |
| **CI** | `npx playwright install --with-deps chromium` before the report/PDF step (`--with-deps` pulls the headless system libraries). Or run the job on the official `mcr.microsoft.com/playwright` image, which ships them. |
| **Deployment** | The web app does not render PDFs at request time, so no browser is needed on the serverless runtime. Where PDFs are generated out-of-band, install Playwright's Chromium (as CI) or point `CHROME_BIN` at a bundled Chrome. |

### CI snippet

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run browser:smoke     # optional gate: prove the browser launches
```

## Troubleshooting

- **`No Playwright-managed Chromium found`** — run `npm run browser:install`.
- **Launches locally, fails headless in CI** — missing system libraries; use
  `--with-deps` or the official Playwright image.
- **Need a specific Chrome** — set `CHROME_BIN=/path/to/chrome`; it takes
  priority over the managed browser.
