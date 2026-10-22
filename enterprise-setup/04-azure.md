# Gate 4: Azure deployment foundations

[Index](README.md) | Previous: [Security and governance](03-security-governance.md) | Next: [Pages and Copilot](05-pages-copilot.md)

**Accountable:** cloud platform owner. **Sign-off:** cloud identity administrator and security.

Azure is the worked example, not a dependency of the intake service itself. Perform these tasks in the **solution's deployment boundary**. The GitHub App used to create issues must not become an Azure deployment identity.

## 1. Allocate a governed landing zone

- [ ] Assign subscription, management group, resource group(s), region, network/DNS, budget, cost owner and separate non-production/production boundaries. Use the enterprise's approved landing-zone vending process.
- [ ] Confirm required resource providers, quotas and platform service availability. Define who provisions infrastructure and who operates the app.
- [ ] Apply Azure Policy/guardrails for approved regions/SKUs, identity, tagging, encryption, transport security, diagnostics and network/public-endpoint restrictions. Record approved exceptions and expiry.
- [ ] Establish private-endpoint/network reachability for deployment runners and runtime dependencies. A successful public login does not prove a runner can reach a private Key Vault or app endpoint.
- [ ] Define monitoring, incident response, backup/restore, retention and deletion requirements for the workload. Test with a sandbox before production.

Source: [Deploy Azure landing zones](https://learn.microsoft.com/en-us/azure/architecture/landing-zones/landing-zone-deploy).

## 2. Create a scoped OIDC deployment identity

1. Obtain Entra administrator approval and register an application with a service principal for the workload/environment. Record tenant ID, application/client ID and service-principal object ID distinctly. A user-assigned managed identity with federation is an alternative when approved.
2. Assign the narrow deployment role at the required resource-group/resource scope. Do not default to subscription Owner, directory-wide permissions or role-assignment rights. Provision privileged IAM changes separately.
3. Add a federated identity credential with the **exact** GitHub issuer, subject and audience used by the protected deployment job. Use `api://AzureADTokenExchange` for the normal Azure Login audience unless the approved cloud/action configuration requires otherwise.
4. Configure the solution workflow's exact Azure input secret/variable names. Standard examples use `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`; these identifiers are not an Azure client password. Match whether the workflow reads `secrets` or `vars`; do not create an unused variable.
5. Set `permissions: contents: read` and `id-token: write` on the deployment job as needed and use a reviewed/pinned Azure Login action. OIDC permission lets the job request a token; Azure RBAC still controls resource access.
6. Bind the job to the intended protected GitHub environment. Require approved reviewers, prevent self-review where required and supported, restrict deployment branches/tags and decide whether administrator bypass is allowed. Separate sandbox and production identities/trusts.
7. Prove token exchange and an authorized sandbox action. Test rejection from the wrong repository, branch/environment and unauthorized PR context. Inspect only necessary non-secret claim metadata; never print the bearer JWT or Azure access token in logs.

### Do not copy an outdated subject or the wrong host's issuer

| Host | Issuer baseline to verify |
|---|---|
| GitHub.com | `https://token.actions.githubusercontent.com` |
| Data residency | `https://token.actions.<subdomain>.ghe.com` |
| GHES | Use the issuer/discovery values documented by the installed appliance/version and verify Entra can reach its discovery/JWKS endpoints; do not reuse the Cloud issuer |

An enterprise may customize its issuer or subject. Record **effective values**, not just the baseline above.

Current Cloud docs describe immutable subject claims for repositories created after **2026-07-15**, and for renames/transfers after that date; older repositories may use the earlier format unless opted in. GHES does not support that immutable format in the referenced documentation. For example, a branch subject may be:

```text
Earlier name-based example:
repo:ORG/REPO:ref:refs/heads/main

Immutable example (replace both names AND numeric IDs):
repo:ORG@123456/REPO@456789:ref:refs/heads/main
```

When a job uses an environment, its default subject context is the environment rather than the branch (for example, the earlier form `repo:ORG/REPO:environment:production`). Obtain the actual effective subject, including immutable IDs, encoding and any custom claim template, before creating federation. An environment-based subject alone does not restrict branches; enforce branch rules on the environment. Recheck trusts after repository/environment renames, transfers and OIDC policy changes.

Sources: [GitHub OIDC in Azure](https://docs.github.com/en/enterprise-cloud@latest/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure); [OIDC reference: claims, immutable subjects and GHE.com substitutions](https://docs.github.com/en/enterprise-cloud@latest/actions/reference/security/oidc); [Microsoft: authenticate from GitHub Actions with OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect).

## 3. Separate runtime identity and secrets

- [ ] Enable a managed identity for the app runtime on supported Azure services. Give it only its own downstream data-plane permissions, separately from the deployment service principal.
- [ ] Provision Key Vault under the approved network/security baseline, with an assigned owner, recovery controls, diagnostic logs and rotation process. Use Azure RBAC with least-privilege data-plane roles, not broad administrative roles just to read secrets.
- [ ] Keep application secrets in Key Vault and retrieve them with the runtime managed identity. Do not commit `.env`, embed keys in images, or copy production secrets to issue evidence, the guide or Actions artifacts.
- [ ] Test positive and negative Key Vault access as the **runtime identity**. A deployer being able to read a secret is not proof the app can, and should not be required by default.
- [ ] Record inventory and rotation for external service credentials that cannot use managed identity.

A vault-backed **sign-only** App key design is stronger than an exportable Actions PEM, but it requires a supported signing integration. The standard App-token action cannot automatically use a non-exportable Key Vault key merely because a vault exists. Treat this as a separately designed change, not an undocumented prerequisite.

Sources: [Managed identities overview](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview); [Key Vault RBAC](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide); [GitHub App private-key storage](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).

**Gate exit:** cloud allocation, scoped federation, protected deployment and runtime identity access are demonstrated; no long-lived Azure client secret is needed for the approved OIDC path.
