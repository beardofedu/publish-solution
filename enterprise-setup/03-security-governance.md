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

| Control surface | Administrator must establish | Acceptance evidence |
|---|---|---|
| Secret scanning and push protection | Licensed, enabled on the solution repo; bypass governance and remediation owner | Actual enablement visible to validator identity and approved synthetic push-protection test |
| Dependencies | Dependency graph/alerts and the update configuration required by the deployed validator; registry access for private dependencies | Successful dependency/update run and endpoint visibility |
| CodeQL / code scanning | Supported languages/builds, default or advanced setup, allowed actions and adequate runners | A successful analysis at the exact current default-branch commit, within `scan_max_age_days`, among the latest 100 analyses; verify the required scanner separately |
| Rulesets | Active rules targeting default/release branches, required review/checks and reviewed bypass list | Direct-push and unapproved-PR rejection |
| CODEOWNERS | Valid, visible reviewer teams with explicit write access to the repo; protect CODEOWNERS itself | GitHub recognizes owners and requests the expected review |
| SECURITY.md | Internal vulnerability reporting route and response owner | Approved policy at the path the validator recognizes |
| `.env`/secrets hygiene | No non-template `.env` files at default-branch head; prevent actual secrets and review history separately | Negative fixture rejected; only `.env.example`, `.env.sample` and `.env.template` filename exemptions; a truncated tree is UNKNOWN |
| OIDC deployment workflow | Protected deploy job with `id-token: write`, correct cloud identity/trust and required environment controls | Real sandbox authentication and unauthorized-context rejection |

- [ ] Read the deployed [validator scripts](../scripts/) to record exactly what each check proves. File existence, enabled tooling and closed issues do **not** prove there are zero vulnerabilities, correct cloud RBAC or complete evidence.
- [ ] Record stock detector limits explicitly: code scanning accepts successful analysis evidence without requiring a particular scanner; branch review checks accept classic protection or an applicable active ruleset; CODEOWNERS/SECURITY.md content checks do not prove valid teams/reporting routes; OIDC detection is an Azure workflow pattern, not an executed cloud trust test.
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

**Important boundary:** CODEOWNERS/rulesets protect code changes, not issue labels. Users with applicable issue permissions may be able to change labels or close control issues. Do not claim a governance-only label is enforced unless the automation explicitly verifies authorized reviewers. Use a protected deployment environment and least-privilege cloud identity for actual production access. If the deployed toolkit does not enforce the required separation of duties, remediate it or hold launch.

Source: [About code owners and review behavior](https://docs.github.com/en/enterprise-cloud@latest/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

## 3. Map tiers and control catalog to internal policy

- [ ] Governance and security jointly review [config/tiers.yml](../config/tiers.yml), [controls/](../controls/), the [request form](../.github/ISSUE_TEMPLATE/request-publication.yml) and [CUSTOMIZING.md](../CUSTOMIZING.md). Change them through protected PRs, not production issue edits.
- [ ] Define Low/Moderate/High thresholds for data classification, external exposure, authentication, financial/regulated impact and cloud access. Test combinations and missing/ambiguous answers. Ensure the form and tier logic use matching values.
- [ ] Assign a stable internal policy ID and version to each required control. Preserve the catalog's supported schema: put mappings in supported evidence text/links or an internal mapping register, not invented YAML fields.
- [ ] Identify accountable evidence owners, acceptable evidence, independent reviewers, remediation targets and expiry for each control/tier. A checked box is not evidence.
- [ ] Freeze the catalog revision used by a request. Define how existing requests pick up newly mandatory controls, and test reruns without duplicate issues or lost evidence.
- [ ] Define an exception path: risk owner, rationale, compensating controls, expiry, affected release and revalidation date. Only use toolkit-supported exception behavior; a manual waiver must not falsely make automation report a failed control as passed.

The stock gate has **no automatic exception override**. PASS is required for every detector; FAIL and UNKNOWN both block readiness. A separate risk acceptance does not turn an unavailable detector green. Any approved detector change needs a protected, scoped implementation change and tests.

Copy into your restricted policy register:

| Toolkit control ID / tier | Internal policy ID + version | Required evidence | Evidence owner | Reviewer | Exception authority / expiry |
|---|---|---|---|---|---|
| `<catalog ID / tier>` | `<POL-000 v0>` | `<link/type>` | `<team>` | `<team>` | `<owner/date or none>` |

**Gate exit:** security features actually work in solution repos, automated checks are understood, policy mapping is approved and production approval has enforceable access boundaries.
