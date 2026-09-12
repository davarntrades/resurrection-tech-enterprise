#!/usr/bin/env node
/* Phase-1 test suite.
 *
 * Each file runs in its own process: they bind sockets, set RUNTIME_DATA_DIR and
 * RTX_ENV_* differently, and load the platform's singleton runtime module, so
 * sharing a process would let one suite's fixtures leak into another's.
 *
 * The last entry is the PLATFORM's own governed-execution contract test, run
 * unmodified. It is included here as a regression gate: this experiment adds
 * files but must not change how the execution boundary behaves, and the fastest
 * way to notice a breach of that is to keep the platform's own assertions in the
 * same command.
 */
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..", "..");

const SUITES = [
  { name: "synthetic environment", file: path.join(__dirname, "env-service.test.cjs") },
  { name: "agent isolation", file: path.join(__dirname, "isolation.test.cjs") },
  { name: "orchestrator", file: path.join(__dirname, "orchestrator.test.cjs") },
  { name: "analyser", file: path.join(__dirname, "analyser.test.cjs") },
  {
    name: "platform governed-execution contract (unmodified)",
    file: path.join(REPO, "scripts", "runtime", "universal-governed-execution.test.cjs"),
    platform: true,
  },
];

let failed = 0;
for (const suite of SUITES) {
  const result = spawnSync(process.execPath, [suite.file], { stdio: "inherit", cwd: REPO });
  if (result.status !== 0) {
    failed++;
    console.error(`✗ ${suite.name} FAILED (exit ${result.status})`);
  }
}

if (failed) {
  console.error(`\n${failed} of ${SUITES.length} suite(s) failed.`);
  process.exit(1);
}
console.log(`\n✓ all ${SUITES.length} phase-1 suites passed`);
