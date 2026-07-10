#!/usr/bin/env bash
# ============================================================================
# Focused tests for regenerate-live.sh — argument validation + secret redaction.
#
# These are hermetic: they exercise only --help, argument/path validation, and
# the --dry-run path. They make NO engine calls, generate nothing, and publish
# nothing, so they are safe to run anywhere (CI, sandbox, laptop).
#
#   bash scripts/smoke-tests/regenerate-live.test.sh
# ============================================================================
set -Eeuo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
SUT="$DIR/regenerate-live.sh"
PACK="$DIR/01-finance-meridian-sterling.json"   # a real, committed pack
[ -f "$SUT" ]  || { echo "missing SUT: $SUT" >&2; exit 2; }
[ -f "$PACK" ] || { echo "missing test pack: $PACK" >&2; exit 2; }

PASS=0; FAIL=0
ok()   { printf '  ok   %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL %s\n' "$1"; FAIL=$((FAIL+1)); }

# Distinctive sentinels that must NEVER appear in any output the script emits.
TOKEN_SENTINEL="TOKEN_SENTINEL_c0ffee_DO_NOT_LEAK"
KEY_SENTINEL="SERVICE_ROLE_SENTINEL_deadbeef_DO_NOT_LEAK"

# Run the SUT, capturing combined stdout+stderr and the exit code.
# Usage: run "<extra-env>" <args...>   (extra-env is a space-separated KEY=VAL list)
run() {
  local env_prefix="$1"; shift
  local out rc
  set +e
  out="$(env $env_prefix bash "$SUT" "$@" 2>&1)"
  rc=$?
  set -e
  RUN_OUT="$out"; RUN_RC="$rc"
}

# Dummy-but-present secrets so the --dry-run presence checks pass without secrets.
DRY_ENV="GOVERNANCE_URL=https://engine.example \
GOVERNANCE_TOKEN=$TOKEN_SENTINEL \
NEXT_PUBLIC_SUPABASE_URL=https://sb.example \
SUPABASE_SERVICE_ROLE_KEY=$KEY_SENTINEL"

echo "== argument validation =="

run "" --help
{ [ "$RUN_RC" -eq 0 ] && printf '%s' "$RUN_OUT" | grep -qi "USAGE"; } \
  && ok "--help exits 0 and prints usage" || bad "--help"

run "" --pack "$PACK" --env E1
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "org"; } \
  && ok "missing --org fails and mentions org" || bad "missing --org"

run "" --org O1 --env E1
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "pack"; } \
  && ok "missing --pack fails and mentions pack" || bad "missing --pack"

run "" --pack "$PACK" --org O1
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "env"; } \
  && ok "missing --env fails and mentions env" || bad "missing --env"

run "" --pack "$DIR/does-not-exist.json" --org O1 --env E1
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "not found"; } \
  && ok "nonexistent pack fails with 'not found'" || bad "nonexistent pack"

run "" --pack "$PACK" --org O1 --env E1 --style neon
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "invalid --style"; } \
  && ok "invalid --style rejected" || bad "invalid --style"

run "" --pack "$PACK" --org O1 --env E1 --bogus
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qi "unknown argument"; } \
  && ok "unknown argument rejected" || bad "unknown argument"

# Missing required secret (no env) must fail closed, mentioning the var name.
run "" --pack "$PACK" --org O1 --env E1
{ [ "$RUN_RC" -ne 0 ] && printf '%s' "$RUN_OUT" | grep -qiE "GOVERNANCE_URL|GOVERNANCE_TOKEN|SUPABASE"; } \
  && ok "missing secrets fail closed and name the variable" || bad "missing secrets"

echo "== dry run =="

run "$DRY_ENV" --pack "$PACK" --org O1 --env E1 --dry-run
{ [ "$RUN_RC" -eq 0 ] && printf '%s' "$RUN_OUT" | grep -qi "DRY RUN"; } \
  && ok "--dry-run exits 0 and prints the plan" || bad "--dry-run exit/plan"

printf '%s' "$RUN_OUT" | grep -qi "Meridian Sterling Bank" \
  && ok "--dry-run resolves the customer from the pack" || bad "--dry-run customer resolution"

printf '%s' "$RUN_OUT" | grep -q "deliverables/meridian-sterling-bank" \
  && ok "--dry-run resolves the deterministic output dir" || bad "--dry-run output dir"

echo "== secret redaction =="

# The token + service-role key were supplied as sentinels above; neither may
# appear anywhere in the script's combined output.
if printf '%s' "$RUN_OUT" | grep -q "$TOKEN_SENTINEL"; then
  bad "GOVERNANCE_TOKEN leaked into output"
else
  ok "GOVERNANCE_TOKEN never printed"
fi
if printf '%s' "$RUN_OUT" | grep -q "$KEY_SENTINEL"; then
  bad "SUPABASE_SERVICE_ROLE_KEY leaked into output"
else
  ok "SUPABASE_SERVICE_ROLE_KEY never printed"
fi

# The script must affirmatively state secrets are present-but-hidden.
printf '%s' "$RUN_OUT" | grep -qi "hidden" \
  && ok "secrets reported as present-but-hidden" || bad "secrets hidden acknowledgement"

echo
echo "regenerate-live.test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
