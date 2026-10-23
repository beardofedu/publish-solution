# Gate 7: Pilot, dry run and go-live

[Index](README.md) | Previous: [Operations](06-operations.md) | Final: [Sign-off record](sign-off.md)

**Accountable:** service owner. **Sign-off:** platform, security, governance and cloud owners.

Use disposable **selected, non-production** solution repositories with the intended private/internal visibility. Do not use real credentials or sensitive data as test fixtures. Run tests as an ordinary citizen developer, governance reviewer and the actual workflow identity, not solely as an enterprise administrator.

For **installation-only**, follow the [rendered walkthrough](https://beardofedu.github.io/publish-solution/setup.html#pilot) and the I assertions below. No target toolkit workflow or Azure resources/credentials are needed. Record partial rows explicitly; unexecuted workload assertions stay unverified. Installation acceptance is not workload go-live approval.

## Reproducible local fixture

Run `npm ci --ignore-scripts`, `npm test`, `npm run check`, and `npm run preflight`. `test/publish.test.mjs` uses the real catalog with a mock GitHub API for reruns/recovery, authorization, allowlist, evidence, gaps, and labels. The [synthetic scenario](../examples/scenario.md) and [sample app](../examples/triage-helper/) support practice, not live evidence.

The live pilot is **opt-in and customer-executed**: require authorization, a disposable hub/target, narrowly scoped credentials, and an independent observer. Fixtures do not create live resources or prove a pilot pass.

## 1. Prepare the test record

- [ ] Select [review scope](README.md#complete-these-gates-in-order), complete its applicable gate 1-6 assertions, and freeze the implementation/catalog commit.
- [ ] Record host/version, auth method, installed repository set, policy/security configuration, expected label names and run links. Use [SETUP.md](../SETUP.md) and [scripts/](../scripts/) for exact triggers and output.
- [ ] Select known input combinations yielding each tier under [config/tiers.yml](../config/tiers.yml). Record the expected control IDs/count for each before running intake.
- [ ] Record a test owner, observer and expected result for every row below. Attach the actual result; an unexecuted test is not a pass.

## 2. Execute the acceptance matrix

**I** = installation assertion; **W** = workload/launch assertion. An I/W row must record each tested assertion separately. Attach actual run/issue URLs, observer, and result in [sign-off](sign-off.md#pilot-evidence), rather than treating the whole row as passed.

| ID / scope | Test action | Expected result |
|---|---|---|
| P01 · I | Submit Low, Moderate, High forms; obtain maintainer `/publish` authorization | Exact tier/control set in **solution** repo, correct links/labels; native sub-issues or accepted visible fallback |
| P02 · I | Repeat unchanged `/publish`, including partial-run recovery; edit task checkboxes | Same issues/evidence; missing work resumes; checkboxes cannot bypass validation |
| P03 · I | Issue two supported reruns together | No duplicates; visible, recoverable failure |
| P03a · I | Opt in to onboarding PRs; submit/repeat/edit authorized requests for one new repo, then another request for the same repo | One hub PR, preserved allowlist, linked requests, pending comment/label, no target writes; untrusted/non-command-capable actors and foreign owners cannot trigger it |
| P03b · I | Disable PR creation or deny it via Actions policy; close a prior PR or diverge a recovery branch | Explicit manual/comment-only path or blocking reconciliation report, never duplicate PRs or new admin credentials |
| P03c · I | Test extra/missing App grants, variable mismatch, All repositories, API denial, then reconcile and human-merge policy | Mismatches fail closed and remain pending; PR-head checks run explicitly because bot PRs do not trigger PR CI. Exact scope and target reads produce a request comment and clear pending; only authorized `/publish` resumes. Variable-only fixes use manual onboarding workflow dispatch |
| P04 · I | Try invalid URL/host/org, missing answers, inaccessible or unselected target | Explicit rejection/failure; no out-of-scope writes, false readiness, or disclosure |
| P05 · I | Validate open controls, then one closed as not planned/duplicate | Not ready; report names incomplete controls |
| P06 · W | Close controls; leave each security prerequisite unsatisfied in turn | Correct gap for secret scanning, push protection, dependencies, code scanning, rulesets, CODEOWNERS, SECURITY.md, `.env`, and OIDC pattern |
| P07 · I/W | I: remove issue permission/target selection; test expired/revoked PAT if used. W: hide required security metadata | Explicit failures; missing fields/403/404 never pass |
| P08 · W | Complete controls, restore baseline, validate | Readiness only after all checks PASS; timestamp, commit, evidence links recorded; human governance/platform fields PENDING, **no automatic approval** |
| P09 · I/W | I: ordinary requester tries `/validate` and label edits. W: governance reviews; requester attempts production access | I: command/label behavior matches actual permissions. W: production denies unauthorized access independently of mutable labels |
| P10 · I/W | I: change intake/catalog and rerun; test daily/manual sweeps on open requests. W: reopen control/change code/settings after approval | I: reuse IDs, reopen required controls, refresh evidence; metadata-only changes get manual evidence review. W: gaps remove advisory labels; stale labels never authorize release |
| P11 · I/W | Attempt direct push and unreviewed workflow/control/CODEOWNERS changes | Rejected in hub (I) and workload (W); approved maintainer path works |
| P12 · W | Use synthetic secret and non-secret `.env` fixtures | Expected protections reject them; no real credentials or universal-detection claim |
| P13 · W | Run code/dependency scans; inspect alert routing | Supported analysis/processing succeeds; security receives evidence |
| P14 · W | Sandbox OIDC login/deploy and runtime vault access; retry wrong repo/branch/environment | Only intended identities/contexts succeed; production protected; no long-lived Azure password |
| P15 · I if hosting guide | Test allowed, unauthorized signed-in, anonymous readers | Approved audience only; test instance-user boundary for GHES adaptations |
| P16 · I | Rotate App key or renew PAT; rerun intake/validation | New credential works, obsolete revoked, no duplicate issues; workload gaps may remain |
| P17 · I/W | Simulate failure and benign audit event; exercise alert/recovery | Operators correlate evidence and restore without deleting history, for hub (I) and workload (W) |
| P18 · I/W | Repeat applicable assertions for each additional host/org/auth scope | Prove feature/API, URL, runner, credential/identity differences; untested scope excluded |

For P06, distinguish **the validator's actual automated assertions** from the stronger runtime/administrative proofs in gates 3-4. If it only detects an OIDC workflow's structure, P14 must still prove effective trust and RBAC. If a required negative test unexpectedly passes, do not explain it away as a documentation limitation: remediate the implementation or narrow launch scope with explicit risk approval.

## 3. Go-live criteria

- [ ] Every mandatory workload/launch assertion passes, or a documented exception has a risk owner, compensating control, expiry, and retest. Missing cross-repo auth, false-positive validation, unsupported required APIs, or unauthorized production access are **no-go**. Exceptions never convert FAIL/UNKNOWN to automated readiness.
- [ ] All internal policy mappings, role assignments, credential inventories, licenses and data/Pages audiences are signed off.
- [ ] Governance understands `ready-for-review` is automated readiness evidence, while `approved-for-production` is a human decision, not a cloud deployment authorization.
- [ ] A normal user can discover the guide, submit a request and understand a failing validation without platform-admin assistance.
- [ ] Service/on-call coverage, alerting, credential reminders, support SLA and incident/rollback procedures are live.
- [ ] Platform, security, governance and cloud owners complete [the sign-off record](sign-off.md), including residual risks and authorized rollout scope.
- [ ] Publish the internal launch notice with guide URL, support contact, eligibility, expected review lead time and escalation process. Start with the approved cohort; expand only after reviewing pilot outcomes.

**Gate exit:** a named service owner authorizes a dated, scoped launch backed by test evidence and independent sign-offs.
