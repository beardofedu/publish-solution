# Set up a governance instance

For the ordered, role-based administrator journey, use the **[rendered enterprise installation walkthrough](https://beardofedu.github.io/publish-solution/setup.html)** ([local source](docs/setup.html)). It covers customer-controlled adoption, exact UI paths, per-repository onboarding and the first synthetic pilot. Use the existing [enterprise readiness runbook](enterprise-setup/README.md) and its sign-off record for policy and workload launch evidence; this file is the configuration reference.

**Toolkit installation is not workload deployment.** The hub creates issues in selected solution repositories without installing a toolkit workflow there. No Azure resources, cloud credentials or Copilot seat are required for issue generation. An installation pilot can succeed while `/validate` correctly reports workload readiness gaps, including the stock Azure OIDC pattern check.

## 1. Prepare a repository

Adopt a reviewed independent Git copy into a repository managed by the governance team; retain the license and record the upstream commit/update owner. Use private visibility if intake metadata is confidential, or internal only when enterprise-wide read access is acceptable. A public fork stays public and cannot independently change visibility; respect enterprise fork restrictions. Follow the walkthrough's bootstrap sequence to keep Actions/Pages from running before configuration review.

The bundled workflows target GitHub.com, Node.js 22+, and the repository's trusted default branch. `ghe.com` and GHES need implemented, tested host-specific adaptations, not just an API URL change; see [deployment boundaries](enterprise-setup/README.md#deployment-scope-and-documentation-currency). If your default branch is not `main`, update `ci.yml`, `pages.yml`, and `onboarding.yml`.

Enable Issues and Actions. Publication/validation jobs request `contents: read` and `issues: write`; only the hub-side onboarding job additionally requests `contents: write` and `pull-requests: write`. Protect the default branch and review changes to workflows, scripts, dependencies, controls, and policy. Never run target-repository code under the governance credentials.

Create these labels before using the form, either with the [optional bootstrap](#optional-preview-first-bootstrap) or these fully manual commands (no force/overwrite):

```sh
gh label create publication-request --repo YOUR-ORG/YOUR-HUB --color 0969da
gh label create approved-for-production --repo YOUR-ORG/YOUR-HUB --color 1a7f37
gh label create reassessment-request --repo YOUR-ORG/YOUR-HUB --color 8250df
gh label create control-exception --repo YOUR-ORG/YOUR-HUB --color bf8700
gh label create decommission-request --repo YOUR-ORG/YOUR-HUB --color 57606a
gh label create onboarding-pending --repo YOUR-ORG/YOUR-HUB --color bf8700
```

Risk and readiness labels are created by the toolkit. Existing labels are preserved. Non-collaborators may submit a form, but only hub collaborators with `write`, `maintain`, or `admin` permission may start cross-repository processing. An automatic run from a non-collaborator will fail preflight; a maintainer should review the request and comment `/publish`.

Keep existing labels when upgrading; create only missing labels. Assign governance triage for `reassessment-request`, `control-exception`, and `decommission-request`. These are **manual** forms and must not also have `publication-request`: automation on a separate request number would create a separate publication plan. No App/PAT permission, secret, variable, or environment names change.

The [optional bootstrap reference](#optional-preview-first-bootstrap) provides a missing-label preview and explicitly selected apply options. Manual installation remains supported.

### Lifecycle review process

| Form / label | Governance action |
| --- | --- |
| Change or re-assessment / `reassessment-request` | Review the same target's changed scope on the **original** publication request. Rerun `/publish`; manually reopen affected controls for metadata-only changes. Refresh evidence, `/validate`, and obtain a new human decision. [Full procedure](https://beardofedu.github.io/publish-solution/requests.html#reassessment). |
| Control exception / `control-exception` | Record the control, risk owner, evidence, decision, conditions, and real expiry. Daily reminders cover due (within seven days), expired, or incomplete tracked records, open or closed. They never approve, renew, or bypass FAIL/UNKNOWN. [Full procedure](https://beardofedu.github.io/publish-solution/requests.html#exceptions). |
| Decommission / `decommission-request` | Obtain owner approvals before manual retirement. Verify disposal/access evidence, remove advisory approval, and close the original to stop validation; preserve audit history. [Full procedure](https://beardofedu.github.io/publish-solution/requests.html#decommission). |

Authorized reassessment events clear advisory labels on the verified same-hub original request and add a linkage comment. They do not create a second plan. Run `/publish` and `/validate` only on the original publication request, never lifecycle forms. Closing a lifecycle request is not approval or proof of retirement.

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

Also leave Workflows write, Administration write, Secret scanning alerts, Secrets, Members, and organization administration ungranted. The validator reads secret-scanning settings, not alert contents. Verify restricted `security_and_analysis` fields with the actual installation token: HTTP 200 with missing fields is UNKNOWN, not PASS. Never escalate to Administration write without reviewed endpoint-specific justification.

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

The bundled workflows use `actions/create-github-app-token` to mint a short-lived installation token and revoke it in the action's post step. Before that token is created, the scope guard requires `SOLUTION_APP_REPOSITORIES` to exactly match the reviewed allowlist under one installation owner; blank, duplicated, prefixed, missing, or extra names fail closed. In Actions, the guard also uses the existing App key to inspect that owner's active installation: **Only select repositories** is required, and its entire repository set must exactly match policy. To detect grants hidden by a narrowed token, it briefly creates an installation-wide **Metadata read-only** token, lists repositories, and revokes it in a `finally` block. It grants no access and performs no target writes. API uncertainty or revocation failure blocks publication; abruptly cancelled runners may leave this read-only token until expiry.

### Safe configuration preflight

Run preflight from the trusted governance checkout. Both modes are read-only: no App, credential, label, setting, or cloud resource is created.

| Mode | Inputs and coverage | Limits |
| --- | --- | --- |
| `npm run preflight` | No credentials/network. Checks allowlist validity, target names, hub/target separation, and target authorization. | Cannot inspect live access. |
| `npm run preflight -- --live` | `GITHUB_REPOSITORY=owner/hub`; approved `HUB_TOKEN` reads repository-scoped Actions variable/secret names; optional `SOLUTION_TOKEN` reads selected-target metadata/issues. `--target owner/name` selects an allowlisted target; others are never queried. Checks App owner/list parity with policy. | No secret values printed or returned. Does not prove secret validity, target writes, full Administration/code-scanning permissions, or org/environment inheritance. |

Hidden names, 403/404, and unknown features remain unresolved. Use the authorized [pilot](#5-pilot-the-full-flow) to prove actual permissions; optional bootstrap does not change preflight's read-only contract.

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

### Onboard each new repository

The default `onboarding_prs: false` keeps PR preparation manual. To opt in for App mode, review `onboarding_prs: true` and `onboarding_installation_id: 123` into `config/policy.yml`; replace `123` with the numeric ID from the intended App installation's **Configure URL**, not the App ID. This creates a direct settings link without giving the hub-side job App credentials. Enable **hub Settings > Actions > General > Workflow permissions > Allow GitHub Actions to create and approve pull requests**, if organization policy permits. This setting permits creation; the code never approves or merges PRs. Optional live preflight reports the setting when visible, otherwise marks it unknown.

An authorized publication request (or maintainer `/publish`) for a non-allowlisted target gets an `onboarding-pending` label and an explanatory comment before any target token is minted. With opt-in enabled, the hub `GITHUB_TOKEN` creates one review PR per exact repository, preserving existing allowlist entries and linking each request. Repeats/edits link the same open PR. A closed previous PR or diverged recovery branch needs maintainer reconciliation, not an automatic duplicate. Only the configured installation owner is accepted. No admin/PAT credential is added.

The admin reviews owner, visibility, active state and scope, follows the PR's installation-settings link to add the repo under **Only select repositories**, updates `SOLUTION_APP_REPOSITORIES` (names only, preserving existing targets), then reviews and merges the policy PR. Coordinate this change window: installation/variable changes before merge deliberately block existing runs until all three sets agree.

**CI caveat:** PRs created by `GITHUB_TOKEN` do not trigger `pull_request` workflows. After reviewing the PR head, a maintainer uses **Actions > Toolkit checks > Run workflow**, selecting the exact `onboard/...` branch listed in the PR checklist. This read-only CI workflow supports manual dispatch and receives no App key/target token. Local alternative: run `npm ci --ignore-scripts`, `npm test`, `npm run check`, and `actionlint` on the PR head from an approved trusted checkout. Do not bypass required GitHub checks or add a privileged `pull_request_target` workflow to work around this limitation.

After a human merge to `main`, **Repository onboarding checks** reruns the exact App scope guard and the existing target-read diagnostics. It comments on open pending requests and clears `onboarding-pending` only on success. Scope/token/API failures stay blocked with a request comment; fix the cause and use **Actions > Repository onboarding checks > Run workflow** to retry after variable/installation-only changes. It never auto-publishes: an authorized requester or maintainer resumes with `/publish`. A successful `/publish` also clears a leftover pending label. Labels remain advisory; publication still rechecks policy, permissions and scope.

If PR creation is disabled, App mode is absent, or GitHub refuses PR creation (403/422), intake explicitly falls back to a comment-only manual review request. Other errors fail the run with a comment; resolve them before retrying. PAT-mode onboarding remains manual; the App-only post-merge check cannot prove PAT selection. Never give Actions a new admin credential to automate installation grants.

Customize `config/tiers.yml` and `controls/*.yml` with your governance owners. Update the URLs in the issue form config and HTML pages when copying the repository. See [CUSTOMIZING.md](CUSTOMIZING.md).

## 4. Optionally enable Pages

Pages is not required for issue generation. If it is not approved, disable **Publish guide** and keep its push trigger removed in your adopted copy; use an approved authenticated documentation host and set `guide_url` accordingly. Before publishing internal content, complete the [Pages audience/access prerequisites](enterprise-setup/05-pages-copilot.md).

For an approved **public** hub only, the optional bootstrap can create a missing workflow-based Pages configuration:

```sh
npm run bootstrap -- --repo contoso/publish-solution --pages
# Only after public audience/content and applicable organization/plan approval:
npm run bootstrap -- --repo contoso/publish-solution --pages --apply --acknowledge-public-pages
```

The acknowledgment accepts **public accessibility**, separately from `--apply`. Before creation:

- Confirm public GitHub.com hub, verified hub administrator access, enabled Actions, and `has_pages=false`. Private/internal repositories stay manual even with acknowledgment.
- Verify active `.github/workflows/pages.yml` on the remote default branch with **only `workflow_dispatch`**. Remove automatic triggers through review; the stock push trigger is refused.
- Approve content/audience, applicable organization/plan policy, and the [required token permissions](#bootstrap-permissions). Refusals block the operation, not justify paid features or policy bypass.
- Existing source/publication/access settings stay unchanged. Creation dispatches no workflow and proves neither deployment nor privacy. Recheck Settings and environment protections before separate deployment and audience testing.

For the fully manual path, in **Settings → Pages → Build and deployment**, choose **GitHub Actions** and explicitly configure the approved visibility before publishing. Alternatively, an authorized maintainer can configure workflow-based Pages after the same review:

```sh
gh api --method POST repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
# For an existing site ONLY after explicit source-change approval (bootstrap never does this):
gh api --method PUT repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
```

Push a docs change to `main` or manually run **Publish guide**. The site publishes `docs/` as plain HTML/CSS. Review the `github-pages` environment configuration. Do not assume a private repository's Pages site is private; confirm plan and access-control settings before publishing confidential content.

## 5. Pilot the full flow

Use a disposable solution repository and synthetic data. **The live pilot is opt-in and customer-executed**, with approved credentials and authorization. `npm test` uses fixtures, not live evidence.

Before processing and approval, check the source issue's description/AI behavior, real `YYYY-MM-DD` requested date, `dev`/`test`/`prod` environment, and three attestations. These human-review fields do not affect tiering, the plan fingerprint, or generated issues. Legacy/API-created or edited requests may omit them. Dev/test and deadlines never waive review; see [publication review](https://beardofedu.github.io/publish-solution/requests.html#publication).

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

## Optional preview-first bootstrap

From the **trusted adopted hub checkout**, use Node.js 22+ and `npm ci --ignore-scripts`. Bootstrap supports **GitHub.com only**, rejects alternate `GITHUB_API_URL`/`GITHUB_SERVER_URL` destinations, and never reads targets. Inject hub-only `HUB_TOKEN` through approved secure environment handling, never arguments, history, files, or logs. No solution credential is needed.

```sh
# Read-only diagnostics and missing-label preview; no local writes.
npm run bootstrap -- --repo contoso/publish-solution
# Create only missing required labels after review.
npm run bootstrap -- --repo contoso/publish-solution --labels --apply
# Print proposals only; replace the example guide URL.
npm run bootstrap -- --repo contoso/publish-solution --scaffold \
  --guide-url https://guide.example.org/publication \
  --target contoso/team-helper --app-id 12345
```

`--labels`, `--scaffold`, and `--pages` select operations; no selection previews labels alongside diagnostics. **Writes require `--apply` and `--labels` and/or `--pages`.** Apply alone or with only scaffolding is an error. Use `--help` for syntax.

### Bootstrap permissions

| Operation | Hub-only token permissions and authority |
| --- | --- |
| Every invocation | Metadata read and Administration read for repository/Actions diagnostics; applicable caller access. No settings enabled or widened. |
| Label preview | Issues read, including pagination. |
| `--labels --apply` | Issues write. Creates only the six missing form/approval/onboarding labels, using the manual colors and no descriptions. Existing labels and custom metadata stay unchanged. |
| `--scaffold` | Common diagnostic reads only; no variables/secrets or target permission. |
| `--pages` preview | Pages read; Contents and Actions read to verify a missing site's default-branch workflow. Existing sites are only read. |
| `--pages --apply` | Pages write **and repository Administration write**, plus the reads above and hub administrator role. The role does not replace token permissions; organization administration is unnecessary. All [public-site prerequisites](#4-optionally-enable-pages) must pass, including `--acknowledge-public-pages`. |

### Review the proposal

Scaffolding prints policy fields, issue-chooser links, hub URL, and App variables; it is **not approval, an applied configuration, or an overwrite-ready patch**.

- Existing policy/allowlist entries are preserved; proposed targets are not saved or authorized. Keep the default allowlist empty until approval.
- `--app-owner` defaults to the hub owner. All proposed targets must share one installation owner; the repository-name list is exact, never a wildcard. Omitted `--app-id` remains a placeholder.
- Incorporate approved changes through a protected PR. Review customer hub/source/guide links throughout HTML/Markdown, CODEOWNERS, branch filters, and policy.
- The script never writes local files, commits, or PRs; sets variables/secrets; creates/installs an App; changes target scope, protections, access, licensing, or enterprise policy; enables Issues/Actions; widens permissions; provisions cloud resources; or dispatches deployment. [Authentication and credential management](#2-choose-target-authentication) remain manual.

### Bootstrap results and recovery

| Result | Meaning / next action |
| --- | --- |
| `PLANNED`, `APPLIED`, `UNCHANGED`, `BLOCKED`, `MANUAL` | Per-operation status plus counts. A fresh label preview normally has six `PLANNED`, `APPLIED=0`. Reruns/upgrades create only missing labels; existing/concurrent labels/sites are preserved, not reconciled. |
| Final static preflight | Checks the **current checkout**, not proposals. An empty allowlist remains a manual intake blocker, never automatic approval. Successful apply also verifies label/site existence through reads. |
| Exit 0 | Selected operations completed or previewed, **not installation or workload readiness**. Static checks cannot prove secret validity, installation scope, target writes, or org/environment inheritance. Use [live preflight](#safe-configuration-preflight) and the separately authorized pilot. Fixtures are not live pilot evidence. |
| Nonzero / partial apply | Requested API, authorization, prerequisite, or verification failure. Earlier `APPLIED` changes remain; no rollback/deletion. Inspect the cause, rerun preview, then narrowly reapply. |
| 403/404 | Hidden access/policy may look like absence. Resolve hub-only permissions, approvals, checkout, and destinations; never broaden target credentials. Pages 404 stays ambiguous until every [public-site prerequisite](#4-optionally-enable-pages) is verified. |

## References

- [GitHub App installation tokens in Actions](https://github.com/actions/create-github-app-token)
- [Fine-grained PAT management](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Sub-issues REST API](https://docs.github.com/en/rest/issues/sub-issues)
- [Branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection)
- [Repository rules REST API](https://docs.github.com/en/rest/repos/rules)
- [Code scanning REST API](https://docs.github.com/en/rest/code-scanning/code-scanning)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
