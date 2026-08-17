# Dependency Security Review

**Review date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**Readiness classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

## Scope and method

The earlier CI summary reported six high-severity npm findings. This review captured:

- `npm audit --json`;
- the installed dependency paths for the six affected package names;
- `npm audit fix --dry-run --json`;
- a non-force `npm audit fix` candidate which is accepted only if the complete non-live General Production Readiness gate remains green.

No `--force` remediation and no automatic major-version upgrade is permitted by this release-candidate review.

### Baseline audit snapshot

At the reviewed pre-remediation lockfile:

- critical: **0**
- high: **6**
- moderate: **0** at npm's package-summary level
- low: **0**
- total: **6**

Npm reports package-level severity using the highest advisory in each affected dependency entry; several entries include a mix of high and moderate advisories.

## Findings

| Package | Direct? | Installed vulnerable version/path | Vulnerability class | Production reachability review | Patched candidate | Upgrade type | Compatibility risk | Recommended action |
|---|---|---|---|---|---|---|---|---|
| `next` | **Yes — production** | `next@16.2.6` | Authorization/middleware bypass, DoS, SSRF, cache confusion and related App Router/framework advisories in affected 16.x range | **Material production dependency.** The application is a Next App Router service. A repository search did not find application `"use server"` declarations or `next/image` imports, reducing exposure to some advisory-specific paths, but framework-level reachability cannot be dismissed. | `16.3.1` from npm's non-force fix plan | **minor** | Medium: framework minor; requires full build/runtime/UI regression | Apply only with complete regression; candidate is being tested in CI |
| `postcss` | **Yes — dev/build** | direct `postcss@8.5.15`; Next also carried nested `8.4.31` | XSS/stringification plus arbitrary `.map` file read/path traversal via source-map comments | Primarily **build/toolchain** in this repo. CSS inputs are repository-controlled in normal builds, reducing runtime exploitability, but disclosure/path traversal findings justify patching. | `8.5.23`; vulnerable nested Next copy removed by Next upgrade | patch | Low–medium: build pipeline | Apply with full build/lint regression |
| `sharp` | No — transitive/optional production path through Next | `next@16.2.6 > sharp@0.34.5` | Inherited libvips memory/image-processing vulnerabilities | Potentially production-reachable through framework image processing if image optimization is used. Repository search did not find `next/image`; framework/transitive presence still warrants remediation rather than dismissal. | `0.35.3` through compatible dependency resolution | minor transitive | Medium: native binary/image stack | Accept only as part of fully tested dependency candidate |
| `brace-expansion` | No — tooling | `eslint@9.39.4 > minimatch@3.1.5 > brace-expansion@1.1.15`; `eslint-config-next@16.2.6 > typescript-eslint@8.60.0 > @typescript-eslint/typescript-estree@8.60.0 > minimatch@10.2.5 > brace-expansion@5.0.6` | CPU/memory denial of service from pathological brace expansion | **Development/tooling path.** Inputs are principally repository globs/configuration, not an exposed production request path. Reachability is lower but the patches are narrow. | `1.1.18` and `5.0.9` | patch | Low | Apply compatible transitive patches |
| `js-yaml` | No — tooling | `eslint@9.39.4 > @eslint/eslintrc@3.3.5 > js-yaml@4.1.1` | Quadratic CPU denial of service in YAML merge/omap resolution | **Development/config tooling.** No evidence this dependency is used to parse attacker-controlled production YAML. Lower runtime reachability; still patchable without force. | `4.3.1` | minor transitive | Low–medium | Apply if lint/contracts remain green |
| `nanoid` | No — transitive | `next@16.2.6 > postcss@8.4.31 > nanoid@3.3.12`; direct build PostCSS tree also resolves `nanoid@3.3.12` | Infinite-loop/availability issue in non-secure/custom generators for invalid sizes | Dependency is transitive to CSS/framework tooling; application code is not known to call the affected generator APIs. Production request reachability appears low, but remediation is a narrow patch. | `3.3.18` | patch | Low | Apply compatible patch |

## Advisory detail

### brace-expansion

The baseline audit contains high-severity denial-of-service advisories covering exponential/unbounded brace expansion. Both installed branches are within affected ranges:

- `1.1.15` → candidate `1.1.18`
- `5.0.6` → candidate `5.0.9`

These are indirect lint/type tooling paths.

### js-yaml

The installed `4.1.1` is affected by quadratic CPU-consumption advisories involving merge-key/ordered-map handling. Npm's compatible candidate resolves it to `4.3.1`.

### nanoid

The installed `3.3.12` is affected by high-severity availability advisories where non-secure/custom generators can loop indefinitely for invalid sizes. Candidate: `3.3.18`.

### Next.js

The installed direct framework version `16.2.6` is within npm-audited ranges that include high-severity middleware/authorization bypass, DoS and SSRF findings plus moderate cache/response-handling findings. Npm's **non-force** resolver selects `16.3.1`; this is a minor update within the declared `^16.2.6` range rather than a forced major.

Because Next.js is an exposed production framework, this is the highest-priority dependency remediation in this set.

### PostCSS

The installed direct build version is `8.5.15`; Next also brings a vulnerable nested `8.4.31`. The advisories include arbitrary map-file read/path traversal and CSS stringification issues. Npm's candidate selects `8.5.23` and the Next upgrade removes the old nested `8.4.31` copy.

### Sharp

The installed `0.34.5` is below the patched `0.35.0` boundary for inherited libvips advisories. Npm's compatible candidate selects `0.35.3`. This is a native dependency and therefore receives full build/regression validation before acceptance.

## Non-force remediation candidate

The reviewed `npm audit fix --dry-run` proposes the following security-relevant changes without `--force`:

```text
next             16.2.6  -> 16.3.1
postcss          8.5.15  -> 8.5.23
sharp            0.34.5  -> 0.35.3
nanoid           3.3.12  -> 3.3.18
js-yaml          4.1.1   -> 4.3.1
brace-expansion  1.1.15  -> 1.1.18
brace-expansion  5.0.6   -> 5.0.9
```

It also updates associated Next SWC, Sharp native/libvips and resolver packages required by those compatible versions.

## Acceptance rule

The candidate lockfile may be committed only if all of the following remain green with the remediated dependency tree:

- production-readiness contracts;
- production profile gates;
- destructive-validation guard tests;
- source-health semantics;
- Control Room state contracts;
- production smoke diagnostic classifier;
- simulated sovereign outage harness;
- runtime tests;
- runtime hardening;
- runtime isolation;
- contracts;
- operations regression;
- sovereign regression;
- lint;
- typecheck;
- production build;
- Enterprise Regression and baseline/stress/mutation workflows.

A live-production E2E governance outage is **not** waived by dependency remediation.

## Current remediation status

At the time this review was written, the compatible candidate was being validated in CI and had **not yet been committed to the release-candidate lockfile**. The final report/PR status must state the post-validation audit count and whether the candidate was accepted.

If the candidate fails compatibility testing, the original lockfile must remain and the six findings remain explicit remediation items. If it passes, the generated lockfile should be committed and `npm ci` + `npm audit` rerun from that committed lockfile.

## Security conclusion

The six findings are real audit findings and are not dismissed because several are tooling/transitive. Their risk is heterogeneous:

- **Next.js** is directly production-relevant and should be remediated promptly.
- **Sharp** can be production-relevant through framework image processing and merits remediation.
- **PostCSS, brace-expansion, js-yaml and nanoid** are predominantly build/tooling/transitive in the observed dependency graph, which reduces but does not eliminate security relevance.

No claim of a clean dependency audit should be made until the final committed lockfile is audited by CI.
