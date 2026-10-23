# Gate 2: Cross-repository authentication and repository configuration

[Index](README.md) | Previous: [Foundation](01-foundation.md) | Next: [Security and governance](03-security-governance.md)

**Accountable:** identity/platform owner. **Sign-off:** organization owner and security.

## 1. Use a GitHub App by default

The intake repo's `GITHUB_TOKEN` is scoped to that repository. Use the implementation's App installation-token flow for the solution repo. Installation tokens are short-lived; the **App private key is not**. Anyone who can change a privileged workflow may be able to exfiltrate its credential; protect those files before storing credentials.

- [ ] On the **target host**, open the owning organization's **Settings > Developer settings > GitHub Apps > New GitHub App** (wording varies by host/version). Use an organization-owned identity, service name and internal support/homepage URL.
- [ ] Use an automation-only registration: no OAuth user authorization or callback is needed merely to mint installation tokens. Disable an unused webhook; do not invent a webhook service for workflows triggered by native issue/comment events.
- [ ] Select installation availability deliberately. An org-only/private App is appropriate for one org. Stock workflows mint the target token for **one** `SOLUTION_APP_OWNER`. If solution repos span organizations, obtain separate installation approvals and implement/test a supported per-owner routing design or use separately configured intake deployments. Changing App distribution alone does not add multi-org token routing.
- [ ] Configure repository permissions as below and leave unneeded organization/account permissions and event subscriptions off. Reconcile against [SETUP.md](../SETUP.md) and the deployed [scripts](../scripts/) before accepting this gate.

### Repository permission review

Review the [canonical target permission matrix](../SETUP.md#recommended-github-app) against the deployed endpoints. Record each grant, reason, approver, and actual-token evidence. Extra permissions require endpoint-specific security approval, not a broad write role. Azure deployment uses a **different identity**, never this App.

The repository REST API restricts visibility of `security_and_analysis`. Test with the **actual installation token**, not an admin's interactive `gh` session. If required fields are omitted, capture the endpoint/permission failure and stop readiness; a 200 response alone does not prove visibility. Do not escalate to Administration write without a reviewed endpoint-specific justification.

Sources: [Registering a GitHub App](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/registering-a-github-app/registering-a-github-app); [App endpoint permissions](https://docs.github.com/en/enterprise-cloud@latest/rest/authentication/permissions-required-for-github-apps); [Repository API and security metadata](https://docs.github.com/en/enterprise-cloud@latest/rest/repos/repos).

## 2. Install and store credentials

- [ ] Install the App on **selected solution repositories** under `SOLUTION_APP_OWNER`. The stock hub workflow uses its own `GITHUB_TOKEN` for intake issues, so the App does not need intake access; the hub cannot also be a solution target. Record installation IDs, owner orgs and repository selections, not tokens.
- [ ] Prove a selected pilot repo is accessible and an unselected repo is denied. Repeat when onboarding a new org; review new requested App permissions before approving installation updates.
- [ ] Generate an App private key. Save the PEM only in approved secure storage and the GitHub Actions secret consumed by the implementation; never commit it, paste it into issues, or include it in a screenshot.
- [ ] Configure the [exact App variables/key](../SETUP.md#recommended-github-app) in the hub. Record the App ID (not installation/client ID), installation owner, and repository **names only**, without `owner/`. Installation selection, token list, and policy allowlist must match.
- [ ] Verify empty, missing, or extra repository names fail before token creation. Do not rely on the token action's broader empty-list behavior.
- [ ] Verify installation-wide parity, including an extra selected repo and an "All repositories" installation. The Actions guard uses the existing App key to mint/revoke a temporary Metadata read-only token for full enumeration before minting the scoped publication token. API uncertainty/revocation failure blocks processing; no installation access is granted.
- [ ] If opting in to `onboarding_prs: true`, approve the hub-only job's `contents: write`, `issues: write`, `pull-requests: write` and the Actions PR-creation setting. No PR approval/merge or admin/PAT credential is added. Keep installation grants human; follow [new-repository onboarding](../SETUP.md#onboard-each-new-repository).
- [ ] Prefer a repository secret in the intake repo, or a selected-repository organization secret restricted to intake. Do not distribute the App key to solution repos.
- [ ] Confirm the workflow references the credential's actual scope. An environment secret is unavailable unless the job targets that environment; adding environment approval can also intentionally pause automated intake.
- [ ] Disable/remove the unused PAT alternative so an unexpected auth fallback cannot hide a broken App setup.

### Rotation and compromise

1. Schedule rotation under internal credential policy; GitHub App private keys do not expire automatically.
2. Generate a replacement key while the current key remains valid. Update the secret, run intake and validation on the pilot, and retain the evidence.
3. Revoke/delete the old key after successful cutover; confirm no other service still needs it. Remove temporary local PEM files using approved secure handling.
4. On suspected compromise, suspend the App/affected installations and disable privileged workflows as needed, revoke compromised keys and active installation tokens where supported, investigate access and issue mutations, replace credentials and retest before reopening intake. Deleting a key alone is not a reason to assume all previously minted tokens are gone.

Source: [Managing App private keys](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).

## 3. PAT alternative: approved exception only

- [ ] Record why an App is unavailable, the exception owner, expiry and App migration date.
- [ ] Create a **fine-grained** PAT on the target host under an approved organizational identity with a lifecycle owner. Select one resource-owner organization, only required repositories, an explicit short expiry and the reviewed repository permissions above. Its effective access is also constrained by the user's access: verify that user's role permits required security metadata without unnecessarily making them an organization owner.
- [ ] Complete organization approval before testing; a pending token cannot be treated as ready. Verify enterprise/org lifetime restrictions, membership and applicable SSO access.
- [ ] Store it as intake Actions secret `SOLUTION_REPO_TOKEN` and leave `SOLUTION_APP_ID` **unset** to select the PAT path. Remove unused App credentials from the pilot deployment rather than leaving stale configuration alongside the PAT.
- [ ] Test expiry, revocation and offboarding handling. Track renewal ahead of expiry and arrange a backup administrator.
- [ ] Do not substitute a classic PAT to bypass fine-grained approval or unsupported endpoints. Reassess the design and host compatibility instead.

**Risks to accept explicitly:** user/offboarding dependency, copied long-lived bearer secret, overly broad repository selections, manual expiry/renewal, and access changes when the user changes roles. A fine-grained PAT has one resource owner; multi-org operation requires a supported credential design, not simply checking more repositories.

Sources: [PAT behavior and limitations](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens); [Fine-grained PAT endpoint permissions](https://docs.github.com/en/enterprise-cloud@latest/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens); [Organization PAT approval/lifetime policy](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization).

## 4. Complete the configuration inventory

Use [SETUP.md](../SETUP.md#recommended-github-app) as the naming contract and verify actual workflow expressions. The inventory below records evidence, not a second configuration procedure.

| Kind | Exact name from deployed workflow/config | Scope | Owner | Evidence / rotation or review date |
|---|---|---|---|---|
| App identifier variable | `SOLUTION_APP_ID` | Intake Actions variable | `<owner>` | `<link/date>` |
| App owner variable | `SOLUTION_APP_OWNER` | Intake Actions variable; default is hub repo owner | `<owner>` | `<target org/link>` |
| App repository selection variable | `SOLUTION_APP_REPOSITORIES` | Intake Actions variable; names without owner | `<owner>` | `<selection evidence>` |
| App PEM secret | `SOLUTION_APP_PRIVATE_KEY` | Intake Actions secret or selected-repo org secret | `<owner>` | `<link/date>` |
| PAT secret, if exception approved | `SOLUTION_REPO_TOKEN` | Intake Actions secret; App ID unset | `<owner>` | `<expiry/exception or not configured>` |
| Repository/requester boundary | `allowed_repositories`, `requester_permissions` | `config/policy.yml` | `<owner>` | `<reviewed PR>` |
| Onboarding PR opt-in/settings link | `onboarding_prs` (default `false`), `onboarding_installation_id` (required when enabled; from Configure URL) | `config/policy.yml`; hub Actions PR-creation setting | `<owner>` | `<reviewed PR/setting evidence>` |
| Guide/scan freshness policy | `guide_url`, `scan_max_age_days` | `config/policy.yml`; stock freshness 30 days | `<owner>` | `<reviewed PR>` |
| Request/tier/status labels | `publication-request`, `risk:low`, `risk:moderate`, `risk:high`, `ready-for-review`, `approved-for-production` | Intake repository; reconcile against scripts | `<owner>` | `<label inventory>` |
| Pages environment | `github-pages` | Intake repository | `<owner>` | `<protection evidence>` |
| Production deployment environment | `production` in Azure example; consumer-configured | Solution repository; not created by intake | `<owner>` | `<protection evidence>` |
| Azure IDs, if consumed | `<exact workflow names>` | `<solution environment secrets/variables as implemented>` | `<cloud owner>` | `<link>` |

- [ ] Confirm required labels exist or the documented automation creates them. Do not rename `ready-for-review` or `approved-for-production` without updating every producer, consumer and guide.
- [ ] Before exposing the form, verify the [six required labels](../SETUP.md#1-prepare-a-repository), including advisory `onboarding-pending`, exist; automation creates risk/readiness labels. Review CI/Pages/onboarding branch filters if the default branch is not `main`.
- [ ] Do not create a target control-label taxonomy expecting the stock automation to consume it: target control issue IDs use idempotency markers, not generated control labels. Preserve those markers.
- [ ] Verify environment names, reviewer teams, deployment branch restrictions and secret references exactly match workflows. The intake/validation jobs should not accidentally depend on the `github-pages` environment or Azure production credentials.
- [ ] Record workflow-token permissions separately from App permissions: configuring one does not configure the other.

Stock runtime environment names `HUB_TOKEN` and `SOLUTION_TOKEN` are **not additional repository secrets**: the workflows map `HUB_TOKEN` from the hub `GITHUB_TOKEN` and `SOLUTION_TOKEN` from the selected App/PAT path. Publication/validation use `contents: read`, `issues: write`; only hub-side onboarding additionally uses `contents: write`, `pull-requests: write` to propose policy PRs. That job receives no App key or target token. Keep the authority boundaries separate.

For local bootstrap, `HUB_TOKEN` instead uses approved hub-only secure environment injection, not a new Actions secret; no `SOLUTION_TOKEN` is used. Follow the [bootstrap permission/proposal reference](../SETUP.md#bootstrap-permissions). Proposals never authorize targets or upload credentials; approved edits and installation scope remain manual.

**Gate exit:** least-privilege auth works across the approved boundary, rejected access is demonstrated, names match the pinned implementation, and credential lifecycle is assigned.
