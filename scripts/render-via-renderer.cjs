"use strict";
/* Verify the deployed Railway renderer with the exact generated HTML on disk.
 * Usage: npm run audit:verify-renderer -- path/to/full-audit.html [output.pdf]
 * This is deliberately outside customer-facing generation/publishing logic. */
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`renderer verification failed: ${message}`);
  process.exitCode = 1;
}

function verifyEmbeddedFonts(html) {
  for (const family of ["TeX Gyre Pagella", "TeX Gyre Heros"]) {
    if (!html.includes(`font-family:"${family}"`) && !html.includes(`font-family: "${family}"`)) {
      throw new Error(`${family} is not declared in the generated HTML`);
    }
  }
  const faces = html.match(/@font-face\s*\{[^}]+\}/g) || [];
  if (faces.length < 4 || faces.some((face) => !/src:\s*url\(data:font\//i.test(face))) {
    throw new Error("expected four self-contained data: font faces");
  }
  if (/@import\s+url\(/i.test(html) || /src:\s*url\(https?:/i.test(html)) {
    throw new Error("external font request found in generated HTML");
  }
}

async function main() {
  const htmlPath = process.argv[2];
  const outputPath = process.argv[3] || (htmlPath ? htmlPath.replace(/\.html?$/i, "") + ".renderer.pdf" : "");
  if (!htmlPath) throw new Error("HTML path required: npm run audit:verify-renderer -- full-audit.html [output.pdf]");
  if (!fs.existsSync(htmlPath)) throw new Error(`HTML file not found: ${htmlPath}`);
  const rendererUrl = String(process.env.RENDERER_URL || "").replace(/\/+$/, "");
  const rendererSecret = process.env.RENDERER_SECRET || "";
  if (!rendererUrl || !rendererSecret) throw new Error("RENDERER_URL and RENDERER_SECRET are required");

  const html = fs.readFileSync(htmlPath, "utf8");
  verifyEmbeddedFonts(html);
  const name = path.basename(outputPath || "verified.pdf");
  let response;
  try {
    response = await fetch(`${rendererUrl}/render`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-render-secret": rendererSecret },
      body: JSON.stringify({ documents: [{ name, html }] }),
      signal: AbortSignal.timeout(Number(process.env.RENDERER_TIMEOUT_MS || 45000)),
    });
  } catch (error) {
    throw new Error(`renderer request failed: ${error.message || error}`);
  }
  const raw = await response.text();
  let payload = null;
  try { payload = JSON.parse(raw); } catch { /* reported below */ }
  if (!response.ok) {
    const detail = payload && payload.error ? payload.error : raw.slice(0, 300) || "empty response";
    if (response.status === 401 || response.status === 403) throw new Error(`renderer authentication rejected (HTTP ${response.status}): ${detail}`);
    throw new Error(`renderer HTTP ${response.status}: ${detail}`);
  }
  const encoded = payload && payload.ok && payload.files && payload.files[0] && payload.files[0].pdf_base64;
  if (!encoded) throw new Error("renderer returned no PDF bytes");
  const pdf = Buffer.from(String(encoded), "base64");
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("renderer output does not have a %PDF- header");
  if (pdf.length < 1000) throw new Error(`renderer output is unexpectedly small (${pdf.length} bytes)`);
  fs.writeFileSync(outputPath, pdf);
  console.log(`renderer verification passed: ${outputPath} (${pdf.length} bytes)`);
}

main().catch((error) => fail(error.message || String(error)));

