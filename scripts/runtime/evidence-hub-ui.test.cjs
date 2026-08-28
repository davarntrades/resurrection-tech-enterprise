#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const page = fs.readFileSync(path.join(root, "app/evidence/hub/[token]/page.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/evidence/hub/[token]/page.module.css"), "utf8");

// The redesign must preserve the durable Hub contract and customer actions.
assert.match(page, /rt\.hub\.resolveHub\(token\)/, "page still resolves the existing durable hub token");
assert.match(page, /mode=preview/, "published evidence can still be opened");
assert.match(page, /mode=download/, "published evidence can still be downloaded");
assert.match(page, /res\.status === 410/, "revoked links retain their explicit state");

// A customer should understand the evidence posture before opening a document.
for (const label of ["Published audits", "Documents", "Open actions", "Last published"]) {
  assert.match(page, new RegExp(label), `summary exposes ${label}`);
}
assert.match(page, /Evidence library/, "evidence has a clear primary section");
assert.match(page, /Action register/, "recommendations are presented as tracked actions");
assert.match(page, /Recent activity/, "publication history remains available");
assert.doesNotMatch(page, /Evidence verified/, "UI does not invent an unsupported verification claim");

// Responsive and accessible behavior is part of the contract, not decoration.
assert.match(css, /@media \(max-width: 620px\)/, "mobile reflow is defined");
assert.match(css, /:focus-visible/, "keyboard focus is visibly styled");
assert.match(css, /prefers-reduced-motion/, "reduced-motion preference is respected");
assert.match(page, /aria-label="Evidence summary"/, "summary has an accessible name");
assert.match(page, /aria-label="Evidence Hub sections"/, "section navigation has an accessible name");

console.log("Evidence Hub UI: all checks passed");
