# Enterprise readiness sign-off record

[Runbook index](README.md) | [Pilot criteria](07-pilot.md)

Copy this template to an **internal, appropriately restricted** issue or change record. Never fill it with secret values, private keys, access tokens or raw JWTs. Link to restricted evidence when this document is kept in a broader-audience repository.

## Review scope

Select **installation-only** or **workload/service launch**, then record exact gate subsections and pilot assertions. Use `Passed`, `Failed`, `Unverified`, or `Not applicable (reason)`. A partial gate is not a full pass; an unexecuted workload test stays **Unverified**.

| Scope field | Value |
|---|---|
| Review type | `<installation-only / workload-service launch>` |
| Applicable assertions / exclusions and reasons | `<gate subsections and Pxx I/W assertions>` |
| Installation outcome, if installation-only | `<accepted for issue generation / blocked; evidence and named approver/date>` |

Installation acceptance does **not** authorize workload go-live. Leave the workload final decision below **not evaluated** until its mandatory gates have evidence. See [scope guidance](README.md#complete-these-gates-in-order).

## Deployment identity

| Field | Value |
|---|---|
| Change/readiness record | `<internal link>` |
| Enterprise / organization / intake repository | `<names and URL>` |
| GitHub host / API base URL | `<host and API URL>` |
| Deployment type / GHES exact version if applicable | `<GHEC / GHEC data residency / GHES version>` |
| Identity model / data-residency region if applicable | `<EMU or personal accounts / region>` |
| Approved repository visibility and data classification | `<private/internal; classification>` |
| Toolkit implementation commit / catalog revision | `<immutable commit SHAs>` |
| Supported solution orgs/repos and rollout cohort | `<scope/link>` |
| Cross-repository auth method / App registration owner | `<App or approved PAT exception; owner>` |
| Installation IDs / selected-repo inventory | `<IDs or restricted link; no tokens>` |
| Credential inventory / next rotation / backup owner | `<restricted inventory link; dates; team>` |
| Security licenses/configuration and capacity owner | `<entitlements/configuration link; owner>` |
| Governance / security / platform / cloud teams | `<team slugs and contacts>` |
| Azure tenant/subscription/landing-zone evidence | `<restricted allocation link or approved alternative>` |
| Effective OIDC issuer / audience / subject evidence | `<non-secret values or restricted link; never JWT>` |
| Guide URL / publication visibility / audience test | `<URL; audience; evidence>` |
| Audit destination / retention / health alert | `<restricted link; policy; alert>` |
| Support queue / on-call / agreed response target | `<contact; schedule; SLA>` |
| Planned launch date / scope / rollback owner | `<date; scope; person>` |

## Ordered readiness checklist

Check a row only when **all applicable assertions** are evidenced. For partial installation scope, record tested subsections and unverified workload assertions in Evidence; do not check the full gate. Approvers record name, role, and date.

| Done | Gate | Evidence | Accountable owner | Approver(s) / date |
|---|---|---|---|---|
| [ ] | 1. RACI, hosting, visibility, enterprise/org policies, runners and supported host boundary | `<link>` | `<owner>` | `<enterprise + security; date>` |
| [ ] | 2. Least-privilege App/PAT, installation scope, exact names, credential storage/rotation | `<link>` | `<owner>` | `<org + security; date>` |
| [ ] | 3. Licensed/enabled security, reviewer access, rulesets, policy mapping and approval boundaries | `<link>` | `<owner>` | `<security + governance; date>` |
| [ ] | 4. Governed landing zone, scoped OIDC, protected deploy and runtime identity/Key Vault | `<link>` | `<owner>` | `<cloud + identity/security; date>` |
| [ ] | 5. Pages audience test and approved Copilot policies/training | `<link>` | `<owner>` | `<security + AI governance; date>` |
| [ ] | 6. Audit, monitoring, incident/rollback, maintenance and backup ownership | `<link>` | `<owner>` | `<service + SOC; date>` |
| [ ] | 7. Pilot positive/negative cases and all host/auth variants in launch scope | `<test matrix link>` | `<owner>` | `<platform + security + governance + cloud; date>` |

## Pilot evidence

Copy one row per applicable P01-P18 **assertion**, splitting I/W rows and each P06 prerequisite/host variant. List unexecuted workload assertions as Unverified; fixtures never count as live results.

| Test ID + I/W assertion / host / tier / auth | Expected result | Actual result | Run/issue/evidence URL | Tester / date | Passed / Failed / Unverified / Not applicable + reason |
|---|---|---|---|---|---|
| `<Pxx>` | `<expected>` | `<observed>` | `<link>` | `<name/date>` | `<status>` |

## Exceptions and residual risks

Use `None` explicitly when there are no exceptions. A required feature that cannot be validated does not become a passing check.

| Exception ID / failed gate or test | Risk / scope | Compensating control | Accountable risk approver / date | Expiry / remediation owner / retest |
|---|---|---|---|---|
| `<ID or None>` | `<risk>` | `<control>` | `<name/date>` | `<date/owner/test>` |

## Final decision

**Workload/service launch only.** For installation-only review, record `Not evaluated - installation-only` here and complete the installation outcome above. An accepted manual exception is a separate risk record, not a PASS for a failed/unknown automated check.

- [ ] **Go:** all mandatory gates are evidenced, scope is explicit, residual risks are accepted by the appropriate owner, and no no-go condition remains.
- [ ] **No-go:** rollout remains paused; blockers have owners and a retest date.

| Required sign-off | Name / role | Decision and evidence | Date |
|---|---|---|---|
| Enterprise/platform | `<name>` | `<approve/reject; link>` | `<date>` |
| Information security | `<name>` | `<approve/reject; link>` | `<date>` |
| Governance/risk | `<name>` | `<approve/reject; link>` | `<date>` |
| Cloud/identity | `<name>` | `<approve/reject; link>` | `<date>` |
| Service owner (launch authority) | `<name>` | `<Go/No-go; authorized scope>` | `<date>` |

Next readiness review: `<date>`. Reassess after material host, permission, policy/catalog, OIDC, deployment or ownership changes.
