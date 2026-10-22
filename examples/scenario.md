# Synthetic start-to-handoff scenario

**Fixture only:** this scenario is simulated from a local mock, not an observed GitHub integration or live customer pilot. No issue, App installation, secret, Azure resource, or approval exists. Names and issue links below are illustrative.

## 1. Prototype to remediated sample

The prototype displayed user-submitted title/summary text directly in HTML. Before this example is presented, the sample was changed to reject empty/oversized fields and escape HTML metacharacters in `triage-helper/src/render.mjs`. The local tests prove only that narrow behavior; they do not claim general application security. Run `node --test test/example.test.mjs` from the repository root.

## 2. Synthetic intake

| Publication field | Fixture answer |
| --- | --- |
| Solution repository | `example/triage-helper` |
| Business owner | `demo-business-team` |
| Technical owner | `demo-platform-team` |
| Data classification | Internal |
| Exposure / audience | Internal / Small team |
| Runtime AI / integrations | No / None or read-only |
| Hosting / target environment | Other cloud / dev |
| Requested date | `2030-01-15` |
| Description | Static synthetic work-item renderer; no storage, model calls, or external services. |

Expected outcome under the stock rules: **Low**, with 11 control issues plus one parent tracking issue. Date, description, and environment are human context only; `dev` does not reduce risk. The target is a placeholder and is not allowlisted.

## 3. Representative generated work package and evidence

**Simulated issue:** `[Publication] Authenticate users and enforce least privilege`  
**Lead:** platform · **Contributors:** citizen, security · **Prerequisite:** ownership

- Steps, acceptance criteria, evidence checklist, and suggested prompts come from the catalog and `config/work-packages.yml`.
- **Acceptable evidence example:** a platform-reviewed authorization design and tests denying cross-user requests, linked to the reviewed commit.
- **Insufficient evidence example:** “internal URL” with no server-side authorization proof.
- **Example evidence comment:** “Mock only: local negative test `test/example.test.mjs` passed at fixture commit `DEMO_SHA`; no production identity exists.”

That comment is an example string, not a test result from GitHub or Azure.

## 4. Simulated validation and handoff

The mock integration can exercise stable markers, repeated `/publish`, changed-tier control reopening, missing permissions, UNKNOWN checks, and branch-head changes. Expected behaviors:

- An unchanged rerun reuses the one parent and applicable child issues.
- External exposure raises the tier and reopens applicable controls; it does not silently change the target repository.
- Missing API permissions or feature visibility yield UNKNOWN, never PASS.
- A default-branch change during checks yields FAIL and requires a new validation.
- Approval labels are not produced by validation.

An illustrative package would name the source request, target repository, tier, validation timestamp/commit, each control issue/evidence location, and current check results. Its governance decision and platform acceptance fields remain **PENDING** until real named humans review and record them. No synthetic PASS, reviewer, or platform acceptance is asserted here.

## 5. Customer-facing walkthrough and pilot checklist

1. Run the local test; inspect the final sample and its narrow limitations.
2. In a customer-owned disposable hub, complete static `npm run preflight`; review the empty allowlist and retain it until each target is approved.
3. For an explicitly authorized **live pilot only**, configure an isolated selected-repository App/PAT, target repository, and policy through the customer's change process; then run the test matrix in `enterprise-setup/07-pilot.md`.
4. Submit a synthetic publication request, verify the exact issue count and content, repeat unchanged, change one risk answer, and exercise a missing-permission/UNKNOWN path.
5. Have an independent governance reviewer inspect evidence and separately obtain platform acceptance. Exercise protected deployment/rollback only under the customer's own approval.
6. Record actual commit, run links, observed results, failures, reviewers, and limits in the customer's restricted sign-off record. An unexecuted row stays unverified.

This repository contains no credentials and this walkthrough does not execute the live pilot. The stock toolkit scope is GitHub.com; GHES and GHEC data-residency hosts need tested host-specific adaptation.
