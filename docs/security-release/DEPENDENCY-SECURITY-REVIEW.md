# Dependency Security Review

**Review date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**Readiness classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

## Scope and method

The earlier CI summary reported six high-severity npm findings. This review captured:

- `npm audit --json`;
- the installed dependency paths for the six affected package names;
- `npm audit fix --dry-run --json`;
- a non-force `npm audit fix` candidate;
- the complete General Production Readiness regression gate using that candidate;
- promotion of the resulting `package-lock.json` only after that gate passed;
- a fresh `npm ci` and `npm audit --audit-level=high` from the committed lockfile.

No `--force` remediation and no major-version upgrade was used.

## Baseline audit snapshot

Before remediation:

- critical: **0**
- high: **6**
- moderate: **0**
- low: **0**
- total: **6**

Npm reports package-level severity using the highest advisory in each affected dependency entry; several entries contained a mix of high and moderate advisories.

## Findings and remediation

| Package | Direct? | Baseline | Vulnerability class | Reachability review | Applied version | Upgrade type | Result |
|---|---|---|---|---|---|---|---|
| `next` | **Yes — production** | `16.2.6` | Authorization/middleware bypass, DoS, SSRF, cache confusion and related framework advisories in the affected range | Material production dependency: this application is a Next App Router service | `16.3.1` | minor within declared semver range | **Applied; full build/regression green** |
| `postcss` | **Yes — dev/build** | direct `8.5.15`; nested `8.4.31` | XSS/stringification and source-map path/file-read issues | Primarily build/toolchain in this repository | `8.5.23`; vulnerable nested copy removed by dependency resolution | patch | **Applied; lint/build green** |
| `sharp` | No — transitive/optional production path through Next | `0.34.5` | Inherited libvips memory/image-processing vulnerabilities | Potentially production-reachable through framework image processing | `0.35.3` | minor transitive | **Applied; native build green** |
| `brace-expansion` | No — tooling | `1.1.15`, `5.0.6` | CPU/memory denial of service from pathological brace expansion | Development/tooling paths | `1.1.18`, `5.0.9` | patch | **Applied** |
| `js-yaml` | No — tooling | `4.1.1` | Quadratic CPU denial of service in YAML merge/omap resolution | Development/config tooling | `4.3.1` | minor transitive | **Applied; lint green** |
| `nanoid` | No — transitive | `3.3.12` | Availability/infinite-loop issue in affected non-secure/custom generator paths | Transitive CSS/framework tooling; direct application reachability appears low | `3.3.18` | patch | **Applied** |

Associated Next SWC, Sharp native/libvips and resolver packages were updated as required by the compatible dependency resolution.

## Validation gate used before promotion

The remediated tree passed:

- production-readiness contracts;
- production profile fail-closed gates;
- destructive-validation guard tests;
- source-health semantics;
- Control Room state contracts;
- production smoke diagnostic classifier;
- governance-engine diagnostic contracts;
- simulated sovereign outage harness;
- runtime tests;
- runtime hardening;
- runtime isolation;
- contracts;
- operations regression;
- sovereign regression;
- lint;
- typecheck;
- production build.

The lockfile was then committed as `Apply compatible dependency security updates`. The temporary branch-only GitHub Actions write permission used to promote that already-tested lockfile was immediately removed; General Production Readiness CI is back to `contents: read`.

## Fresh committed-lock audit

A subsequent General Production Readiness run performed `npm ci` directly from the committed lockfile before running:

```bash
npm audit --audit-level=high
```

The captured `npm audit --json` metadata reported:

```text
info:     0
low:      0
moderate: 0
high:     0
critical: 0
total:    0
```

Therefore the six dependency audit findings that motivated this review are **remediated in the current committed dependency tree**.

## Residual dependency considerations

A zero-result npm audit is not a claim that the application has no software-security risk. It means npm's current advisory database reports no known vulnerabilities for the committed resolved dependency tree at this validation point.

The direct `package.json` semver ranges remain compatible with the remediated versions and `npm ci` is lockfile-driven. Future dependency updates or lockfile regeneration must continue to run the same audit and complete regression gate.

The live-production E2E governance outage is unrelated to dependency remediation and remains a failed gate. This dependency result does **not** change the overall classification.

## Security conclusion

**Dependency audit finding status: REMEDIATED AND RE-AUDITED.**

**General-production validation status: still INCOMPLETE.**

No claim of production readiness, customer-boundary validation, penetration testing, independent audit or certification follows from the dependency result alone.
