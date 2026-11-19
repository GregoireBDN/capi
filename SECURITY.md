# Security

Finances is a single-user, self-hosted app holding personal financial data. Production is only reachable through Tailscale.

## Reporting a vulnerability

Do not open a public issue or PR describing it. Report it privately to the owner (GitHub: Security → Report a vulnerability, or directly). Never include real financial data (CSV rows, labels, amounts, balances, account numbers) or a live secret in a report: describe it, or use synthetic values.

## Audit

The manual audit lives in [`docs/security/`](docs/security/): the [threat model](docs/security/threat-model.md), the [OWASP ASVS 4.0 level 2 checklist](docs/security/asvs-l2-checklist.md), the latest [report](docs/security/audit-2026-11-14.md) with its owner checklist for the server, and [re-runnable checks](docs/security/pentest/README.md) against a throwaway production-like stack. Re-run them before exposing anything beyond the tailnet (#78) and after changes to authentication, the `/api` proxy or the deployment.

## Automated checks

| Check                                                                  | Where                                                                           | Fails on                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dependency audit: `pnpm audit --prod` through `scripts/audit-prod.mjs` | `security.yml`: every PR, push to main, weekly, every release                   | a high or critical advisory not in `.github/security/audit-allowlist.json`               |
| SAST: Semgrep, `p/default` + `p/typescript`, `p/nodejs`, `p/react`     | `security.yml`                                                                  | any finding                                                                              |
| Secrets: gitleaks                                                      | `security.yml`: the PR's commits; full history otherwise                        | any finding (output redacted)                                                            |
| Container scan: Trivy on the API, web and MCP adapter images           | `container-scan.yml` (Dockerfile changes, weekly), `release.yml` before pushing | a fixable high or critical vulnerability, or a secret, in the image                      |
| Dependabot                                                             | `.github/dependabot.yml`                                                        | opens PRs: npm security updates, monthly GitHub Actions bumps, weekly base image digests |

- Semgrep runs the community rules locally in the job (no account, `--metrics=off`). `p/default` is added to the three language packs, which alone miss e.g. `eval()` of request input; its pnpm rules check the supply-chain settings below. CodeQL was not used: on a private repository of a free plan, code scanning results cannot be uploaded or shown, and its action fails on upload.
- pnpm supply-chain settings (`pnpm-workspace.yaml`, #156): `minimumReleaseAge: 10080` (no version published less than 7 days ago), `trustPolicy: no-downgrade` (no version with a weaker publish trust level, provenance or trusted publishing, than earlier ones) and `blockExoticSubdeps` (transitive dependencies from the registry only, no git URL or tarball). They apply whenever pnpm resolves (`pnpm add`, `pnpm update`, Dependabot); a frozen install only fetches what the lockfile pins. An exception is an exact `name@version` in `minimumReleaseAgeExclude` (e.g. an urgent security fix younger than 7 days) or `trustPolicyExclude` (a release that legitimately lacks the trust level of earlier ones), with a comment giving the reason; remove it once it is no longer needed. `packageManager` pins pnpm with its sha512, which corepack verifies when it downloads pnpm. No `package.json` may depend on a moving dist-tag (`latest`, `next`, a nightly channel, `*`): `scripts/check-specifiers.mjs` fails the dependency audit job on one (#243); a prerelease channel such as `nitro-nightly` is pinned to an exact version and changed only by a deliberate PR.
- Trivy skips the app's own `node_modules` (they come from the lockfile, gated by the audit). It covers what the base image brings: Alpine packages, Node itself, and secrets. The runtime images run as the unprivileged `node` user and contain no package manager (npm, corepack and yarn are removed).
- Workflows: every job declares least-privilege `permissions:`, every action is pinned by full commit SHA with its version in a comment (Dependabot keeps both up to date), and scanner images are pinned by digest.
- Dependabot security updates need "Dependabot alerts" and "Dependabot security updates" enabled in the repository settings (Settings → Advanced Security).

## How findings are tracked

A red check is fixed in the PR that introduced it. A finding that cannot be fixed at once (an advisory published against an existing dependency, a fix that needs a major update) is tracked, never silenced without a trace:

1. Open a `fix` issue (labels `fix`, `area:security` and the `area:*` of the code, milestone **M7 Access & security**) with the advisory ids, why it does or does not affect this app, and the update needed. No real data in it.
2. Accept the finding with a reason and the issue number:
   - **Dependency audit**: an entry in `.github/security/audit-allowlist.json` (`id` = GHSA, `package`, `severity`, `via`, `issue`, `reason`). The audit warns when an entry is no longer reported: remove it.
   - **Trivy**: a line in `.trivyignore` (CVE id) with a `#` comment giving the issue and reason.
   - **Semgrep**: a `// nosemgrep: <rule-id>` comment on the line, with the reason, only for false positives.
   - **gitleaks**: a real secret is **revoked and rotated first**; rewriting history does not un-leak it. A false positive (a fake fixture value) goes in `.gitleaksignore` by fingerprint.
3. Close the issue by updating the dependency and removing the allow-list entry in the same PR.

Accepted advisories are reviewed when Dependabot or the weekly runs report something new, and before each release.
