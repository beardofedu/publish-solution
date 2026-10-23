# Customize the toolkit

Configuration is **trusted governance code**. Protect it with the same review requirements as the automation. Target repository code and intake fields are untrusted; do not execute them or interpolate them into shell commands.

## Tier rules

`config/tiers.yml` has a `default` tier and `rules`. Each rule has `tier` and `any`, a mapping of intake keys to accepted values. The highest matching tier wins regardless of file order. Valid tiers are `Low`, `Moderate`, and `High`.

```yaml
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

Each control ID also needs exactly one `config/work-packages.yml` entry: lead role (`citizen`, `platform`, `security`, or `data`), supporting roles, prerequisite IDs, evidence checklist, and sufficient/insufficient evidence examples. Dependencies must be acyclic. They link existing control issues, not new issues per checklist item. `npm run check`/`npm test` reject missing IDs, invalid roles, unknown dependencies, and cycles.

The **plan fingerprint** (called the state basis in code) hashes normalized risk answers, derived tier, applicable controls, and their work packages. A changed fingerprint requires `/publish`, reopens required issues, refreshes criteria, and clears advisory readiness/approval. Removed controls remain as audit issues but leave the required plan. Renamed IDs create new issues; never reuse IDs for unrelated requirements.

Validation creates a timestamped, commit-bound [handoff package](https://beardofedu.github.io/publish-solution/governance.html#handoff). Governance review and platform acceptance remain pending. Request edits and authorized reassessment invalidate the old report; exception dates never turn FAIL/UNKNOWN into PASS. Do not customize records to synthesize a successful review.

## Automated checks and exceptions

`scripts/checks.mjs` implements conservative configuration checks. Add a detector and tests when extending to another cloud. Every required detector must explicitly return PASS, FAIL, or UNKNOWN. Do not replace unsupported APIs with success-shaped defaults.

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
