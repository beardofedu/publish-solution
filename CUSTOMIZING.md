# Customize the toolkit

Configuration is **trusted governance code**. Protect it with the same review requirements as the automation. Target repository code and intake fields are untrusted; do not execute them or interpolate them into shell commands.

## Tier rules

`config/tiers.yml` has optional `levels`, a `default` tier, and `rules`. `levels` lists tier names from lowest to highest risk (stock: `Low`, `Moderate`, `High`). Each rule has `tier` and `any`, a mapping of intake keys to accepted values. The highest matching tier, by position in `levels`, wins regardless of file order.

```yaml
levels: [Low, Moderate, High]
default: Low
rules:
  - tier: High
    any:
      exposure: [External]
      data: [PII, PHI, PCI, Regulated]
      integrations: [Privileged]
  - tier: Moderate
    any:
      data: [Confidential]
      audience: [Organization-wide, Public]
      integrations: [Business-system writes]
      ai: [Yes]
```

### Rename or add tiers

Tier names are 1-10 unique capitalized words (letters, digits, single spaces), for example `levels: [Low, Moderate, High, Business Critical]`. Every level needs at least one unconditional control: add the new name to the `tiers` list of the relevant `controls/*.yml` files and, where needed, to `tiers` in `config/checks.yml`. The hub applies one `risk:<name>` label per request, lowercased with spaces as hyphens (`risk:business-critical`).

Renaming or reordering tiers changes the plan fingerprint for affected requests, so maintainers must rerun `/publish`. Labels for removed tier names are not cleaned up automatically; remove them from open requests manually.

Intake keys/choices live in `scripts/model.mjs` and the issue form. Change them together and update tests, guides, and rules. Invalid or missing intake values fail rather than defaulting to a lower risk.

Description, requested date, environment, and attestations are **not** parsed risk keys. They remain in the source issue, do not change the tier or plan fingerprint, and are not copied to generated issues. Governance checks completeness, dates, and attestations manually, including API-created or edited issues. Dev/test does not lower risk. See [publication review](https://beardofedu.github.io/publish-solution/requests.html#publication).

Lifecycle forms never create publication plans. Their distinct labels route human review; do not add `publication-request` or create a second marker namespace for the same plan. Authorized reassessment events clear advisory labels on the linked original request; scheduled lifecycle checks add exception reminders.

Governance updates the **original** request and reruns `/publish`. Stable markers reuse existing issues; changed parsed risk answers or applicable control definitions reopen required controls. Metadata-only changes may require **manual reopening** for new evidence. See [reassessment](https://beardofedu.github.io/publish-solution/requests.html#reassessment) and the [lifecycle runbooks](https://beardofedu.github.io/publish-solution/requests.html#exceptions). Exceptions never bypass checks; retirement is manual.

## Control schema

Add one YAML file per control in `controls/`:

```yaml
id: service-inventory
title: Register the service
tiers: [Low, Moderate, High]
guide: controls.html#service-inventory
why: An approved inventory makes the service discoverable and accountable.
steps:
  - Record the service in your approved inventory.
acceptance:
  - The inventory link and owner confirmation are recorded.
prompts:
  - Draft a service inventory entry and mark missing owner decisions.
```

IDs must be unique lowercase kebab-case and cannot be `parent`. The optional `when: { ai: Yes }` limits a control to runtime AI usage. Other conditions are not currently supported and fail catalog validation. Each control needs at least one valid tier, step, acceptance criterion, and Copilot prompt.

Add a matching rendered guide anchor. `npm run check` checks catalog integrity, YAML, and relative HTML links/anchors. Run `npm test` after any policy/logic change.

Each control ID also needs exactly one `config/work-packages.yml` entry: lead role and supporting roles (IDs from `config/roles.yml`), prerequisite IDs, evidence checklist, and sufficient/insufficient evidence examples. Dependencies must be acyclic. They link existing control issues, not new issues per checklist item. `npm run check`/`npm test` reject missing IDs, invalid roles, unknown dependencies, and cycles.

The **plan fingerprint** (called the state basis in code) hashes normalized risk answers, derived tier, applicable controls, and their work packages. A changed fingerprint requires `/publish`, reopens required issues, refreshes criteria, and clears advisory readiness/approval. Removed controls remain as audit issues but leave the required plan. Renamed IDs create new issues; never reuse IDs for unrelated requirements.

Validation creates a timestamped, commit-bound [handoff package](https://beardofedu.github.io/publish-solution/governance.html#handoff). Governance review and platform acceptance remain pending. Request edits and authorized reassessment invalidate the old report; exception dates never turn FAIL/UNKNOWN into PASS. Do not customize records to synthesize a successful review.

## Roles

`config/roles.yml` defines the accountable roles that work packages reference. Generated control issues show the display name and ID, for example **Lead:** Platform engineering (`platform`).

```yaml
roles:
  citizen: { name: Citizen developer }
  platform: { name: Cloud Center of Excellence }
  security: { name: Application security }
  data: { name: Privacy office }
  architecture:
    name: Enterprise architecture
    description: Reviews integration and hosting patterns.
```

Role IDs are lowercase kebab-case; `name` is required and `description` is optional. Every `owner_role` and `supporting_roles` value in `config/work-packages.yml` must exist here; `npm run check` rejects unknown roles. Renaming a role ID changes affected work packages and the plan fingerprint, so rerun `/publish`. Changing only a display name updates future issue text without reopening controls. If the file is absent, the four stock roles above are used.

## Automated checks and exceptions

`config/checks.yml` turns each stock detector on or off, limits it to specific tiers, and selects which cloud OIDC patterns the deployment check accepts:

```yaml
checks:
  code-scanning: { tiers: [Moderate, High] }
  env-files: { enabled: false }
  deployment-oidc:
    providers: [aws, gcp]   # any of azure, aws, gcp; default [azure]
```

| Check ID | Automated signal |
| --- | --- |
| `secret-scanning` | Secret scanning and push protection enabled |
| `dependabot-alerts` | Dependabot alerts enabled |
| `code-scanning` | Recent successful analysis at the default-branch head |
| `branch-reviews` | Pull request approval required on the default branch |
| `codeowners` | Substantive CODEOWNERS file |
| `security-policy` | Substantive SECURITY.md file |
| `env-files` | No committed non-template `.env` filenames |
| `deployment-oidc` | OIDC login (Azure `azure/login`, AWS `aws-actions/configure-aws-credentials` with `role-to-assume`, or Google Cloud `google-github-actions/auth` with `workload_identity_provider`) and `id-token: write`, without static keys |

Omitted checks stay enabled for every tier, and unknown IDs or tiers fail validation. The commit-binding *Default-branch validation basis* check always runs. A disabled or out-of-tier check is never reported as PASS: the validation report and handoff package list it as **NOT RUN**, and governance decides whether manual evidence covers it. Treat changes to this file as a risk decision that needs reviewed approval.

`scripts/checks.mjs` implements the conservative detectors. Add a detector and tests when extending to a cloud or signal not covered above. Every required detector must explicitly return PASS, FAIL, or UNKNOWN. Do not replace unsupported APIs with success-shaped defaults.

The stock gate has no automatic exception override. Equivalent controls and accepted risk belong in an explicit governance record; they do not magically satisfy unavailable checks. It is reasonable to customize the detector set through a reviewed code change with documented scope, evidence, and tests.

## Use the composite GitHub Action

The root `action.yml` exposes `mode`, `hub-token`, `solution-token`, and `config-path`. Call it from a **trusted governance workflow**, not from a solution repository workflow handling untrusted code. It reads the current workflow's `GITHUB_REPOSITORY`, event file, and event type.

```yaml
permissions:
  contents: read
  issues: write
concurrency:
  group: publish-solution-mutations
  cancel-in-progress: false
jobs:
  publication:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@REVIEWED_FULL_COMMIT_SHA
        with:
          ref: ${{ github.event.repository.default_branch }}
          persist-credentials: false
      # Mint a selected-repository App token after authorizing the actor.
      # Or pass a selected-repository fine-grained PAT as shown below.
      - uses: beardofedu/publish-solution@REVIEWED_FULL_COMMIT_SHA
        with:
          mode: intake
          hub-token: ${{ github.token }}
          solution-token: ${{ secrets.SOLUTION_REPO_TOKEN }}
          config-path: ${{ github.workspace }}
```

Replace placeholders with reviewed full commit SHAs. Supply `controls/` and `config/` in the trusted checkout. Use the bundled `intake.yml` and `validate.yml` as the full event-filtering/authentication examples. The Action accepts only supported issue events for intake/validation and schedule/workflow_dispatch for sweeps; it rechecks hub collaborator permissions and the target allowlist. For immediate advisory-label invalidation on untrusted intake edits, also retain the bundled preflight step or an equivalent trusted implementation.

Serialize **all** intake and validation workflows for a hub with the same concurrency group. The API does not provide an atomic “create if marker absent”; independent callers without serialization can race. GitHub concurrency may replace a pending run during bursts; rerun a missing `/publish` command. Do not use multiple hubs with the same marker namespace or edit generated bot state manually.

## Local execution

Tests use a mock API and never require credentials. Real CLI runs mutate GitHub:

```sh
# Set HUB_TOKEN and SOLUTION_TOKEN through an approved secret mechanism.
# Never put literal credentials in shell history.
GITHUB_REPOSITORY=your-org/governance \
GITHUB_EVENT_NAME=issue_comment \
GITHUB_EVENT_PATH=/absolute/path/to/sanitized-event.json \
node scripts/run.mjs intake
```

The event must represent an open labeled publication issue, an exact `/publish` comment with `action: created`, and an authorized `sender.login`. Validation uses `/validate`. The trusted default workflows always obtain live issue state before processing. Direct manual callers must preserve the same trust and serialization boundaries.
