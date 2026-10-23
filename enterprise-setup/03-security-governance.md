# Gate 3: Security licensing, controls and governance

[Index](README.md) | Previous: [Authentication](02-authentication.md) | Next: [Azure](04-azure.md)

**Accountable:** security owner for security enablement; governance owner for policy and approval. **Sign-off:** both owners.

## 1. Budget and enable security on every solution repository

Public-template defaults do not prove security is available in the private/internal repositories your enterprise will publish.

- [ ] Confirm purchased entitlements and available capacity with the license owner. On Cloud, **GitHub Secret Protection** supplies secret scanning/push protection and **GitHub Code Security** supplies code scanning for private/internal repos; a legacy GitHub Advanced Security agreement may cover both. Enterprise licensing alone is not evidence that both are enabled.
- [ ] Record which pilot and future solution repos are covered, active-committer billing/capacity ownership and the onboarding process. Confirm the matching GHES entitlement, license upload and feature support for your version.
- [ ] Distinguish dependency features: dependency graph, Dependabot alerts and updates are not all paid-GHAS features. Do not purchase Code Security solely on the assumption that ordinary Dependabot alerts require it.
- [ ] In org **Settings**, configure an approved security configuration for solution repos, including secret scanning, push protection, dependency graph/Dependabot alerts and CodeQL where supported. Decide whether to enforce it and apply it to existing pilot repos and new eligible repos.
- [ ] Check actual repository state after applying configuration; enforcement can be disrupted by disabled Actions or blocked CodeQL dependencies. A configuration assignment alone is not sufficient evidence.

Sources: [About GitHub Advanced Security](https://docs.github.com/en/enterprise-cloud@latest/get-started/learning-about-github/about-github-advanced-security); [Repository security settings](https://docs.github.com/en/enterprise-cloud@latest/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository); [Security configuration enforcement](https://docs.github.com/en/enterprise-cloud@latest/code-security/reference/security-at-scale/configuration-enforcement).

### Verify the validator's dependencies

| Control surface | Automated signal / prerequisite | Additional human proof |
|---|---|---|
| Secret scanning and push protection | Licensed, enabled on the solution repo; bypass governance and remediation owner | Actual enablement visible to validator identity and approved synthetic push-protection test |
| Dependencies | Dependency graph/alerts and the update configuration required by the deployed validator; registry access for private dependencies | Successful dependency/update run and endpoint visibility |
| CodeQL / code scanning | Successful analysis at the exact default-branch commit, within `scan_max_age_days`, among the latest 100 analyses; licensed tooling/runners required | Verify required scanner and supported-language/build coverage; stock check accepts any successful scanner |
| Rulesets | Required review via classic protection or applicable active ruleset | Direct-push/unapproved-PR rejection; release branches, required checks, and bypass review |
| CODEOWNERS | Substantive file | Valid visible teams with explicit write access; protect the file and prove expected reviews |
| SECURITY.md | Substantive file at a recognized path | Test the approved reporting route and response ownership |
| `.env`/secrets hygiene | No non-template `.env` files at default-branch head; prevent actual secrets and review history separately | Negative fixture rejected; only `.env.example`, `.env.sample` and `.env.template` filename exemptions; a truncated tree is UNKNOWN |
| OIDC deployment workflow | Azure workflow pattern, not executed trust | Protected job with `id-token: write`; real sandbox authentication, scoped cloud role, and unauthorized-context rejection |

- [ ] Reconcile this table against the deployed [checks](../scripts/checks.mjs) and [report limits](https://beardofedu.github.io/publish-solution/governance.html#automated-report). Files, tooling, and issue closure do not prove zero vulnerabilities, cloud role-based access control (RBAC), or evidence quality.
- [ ] Close required control issues **as completed**. Closing as not planned or duplicate does not satisfy validation, and manually checking rendered parent task-list boxes is not authoritative.
- [ ] Establish separate alert triage/remediation SLAs and a security review for material findings; document whether unresolved findings block production under internal policy.
- [ ] If CodeQL cannot analyze a language or a host cannot provide a required feature, implement and test the approved alternative through [CUSTOMIZING.md](../CUSTOMIZING.md), or exclude that class of solution from launch. Do not manufacture passing API responses.

## 2. Establish teams, rulesets and approval authority

- [ ] Create visible teams such as `<org>/platform-maintainers`, `<org>/security-reviewers` and `<org>/governance-reviewers`; use your real team slugs. Grant only necessary access, assign backups and review membership through the identity lifecycle.
- [ ] Use CODEOWNERS and required code-owner review for intake workflow/scripts, tiers and controls. For solution repos, assign the solution team and appropriate security/deployment owners. Owners must have write access; merely naming a team does not grant access.
- [ ] Protect changes to CODEOWNERS itself. Protect default and production branches with active rulesets (or approved version-supported protections), PR reviews, required checks, stale-approval handling and a narrow documented break-glass bypass.
- [ ] Verify independent approvals where policy requires both platform and security. Listing two owners on one CODEOWNERS line allows either owner's approval; it does not require both.
- [ ] Define who may invoke `/validate` and who may apply `approved-for-production`. Test those authorization checks in the actual implementation, not just the written procedure.
- [ ] Record the approval decision with reviewer, time, policy/catalog revision, evidence URLs, release commit/artifact and any exceptions. Material changes after approval require reassessment.

**Labels are advisory, not authorization.** CODEOWNERS/rulesets protect code, not issue labels or closure. Do not claim exclusive governance approval without verified reviewer enforcement. Protect production through deployment environments and least-privilege cloud identity. If required separation of duties is unenforced, remediate or hold launch.

Source: [About code owners and review behavior](https://docs.github.com/en/enterprise-cloud@latest/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

## 3. Map tiers and control catalog to internal policy

- [ ] Governance and security jointly review [config/tiers.yml](../config/tiers.yml), [controls/](../controls/), the [request form](../.github/ISSUE_TEMPLATE/request-publication.yml) and [CUSTOMIZING.md](../CUSTOMIZING.md). Change them through protected PRs, not production issue edits.
- [ ] Define Low/Moderate/High thresholds for data classification, external exposure, authentication, financial/regulated impact and cloud access. Test combinations and missing/ambiguous answers. Ensure the form and tier logic use matching values.
- [ ] Assign a stable internal policy ID and version to each required control. Preserve the catalog's supported schema: put mappings in supported evidence text/links or an internal mapping register, not invented YAML fields.
- [ ] Identify accountable evidence owners, acceptable evidence, independent reviewers, remediation targets and expiry for each control/tier. A checked box is not evidence.
- [ ] Freeze the catalog revision used by a request. Define how existing requests pick up newly mandatory controls, and test reruns without duplicate issues or lost evidence.
- [ ] Define an exception path: risk owner, rationale, compensating controls, expiry, affected release and revalidation date. Only use toolkit-supported exception behavior; a manual waiver must not falsely make automation report a failed control as passed.

**FAIL and UNKNOWN block readiness; exceptions never override them.** A separate risk decision is not an automated PASS. Detector changes need protected review, explicit scope, and tests; see [exception handling](https://beardofedu.github.io/publish-solution/requests.html#exceptions).

Copy into your restricted policy register:

| Toolkit control ID / tier | Internal policy ID + version | Required evidence | Evidence owner | Reviewer | Exception authority / expiry |
|---|---|---|---|---|---|
| `<catalog ID / tier>` | `<POL-000 v0>` | `<link/type>` | `<team>` | `<team>` | `<owner/date or none>` |

**Gate exit:** security features actually work in solution repos, automated checks are understood, policy mapping is approved and production approval has enforceable access boundaries.
