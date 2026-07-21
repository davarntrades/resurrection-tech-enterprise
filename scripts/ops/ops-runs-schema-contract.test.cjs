"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const agentsSource = fs.readFileSync(path.join(ROOT, "lib/ops/agents.js"), "utf8");
const migrationSource = fs.readFileSync(path.join(ROOT, "supabase/operations_agent.sql"), "utf8");

function balancedObjectAfter(source, marker) {
  const markerAt = source.indexOf(marker);
  assert.notEqual(markerAt, -1, `missing source marker: ${marker}`);
  const start = source.indexOf("{", markerAt + marker.length);
  assert.notEqual(start, -1, `missing object after: ${marker}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  throw new Error(`unterminated object after: ${marker}`);
}

function topLevelObjectKeys(body) {
  const keys = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  let tokenStart = 0;

  const inspectSegment = (end) => {
    const segment = body.slice(tokenStart, end).trim();
    if (!segment) return;
    const match = segment.match(/^([A-Za-z_$][\w$]*)\s*(?::|,|$)/s);
    if (match) keys.push(match[1]);
  };

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      inspectSegment(i);
      tokenStart = i + 1;
    }
  }
  inspectSegment(body.length);
  return keys;
}

function sqlColumnsFor(table) {
  const columns = new Set();
  const create = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i").exec(migrationSource);
  assert.ok(create, `missing CREATE TABLE for public.${table}`);

  for (const rawLine of create[1].split("\n")) {
    const line = rawLine.replace(/--.*$/, "").trim();
    if (!line || /^(primary|unique|constraint|foreign|check)\b/i.test(line)) continue;
    const match = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
    if (match) columns.add(match[1]);
  }

  const alter = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+([a-z_][a-z0-9_]*)`, "gi");
  for (const match of migrationSource.matchAll(alter)) columns.add(match[1]);
  return columns;
}

const councilBody = balancedObjectAfter(agentsSource, 'store.insert("ops_runs",');
const councilKeys = new Set(topLevelObjectKeys(councilBody));

// lib/runtime/store.js injects these before sending the PostgREST insert.
councilKeys.add("id");
councilKeys.add("created_at");

const migrationColumns = sqlColumnsFor("rg_ops_runs");
const missing = [...councilKeys].filter((key) => !migrationColumns.has(key)).sort();

assert.deepEqual(
  missing,
  [],
  `rg_ops_runs migration is missing council insert fields: ${missing.join(", ")}`,
);

for (const required of ["mode", "coordination", "handoffs", "per_agent"]) {
  assert.ok(councilKeys.has(required), `council insert no longer writes required field: ${required}`);
  assert.ok(migrationColumns.has(required), `migration no longer defines required field: ${required}`);
}

console.log(`✓ rg_ops_runs contract: ${councilKeys.size} council insert keys are migration-defined`);
