import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { GitHub, setLabels, upsertComment } from './github.mjs';
import { repositoryPattern, loadConfig } from './model.mjs';
import { authorize } from './auth.mjs';
import { exceptionReminderTag, reassessmentTag, reportTag, stateTag } from './tags.mjs';

function field(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body?.match(new RegExp(`^### ${escaped}\\s*\\r?\\n+([^\\r\\n]+)`, 'm'))?.[1]?.trim();
}

export function linkedIssueNumber(body, heading, hub) {
  const value = field(body, heading);
  if (!value) return null;
  try {
    const url = new URL(value);
    const match = url.protocol === 'https:' && url.hostname === 'github.com' && !url.search && !url.hash
      ? url.pathname.match(new RegExp(`^/${hub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d+)/?$`))
      : null;
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function dateValue(body, heading) {
  const value = field(body, heading);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function exceptionReminder(issue, hub, now = new Date()) {
  const expiry = dateValue(issue.body, 'Expiry date');
  const original = linkedIssueNumber(issue.body, 'Original publication request', hub);
  const today = now.toISOString().slice(0, 10);
  let status;
  if (!expiry || !original) status = 'ACTION REQUIRED — missing/invalid expiry date or original request link';
  else {
    const days = Math.floor((Date.parse(`${expiry}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
    if (days < 0) status = `EXPIRED — ${expiry}`;
    else if (days <= 7) status = `DUE — ${expiry} (${days} day${days === 1 ? '' : 's'} remaining)`;
    else return null;
  }
  return `${exceptionReminderTag}\n## Exception review reminder\n\n**${status}.** This is a tracking reminder, not an approval, renewal, or validation bypass. Verify the human decision and take any required operational action through the protected release process.\n\n${original ? `Original publication request: https://github.com/${hub}/issues/${original}\n` : 'Original publication request: NOT VERIFIED; correct the linkage before relying on this record.\n'}Review request: https://github.com/${hub}/issues/${issue.number}\n\nAn exception never turns FAIL or UNKNOWN into PASS.`;
}

export async function linkedExceptions(hubApi, hub, requestNumber, now = new Date()) {
  const issues = (await hubApi.pages(`/repos/${hub}/issues?state=all&labels=control-exception`))
    .filter(issue => !issue.pull_request &&
      linkedIssueNumber(issue.body, 'Original publication request', hub) === requestNumber);
  return issues.map(issue => {
    const expiry = dateValue(issue.body, 'Expiry date');
    let status = 'UNKNOWN — invalid or missing expiry date';
    if (expiry) {
      const days = Math.floor((Date.parse(`${expiry}T00:00:00.000Z`) -
        Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)) / 86_400_000);
      status = days < 0 ? 'EXPIRED' : days <= 7 ? 'DUE' : 'NOT DUE';
    }
    return {
      number: issue.number,
      state: issue.state,
      html_url: issue.html_url,
      control_id: field(issue.body, 'Control ID') ?? 'unspecified',
      expiry: expiry ?? 'unknown',
      status,
    };
  });
}

export async function remindExceptions(hubApi, hub, now = new Date()) {
  const issues = (await hubApi.pages(`/repos/${hub}/issues?state=all&labels=control-exception`))
    .filter(issue => !issue.pull_request);
  let updated = 0;
  for (const issue of issues) {
    const body = exceptionReminder(issue, hub, now);
    if (!body) {
      const comments = await hubApi.pages(`/repos/${hub}/issues/${issue.number}/comments`);
      const existing = comments.find(comment => comment.user?.login === 'github-actions[bot]' &&
        comment.body?.startsWith(exceptionReminderTag));
      if (existing) {
        await upsertComment(hubApi, hub, issue.number, exceptionReminderTag,
          '## Exception review reminder\n\nThe previous warning no longer matches the current record: its original-request link has valid syntax and its entered expiry is more than seven days away. This is not confirmation of approval, renewal, or a validation bypass. Verify the human decision and conditions before relying on this exception.');
        updated++;
      }
      continue;
    }
    await upsertComment(hubApi, hub, issue.number, exceptionReminderTag,
      body.slice(exceptionReminderTag.length).trimStart());
    updated++;
  }
  return updated;
}

export async function invalidateForReassessment({ hubApi, hub, issue }) {
  if (!issue.labels?.some(label => label.name === 'reassessment-request')) {
    throw new Error('Only reassessment-request issues can invalidate an original request.');
  }
  if (issue.state !== 'open') throw new Error('Reassessment request must be open.');
  const originalNumber = linkedIssueNumber(issue.body, 'Original publication request', hub);
  if (!originalNumber || originalNumber === issue.number) {
    throw new Error('Original publication request must link to a different issue in this governance repository.');
  }
  const original = await hubApi.request('GET', `/repos/${hub}/issues/${originalNumber}`);
  if (original.pull_request || !original.labels?.some(label => label.name === 'publication-request')) {
    throw new Error('Linked issue is not a publication request; governance must correct the reassessment link.');
  }
  const requestRepository = field(issue.body, 'Solution repository')?.toLowerCase();
  if (!repositoryPattern.test(requestRepository ?? '')) {
    throw new Error('Reassessment must include an exact solution repository owner/name.');
  }
  const comments = await hubApi.pages(`/repos/${hub}/issues/${originalNumber}/comments`);
  const stateComment = comments.find(comment => comment.user?.login === 'github-actions[bot]' &&
    comment.body?.startsWith(stateTag));
  const stateMatch = stateComment?.body?.match(/<!-- state-json:({[^\n]+}) -->/);
  let saved;
  try {
    saved = stateMatch ? JSON.parse(stateMatch[1]) : null;
  } catch {
    throw new Error('Original publication state is damaged; governance must investigate before invalidation.');
  }
  if (!saved?.repository || saved.repository.toLowerCase() !== requestRepository) {
    throw new Error('Reassessment repository does not match the original publication plan; governance must correct the link or open a new request.');
  }
  await setLabels(hubApi, hub, originalNumber, [], ['ready-for-review', 'approved-for-production']);
  const message = `Reassessment request [#${issue.number}](${issue.html_url}) was opened or updated. Advisory readiness and approval labels were cleared. This does not approve the change or create a new plan; governance must verify scope and rerun \`/publish\` on this original request after updating it.`;
  await upsertComment(hubApi, hub, originalNumber, reassessmentTag, message);
  await upsertComment(hubApi, hub, originalNumber, reportTag,
    '## Handoff invalidated\n\nA linked reassessment request changed. This prior validation package is stale; verify scope and run `/publish` and `/validate` on this original request before a new human review.');
  return originalNumber;
}

async function main() {
  const mode = process.argv[2];
  const hub = process.env.GITHUB_REPOSITORY;
  const api = new GitHub(process.env.HUB_TOKEN, process.env.GITHUB_API_URL);
  if (mode === 'remind') {
    if (!['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
      throw new Error('Exception reminders are restricted to schedules and workflow dispatch.');
    }
    const count = await remindExceptions(api, hub);
    console.log(`Updated ${count} due, expired, or incomplete exception reminder(s).`);
    return;
  }
  if (mode === 'invalidate') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (process.env.GITHUB_EVENT_NAME !== 'issues' ||
        !['opened', 'edited', 'reopened'].includes(event.action) || !event.issue || event.issue.pull_request) {
      throw new Error('Reassessment invalidation requires an opened, edited, or reopened issue event.');
    }
    if (!repositoryPattern.test(hub ?? '') || !event.sender?.login) {
      throw new Error('A valid governance repository and event sender are required.');
    }
    const config = await loadConfig();
    await authorize(api, hub, event.sender.login, config.policy);
    const liveIssue = await api.request('GET', `/repos/${hub}/issues/${event.issue.number}`);
    if (liveIssue.state !== 'open' || liveIssue.pull_request) {
      throw new Error('Reassessment request is no longer an open issue.');
    }
    await invalidateForReassessment({ hubApi: api, hub, issue: liveIssue });
    console.log(`Cleared advisory labels for the linked original publication request.`);
    return;
  }
  throw new Error('Mode must be remind or invalidate.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
