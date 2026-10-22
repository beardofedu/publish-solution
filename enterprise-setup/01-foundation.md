# Gate 1: Foundation, hosting and enterprise policies

[Index](README.md) | Next: [Authentication](02-authentication.md)

**Accountable:** enterprise platform owner. **Sign-off:** enterprise owner and information security.

## 1. Name the people, scope and prerequisites

- [ ] Record the GitHub host, enterprise, intake organization, allowed solution organizations, exact deployed commit and (for GHES) version in [the sign-off record](sign-off.md).
- [ ] Confirm enterprise/org administration access is available through approved privileged access, with at least two named administrators and a recovery process. Do not give citizen developers enterprise admin.
- [ ] Identify the service owner, backup, support queue, governance team and security escalation contact. Agree response targets before opening intake.
- [ ] Define which data classifications may appear in request issues, evidence, workflow logs and the guide. Keep secrets, customer data and sensitive threat models in approved restricted systems; link to evidence rather than copying it.
- [ ] Confirm GitHub Actions capacity/budget, repository creation rights, network reachability and GitHub API access. Confirm security licenses and [gate 4 cloud foundations](04-azure.md) for the relevant workload-readiness scope; they are not prerequisites merely to generate issues in an installation pilot.
- [ ] Define the supported solution repository boundary. Initially use one organization and non-production repositories; additional organizations require their own access, installation and policy verification.
- [ ] Populate [config/policy.yml](../config/policy.yml) `allowed_repositories` with approved `owner/repository` entries before accepting requests; it starts empty intentionally. Review `requester_permissions` (stock: `admin`, `maintain`, `write`), `guide_url` and `scan_max_age_days` (stock: 30). Do not confuse repository authorization with App installation scope: both must permit the same target.
- [ ] Keep the intake hub distinct from solution targets. Targets must be active and have Issues enabled. Stock preflight requires the command actor to be an authorized **hub collaborator**, not merely a solution-repo writer; define how a maintainer reviews a citizen's request and comments `/publish` when automatic intake is denied.

### RACI

R = performs; A = one accountable owner; C = consulted; I = informed. Replace role names with teams and nominate one person for each A.

| Activity | Enterprise/org admin | Platform/service | Security | Governance/risk | Cloud/identity | Solution owner |
|---|---|---|---|---|---|---|
| Host, visibility and enterprise policies | A/R | R | C | C | C | I |
| App registration, installations and credential lifecycle | A | R | C | I | R | I |
| Security entitlement/configuration and alert response | C | R | A/R | C | I | R |
| Tier/control policy and exceptions | I | R | C | A/R | C | C |
| Landing zone, OIDC and runtime access | I | C | C | C | A/R | R |
| Production approval decision | I | I | C | A/R | C | R |
| Workflow support and upstream updates | C | A/R | C | I | C | I |
| Launch/rollback and continuity | C | A/R | C | C | C | I |

## 2. Create the internal intake repository

- [ ] Obtain legal/open-source approval for adoption, retain the upstream license and record the upstream URL and commit. Use a dedicated platform-owned org/repo, not a developer's personal account.
- [ ] Choose **private** when only selected teams may see requests, evidence and Actions logs. Choose **internal** only when enterprise-wide read access is acceptable; internal is not limited to the hosting organization.
- [ ] Prefer an independent template-generated copy or approved Git clone/push import into a newly created private/internal repository when adopting this **public** upstream. A public fork remains public; do not fork publicly, add internal material and expect to change the fork's visibility later.
- [ ] If a fork is explicitly required, confirm fork-network visibility and enterprise policy **before** creating it. Never put internal issues or credentials in a public fork.
- [ ] For `ghe.com` or GHES, use a supported migration or Git-based copy across hosts. Managed user accounts cannot fork repositories from outside their enterprise. Do not assume a cross-host fork or the GitHub.com **Import repository** button exists on `ghe.com`.
- [ ] Restrict repository visibility changes and deletion to approved administrators. Disable unnecessary features. Enable Issues and Actions, retain a supported default branch, and install the implementation files referenced in the [index](README.md).
- [ ] Document how upstream updates are reviewed and imported without pushing internal controls or history back to the public template.

Sources: [Setting repository visibility](https://docs.github.com/en/enterprise-cloud@latest/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility); [Fork visibility and managed-user restrictions](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/reference/forks); [GHE.com feature differences](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/feature-overview-for-github-enterprise-cloud-with-data-residency).

## 3. Approve enterprise and organization policies

Perform the enterprise review first: organization and repository settings cannot relax overriding enterprise policies.

| Policy | Ordered action and required evidence |
|---|---|
| Actions availability | Enable Actions for the intake hub after bootstrap review. Solution-repo Actions are needed only for the solution's own scanning/build/deployment workflows, not for hub issue generation. In enterprise/org **Actions > General**, approve the exact actions/reusable workflows referenced by the deployed workflows, including nested dependencies. An enterprise-only allow policy can block GitHub-authored `actions/*` too. |
| Allowed actions | Inventory each `uses:` reference in intake, validation, Pages, CodeQL and deployment workflows. Record owner, approved ref/SHA, source, network destination and update owner. Typical families include checkout, runtime setup, App-token creation, Pages/artifact actions, CodeQL and Azure Login; this is not a blanket allowlist. |
| SHA enforcement | If policy requires full-length SHA pins, update and review the adopted workflows accordingly before enabling them. Do not temporarily disable enterprise protection to make a pilot pass. |
| Workflow token | Use restrictive default `GITHUB_TOKEN` permissions and explicitly grant only job-required permissions. The repository token is not the general cross-repository credential. Avoid automatically granting Actions PR approval rights. |
| Runners | Approve GitHub-hosted runners where available or isolated, preferably ephemeral self-hosted runners. GHES needs supported self-hosted runner infrastructure and approved action distribution (GitHub Connect or reviewed mirrors). Match runner versions to action Node/runtime requirements. |
| Network | Test DNS, TLS/proxy trust and egress to the local GitHub API, action downloads, package sources and cloud login/deployment endpoints. Keep privileged runners separate from untrusted build workloads. |
| App installation | Require the organization's approved request/install process and an owner who can authorize installations/permission changes. Restrict App creation/installation as enterprise policy requires. Record each permitted owner org and selected repository set. |
| PAT alternative | If used, explicitly permit fine-grained PATs, require administrator approval where applicable and set a maximum lifetime. Enterprise restrictions win. Restrict classic PATs separately; fine-grained approval does not govern classic tokens. |
| Pages publication | Allow only the intended visibility; approve private project-site publication for Cloud before enabling its workflow. See [gate 5](05-pages-copilot.md). |

- [ ] Record policy screenshots/export links and runner/network evidence, without tokens or private keys.
- [ ] Review all issue/comment inputs as untrusted. Verify workflows never interpolate request text into executable shell, check out an untrusted solution branch and execute it with the App key, or accept arbitrary organizations/hosts beyond the approved boundary.
- [ ] On `ghe.com`, audit hard-coded `github.com`/`api.github.com` URLs, bot identity and URL validation in actions and scripts. Use the host's `github.server_url`, `github.api_url` and supported action inputs in the reviewed adaptation. A token issued on `ghe.com` does not authenticate GitHub.com resources. Stock workflows are supported on GitHub.com only.
- [ ] On GHES, verify sub-issue endpoints and all security endpoints against the installed version. The stock implementation has a visible task-list fallback for specific native sub-issue failures; prove its independent catalog-based validation and decide whether internal policy accepts it. Other unsupported required functionality needs an implemented, tested adaptation or a no-go decision, not a documentation-only waiver.

Sources: [Actions organization policy](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization); [App installation requests](https://docs.github.com/en/enterprise-cloud@latest/apps/using-github-apps/requesting-a-github-app-from-your-organization-owner); [PAT policies](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization); [GHE.com differences](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/feature-overview-for-github-enterprise-cloud-with-data-residency).

**Gate exit:** hosting/data audience, RACI, enterprise policy approvals and supported host scope recorded; enterprise owner and security approver sign gate 1.
