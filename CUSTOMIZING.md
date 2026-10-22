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

The state basis hashes the normalized intake, derived tier, and applicable control definitions. A changed basis requires `/publish`, reopens required existing issues, posts refreshed criteria, and clears readiness/approval. Removing a control preserves old issues for audit but removes it from the current required plan. Renaming an ID creates a new control issue; do not reuse IDs for unrelated requirements.

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
