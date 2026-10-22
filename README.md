# publish-solution

**From “it works on my machine” to a human-reviewed cloud release.**

A public, adaptable toolkit for citizen developers turning AI-built prototypes into maintainable, secure solutions. An intake issue generates a risk-tiered publication plan **in the solution's own repository**, with actionable controls, evidence requirements, Copilot prompts, and a parent tracking issue.

**[Read the rendered guide](https://beardofedu.github.io/publish-solution/)** · [Set up your instance](SETUP.md) · [Customize controls](CUSTOMIZING.md)

Administrators: follow the **[enterprise installation walkthrough](https://beardofedu.github.io/publish-solution/setup.html)** from an empty customer-owned hub to a synthetic citizen-developer pilot, then use the existing [enterprise readiness runbook and sign-off](enterprise-setup/README.md) for broader launch decisions. Issue generation runs in the hub: no toolkit workflow in solution repositories, Azure resources or cloud credentials are needed just to create the plan.

## Choose a path

**Path A is the default:** prepare a reviewed readiness package, then hand deployment to the customer platform team and its independently protected release process. Optional **Path B** adds incomplete Azure deployment/IaC reference snippets; optional **Path C** documents a protected release integration design. Neither B nor C implements or activates deployment. See the [three-path chooser](https://beardofedu.github.io/publish-solution/paths.html).

## How it works

1. Open **Request publication** with the solution repository, owner team aliases, data classification, exposure, audience, runtime AI usage, integrations, and hosting.
2. A governance maintainer allowlists the exact target repository and authorizes intake with `/publish` (authorized collaborators' issue events also trigger it).
3. The toolkit derives **Low / Moderate / High**, creates a parent plus individual control issues, attempts native sub-issue links, and comments back with the plan. Reruns reuse stable markers; a task-list fallback covers unavailable sub-issue APIs.
4. Complete each required control with evidence and close it **as completed**. A maintainer comments `/validate` on the original request; daily checks also cover open requests.
5. A passing report applies `ready-for-review`. A **human governance reviewer** inspects evidence and applies `approved-for-production`. Actual deployments still require independent production-environment protection.

The publication form also collects a solution description (including AI behavior), a target go-live date, dev/test/prod environment, and required attestations. These stay in the source issue as human-review context; they do not change tiering or waive controls. Existing intake fields and legacy requests remain compatible.

## Choose the right request

| Form | Label | Process |
| --- | --- | --- |
| Request publication | `publication-request` | Automated plan generation after authorized maintainer review |
| Change or re-assessment | `reassessment-request` | Manual triage; update and rerun `/publish` on the **original** request to re-tier, reuse existing issues, and create only missing controls. Changed scope reopens required existing work for fresh evidence. |
| Control exception | `control-exception` | Manual, time-limited governance/risk-owner decision; never an automatic validation bypass |
| Decommission | `decommission-request` | Manual review and verified retirement; never automatic deletion or credential revocation |

[Open the issue chooser](https://github.com/beardofedu/publish-solution/issues/new/choose) or read the [lifecycle request guide](https://beardofedu.github.io/publish-solution/requests.html). Do not apply `publication-request` to the three manual forms; their own request numbers would create separate plans. See [SETUP.md](SETUP.md) for label setup and governance runbooks.

Highest matching tier wins: external exposure, regulated/personal/payment data, or privileged integrations are **High**. Confidential data, broad audiences, business-system writes, or runtime LLM use are **Moderate**. Otherwise the default is **Low**. The rules are configurable, not a universal risk model.

The generated validation report includes a handoff package with the current validation timestamp and default-branch commit, applicable control/evidence locations, automated status, unresolved gaps, and blank decision fields for named governance review and separate platform acceptance. Those decision fields are deliberately not filled by automation.

## Included

| Surface | Purpose |
| --- | --- |
| `.github/ISSUE_TEMPLATE/` | Structured intake with public-data warning |
| `.github/workflows/` | Intake, validation, daily sweep, CI, and Pages publication |
| `config/` | Exact target allowlist, trigger permissions, tier rules, and per-control role/dependency/evidence packages |
| `controls/*.yml` | 14 control definitions covering ownership, repo hygiene, secrets, dependencies, code scanning, identity, data, AI, delivery, runtime, operations, resilience, and independent review |
| `scripts/` | Node.js automation, read-only setup diagnostics, lifecycle reminders, API client, conservative detectors, catalog validation |
| `examples/` | Local-only reference app and a fully synthetic start-to-handoff walkthrough |
| `test/` | Unit and mocked cross-repository integration tests |
| `docs/` | Responsive, accessible static HTML guide; no build step or external assets |
| `action.yml` | Composite Action for using the toolkit from another governance repository |

The repository checks cover secret scanning/push protection settings, Dependabot alerts, recent default-head code scanning, branch approval requirements, CODEOWNERS, SECURITY.md, committed .env filenames, and an Azure OIDC workflow pattern. **Unavailable or ambiguous checks remain blocking UNKNOWNs**, never implicit passes.

## Start safely

The target allowlist starts **empty**. Configure a selected-repository **GitHub App** (recommended) or a **fine-grained PAT** using [SETUP.md](SETUP.md). The governance repository's `GITHUB_TOKEN` cannot normally write to another repository.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run preflight
```

Node.js 22+ is required. CI also runs `actionlint`.

`npm run preflight` is static and read-only; it needs no credentials. `npm run preflight -- --live` optionally inspects repository-scoped Actions variable/secret names and selected-target read access with `GITHUB_REPOSITORY`, `HUB_TOKEN`, and optionally `SOLUTION_TOKEN`; organization/environment-scoped values are not enumerated. It never prints token/secret values, writes resources, or claims a visible secret is valid. Bundled App workflows refuse to mint an installation token unless `SOLUTION_APP_REPOSITORIES` exactly matches the reviewed allowlist for its one installation owner.

**Do not submit secrets, customer-specific information, personal data, or sensitive architecture to this public repository.** Organizations should use a private governance instance for confidential intakes and review their Pages publishing visibility.

## Boundaries

This toolkit is **not a compliance certification, penetration test, cloud scanner, deployment engine, or authorization system**. Issue closure and labels are mutable advisory signals. Configuration checks cannot prove alert remediation, cloud trust, actual deployment, network isolation, data handling, or evidence quality. Daily validation can lag, and closed requests are not revalidated.

Daily lifecycle sweeps add due/expired/incomplete exception reminders but never renew exceptions or bypass FAIL/UNKNOWN checks. Opening or editing an authorized reassessment clears advisory labels on its linked original publication request; governance still updates that original request and reruns `/publish`.

Controls are cloud-agnostic; deployment guidance and the stock OIDC detector focus on Azure. For other clouds, implement a reviewed equivalent detector or record a separate governance decision without representing an automatic PASS. No customer-specific data or policies are included.

MIT licensed. See [SECURITY.md](SECURITY.md) for reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for changes.
