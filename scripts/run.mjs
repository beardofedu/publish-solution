import { readFile } from 'node:fs/promises';
import { GitHub, upsertComment } from './github.mjs';
import { loadConfig, repositoryPattern } from './model.mjs';
import { authorize, clearGate, intakeRequest, reportTag, validateRequest } from './publish.mjs';
import { remindExceptions } from './lifecycle.mjs';

async function main() {
  const mode = process.argv[2];
  if (!['intake', 'validate', 'sweep'].includes(mode)) throw new Error('Mode must be intake, validate, or sweep.');
  const hub = process.env.GITHUB_REPOSITORY;
  if (!repositoryPattern.test(hub ?? '')) throw new Error('GITHUB_REPOSITORY must be owner/name.');
  const config = await loadConfig(process.env.TOOLKIT_PATH ?? process.cwd());
  const hubApi = new GitHub(process.env.HUB_TOKEN, process.env.GITHUB_API_URL);
  const targetApi = new GitHub(process.env.SOLUTION_TOKEN, process.env.GITHUB_API_URL);
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let issues;
  if (mode === 'sweep') {
    if (process.env.GITHUB_EVENT_NAME !== 'schedule' && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
      throw new Error('Sweep is restricted to schedules and explicit workflow dispatches.');
    }
    issues = (await hubApi.pages(`/repos/${hub}/issues?state=open&labels=publication-request`))
      .filter(issue => !issue.pull_request);
  } else {
    if (!event.issue || event.issue.pull_request || event.issue.state !== 'open') {
      throw new Error('An open publication request issue is required.');
    }
    if (process.env.GITHUB_EVENT_NAME === 'issue_comment') {
      const expected = mode === 'intake' ? '/publish' : '/validate';
      if (event.action !== 'created' || event.comment?.body?.trim() !== expected) {
        throw new Error('Only an exact newly created /publish or /validate command is accepted.');
      }
    } else if (mode !== 'intake' || process.env.GITHUB_EVENT_NAME !== 'issues' ||
        !['opened', 'edited', 'reopened'].includes(event.action)) {
      throw new Error('Unexpected event for this operation.');
    }
    await authorize(hubApi, hub, event.sender.login, config.policy);
    // Use current state, not the potentially stale webhook body.
    const live = await hubApi.request('GET', `/repos/${hub}/issues/${event.issue.number}`);
    if (live.state !== 'open' || live.pull_request) throw new Error('The request is no longer an open issue.');
    issues = [live];
  }
  let failed = false;
  for (const issue of issues) {
    if (!issue.labels.some(label => label.name === 'publication-request')) continue;
    try {
      const args = { hubApi, targetApi, hub, issue, config };
      if (mode === 'intake') await intakeRequest(args);
      else await validateRequest(args);
    } catch (error) {
      failed = true;
      await clearGate(hubApi, hub, issue.number);
      // Errors do not include HTTP response bodies or tokens.
      await upsertComment(hubApi, hub, issue.number, reportTag,
        `## Publication blocked\n\n${error.message}\n\nRead SETUP.md for permissions and feature prerequisites. No production approval was granted.`);
      console.error(`Request #${issue.number}: ${error.message}`);
    }
  }
  if (mode === 'sweep') {
    const updated = await remindExceptions(hubApi, hub);
    console.log(`Updated ${updated} due, expired, or incomplete exception reminder(s).`);
  }
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
