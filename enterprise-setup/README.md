# Enterprise readiness: publish-solution

Use this runbook **before inviting citizen developers** to your enterprise's publication process. It is for the platform, governance, security, identity and cloud teams configuring an internal deployment, not for a developer requesting publication.

The toolkit coordinates evidence and review. It does not provision your enterprise policies, purchase security licenses, deploy Azure resources, or make an approval label a production access control.

## Start with installation; sign off workload readiness separately

Follow the **[rendered installation walkthrough](https://beardofedu.github.io/publish-solution/setup.html#scope)** for UI steps, repository onboarding, and operations. Use this runbook for evidence and approvals, not a second installation procedure.

An **installation pilot** proves issue generation and repeatable reruns, not workload readiness. It needs hub Actions, target access/Issues, credentials, and policy; no target toolkit workflow, Azure resources/credentials, or Copilot seat. Validation must report honest gaps.

The [optional bootstrap reference](../SETUP.md#optional-preview-first-bootstrap) covers hub-only previews, explicit apply permissions, and public-only Pages creation. Manual installation remains supported. Preflight is read-only; fixture tests are not live evidence.

**Path A is the default:** evidence handoff to independent platform deployment. Paths B/C are reference-only. The stock deployment-identity check (Azure by default; AWS or Google Cloud via `config/checks.yml`) still blocks workload readiness until satisfied, reconfigured, or replaced by a reviewed, tested detector; a separate risk decision never produces an automated PASS.

## Complete these gates in order

Choose a scope in [the sign-off record](sign-off.md#review-scope) before checking gates. Copy it into a restricted internal record; replace placeholders and attach evidence. A blocked prerequisite blocks dependent work. Exceptions need a named risk owner, compensating control, expiry, and retest; unexecuted tests stay unverified.

| Scope | Applicable evidence |
|---|---|
| Installation-only | Gate 1 hub hosting/policies; gate 2 issue-generation credentials; gate 3 protection of trusted hub code; gate 5 guide audience if hosting is selected; gate 6 intake operations; gate 7 installation tests. Record exact subsections and test assertions, not blanket gate passes. |
| Workload/service launch | All seven gates for the approved workload/host/auth scope, including solution security, cloud deployment, and separate human approvals. Pages is optional with an approved alternative; Copilot policy applies when Copilot is used. |

Gate 4/cloud tests are not installation prerequisites. Their workload status remains **unverified**, not passed or waived, after an installation-only pilot.

| Gate | Owner accountable for completion | Instructions | Exit evidence |
|---|---|---|---|
| 1. Establish ownership and hosting | Enterprise platform owner | [Foundation and policies](01-foundation.md) | RACI, approved host/visibility, Actions and installation policies |
| 2. Establish cross-repository identity | Identity/platform owner | [App or PAT authentication](02-authentication.md) | Approved permissions, selected installations, secret inventory, rotation test |
| 3. Establish security and review controls | Security and governance owners | [Security and governance](03-security-governance.md) | Licensed/enabled solution repos, policy mapping, enforced reviews |
| 4. Establish deployment foundations | Cloud platform owner | [Azure readiness](04-azure.md) | Landing-zone assignment, scoped OIDC trust, runtime identity and guardrails |
| 5. Publish guidance and approve AI use | Platform and AI governance owners | [Pages and Copilot](05-pages-copilot.md) | Audience/access test and approved Copilot policy |
| 6. Establish operations | Service owner | [Operations](06-operations.md) | Monitoring, audit evidence and incident/maintenance ownership |
| 7. Prove readiness and authorize launch | Service and risk owners | [Pilot and go-live](07-pilot.md) | Passing positive/negative tests and signed launch decision |

For a non-Azure deployment, replace gate 4 with the equivalent cloud platform evidence; do not silently mark identity, secrets or deployment guardrails out of scope.

## Read alongside the implementation

Use [SETUP.md](../SETUP.md#2-choose-target-authentication) for exact permissions/names, [CUSTOMIZING.md](../CUSTOMIZING.md#control-schema) for supported schema, and the [guide](https://beardofedu.github.io/publish-solution/) for the user journey. Review workflows, scripts, policy, catalog, and form at the **deployed commit** recorded in sign-off. Documentation alone is not an installation.

## Deployment scope and documentation currency

GitHub product details were checked against current GitHub documentation on **2026-10-22**. Cloud references use `enterprise-cloud@latest`; GHES references retrieved in this review resolve to **3.22**. That is the documentation baseline, **not** a claim that this toolkit supports every GHES version or has been certified on your appliance. Recheck your installed version's docs and execute the host-specific pilot.

| Deployment | Required decision before launch |
|---|---|
| GHEC on `github.com` | Approve org visibility, security entitlements, identity model and private Pages policy |
| GHEC with data residency on `<subdomain>.ghe.com` | Use local App registrations and API endpoints; test action dependencies, URL parsing, OIDC issuer, identity restrictions and regional requirements |
| GHES | Record exact version; prove issue/sub-issue API support, token permissions, security feature availability, runner/action compatibility, Pages exposure and cloud OIDC reachability |

**Stock toolkit scope is GitHub.com only.** The current client can accept a trusted `GITHUB_API_URL`, but that is not complete `ghe.com` or GHES support. The alternate-host instructions here are an administrator adaptation checklist, not permission to launch unmodified workflows there. Resolve bot identity, URL parsing, API/security/sub-issue features, actions and Pages differences, then execute the host-specific pilot before claiming support.

**Do not treat Cloud feature documentation as a GHES support guarantee.** A host-dependent endpoint returning 403/404, missing feature, or absent security data is a blocker to investigate, not a successful control check.

Source: [Feature overview for GHEC with data residency](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/feature-overview-for-github-enterprise-cloud-with-data-residency).
