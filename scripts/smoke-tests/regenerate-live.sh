#!/usr/bin/env bash
# ============================================================================
# Runtime Governance — regenerate branded executive deliverables from the LIVE
# deployed engine, then publish them through the durable Audit Pack workflow.
#
# This is an orchestrator around existing tooling — it does NOT reimplement the
# engine, the delivery kit, the regression suite, or the publish path. It wires
# them together in a fail-closed order so a customer-facing pack can only be
# produced (and published) from fresh, provenance-checked live evidence.
#
# Order of operations (each step fails closed):
#   1. Load .env.delivery + .env.production (secrets never printed).
#   2. Require GOVERNANCE_URL, GOVERNANCE_TOKEN, Supabase creds, --org, --env,
#      the customer pack, and a usable Chromium — else abort.
#   3. Verify connectivity + token validity against the deployed engine.
#   4. Record the deployed engine commit + service version from /health.
#   5. Run the full LIVE enterprise regression (replay + baseline gate).
#   6. Refuse to continue if the regression skipped live, saw a false
#      positive/negative, or failed.
#   7. Generate the branded Chromium deliverable set for the pack.
#   8. Verify every expected file exists, is non-empty, and both PDFs are valid.
#   9. Verify run-summary.json carries live-engine provenance and that its
#      engine commit matches the deployed /health commit.
#  10. Publish the pack to the org/env via the durable Supabase Audit Pack path.
#  11. Print a concise final summary.
#
# The generated customer deliverables live under deliverables/ (gitignored) and
# are never committed. See scripts/smoke-tests/REGENERATE-LIVE.md for usage.
# ============================================================================
set -Eeuo pipefail

# --- resolve repo layout (script lives in <repo>/scripts/smoke-tests) --------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd -P)"
DELIVERY_KIT="$REPO_ROOT/scripts/delivery-kit.cjs"
REGRESSION="$REPO_ROOT/scripts/smoke-tests/enterprise-regression.cjs"
VALIDATOR="$REPO_ROOT/scripts/smoke-tests/_validate.py"
PUBLISH="$REPO_ROOT/scripts/runtime/publish-audit.cjs"
VALIDATION_REPORT="$REPO_ROOT/scripts/smoke-tests/VALIDATION-REPORT.md"

# --- defaults ----------------------------------------------------------------
PACK=""; ORG=""; ENVID=""; NAME="48-Hour Runtime Governance Audit"; REFERENCE=""
STYLE="editorial"            # premium branded house style (default). Alt: dark.
DRY_RUN=0
TMP_DIR=""; REPORT_BACKUP=""; REPORT_OK=0; RUN_OK=0

# --- output helpers (stderr for logs; stdout reserved for the final summary) --
_c() { if [ -t 2 ]; then printf '\033[%sm' "$1" >&2; fi; }
log()  { _c "0;36"; printf '• %s\n' "$*" >&2; _c 0; }
ok()   { _c "0;32"; printf '✓ %s\n' "$*" >&2; _c 0; }
warn() { _c "0;33"; printf '⚠ %s\n' "$*" >&2; _c 0; }
die()  { _c "0;31"; printf '✗ %s\n' "$*" >&2; _c 0; exit 1; }

usage() {
  cat >&2 <<'EOF'
Regenerate branded executive deliverables from the LIVE deployed engine and
publish them through the durable Audit Pack workflow.

USAGE:
  scripts/smoke-tests/regenerate-live.sh --pack <file.json> --org <id> --env <id> [options]

REQUIRED:
  --pack, --customer <file>   Customer smoke-test pack (e.g.
                              scripts/smoke-tests/01-finance-meridian-sterling.json)
  --org  <org_id>             Target organisation id (see: publish-audit.cjs --list-envs)
  --env  <environment_id>     Target environment id

OPTIONS:
  --name  <string>            Audit pack name (default: "48-Hour Runtime Governance Audit")
  --reference <string>        Optional pack reference (e.g. RT-MSB-2026-07)
  --style <editorial|dark>    PDF style. Default: editorial (premium branded house style).
  --dry-run                   Validate config, paths, secrets presence and Chromium,
                              print the execution plan, then stop. No engine calls,
                              no generation, no publish, no file writes.
  --help                      Show this help and exit.

ENVIRONMENT (loaded from .env.delivery + .env.production; never printed):
  GOVERNANCE_URL, GOVERNANCE_TOKEN         deployed engine + bearer token
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   durable Audit Pack store

Secrets are never echoed. Generated customer deliverables (deliverables/) are
gitignored and never committed. The committed validation report is only updated
if the live regression completes successfully.
EOF
}

# --- cleanup / error trap ----------------------------------------------------
cleanup() {
  local rc=$?
  # Restore the committed validation report unless the live regression finished
  # successfully (requirement: never overwrite it on a skipped/failed run).
  if [ "$REPORT_OK" -ne 1 ] && [ -n "$REPORT_BACKUP" ] && [ -f "$REPORT_BACKUP" ]; then
    cp -f "$REPORT_BACKUP" "$VALIDATION_REPORT" 2>/dev/null || true
    warn "restored committed validation report (live regression did not complete successfully)"
  fi
  [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null || true
  if [ "$rc" -ne 0 ] && [ "$RUN_OK" -ne 1 ]; then
    _c "0;31"; printf '✗ aborted (exit %s)\n' "$rc" >&2; _c 0
  fi
}
trap cleanup EXIT
trap 'die "interrupted"' INT TERM

# --- arg parsing -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --pack|--customer) PACK="${2:-}"; shift 2 || die "missing value for $1" ;;
    --org)             ORG="${2:-}"; shift 2 || die "missing value for --org" ;;
    --env)             ENVID="${2:-}"; shift 2 || die "missing value for --env" ;;
    --name)            NAME="${2:-}"; shift 2 || die "missing value for --name" ;;
    --reference)       REFERENCE="${2:-}"; shift 2 || die "missing value for --reference" ;;
    --style)           STYLE="${2:-}"; shift 2 || die "missing value for --style" ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --help|-h)         usage; exit 0 ;;
    *)                 usage; die "unknown argument: $1" ;;
  esac
done

# --- argument validation (before any side effects) ---------------------------
[ -n "$PACK" ]  || { usage; die "--pack <file.json> is required"; }
[ -n "$ORG" ]   || { usage; die "--org <org_id> is required"; }
[ -n "$ENVID" ] || { usage; die "--env <environment_id> is required"; }
case "$STYLE" in
  editorial|dark) : ;;
  *) die "invalid --style '$STYLE' (allowed: editorial, dark)" ;;
esac

# Resolve + validate paths.
[ -f "$PACK" ]         || die "customer pack not found: $PACK"
case "$PACK" in *.json) : ;; *) die "customer pack must be a .json file: $PACK" ;; esac
[ -f "$DELIVERY_KIT" ] || die "delivery kit missing: $DELIVERY_KIT"
[ -f "$REGRESSION" ]   || die "regression suite missing: $REGRESSION"
[ -f "$VALIDATOR" ]    || die "validator missing: $VALIDATOR"
[ -f "$PUBLISH" ]      || die "publish script missing: $PUBLISH"
command -v node >/dev/null 2>&1 || die "node is required on PATH"
command -v curl >/dev/null 2>&1 || die "curl is required on PATH"

# --- small helpers -----------------------------------------------------------
# Read a dotted path out of a JSON file without exposing anything else.
json_get() {
  node -e '
    const fs=require("fs");
    let d; try { d=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch { process.exit(3); }
    let v=d; for (const k of process.argv[2].split(".")) { v = (v==null?v:v[k]); }
    process.stdout.write(v==null?"":String(v));
  ' "$1" "$2"
}
# Deterministic slug — must match delivery-kit.cjs slug() exactly.
slugify() {
  node -e 'process.stdout.write(String(process.argv[1]||"customer").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"customer")' "$1"
}

# --- 1. load env (secrets NEVER printed; xtrace never enabled) ---------------
load_env_file() {
  local f="$1"
  if [ -f "$f" ]; then
    # shellcheck disable=SC1090
    set -a; . "$f"; set +a
    log "loaded env: $(basename "$f")"
  else
    warn "env file not present (skipped): $(basename "$f")"
  fi
}
log "repo: $REPO_ROOT"
load_env_file "$REPO_ROOT/.env.delivery"
load_env_file "$REPO_ROOT/.env.production"

# --- 2. require secrets + ids + Chromium -------------------------------------
require_var() {  # require_var NAME  — fails if unset/empty, never prints value
  local name="$1"; local val="${!name:-}"
  [ -n "$val" ] || die "required environment variable $name is missing (set it in .env.delivery / .env.production or the shell)"
}
require_var GOVERNANCE_URL
require_var GOVERNANCE_TOKEN
require_var NEXT_PUBLIC_SUPABASE_URL
require_var SUPABASE_SERVICE_ROLE_KEY
GOV_URL="${GOVERNANCE_URL%/}"
ok "engine URL configured: $GOV_URL"
ok "governance token present (value hidden)"
ok "Supabase durable store configured (service-role key hidden)"

# Chromium must be usable — no HTML-only fallback is ever acceptable.
if node "$DELIVERY_KIT" --check-chrome >/dev/null 2>&1; then
  ok "Chromium usable for PDF rendering"
else
  die "Chromium not usable — install it (npm run audit:chrome:install) or set CHROME_BIN. No HTML-only fallback."
fi

# Resolve the pack's identity + deterministic output directory now (path check).
CUST_NAME="$(json_get "$PACK" customer.name)";   [ -n "$CUST_NAME" ] || die "pack missing customer.name: $PACK"
CUST_PERIOD="$(json_get "$PACK" customer.period)"
CUST_REF="$(json_get "$PACK" customer.reference)"
SLUG_A="$(slugify "$CUST_NAME")"
SLUG_B="$(slugify "${CUST_PERIOD:-${CUST_REF:-report}}")"
OUT_DIR="$REPO_ROOT/deliverables/${SLUG_A}-${SLUG_B}"
RUN_SUMMARY="$OUT_DIR/run-summary.json"
[ -z "$REFERENCE" ] && REFERENCE="$CUST_REF"

if [ "$DRY_RUN" -eq 1 ]; then
  cat >&2 <<EOF

── DRY RUN — execution plan (no engine calls, no writes, no publish) ──────────
  customer pack   : $PACK
  customer        : $CUST_NAME
  reporting period: ${CUST_PERIOD:-<none>}
  org / env       : $ORG / $ENVID
  pack name       : $NAME
  reference       : ${REFERENCE:-<none>}
  PDF style       : $STYLE (premium branded = editorial)
  engine          : $GOV_URL
  output dir      : $OUT_DIR
  would run       : auth-verify → live regression → generate PDFs →
                    provenance check → publish (durable Supabase) → summary
  secrets         : loaded and validated as PRESENT; never printed
───────────────────────────────────────────────────────────────────────────────
EOF
  ok "dry run complete — configuration and paths valid"
  RUN_OK=1
  exit 0
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rt-regen.XXXXXX")"

# --- 3. verify connectivity + token validity against the deployed engine -----
log "verifying connectivity + token against $GOV_URL ..."
HCODE="$(curl -sS -m 20 -o "$TMP_DIR/health.json" -w '%{http_code}' "$GOV_URL/health" 2>>"$TMP_DIR/curl.err" || true)"
[ "$HCODE" = "200" ] || die "engine /health returned HTTP ${HCODE:-000} (unreachable or not deployed)"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$TMP_DIR/health.json" 2>/dev/null \
  || die "engine /health did not return JSON"
ok "engine reachable (/health 200)"

# Token probe: a minimal /v1/evaluate. 200 ⇒ token valid, 401 ⇒ rejected.
# The token travels only in the Authorization header; it is never echoed.
ECODE="$(curl -sS -m 20 -o "$TMP_DIR/probe.json" -w '%{http_code}' \
  -X POST "$GOV_URL/v1/evaluate" \
  -H "Authorization: Bearer ${GOVERNANCE_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"trajectory":[{"tool":"noop","args":{}}]}' 2>>"$TMP_DIR/curl.err" || true)"
case "$ECODE" in
  200) ok "governance token accepted by /v1/evaluate" ;;
  401|403) die "governance token rejected (HTTP $ECODE) — set GOVERNANCE_TOKEN to match the engine's token" ;;
  *)   die "/v1/evaluate probe returned unexpected HTTP ${ECODE:-000}" ;;
esac

# --- 4. record deployed engine commit + version -----------------------------
HEALTH_COMMIT="$(json_get "$TMP_DIR/health.json" engine_commit)"; HEALTH_COMMIT="${HEALTH_COMMIT:-unknown}"
HEALTH_VER="$(json_get "$TMP_DIR/health.json" service_version)"; HEALTH_VER="${HEALTH_VER:-unknown}"
log "deployed engine commit: $HEALTH_COMMIT · service_version: $HEALTH_VER"
[ "$HEALTH_COMMIT" = "unknown" ] && warn "engine /health reports commit 'unknown' — provenance will match on 'unknown' but cannot be pinned"

# --- 5. full LIVE enterprise regression (replay + baseline gate) -------------
# Protect the committed report: back it up, restore later unless this succeeds.
if [ -f "$VALIDATION_REPORT" ]; then
  REPORT_BACKUP="$TMP_DIR/VALIDATION-REPORT.backup.md"
  cp -f "$VALIDATION_REPORT" "$REPORT_BACKUP"
fi
log "running full live enterprise regression (this drives every sector pack + replay + baseline) ..."
REG_LOG="$TMP_DIR/regression.log"
set +e
GOVERNANCE_URL="$GOV_URL" GOVERNANCE_TOKEN="$GOVERNANCE_TOKEN" \
  node "$REGRESSION" --report >"$REG_LOG" 2>&1
REG_RC=$?
set -e

# --- 6. refuse to continue on skip / FP / FN / failure -----------------------
if grep -qi "Live regression SKIPPED" "$REG_LOG"; then
  die "live regression was SKIPPED — engine env not honoured. See: $REG_LOG"
fi
if [ "$REG_RC" -ne 0 ]; then
  warn "regression output tail:"; tail -n 15 "$REG_LOG" >&2 || true
  die "live enterprise regression FAILED (exit $REG_RC)"
fi
# Confirm the written report reflects a live run (engine URL, not unit-only).
if grep -q 'engine `(unit-only)`' "$VALIDATION_REPORT" 2>/dev/null; then
  die "validation report shows a unit-only run — live evidence was not produced"
fi
# Aggregate false positive / negative gate from the freshly written report.
SUITE_FP="$(grep -oE 'False positives \| [0-9]+' "$VALIDATION_REPORT" | grep -oE '[0-9]+' | head -1 || true)"
SUITE_FN="$(grep -oE 'False negatives \| [0-9]+' "$VALIDATION_REPORT" | grep -oE '[0-9]+' | head -1 || true)"
[ "${SUITE_FP:-0}" = "0" ] || die "live regression reported $SUITE_FP false positive(s) — refusing to continue"
[ "${SUITE_FN:-0}" = "0" ] || die "live regression reported $SUITE_FN false negative(s) — refusing to continue"
REPORT_OK=1   # the live regression succeeded — the new report may stand
ok "live regression passed (0 false positives / 0 false negatives; baseline + replay validated)"

# Per-pack false positive/negative for the specific customer (authoritative,
# scoped to this pack) — feeds the final summary.
PACK_FP=0; PACK_FN=0; PACK_VALIDATE="skipped"
if command -v python3 >/dev/null 2>&1; then
  VAL_LOG="$TMP_DIR/validate.log"
  set +e
  GOVERNANCE_URL="$GOV_URL" GOVERNANCE_TOKEN="$GOVERNANCE_TOKEN" \
    python3 "$VALIDATOR" "$PACK" >"$VAL_LOG" 2>&1
  VAL_RC=$?
  set -e
  PACK_FP="$(grep -oE 'false_positives=[0-9]+' "$VAL_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)"
  PACK_FN="$(grep -oE 'false_negatives=[0-9]+' "$VAL_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)"
  [ "$VAL_RC" -eq 0 ] && PACK_VALIDATE="pass" || PACK_VALIDATE="fail"
  [ "$VAL_RC" -eq 0 ] || die "per-pack validation failed (fp=$PACK_FP fn=$PACK_FN). See $VAL_LOG"
fi

# --- 7. generate the branded Chromium deliverable set ------------------------
# Idempotent: clear any prior output for this customer before regenerating.
rm -rf "$OUT_DIR"
log "generating branded deliverables (style=$STYLE) for $CUST_NAME ..."
GEN_LOG="$TMP_DIR/generate.log"
set +e
GOVERNANCE_URL="$GOV_URL" GOVERNANCE_TOKEN="$GOVERNANCE_TOKEN" RT_PDF_STYLE="$STYLE" \
  node "$DELIVERY_KIT" "$PACK" --style "$STYLE" >"$GEN_LOG" 2>&1
GEN_RC=$?
set -e
if [ "$GEN_RC" -ne 0 ]; then
  warn "generation output tail:"; tail -n 20 "$GEN_LOG" >&2 || true
  die "delivery-kit generation FAILED (exit $GEN_RC) — fix the pipeline; no HTML-only fallback."
fi

# --- 8. verify every expected file exists, non-empty, PDFs valid -------------
[ -d "$OUT_DIR" ] || die "expected output directory not created: $OUT_DIR"
EXPECTED=(audit.pdf executive-report.pdf audit.html executive-report.html run-summary.json)
for f in "${EXPECTED[@]}"; do
  p="$OUT_DIR/$f"
  [ -f "$p" ] || die "expected deliverable missing: $f (Chromium pipeline incomplete — not falling back to HTML)"
  [ -s "$p" ] || die "expected deliverable is empty: $f"
done
for pdf in audit.pdf executive-report.pdf; do
  # Valid PDFs start with the %PDF magic and end with %%EOF.
  head -c 5 "$OUT_DIR/$pdf" | grep -q '%PDF' || die "$pdf is not a valid PDF (missing %PDF header) — PDF generation failed"
  tail -c 1024 "$OUT_DIR/$pdf" | grep -q 'EOF'  || die "$pdf looks truncated (missing EOF marker) — PDF generation failed"
done
ok "all deliverables present and non-empty; both PDFs valid"

# --- 9. provenance: fresh live evidence + engine-commit match ----------------
[ -f "$RUN_SUMMARY" ] || die "run-summary.json missing"
RS_MODE="$(json_get "$RUN_SUMMARY" mode)"
RS_SRC="$(json_get "$RUN_SUMMARY" metrics.source)"
RS_ASSESS="$(json_get "$RUN_SUMMARY" status.assess)"
RS_EVAL="$(json_get "$RUN_SUMMARY" status.evaluate)"
RS_PDF="$(json_get "$RUN_SUMMARY" pdf_available)"
RS_COMMIT="$(json_get "$RUN_SUMMARY" attestation.engine_commit)"; RS_COMMIT="${RS_COMMIT:-unknown}"
RS_CHECKED="$(json_get "$RUN_SUMMARY" replay.checked)"
RS_DET="$(json_get "$RUN_SUMMARY" replay.deterministic)"

[ "$RS_MODE" = "live" ]      || die "run-summary mode is '$RS_MODE' (expected 'live') — not fresh live evidence"
[ "$RS_SRC" = "engine" ]     || die "run-summary metrics.source is '$RS_SRC' (expected 'engine')"
[ "$RS_ASSESS" = "true" ]    || die "run-summary status.assess is not true — engine /v1/assess did not run"
[ "$RS_EVAL" = "true" ]      || die "run-summary status.evaluate is not true — engine /v1/evaluate did not run"
[ "$RS_PDF" = "true" ]       || die "run-summary pdf_available is not true — PDFs were not produced"
[ -n "$RS_CHECKED" ] && [ "$RS_DET" = "$RS_CHECKED" ] || die "replay not fully deterministic ($RS_DET/$RS_CHECKED)"
[ "$RS_COMMIT" = "$HEALTH_COMMIT" ] || die "engine commit mismatch: run-summary '$RS_COMMIT' != /health '$HEALTH_COMMIT'"
ok "provenance verified (mode=live, source=engine, replay ${RS_DET}/${RS_CHECKED}, commit matches /health)"

# Verdict + trajectory totals for the summary (this pack, live).
M_TOTAL="$(json_get "$RUN_SUMMARY" metrics.total)"
M_ALLOW="$(json_get "$RUN_SUMMARY" metrics.allow)"
M_ESCALATE="$(json_get "$RUN_SUMMARY" metrics.escalate)"
M_BLOCK="$(json_get "$RUN_SUMMARY" metrics.block)"

# --- 10. publish through the durable Supabase Audit Pack workflow ------------
log "publishing audit pack to org=$ORG env=$ENVID (durable Supabase store) ..."
PUB_LOG="$TMP_DIR/publish.log"
PUB_ARGS=(--org "$ORG" --env "$ENVID" --dir "$OUT_DIR" --name "$NAME")
[ -n "$REFERENCE" ] && PUB_ARGS+=(--reference "$REFERENCE")
set +e
node "$PUBLISH" "${PUB_ARGS[@]}" >"$PUB_LOG" 2>&1
PUB_RC=$?
set -e
if grep -qi "NON-DURABLE" "$PUB_LOG"; then
  warn "publish output tail:"; tail -n 10 "$PUB_LOG" >&2 || true
  die "store is NON-DURABLE — Supabase not active. Configure NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."
fi
if [ "$PUB_RC" -ne 0 ]; then
  warn "publish output tail:"; tail -n 15 "$PUB_LOG" >&2 || true
  die "publish FAILED (exit $PUB_RC)"
fi
PACK_ID="$(grep -oE 'Published audit pack [^ ]+' "$PUB_LOG" | awk '{print $4}' | head -1 || true)"
[ -n "$PACK_ID" ] || warn "could not parse published pack id from publish output"
ok "published pack${PACK_ID:+ $PACK_ID}"

# --- 11. concise final summary (stdout) --------------------------------------
RUN_OK=1
OUT_REL="${OUT_DIR#"$REPO_ROOT"/}"
cat <<EOF

════════════════════════════════════════════════════════════════════════════
 RUNTIME GOVERNANCE — LIVE DELIVERABLE REGENERATION COMPLETE
════════════════════════════════════════════════════════════════════════════
  Customer            : $CUST_NAME
  Reporting period    : ${CUST_PERIOD:-n/a}
  Trajectories        : ${M_TOTAL:-?}
  Verdicts            : ALLOW ${M_ALLOW:-?} · ESCALATE ${M_ESCALATE:-?} · BLOCK ${M_BLOCK:-?}
  False positives     : ${PACK_FP:-0}
  False negatives     : ${PACK_FN:-0}
  Replay              : ${RS_DET:-?}/${RS_CHECKED:-?} deterministic
  Engine commit       : ${RS_COMMIT} (service ${HEALTH_VER})
  PDF style           : $STYLE
  Output directory    : $OUT_REL
  Published pack ID   : ${PACK_ID:-<unparsed>}
  Control Room path   : /admin/runtime  → $CUST_NAME → this Audit Pack
════════════════════════════════════════════════════════════════════════════
EOF
ok "done — preview both PDFs in the Control Room (Preview / Download / Share Securely)"
