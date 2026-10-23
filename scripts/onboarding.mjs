import { appendFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isSeq, parseDocument } from 'yaml';
import { GitHub, setLabels, upsertComment } from './github.mjs';
import { hasLabel, loadConfig, parseIntake, repositoryPattern } from './model.mjs';
import { authorize, clearGate } from './publish.mjs';
import { staticDiagnostics, formatDiagnostics, targetDiagnostics } from './diagnose.mjs';

const tag = '<!-- publish-solution:onboarding -->';
const isAllowed = (policy, repository) =>
  policy.allowed_repositories.some(name => name.toLowerCase() === repository);

export function onboardingTarget(issue, hub, owner) {
  if (!repositoryPattern.test(hub ?? '')) throw new Error('GITHUB_REPOSITORY must be owner/name.');
  const repository = parseIntake(issue.body).repository;
  const installationOwner = owner || hub.split('/')[0];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(installationOwner) ||
      repository.split('/')[0] !== installationOwner.toLowerCase()) {
    throw new Error('Onboarding supports only the configured installation owner; use a separate hub for another owner.');
  }
  if (repository === hub.toLowerCase()) throw new Error('The solution repository must differ from the governance repository.');
  return repository;
}

export function policyWithTarget(source, repository) {
  const document = parseDocument(source, { uniqueKeys: true, maxAliasCount: 0 });
  if (document.errors.length) throw new Error('Cannot prepare onboarding PR: invalid policy YAML.');
  const allowed = document.get('allowed_repositories');
  if (!isSeq(allowed)) throw new Error('Policy allowlist must be an array.');
  if (!allowed.toJSON().some(name => name.toLowerCase() === repository)) allowed.add(repository);
  return document.toString();
}

export async function requestOnboardingPr(api, hub, repository, issueNumber, installationId) {
  if (!Number.isSafeInteger(installationId) || installationId < 1) throw new Error('A reviewed onboarding_installation_id is required for the App settings link.');
  const root = `/repos/${hub}`;
  const metadata = await api.request('GET', root);
  const base = metadata.default_branch;
  const branch = `onboard/${createHash('sha256').update(repository).digest('hex').slice(0, 24)}`;
  const head = `${hub.split('/')[0]}:${branch}`;
  const existing = await api.pages(`${root}/pulls?state=all&head=${encodeURIComponent(head)}`);
  if (existing.length > 1) throw new Error('Multiple onboarding PRs found; reconcile them manually.');
  let pr = existing[0];
  if (pr && pr.state !== 'open') throw new Error('The previous onboarding PR is closed. A maintainer must reconcile or reopen it; no duplicate was created.');
  if (!pr) {
    const baseRef = await api.request('GET', `${root}/git/ref/heads/${encodeURIComponent(base)}`);
    const file = await api.request('GET', `${root}/contents/config/policy.yml?ref=${baseRef.object.sha}`);
    if (file.encoding !== 'base64') throw new Error('Expected a base64 policy file.');
    const content = policyWithTarget(Buffer.from(file.content, 'base64').toString('utf8'), repository);
    let branchExists = false;
    try {
      await api.request('GET', `${root}/git/ref/heads/${branch}`);
      branchExists = true;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (branchExists) {
      // Recover only our exact proposal, never overwrite edits on an existing branch.
      const current = await api.request('GET', `${root}/contents/config/policy.yml?ref=${encodeURIComponent(branch)}`);
      if (current.encoding !== 'base64' || Buffer.from(current.content, 'base64').toString('utf8') !== content) {
        throw new Error('Existing onboarding branch differs from the proposal; a maintainer must reconcile it.');
      }
    } else {
      await api.request('POST', `${root}/git/refs`, { ref: `refs/heads/${branch}`, sha: baseRef.object.sha });
      await api.request('PUT', `${root}/contents/config/policy.yml`, {
        branch, sha: file.sha, content: Buffer.from(content).toString('base64'),
        message: `Request onboarding for ${repository}`,
      });
    }
    const owner = repository.split('/')[0];
    const settings = `https://github.com/organizations/${owner}/settings/installations/${installationId}`;
    pr = await api.request('POST', `${root}/pulls`, {
      head: branch, base, title: `Onboard ${repository}`,
      body: `${tag}\nRepository: \`${repository}\`\nSource: https://github.com/${hub}/issues/${issueNumber}\n\n` +
        '## Admin review (no access grant is automated)\n\n' +
        '- [ ] Verify the repository owner, visibility, active state, Issues, and approved scope.\n' +
        `- [ ] Open [organization App installation settings](${settings}) (or [personal installation settings](https://github.com/settings/installations/${installationId}) for an account owner), verify the owner and solution App, and add this repository under **Only select repositories**; retain only approved targets.\n` +
        '- [ ] Update `SOLUTION_APP_REPOSITORIES` (names only) to exactly match the proposed allowlist under `SOLUTION_APP_OWNER`.\n' +
        `- [ ] After reviewing this PR head, a maintainer runs **Actions > Toolkit checks > Run workflow** with branch \`${branch}\`. GITHUB_TOKEN-created PRs do not trigger pull_request workflows. Local alternative: \`npm ci --ignore-scripts\`, \`npm test\`, \`npm run check\`, and \`actionlint\` in an approved trusted checkout; do not bypass required GitHub checks.\n` +
        '- [ ] Review the complete diff and merge only after approval. Post-merge onboarding checks must pass; the requester then resumes with `/publish`.\n\n' +
        'This PR changes policy only. It grants no App access and approves no production deployment. Until merge, changing installation/variable scope can block existing publication runs; coordinate the change window.',
    });
  }
  await upsertComment(api, hub, pr.number, `<!-- publish-solution:onboarding-request:${issueNumber} -->`,
    `Onboarding request: https://github.com/${hub}/issues/${issueNumber} for \`${repository}\`. Review the current request before merging.`);
  return `https://github.com/${hub}/pull/${pr.number}`;
}

export async function prepareOnboarding({ api, hub, event, eventName, config, owner, appId }) {
  if (!event.issue || event.issue.pull_request ||
      !(eventName === 'issues' && ['opened', 'edited', 'reopened'].includes(event.action) ||
        eventName === 'issue_comment' && event.action === 'created' && event.comment?.body === '/publish')) {
    throw new Error('Unexpected onboarding event.');
  }
  await authorize(api, hub, event.sender.login, config.policy);
  const issue = await api.request('GET', `/repos/${hub}/issues/${event.issue.number}`);
  if (issue.pull_request || issue.state !== 'open' || !hasLabel(issue, 'publication-request')) {
    throw new Error('An open publication request is required.');
  }
  await clearGate(api, hub, issue.number);
  let repository;
  try {
    repository = onboardingTarget(issue, hub, owner);
  } catch (error) {
    await upsertComment(api, hub, issue.number, tag, `## Repository onboarding blocked\n\n${error.message}\n\nCorrect the request and ask an authorized maintainer to retry \`/publish\`. No target credentials were minted.`);
    throw error;
  }
  if (isAllowed(config.policy, repository)) return true;
  await setLabels(api, hub, issue.number, ['onboarding-pending']);
  let detail = 'A maintainer must add the exact target through a reviewed policy PR and reconcile the App installation and repository-list variable.';
  let failed = false;
  if (config.policy.onboarding_prs && appId) {
    try {
      detail = `Review the [onboarding PR](${await requestOnboardingPr(api, hub, repository, issue.number, config.policy.onboarding_installation_id)}). App access must still be granted manually.`;
    } catch (error) {
      detail = `Automatic PR creation is unavailable: ${error.message} ${detail} Check hub Actions PR-creation policy; do not add an admin token.`;
      console.error(`Onboarding request #${issue.number}: ${error.message}`);
      failed = ![403, 422].includes(error.status);
    }
  } else {
    detail += config.policy.onboarding_prs ? ' App mode is not configured; automatic PR creation is App-only.' :
      ' Automatic PR creation is disabled (`onboarding_prs: false`).';
  }
  await upsertComment(api, hub, issue.number, tag,
    `## Awaiting repository onboarding\n\nTarget: \`${repository}\`.\n\n${detail}\n\n` +
    'Publication remains blocked. After merge, run **Repository onboarding checks** if needed; when checks pass, an authorized requester or maintainer can comment `/publish`. This label is advisory, not authorization.');
  if (failed) throw new Error('Onboarding PR preparation failed; see the request comment.');
  return false;
}

export async function checkPending({ api, targetApi, hub, config, owner, scopePassed }) {
  const issues = await api.pages(`/repos/${hub}/issues?state=open&labels=publication-request,onboarding-pending`);
  let failed = false;
  for (const issue of issues.filter(item => !item.pull_request)) {
    try {
      const repository = onboardingTarget(issue, hub, owner);
      if (!isAllowed(config.policy, repository)) continue;
      if (!scopePassed) throw new Error('App scope verification or token creation failed. Inspect this workflow run, reconcile the installation, variable and allowlist, then rerun Repository onboarding checks.');
      const results = [...staticDiagnostics(config, hub, [repository]),
        ...await targetDiagnostics(targetApi, [repository])];
      if (results.some(result => result.status === 'BLOCKED')) throw new Error(formatDiagnostics(results));
      // Do not clear a label for an edited, closed, or redirected request.
      const live = await api.request('GET', `/repos/${hub}/issues/${issue.number}`);
      if (live.state !== 'open' || !hasLabel(live, 'publication-request') ||
          onboardingTarget(live, hub, owner) !== repository) throw new Error('Request changed during onboarding checks; rerun after review.');
      await upsertComment(api, hub, issue.number, tag,
        `## Repository onboarding checks passed\n\nTarget: \`${repository}\`.\n\n${formatDiagnostics(results)}\n\n` +
        'Exact App scope and target read access confirmed in this run. This is not a security-feature, issue-write, or production approval. An authorized requester or maintainer can now comment `/publish`.');
      await setLabels(api, hub, issue.number, [], ['onboarding-pending']);
    } catch (error) {
      failed = true;
      await clearGate(api, hub, issue.number);
      await upsertComment(api, hub, issue.number, tag,
        `## Repository onboarding remains blocked\n\n${error.message}\n\nNo publication or production approval was granted. Fix the reported configuration/access problem and rerun **Repository onboarding checks**.`);
      console.error(`Onboarding request #${issue.number}: ${error.message}`);
    }
  }
  if (failed) throw new Error('One or more pending onboarding checks failed.');
}

async function main() {
  if (process.env.GITHUB_SERVER_URL !== 'https://github.com') throw new Error('Stock onboarding supports GitHub.com only.');
  const hub = process.env.GITHUB_REPOSITORY;
  if (!repositoryPattern.test(hub ?? '')) throw new Error('GITHUB_REPOSITORY must be owner/name.');
  const config = await loadConfig();
  const api = new GitHub(process.env.HUB_TOKEN, process.env.GITHUB_API_URL);
  const owner = process.env.SOLUTION_APP_OWNER;
  if (process.argv[2] === 'prepare') {
    const ready = await prepareOnboarding({
      api, hub, config, owner, appId: process.env.SOLUTION_APP_ID,
      event: JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')),
      eventName: process.env.GITHUB_EVENT_NAME,
    });
    await appendFile(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
  } else if (process.argv[2] === 'check' &&
      ['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
    const scopePassed = process.env.SCOPE_OUTCOME === 'success' && process.env.TOKEN_OUTCOME === 'success' &&
      Boolean(process.env.SOLUTION_TOKEN);
    await checkPending({ api, hub, config, owner, scopePassed,
      targetApi: scopePassed ? new GitHub(process.env.SOLUTION_TOKEN, process.env.GITHUB_API_URL) : null });
  } else throw new Error('Expected prepare or check with a trusted workflow event.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
