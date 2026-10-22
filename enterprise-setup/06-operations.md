# Gate 6: Audit, monitoring and ongoing ownership

[Index](README.md) | Previous: [Pages and Copilot](05-pages-copilot.md) | Next: [Pilot and go-live](07-pilot.md)

**Accountable:** service owner. **Sign-off:** security operations and enterprise platform owner.

## 1. Establish audit and monitoring before the pilot

- [ ] Configure enterprise audit-log streaming to an approved SIEM/storage destination where supported. Record destination, region, access controls, retention, ingestion owner and alert route. Data residency for GitHub does not automatically apply to your external log destination.
- [ ] Test receipt of a known, benign policy or App-installation change. Streaming begins when enabled; it is not a historical backfill. Plan deduplication because delivery can be at least once.
- [ ] Alert on stream health/failures and document recovery. If streaming is unavailable on the installed version or destination, document an approved export/collection alternative, retention and collection-gap detection.
- [ ] Monitor GitHub App installation/permission/repository-selection changes, credential lifecycle, security feature disablement, reviewer membership, ruleset/bypass changes and Actions/Pages policy changes.
- [ ] Separately collect workflow outcomes, issue/control transitions and production approval evidence. Audit logs are not a substitute for Actions logs, control evidence or an application deployment trail; not every API call is audited.
- [ ] Record intake request URL, solution repository, parent/control issue IDs, selected tier, catalog revision, workflow run/attempt URL, deployed commit and governance decision. Restrict evidence access appropriately.
- [ ] Keep publication requests **open** while monitoring readiness. Stock scheduled validation runs daily at `07:17 UTC` and sweeps open labeled requests; manual workflow dispatch also sweeps them. Schedules may be delayed, and API outages can prevent advisory label removal, so do not use labels as a production gate.
- [ ] Set Actions log/artifact retention deliberately; export needed evidence before it expires. Redact credentials and sensitive issue content from monitoring.

Sources: [Cloud audit-log streaming](https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise); [GHES 3.22 streaming](https://docs.github.com/en/enterprise-server@3.22/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise).

### Fill in an actionable monitoring contract

| Signal | Required response | Named queue/on-call | Target / evidence |
|---|---|---|---|
| Intake/validation failure, cancellation, stuck queue | Distinguish input error, policy denial, auth and platform outage; notify requester without claiming readiness | `<queue>` | `<time/dashboard>` |
| No parent/control issues after accepted request | Correlate request with run, inspect partial creation, retry idempotently | `<queue>` | `<time/query>` |
| Missing security metadata / API 401, 403, 404, 429 | Block readiness; inspect entitlement, App scope, permissions, host/version and rate limit; bounded retry only for transient failures | `<queue>` | `<time/runbook>` |
| App key/PAT compromise or unexpected installation | Suspend/revoke affected access, contain workflows, investigate mutations and rotate | `<security on-call>` | `<incident process>` |
| Security configuration/ruleset/reviewer drift | Restore approved baseline and reassess affected approvals | `<security/platform>` | `<cadence/alert>` |
| Pages failure or unexpected public exposure | Unpublish/restrict exposure, assess leaked content and restore intended audience | `<queue>` | `<time/test>` |
| Audit ingestion gap | Restore collection and record gap/impact; preserve alternate evidence | `<SOC>` | `<threshold/dashboard>` |
| Aging controls / stalled review | Escalate to evidence owner/governance; never auto-approve because of age | `<governance>` | `<SLA/report>` |

## 2. Practice safe recovery

- [ ] For partial intake, inspect existing parent/control issue identifiers, idempotency markers and the bot state comment. An authorized hub collaborator reruns `/publish` rather than deleting issues or changing markers to start over. Preserve the shared intake/validation concurrency group with `cancel-in-progress: false`; do not cancel active intake. Burst concurrency can replace a pending run, so reconcile missing commands.
- [ ] For validation failure, preserve run evidence and correct the cause. Never close issues, remove security controls or grant broader credentials solely to get a green run.
- [ ] Define launch rollback: close/pause new intake, disable affected privileged workflows, suspend credentials if needed, announce the outage and retain existing issues/evidence. Roll back code/config through a reviewed commit, not destructive history rewrites.
- [ ] Restore from a known-good pinned release and reconcile in-flight requests, label state and catalog version. Retest before reopening intake; a code rollback alone does not undo created issues or cloud changes.
- [ ] Confirm how revoked/removed production approvals affect deployment access. Removing a label alone does not revoke an already deployed workload or cloud identity.

## 3. Assign the recurring work

These are suggested minimum review points; replace them with your internal policy cadence and ticket links.

| Cadence/event | Responsible owner | Required action |
|---|---|---|
| Each new solution repo/org | Platform + security | Approve scope, install App on selected repo, apply security baseline, assign owners and verify auth/endpoints |
| Weekly | Service operator | Review failed/stuck runs, aged controls, alert queues, Actions capacity and audit ingestion |
| Monthly | Security + governance | Review memberships, bypasses, security/label drift, exceptions and evidence completeness |
| Before credential deadline / incident | Identity/platform | Rotate App keys/PATs, test cutover and revoke obsolete credentials; App keys need explicit scheduled rotation |
| Each upstream/action/dependency update | Platform maintainer | Review diffs and release notes, update pins/allowlist, run representative tier and negative pilots, record deployed commit |
| Each policy/catalog change | Governance + security | Review mappings/thresholds, version controls, define in-flight request migration and repeat tier/idempotency tests |
| Each host upgrade or repository transfer | Platform + cloud | Recheck APIs, action/runner support, Pages audience and effective OIDC issuer/subject |
| Quarterly and owner departure | Service owner | Review RACI, budgets/licenses, recovery procedure, support documentation and backup administrator readiness |

- [ ] Assign both primary and backup maintainers for every row, with a ticket/reminder mechanism.
- [ ] Keep a change log and evidence of approvals; prevent public upstream synchronization from exporting internal policy content.

**Gate exit:** alert routes work, audit evidence is recoverable, incident/rollback procedures have owners and recurring maintenance is scheduled.
