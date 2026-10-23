# Set up a governance instance

For the ordered, role-based administrator journey, use the **[rendered enterprise installation walkthrough](https://beardofedu.github.io/publish-solution/setup.html)** ([local source](docs/setup.html)). It covers customer-controlled adoption, exact UI paths, per-repository onboarding and the first synthetic pilot. Use the existing [enterprise readiness runbook](enterprise-setup/README.md) and its sign-off record for policy and workload launch evidence; this file is the configuration reference.

**Toolkit installation is not workload deployment.** The hub creates issues in selected solution repositories without installing a toolkit workflow there. No Azure resources, cloud credentials or Copilot seat are required for issue generation. An installation pilot can succeed while `/validate` correctly reports workload readiness gaps, including the stock Azure OIDC pattern check.

## 1. Prepare a repository

Adopt a reviewed independent Git copy into a repository managed by the governance team; retain the license and record the upstream commit/update owner. Use private visibility if intake metadata is confidential, or internal only when enterprise-wide read access is acceptable. A public fork stays public and cannot independently change visibility; respect enterprise fork restrictions. Follow the walkthrough's bootstrap sequence to keep Actions/Pages from running before configuration review.

The bundled workflows target GitHub.com, Node.js 22+, and the repository's trusted default branch. `ghe.com` and GHES need implemented, tested host-specific adaptations, not just an API URL change; see [deployment boundaries](enterprise-setup/README.md#deployment-scope-and-documentation-currency). If your default branch is not `main`, update `ci.yml` and `pages.yml`.

Enable Issues and Actions. Allow the workflow `GITHUB_TOKEN` to write issues; each workflow explicitly requests `contents: read` and `issues: write`. Protect the default branch and review changes to workflows, scripts, dependencies, controls, and policy. Never run target-repository code under the governance credentials.

Create these labels before using the form, either with the [optional bootstrap](#optional-preview-first-bootstrap) or these fully manual commands (no force/overwrite):

```sh
gh label create publication-request --repo YOUR-ORG/YOUR-HUB --color 0969da
gh label create approved-for-production --repo YOUR-ORG/YOUR-HUB --color 1a7f37
gh label create reassessment-request --repo YOUR-ORG/YOUR-HUB --color 8250df
gh label create control-exception --repo YOUR-ORG/YOUR-HUB --color bf8700
gh label create decommission-request --repo YOUR-ORG/YOUR-HUB --color 57606a
```

Risk and readiness labels are created by the toolkit. Existing labels are preserved. Non-collaborators may submit a form, but only hub collaborators with `write`, `maintain`, or `admin` permission may start cross-repository processing. An automatic run from a non-collaborator will fail preflight; a maintainer should review the request and comment `/publish`.

Keep existing labels when upgrading; create only missing labels. Assign governance triage for `reassessment-request`, `control-exception`, and `decommission-request`. These are **manual** forms and must not also have `publication-request`: automation on a separate request number would create a separate publication plan. No App/PAT permission, secret, variable, or environment names change.

### Optional preview-first bootstrap

The manual installation remains fully supported. From the **trusted adopted hub checkout** with Node.js 22+, run `npm ci --ignore-scripts`, then use the optional script below. It supports **GitHub.com only**, rejects alternate `GITHUB_API_URL`/`GITHUB_SERVER_URL` destinations, and never reads a target repository. Supply `HUB_TOKEN` for **only the hub**, using your approved secret-manager/environment injection; do not put tokens in command arguments, shell history, files or logs. No target solution-repository credential is needed.

```sh
# Default: read-only hub diagnostics and missing-label preview; no local writes.
npm run bootstrap -- --repo contoso/publish-solution

# Explicit, narrowly selected mutation: create only missing required hub labels.
npm run bootstrap -- --repo contoso/publish-solution --labels --apply

# Print field proposals only, even when combined with --apply --labels.
# Replace this example URL with the actual reviewed guide root.
npm run bootstrap -- --repo contoso/publish-solution --scaffold \
  --guide-url https://guide.example.org/publication \
  --target contoso/team-helper --app-id 12345
```

`--labels`, `--scaffold` and `--pages` select operations; without selections, only labels are previewed alongside diagnostics. **Nothing mutates without both `--apply` and `--labels` and/or `--pages`.** `--apply` alone (or with only `--scaffold`) is an error. Use `--help` for syntax.

| Operation | Hub-only token permissions / prerequisites |
| --- | --- |
| All invocations | Metadata read and Administration read for repository/Actions policy diagnostics; caller must have applicable repository access. No settings are enabled or widened. |
| Default / `--labels` preview | Issues read to enumerate labels, including pagination. |
| `--labels --apply` | Issues write; only five missing form/approval labels are created with the manual colors above. Manual setup specifies no descriptions, so none are invented; existing colors/descriptions and unrelated labels are untouched. |
| `--scaffold` | Only the common diagnostic reads; no variables/secrets permission or target credential is needed. |
| `--pages` preview | Pages read; Contents read and Actions read to verify a missing site's default-branch workflow. Existing sites are only read. |
| `--pages --apply` | Pages write plus the reads above, verified hub administrator access, public repository, enabled Actions, active manual-only Pages workflow, applicable org/plan approval, and explicit public acknowledgment below. Never grant organization administration just for this script. |

The scaffolding output is a **review proposal, not an applied configuration or an overwrite-ready patch**: policy fields, issue-chooser guide links, hub URL, and App variable values. Existing allowlist entries and other policy fields are preserved in the proposal; additional `--target owner/name` entries are **not approved or saved**. `--app-owner` defaults to the hub owner; all proposed targets must belong to that one installation owner. The App repository-name variable is derived from the exact proposed list, never a wildcard. `--app-id` is optional and otherwise remains a manual placeholder. Keep the empty default allowlist until actual approval.

Manually adapt the proposal into a protected PR and review customer hub/source links throughout HTML/Markdown, CODEOWNERS, branch filters and policy. The script **never writes local files**, so it cannot overwrite dirty/custom files, nor does it create commits or PRs. It never sets Actions variables, uploads secrets, creates/installs an App, authorizes targets, changes protections/team access/security licensing/enterprise policy, enables Issues/Actions, widens token permissions, provisions cloud resources, or dispatches a deployment. App installation scope, organization approval, secret storage and rotation stay in [section 2](#2-choose-target-authentication).

Output uses `PLANNED`, `APPLIED`, `UNCHANGED`, `BLOCKED`, `MANUAL`, then a count summary. A fresh-hub label preview normally shows five `PLANNED` entries and `APPLIED=0`; an apply rerun shows existing labels as `UNCHANGED`. After selected operations it reuses **static preflight** against the current checkout, not the proposal; an empty allowlist is a clearly reported manual intake blocker, not a reason to auto-approve targets. Successful apply verifies labels/site existence with read-only requests. Exit 0 means the selected bootstrap operations completed/previewed, **not** that the installation or workload is ready. Requested API/prerequisite/authorization failures, failed verification and partial mutations exit nonzero; earlier `APPLIED` entries remain, with no rollback/deletion. Inspect the cause, rerun preview, then narrowly reapply. Concurrent existing labels/sites are preserved; label reruns and upstream upgrades create only missing required labels and never reconcile custom metadata.

403/404 may mean hidden access or policy, not absence. The script stops on diagnostic authorization failures rather than reporting success. Check hub-only token permissions, account/organization approvals, trusted checkout and destinations; do not broaden target credentials to repair hub bootstrap. Pages 404 is treated as ambiguous until the conservative prerequisites below are verified. Static verification cannot validate live secret values, installation scope, target write access, organization/environment variable inheritance, or workload readiness. Use read-only live preflight and the separate authorized synthetic pilot when appropriate. **No live bootstrap pilot is claimed by the fixture-backed tests.**

The publication form now also requires a solution description (purpose and AI behavior), requested go-live date (`YYYY-MM-DD`), target environment (`dev`, `test`, `prod`), and three attestations. These are recorded **only in the source issue**, not parsed, copied into generated issues, used in tiering, or included in the plan fingerprint. Existing structured intake/risk fields and choices remain unchanged, and legacy requests remain compatible. Maintainers must check the metadata, real calendar date, and attestations before processing and approval: GitHub's form UI requirements do not validate later edits or direct API submissions. Dev/test never lowers the tier; a requested deadline never overrides review.

### Lifecycle review process

| Form / label | Governance action |
| --- | --- |
| Change or re-assessment / `reassessment-request` | Verify and cross-link the original request and same target repository; remove its readiness/approval while review is pending. Reopen the original if needed, update its structured risk answers and record the change, then comment `/publish` **on the original**. Automation re-tiers, reuses existing parent/controls, and creates only missing applicable controls; changed scope reopens required existing controls for fresh evidence. Complete controls, `/validate`, and obtain fresh human approval; record the result in the reassessment issue. A different target requires a new publication request. |
| Control exception / `control-exception` | Verify the catalog control ID, affected issue, justification, compensating controls/evidence, real expiry date, and risk owner's authority. Assign a reviewer, record explicit approval/rejection and conditions, link the decision to the original/control issue, and arrange expiry review. The daily lifecycle sweep comments on tracked open or closed records that are due (within seven days), expired, or incomplete; it does not infer approval, renew, close controls, or bypass FAIL/UNKNOWN. |
| Decommission / `decommission-request` | Obtain business/technical/data/platform/governance decisions before destructive actions; verify communications, resource/access retirement, credential revocation, billing, retention/legal holds, and disposal evidence. Operators execute the approved work manually. Remove original readiness/approval, record retirement, and close the original to stop scheduled validation, preserving audit history. |

An authorized hub collaborator opening, editing, or reopening a reassessment form automatically clears `ready-for-review` and `approved-for-production` on the verified same-hub original publication request and adds a visible linkage comment. The request issue is never used to create a second plan. Governance must still update and rerun `/publish` on the original. Do not run `/publish` or `/validate` on lifecycle forms. Closing one does not itself approve a change, accept risk, or verify retirement. Follow the full [rendered lifecycle runbooks](https://beardofedu.github.io/publish-solution/requests.html); update that URL in your own instance.

## 2. Choose target authentication

`GITHUB_TOKEN` is used **only for the governance repository**. Provide a separate credential for the solution repositories. Choose **one** of the following modes.

### Recommended: GitHub App

Create an organization-controlled GitHub App, disable unnecessary webhook subscriptions, and install it on **selected solution repositories only**. Use these repository permissions:

| Permission | Access | Used for |
| --- | --- | --- |
| Metadata | Read (implicit) | Repository identity, default branch |
| Issues | Read and write | List/create/update issues, native sub-issue relationships |
| Contents | Read | CODEOWNERS, SECURITY.md, tree and workflow inspection |
| Administration | Read | Security settings, Dependabot enablement, branch protection/rules |
| Code scanning alerts | Read | Code scanning analyses |

No target Actions write, Contents write, deployment, or cloud credentials are needed. The current validator checks Dependabot enablement with `GET /repos/{owner}/{repo}/vulnerability-alerts`, which requires **Administration read**, not a separate Dependabot alerts read grant; it does not list dependency alerts. See the [App endpoint permission mapping](https://docs.github.com/en/enterprise-cloud@latest/rest/authentication/permissions-required-for-github-apps). Permission labels may differ between App and fine-grained PAT UIs. Verify access against current REST documentation and organizational policy.

Configure these **Actions variables** in the hub:

| Variable | Value |
| --- | --- |
| `SOLUTION_APP_ID` | The App ID |
| `SOLUTION_APP_OWNER` | Installation owner (organization or account); defaults to hub owner |
| `SOLUTION_APP_REPOSITORIES` | Comma-separated repository names without owner, e.g. `team-helper,expense-helper` |

Configure this **Actions secret**:

| Secret | Value |
| --- | --- |
| `SOLUTION_APP_PRIVATE_KEY` | The App's PEM private key |

The bundled workflows use `actions/create-github-app-token` to mint a short-lived installation token and revoke it in the action's post step. Before token creation, a local guard requires `SOLUTION_APP_REPOSITORIES` to exactly match the reviewed allowlist under one installation owner; it rejects blank, duplicated, prefixed, missing, or extra names. This list does not replace the App installation selection; the App installation, token list, and policy allowlist must all match.

### Safe configuration preflight

From the trusted governance checkout, run `npm run preflight` for static checks. It requires no credentials and performs no network calls or writes. It reports an empty/invalid allowlist, invalid target names, targets matching the hub, out-of-allowlist targets, and what cannot be inspected without live access.

Optional `npm run preflight -- --live` performs read-only GitHub API requests. Set `GITHUB_REPOSITORY=owner/hub`, `HUB_TOKEN` with approved read access to the hub Actions variables/secrets metadata, and optionally `SOLUTION_TOKEN` for selected-target repository/issue reads. Add `--target owner/name` to select a target; targets not explicitly allowlisted are never queried. It checks that configured variable/secret *names* are visible and that App repository names exactly match the allowlist under the configured owner. It never prints secret/token values, proves that a secret is valid, proves target issue-write access, or fully verifies Administration/code-scanning feature permissions. GitHub does not return secret plaintext through these reads. Treat hidden names, 403/404, and unknown product features as unresolved; use an authorized pilot for actual permissions. Neither preflight mode creates an App, credential, label, setting or cloud resource; the separately selected optional bootstrap does not change preflight's read-only contract.

One workflow token addresses **one installation owner**. For multiple organizations, run separate governance instances or extend token routing with an explicit, reviewed per-owner mapping. Do not try to use a token from one installation for another.

### Alternative: fine-grained personal access token

Create a fine-grained PAT with:

- The correct resource owner and **only selected solution repositories**.
- The repository permissions from the table above.
- An organization-approved expiry, rotation owner, and approval/SSO process where applicable.

Store it in hub Actions secret **`SOLUTION_REPO_TOKEN`**. Leave `SOLUTION_APP_ID` **unset**; a configured App takes precedence, and an invalid App setup should be repaired rather than silently falling back to a PAT.

The PAT's user must actually have the relevant access; requested token permissions cannot grant permissions the user lacks. Avoid classic broad `repo` tokens.

### API/product prerequisites

Secret scanning, push protection, code scanning, dependency review, protected environments, and other capabilities vary by repository visibility, plan, security-product licensing, language, organization policy, and token permissions. A 403/404 is not proof of safety. The gate reports unavailable checks as UNKNOWN and does not claim compliance.

Native sub-issues are attempted via `POST /repos/{owner}/{repo}/issues/{parent}/sub_issues` with `sub_issue_id` set to the child's numeric database ID. A 403/404/410/422 uses a visible task-list fallback; other errors stop the run. The validation gate derives required issues from the trusted catalog, not the rendered task-list checkboxes.

## 3. Configure policy and links

Edit `config/policy.yml`:

```yaml
allowed_repositories:
  - your-org/team-helper
  - your-org/expense-helper
guide_url: https://your-org.github.io/your-governance-repo
requester_permissions: [admin, maintain, write]
scan_max_age_days: 30
```

The empty default allowlist intentionally rejects all targets. Match each target in both the allowlist and the App installation/PAT selection. Targets must differ from the hub, be active, and have Issues enabled.

Customize `config/tiers.yml` and `controls/*.yml` with your governance owners. Update the URLs in the issue form config and HTML pages when copying the repository. See [CUSTOMIZING.md](CUSTOMIZING.md).

## 4. Optionally enable Pages

Pages is not required for issue generation. If it is not approved, disable **Publish guide** and keep its push trigger removed in your adopted copy; use an approved authenticated documentation host and set `guide_url` accordingly. Before publishing internal content, complete the [Pages audience/access prerequisites](enterprise-setup/05-pages-copilot.md).

For an approved **public** hub only, the optional bootstrap can create a missing workflow-based Pages configuration:

```sh
npm run bootstrap -- --repo contoso/publish-solution --pages
# Only after public audience/content and applicable organization/plan approval:
npm run bootstrap -- --repo contoso/publish-solution --pages --apply --acknowledge-public-pages
```

The acknowledgment means the site will be publicly accessible; it is separate from `--apply`. Private/internal repositories are **always manual** in this first version, even with acknowledgment. Existing Pages source/publication/access settings are never changed, even if they differ from the bundled workflow. For a missing public site, the script requires verified hub admin access, enabled Actions, `has_pages=false`, and an active `.github/workflows/pages.yml` on the remote default branch whose **only** trigger is `workflow_dispatch`. Remove automatic triggers through review first; the stock push-triggered workflow is intentionally refused. Permissions or applicable policy/plan refusals are blockers, not reasons to enable paid features or bypass policy. No workflow is dispatched and no deployment/access/privacy is verified by creation alone. Recheck Settings, environment protections, content and audience before a separate manual deployment.

For the fully manual path, in **Settings → Pages → Build and deployment**, choose **GitHub Actions** and explicitly configure the approved visibility before publishing. Alternatively, an authorized maintainer can configure workflow-based Pages after the same review:

```sh
gh api --method POST repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
# For an existing site ONLY after explicit source-change approval (bootstrap never does this):
gh api --method PUT repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
```

Push a docs change to `main` or manually run **Publish guide**. The site publishes `docs/` as plain HTML/CSS. Review the `github-pages` environment configuration. Do not assume a private repository's Pages site is private; confirm plan and access-control settings before publishing confidential content.

## 5. Pilot the full flow

Use a disposable solution repository you own and synthetic intake data. The local fixture-backed cross-repository tests are repeatable with `npm test`; the separately described **live pilot is opt-in and customer-executed only**. It was not run as part of this toolkit change.

1. Allowlist the target and configure credentials with the exact repository scope.
2. Submit the form. As a hub maintainer, comment `/publish` if automatic intake was not authorized.
3. Rerun `/publish` unchanged. Confirm one parent and one issue per applicable control.
4. Change runtime AI or exposure and rerun. Required issues must reopen and new controls must appear; changing the target repository requires a new request.
5. Complete controls with evidence and close them **as completed**. `/validate` should report gaps until all required controls and checks pass.
6. Confirm that a missing permission, stale scan, or truncated tree produces a gap, not readiness.
7. Have an independent reviewer inspect evidence and apply `approved-for-production` manually. Confirm actual release approvals live in protected deployment environments.

Both workflows share a concurrency group to serialize mutations. Do not cancel a running intake. If a run fails after some issues were created, rerun `/publish`: markers recover partial creation without duplicate issues. Do not delete generated markers or the bot's state comment. A changed intake/catalog reopens required controls for fresh evidence; historical controls no longer applicable are retained for audit.

## 6. Onboard each additional solution repository

Repeat all three scope updates for every new target: add it to the App installation's selected repositories (or the approved PAT's selection), add its name to hub variable `SOLUTION_APP_REPOSITORIES` in App mode, and add its exact `owner/name` to `config/policy.yml` through review. Preserve existing targets in both lists. Confirm active state, Issues, owners, visibility and access, then open a new synthetic request and repeat the pilot. No target toolkit workflow or copied hub secret is needed. For detailed UI paths and maintenance/disablement, see [onboarding](https://beardofedu.github.io/publish-solution/setup.html#onboard) and [operations](https://beardofedu.github.io/publish-solution/setup.html#operate).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Form has no automation | Create `publication-request` label, confirm workflows exist on the default branch, and use an authorized maintainer |
| Unauthorized preflight | Ask a hub collaborator with the configured role to comment `/publish` or `/validate`; do not widen access for arbitrary public requesters |
| Token missing | Configure App variables/key or PAT secret; organization secret policy must include this hub |
| Repository not allowlisted | Review and add its exact owner/name in a pull request |
| 403 / 404 | Check App installation/PAT selection, user access, organization approvals, feature availability, and token permissions |
| No native sub-issues | Inspect the fallback note; the parent task list and independent validation still work |
| Controls closed but not ready | Close as completed (not duplicate/not planned), inspect automated FAIL/UNKNOWN checks, and verify the current catalog/intake basis |
| Scan exists but fails gate | The latest 100 analyses must include a successful, recent analysis at the exact current default-branch commit |
| Non-Azure OIDC | The stock detector is Azure-specific; implement and test an approved equivalent or record a separate human decision |
| State missing / duplicate markers | Investigate target issues and bot state before retrying; do not hide duplicates by closing them |
| Approved label removed | Intake changes, a changed default-branch commit, failed validation, or detected gaps invalidate the old advisory decision; review again |

Readiness is point-in-time. The daily schedule processes **open** labeled requests and may be delayed by GitHub. Keep requests open while monitoring readiness. API/network failures fail the workflow and remove advisory approval where possible; an outage can prevent even label updates, so production must never trust labels as its sole gate.

## References

- [GitHub App installation tokens in Actions](https://github.com/actions/create-github-app-token)
- [Fine-grained PAT management](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Sub-issues REST API](https://docs.github.com/en/rest/issues/sub-issues)
- [Branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection)
- [Repository rules REST API](https://docs.github.com/en/rest/repos/rules)
- [Code scanning REST API](https://docs.github.com/en/rest/code-scanning/code-scanning)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
