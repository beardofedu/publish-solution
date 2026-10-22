# Gate 7: Pilot, dry run and go-live

[Index](README.md) | Previous: [Operations](06-operations.md) | Final: [Sign-off record](sign-off.md)

**Accountable:** service owner. **Sign-off:** platform, security, governance and cloud owners.

Use disposable **selected, non-production** solution repositories with the intended private/internal visibility. Do not use real credentials or sensitive data as test fixtures. Run tests as an ordinary citizen developer, governance reviewer and the actual workflow identity, not solely as an enterprise administrator.

For the narrower **toolkit installation pilot**, follow the [rendered walkthrough](https://beardofedu.github.io/publish-solution/setup.html#pilot): prove request access, authorized processing, exact generated issues, rerun recovery and honest validation gaps. Record this as a scoped subset of the matrix below, not full go-live approval. No target toolkit workflow or Azure resources/credentials are needed for that subset. The full matrix includes separate workload security/deployment and enterprise service-launch evidence.

## Reproducible local fixture

Run `npm ci --ignore-scripts`, `npm test`, `npm run check`, and `npm run preflight` before the customer pilot. `test/publish.test.mjs` is a mocked cross-repository integration fixture using the real catalog and simulated GitHub API; it covers stable issue markers, partial-run recovery, authorization, allowlist enforcement, evidence completion, validation gaps, and advisory labels. `examples/scenario.md` and `examples/triage-helper/` provide a local sample and explicitly synthetic intake, evidence, and handoff walkthrough. These are software fixtures, not observed live integration results or customer evidence.

The live procedure below is **opt-in and customer-executed**. It requires explicit customer authorization, a disposable hub/target, approved narrowly scoped credentials, and an independent observer. No App, secret, repository setting, issue, cloud resource, or live pilot is created by these tests or by this documentation change. Mark every unexecuted live row unverified; do not convert mock results into a pilot pass.

## 1. Prepare the test record

- [ ] Complete gates 1-6 and freeze the implementation and control-catalog commit.
- [ ] Record host/version, auth method, installed repository set, policy/security configuration, expected label names and run links. Use [SETUP.md](../SETUP.md) and [scripts/](../scripts/) for exact triggers and output.
- [ ] Select known input combinations yielding each tier under [config/tiers.yml](../config/tiers.yml). Record the expected control IDs/count for each before running intake.
- [ ] Record a test owner, observer and expected result for every row below. Attach the actual result; an unexecuted test is not a pass.

## 2. Execute the acceptance matrix

| ID | Test | Required result |
|---|---|---|
| P01 | Submit one valid Low, Moderate and High request using the real form; maintainer comments `/publish` if preflight requires it | Expected tier and exact catalog control set for each; parent and control issues in the **solution** repo, native sub-issue linkage or explicitly accepted visible fallback, correct request backlink and labels |
| P02 | Rerun `/publish` for the same request, including after an interrupted/partial run | No duplicate parent/control issues or lost evidence; missing work resumes consistently; manual task-list checkbox edits cannot bypass validation |
| P03 | Issue two supported reruns close together | Concurrency/idempotency prevents duplicate creation; failures are visible and recoverable |
| P04 | Give invalid repo URL, wrong host/org, missing answers, inaccessible repo or repo outside the installation | Rejected or clearly failed; no out-of-scope issue creation, no false readiness, no secret disclosure |
| P05 | Invoke `/validate` with open controls, then close one as not planned/duplicate rather than completed | Not ready in each case; actionable evidence identifies the incomplete controls |
| P06 | Close every control but deliberately leave one security prerequisite unsatisfied | Not ready; correct failing check is reported. Repeat separately for secret scanning, push protection, dependencies, CodeQL, rulesets, CODEOWNERS, SECURITY.md, committed `.env` fixture and OIDC-workflow requirements within validator scope |
| P07 | Remove needed App permission/repository selection in an isolated pilot; test expired/revoked PAT if that path is supported | Authentication/authorization failure is explicit; missing security fields/403/404 cannot become a pass |
| P08 | Complete controls and restore the approved baseline, then validate | `ready-for-review` appears only after required checks pass; package records timestamp/current commit/control evidence locations and keeps named governance decision and separate platform acceptance PENDING; **no automatic production approval** |
| P09 | Ordinary requester invokes `/validate` and attempts approval/label changes; authorized governance reviewer performs approval | Actual behavior matches approved authority model; unauthorized production access is denied independently of a mutable label |
| P10 | Reopen a control, change intake/catalog, or change material code/settings after readiness/approval, then revalidate | Failed/gapped validation removes advisory readiness/approval; changed intake/catalog requires `/publish` and refreshed controls/evidence. Keep request open and prove daily/manual sweep behavior. Production never trusts a stale label during an outage |
| P11 | Try direct push, unreviewed workflow/control changes and CODEOWNERS changes | Branch/review protections reject unauthorized changes; approved maintainer path still works |
| P12 | Use a supported synthetic secret fixture and a non-secret `.env` fixture | Expected protections/checks reject them; do not introduce a real credential or assume every secret pattern is detected |
| P13 | Run CodeQL/dependency scans and review alert routing | Actual supported-language analysis and dependency processing succeed; security team receives actionable evidence |
| P14 | Perform sandbox Azure OIDC login/deploy and runtime Key Vault access; retry from wrong repo/branch/environment | Only intended identities/contexts succeed; production remains protected; no long-lived Azure password required |
| P15 | Visit guide as allowed reader, unauthorized signed-in user and anonymous user | Approved audience only; test GHES instance-user boundary explicitly |
| P16 | Rotate the App key (or renew approved PAT), then retry intake and validation | New credential succeeds, obsolete credential is revoked, existing issues are not duplicated |
| P17 | Simulate workflow failure and a benign auditable change; exercise alert and rollback procedure | Named operators receive alerts, correlate run/audit evidence and restore safely without deleting history |
| P18 | Repeat representative end-to-end tests on each additional supported host/org/auth path | Feature/API, URL, runner, secret and identity differences proven; an untested deployment is excluded from launch |

For P06, distinguish **the validator's actual automated assertions** from the stronger runtime/administrative proofs in gates 3-4. If it only detects an OIDC workflow's structure, P14 must still prove effective trust and RBAC. If a required negative test unexpectedly passes, do not explain it away as a documentation limitation: remediate the implementation or narrow launch scope with explicit risk approval.

## 3. Go-live criteria

- [ ] Every mandatory pilot row passes for the approved scope, or a documented exception has an accountable risk owner, compensating control, expiry and retest. Missing cross-repo auth, false-positive validation, unsupported required APIs or unauthorized production access are **no-go** conditions.
- [ ] All internal policy mappings, role assignments, credential inventories, licenses and data/Pages audiences are signed off.
- [ ] Governance understands `ready-for-review` is automated readiness evidence, while `approved-for-production` is a human decision, not a cloud deployment authorization.
- [ ] A normal user can discover the guide, submit a request and understand a failing validation without platform-admin assistance.
- [ ] Service/on-call coverage, alerting, credential reminders, support SLA and incident/rollback procedures are live.
- [ ] Platform, security, governance and cloud owners complete [the sign-off record](sign-off.md), including residual risks and authorized rollout scope.
- [ ] Publish the internal launch notice with guide URL, support contact, eligibility, expected review lead time and escalation process. Start with the approved cohort; expand only after reviewing pilot outcomes.

**Gate exit:** a named service owner authorizes a dated, scoped launch backed by test evidence and independent sign-offs.
