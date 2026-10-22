# Set up a governance instance

## 1. Prepare a repository

Copy/fork this toolkit into a repository managed by the governance team. Use private visibility if intake metadata is confidential. The bundled workflows target GitHub.com, Node.js 22+, and the repository's trusted default branch. If your default branch is not `main`, update `ci.yml` and `pages.yml`.

Enable Issues and Actions. Allow the workflow `GITHUB_TOKEN` to write issues; each workflow explicitly requests `contents: read` and `issues: write`. Protect the default branch and review changes to workflows, scripts, dependencies, controls, and policy. Never run target-repository code under the governance credentials.

Create these labels before using the form:

```sh
gh label create publication-request --repo YOUR-ORG/YOUR-HUB --color 0969da
gh label create approved-for-production --repo YOUR-ORG/YOUR-HUB --color 1a7f37
gh label create reassessment-request --repo YOUR-ORG/YOUR-HUB --color 8250df
gh label create control-exception --repo YOUR-ORG/YOUR-HUB --color bf8700
gh label create decommission-request --repo YOUR-ORG/YOUR-HUB --color 57606a
```

Risk and readiness labels are created by the toolkit. Existing labels are preserved. Non-collaborators may submit a form, but only hub collaborators with `write`, `maintain`, or `admin` permission may start cross-repository processing. An automatic run from a non-collaborator will fail preflight; a maintainer should review the request and comment `/publish`.

Keep existing labels when upgrading; create only the three missing lifecycle labels. Assign governance triage for `reassessment-request`, `control-exception`, and `decommission-request`. These are **manual** forms and must not also have `publication-request`: automation on a separate request number would create a separate publication plan. No App/PAT permission, secret, variable, or environment names change.

The publication form now also requires a solution description (purpose and AI behavior), requested go-live date (`YYYY-MM-DD`), target environment (`dev`, `test`, `prod`), and three attestations. These are recorded **only in the source issue**, not parsed, copied into generated issues, used in tiering, or included in the plan fingerprint. Existing structured intake/risk fields and choices remain unchanged, and legacy requests remain compatible. Maintainers must check the metadata, real calendar date, and attestations before processing and approval: GitHub's form UI requirements do not validate later edits or direct API submissions. Dev/test never lowers the tier; a requested deadline never overrides review.

### Lifecycle review process

| Form / label | Governance action |
| --- | --- |
| Change or re-assessment / `reassessment-request` | Verify and cross-link the original request and same target repository; remove its readiness/approval while review is pending. Reopen the original if needed, update its structured risk answers and record the change, then comment `/publish` **on the original**. Automation re-tiers, reuses existing parent/controls, and creates only missing applicable controls; changed scope reopens required existing controls for fresh evidence. Complete controls, `/validate`, and obtain fresh human approval; record the result in the reassessment issue. A different target requires a new publication request. |
| Control exception / `control-exception` | Verify the catalog control ID, affected issue, justification, compensating controls/evidence, real expiry date, and risk owner's authority. Assign a reviewer, record explicit approval/rejection and conditions, link the decision to the original/control issue, and arrange expiry review in your approved tracking system. No automatic waiver, reminders, renewal, closure of controls, or FAIL/UNKNOWN bypass occurs. |
| Decommission / `decommission-request` | Obtain business/technical/data/platform/governance decisions before destructive actions; verify communications, resource/access retirement, credential revocation, billing, retention/legal holds, and disposal evidence. Operators execute the approved work manually. Remove original readiness/approval, record retirement, and close the original to stop scheduled validation, preserving audit history. |

Opening a manual lifecycle form does not automatically clear original labels or change cloud resources. Do not run `/publish` or `/validate` on these forms. Closing one does not itself approve a change, accept risk, or verify retirement. Follow the full [rendered lifecycle runbooks](https://beardofedu.github.io/publish-solution/requests.html); update that URL in your own instance.

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
| Dependabot alerts | Read | Security metadata/related visibility |

No target Actions write, Contents write, deployment, or cloud credentials are needed. Permission labels may differ between App and fine-grained PAT UIs. Verify access against current REST documentation and organizational policy.

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

The bundled workflows use `actions/create-github-app-token` to mint a short-lived installation token and revoke it in the action's post step. List repository names explicitly to narrow token scope. If this variable is empty, the token action may select all repositories in that installation; prefer a selected-repository installation and an explicit list.

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

## 4. Enable Pages

In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Alternatively, an authorized maintainer can configure workflow-based Pages:

```sh
gh api --method POST repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
# For an existing Pages site:
gh api --method PUT repos/YOUR-ORG/YOUR-HUB/pages -f build_type=workflow
```

Push a docs change to `main` or manually run **Publish guide**. The site publishes `docs/` as plain HTML/CSS. Review the `github-pages` environment configuration. Do not assume a private repository's Pages site is private; confirm plan and access-control settings before publishing confidential content.

## 5. Pilot the full flow

Use a disposable solution repository you own and synthetic intake data:

1. Allowlist the target and configure credentials with the exact repository scope.
2. Submit the form. As a hub maintainer, comment `/publish` if automatic intake was not authorized.
3. Rerun `/publish` unchanged. Confirm one parent and one issue per applicable control.
4. Change runtime AI or exposure and rerun. Required issues must reopen and new controls must appear; changing the target repository requires a new request.
5. Complete controls with evidence and close them **as completed**. `/validate` should report gaps until all required controls and checks pass.
6. Confirm that a missing permission, stale scan, or truncated tree produces a gap, not readiness.
7. Have an independent reviewer inspect evidence and apply `approved-for-production` manually. Confirm actual release approvals live in protected deployment environments.

Both workflows share a concurrency group to serialize mutations. Do not cancel a running intake. If a run fails after some issues were created, rerun `/publish`: markers recover partial creation without duplicate issues. Do not delete generated markers or the bot's state comment. A changed intake/catalog reopens required controls for fresh evidence; historical controls no longer applicable are retained for audit.

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
| Approved label removed | Intake changes, failed validation, or detected gaps invalidate the old advisory decision; review again |

Readiness is point-in-time. The daily schedule processes **open** labeled requests and may be delayed by GitHub. Keep requests open while monitoring readiness. API/network failures fail the workflow and remove advisory approval where possible; an outage can prevent even label updates, so production must never trust labels as its sole gate.

## References

- [GitHub App installation tokens in Actions](https://github.com/actions/create-github-app-token)
- [Fine-grained PAT management](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Sub-issues REST API](https://docs.github.com/en/rest/issues/sub-issues)
- [Branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection)
- [Repository rules REST API](https://docs.github.com/en/rest/repos/rules)
- [Code scanning REST API](https://docs.github.com/en/rest/code-scanning/code-scanning)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
