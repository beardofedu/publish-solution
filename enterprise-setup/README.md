# Enterprise readiness: publish-solution

Use this runbook **before inviting citizen developers** to your enterprise's publication process. It is for the platform, governance, security, identity and cloud teams configuring an internal deployment, not for a developer requesting publication.

The toolkit coordinates evidence and review. It does not provision your enterprise policies, purchase security licenses, deploy Azure resources, or make an approval label a production access control.

## Complete these gates in order

Copy [the sign-off record](sign-off.md) into your internal change-management system or a restricted readiness issue. Replace every `<placeholder>`. Check a task only after attaching evidence. A blocked prerequisite blocks later gates; an exception needs a named risk owner, compensating control, expiry and retest.

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

The implementation's [SETUP.md](../SETUP.md) is authoritative for workflow input names and installation commands; [CUSTOMIZING.md](../CUSTOMIZING.md) for supported customization; [README.md](../README.md) and the [guide site](../docs/) for the user journey. Review the actual [workflows](../.github/workflows/), [scripts](../scripts/), [repository access policy](../config/policy.yml), [tier configuration](../config/tiers.yml), [control catalog](../controls/) and [request form](../.github/ISSUE_TEMPLATE/request-publication.yml) at the **same commit you deploy**.

This directory deliberately does not replace those files. Freeze the deployed commit in the sign-off record. If these linked files are absent from your checkout, install the toolkit implementation before executing this checklist; documentation alone is not a runnable deployment.

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
