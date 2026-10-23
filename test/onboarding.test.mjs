import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { ApiError } from '../scripts/github.mjs';
import { fields, loadConfig } from '../scripts/model.mjs';
import { checkPending, onboardingTarget, policyWithTarget, prepareOnboarding, requestOnboardingPr } from '../scripts/onboarding.mjs';

const hub = 'example/hub';
const root = `/repos/${hub}`;
const answers = { repository: 'example/new-app', business: 'Team', technical: 'Dev',
  data: 'Internal', exposure: 'Internal', audience: 'Small team', ai: 'No',
  integrations: 'None or read-only', hosting: 'Azure' };
const body = Object.entries(answers).map(([key, value]) => `### ${fields[key]}\n\n${value}`).join('\n\n');
const sourcePolicy = '# Preserve this comment\nallowed_repositories: [example/old-app]\nonboarding_prs: true\nonboarding_installation_id: 123\n';

function fixture(options = {}) {
  const calls = [];
  const comments = new Map();
  const prs = [];
  const branches = new Map();
  const issue = { number: 7, state: 'open', labels: [{ name: 'publication-request' }], body };
  const api = {
    async pages(path) {
      calls.push({ method: 'GET', path });
      if (path.includes('/pulls?')) return prs;
      if (path.includes('/comments')) return comments.get(path) ?? [];
      if (path.includes('/issues?')) return [issue];
      throw new Error(`Unexpected pages ${path}`);
    },
    async request(method, path, data) {
      calls.push({ method, path, data });
      const custom = options.respond?.({ method, path, data, calls, issue });
      if (custom !== undefined) return custom;
      if (path.includes('/collaborators/')) return { permission: options.permission ?? 'write' };
      if (method === 'DELETE' && path.includes('/labels/')) return null;
      if (path === `${root}/labels` || path.endsWith('/labels')) return {};
      if (path.endsWith('/comments') && method === 'POST') {
        const comment = { id: calls.length, user: { login: 'github-actions[bot]' }, ...data };
        comments.set(path, [...comments.get(path) ?? [], comment]);
        return comment;
      }
      if (path.includes('/issues/comments/') && method === 'PATCH') {
        const id = Number(path.split('/').at(-1));
        for (const list of comments.values()) {
          const comment = list.find(item => item.id === id);
          if (comment) { Object.assign(comment, data); return comment; }
        }
      }
      if (path === `${root}/issues/7`) return issue;
      if (path === root) return { default_branch: 'main', owner: { type: 'Organization' } };
      if (path === `${root}/git/ref/heads/main`) return { object: { sha: 'base-sha' } };
      if (path.includes('/git/ref/heads/onboard/')) {
        if (!branches.has(path.split('/heads/')[1])) throw new ApiError(404, method, path);
        return { object: { sha: 'proposal-sha' } };
      }
      if (path === `${root}/git/refs`) { branches.set(data.ref.slice('refs/heads/'.length), sourcePolicy); return {}; }
      if (path.includes('/contents/config/policy.yml')) {
        if (method === 'PUT') { branches.set(data.branch, Buffer.from(data.content, 'base64').toString()); return {}; }
        const ref = decodeURIComponent(path.split('?ref=')[1]);
        return { sha: 'file-sha', encoding: 'base64', content: Buffer.from(branches.get(ref) ?? sourcePolicy).toString('base64') };
      }
      if (path === `${root}/pulls` && method === 'POST') {
        if (options.denyPr) throw new ApiError(options.denyPr, method, path);
        const pr = { number: 10, state: 'open', ...data };
        prs.push(pr);
        return pr;
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  };
  return { api, calls, comments, prs, branches, issue };
}

async function prepare(mock, overrides = {}) {
  const config = await loadConfig();
  config.policy.onboarding_prs = true;
  config.policy.onboarding_installation_id = 123;
  return prepareOnboarding({ api: mock.api, hub, appId: '123', config,
    event: { issue: mock.issue, sender: { login: 'maintainer' }, action: 'opened' },
    eventName: 'issues', ...overrides });
}

test('target parsing rejects foreign owner, hub, invalid names and field injection', () => {
  assert.equal(onboardingTarget({ body }, hub), 'example/new-app');
  assert.equal(onboardingTarget({ body: body.replace('example/new-app', 'OTHER/app') }, hub, 'other'), 'other/app');
  for (const target of ['foreign/app', 'example/hub', 'example/..', 'example/.', 'example/app.git',
    'example/app`', 'example/app\ninjection', 'example/app?x', 'https://github.com/example/app']) {
    assert.throws(() => onboardingTarget({ body: body.replace('example/new-app', target) }, hub));
  }
});

test('policy proposal preserves comments and entries, adds only the exact target once', () => {
  const proposed = policyWithTarget(sourcePolicy, 'example/new-app');
  assert(proposed.includes('# Preserve this comment'));
  assert.deepEqual(parse(proposed).allowed_repositories, ['example/old-app', 'example/new-app']);
  assert.equal(policyWithTarget(proposed, 'example/new-app'), proposed);
  assert.throws(() => policyWithTarget('allowed_repositories: wrong', 'example/new-app'), /array/);
});

test('authorized missing target stays blocked and creates one PR across repeated requests and edits', async () => {
  const mock = fixture();
  assert.equal(await prepare(mock), false);
  assert.equal(await prepare(mock), false);
  await requestOnboardingPr(mock.api, hub, 'example/new-app', 8, 123);
  assert.equal(mock.prs.length, 1);
  assert.equal(mock.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(mock.calls.filter(call => call.path === `${root}/git/refs` && call.method === 'POST').length, 1);
  assert(mock.prs[0].body.includes('Only select repositories'));
  assert(mock.prs[0].body.includes('SOLUTION_APP_REPOSITORIES'));
  assert(mock.prs[0].body.includes('GITHUB_TOKEN-created PRs'));
  assert(mock.prs[0].body.includes('organizations/example/settings/installations/123'));
  assert(mock.comments.get(`${root}/issues/10/comments`).some(comment => comment.body.includes('/issues/8')));
  assert.equal(mock.comments.get(`${root}/issues/7/comments`).length, 1);
  assert(mock.calls.every(call => call.path.startsWith(root)));
});

test('authorization runs before hub mutations, unauthorized edits and malformed events cannot create PRs', async () => {
  for (const permission of ['read', 'triage', 'none']) {
    const mock = fixture({ permission });
    await assert.rejects(prepare(mock), /authorized/);
    assert(mock.calls.every(call => call.method === 'GET'));
  }
  const mock = fixture();
  await assert.rejects(prepare(mock, { eventName: 'pull_request_target' }), /Unexpected/);
  assert.equal(mock.calls.length, 0);
});

test('invalid input gets a blocking comment with no branch or target credentials', async () => {
  const mock = fixture();
  mock.issue.body = body.replace('example/new-app', 'foreign/app');
  await assert.rejects(prepare(mock), /installation owner/);
  assert.equal(mock.branches.size, 0);
  assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('onboarding blocked'));
});

test('disabled PRs, PAT mode and permission refusals have explicit comment-only fallbacks', async () => {
  const config = await loadConfig();
  config.policy.onboarding_prs = false;
  for (const overrides of [{ config }, { appId: '' }]) {
    const mock = fixture();
    assert.equal(await prepare(mock, overrides), false);
    assert.equal(mock.prs.length, 0);
    assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('Awaiting repository onboarding'));
  }
  for (const status of [403, 422]) {
    const mock = fixture({ denyPr: status });
    assert.equal(await prepare(mock), false);
    assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes(`returned ${status}`));
    assert.equal(mock.prs.length, 0);
    assert.equal(await prepare(mock), false);
    assert.equal(mock.branches.size, 1);
  }
  const mock = fixture({ denyPr: 500 });
  await assert.rejects(prepare(mock), /preparation failed/);
  assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('returned 500'));
});

test('already allowlisted requests continue without a PR, closed PRs are not duplicated', async () => {
  const mock = fixture();
  const config = await loadConfig();
  config.policy.allowed_repositories = ['example/new-app'];
  assert.equal(await prepare(mock, { config }), true);
  assert.equal(mock.prs.length, 0);
  await prepare(mock);
  mock.prs[0].state = 'closed';
  await assert.rejects(prepare(mock), /preparation failed/);
  assert.equal(mock.prs.length, 1);
});

test('partial PR creation never overwrites a diverged recovery branch', async () => {
  const mock = fixture({ denyPr: 403 });
  await prepare(mock);
  const branch = [...mock.branches.keys()][0];
  mock.branches.set(branch, '# human edit\n' + mock.branches.get(branch));
  await assert.rejects(prepare(mock), /preparation failed/);
  assert.equal(mock.branches.size, 1);
  assert.equal(mock.calls.filter(call => call.method === 'PUT').length, 1);
  assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('differs from the proposal'));
});

test('post-merge diagnostics clear pending only with exact scope, allowlist and target access', async () => {
  const mock = fixture();
  const config = await loadConfig();
  config.policy.allowed_repositories = ['example/new-app'];
  const reads = [];
  const targetApi = { async request(method, path) {
    reads.push({ method, path });
    return path.endsWith('/new-app') ? { has_issues: true } : [];
  } };
  await checkPending({ api: mock.api, targetApi, hub, config, scopePassed: true });
  assert.deepEqual(reads.map(call => call.method), ['GET', 'GET']);
  assert(mock.calls.some(call => call.method === 'DELETE' && call.path.endsWith('/onboarding-pending')));
  assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('checks passed'));
  assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('/publish'));
});

test('scope failure, inaccessible targets and changed requests remain pending with a blocking report', async () => {
  for (const mode of ['scope', 'access', 'edit']) {
    const mock = fixture({ respond: ({ path }) => {
      if (mode === 'edit' && path === `${root}/issues/7`) return { ...mock.issue, body: body.replace('new-app', 'other-app') };
    } });
    const config = await loadConfig();
    config.policy.allowed_repositories = ['example/new-app'];
    const targetApi = { async request() {
      if (mode === 'access') throw new ApiError(404, 'GET', '/repos/example/new-app');
      return { has_issues: true };
    } };
    await assert.rejects(checkPending({ api: mock.api, targetApi, hub, config, scopePassed: mode !== 'scope' }), /checks failed/);
    assert(!mock.calls.some(call => call.method === 'DELETE' && call.path.endsWith('/onboarding-pending')));
    assert(mock.comments.get(`${root}/issues/7/comments`)[0].body.includes('remains blocked'));
  }
});

test('labels cannot authorize targets: unallowlisted pending requests never get target API calls', async () => {
  const mock = fixture();
  await checkPending({ api: mock.api, targetApi: null, hub, config: await loadConfig(), scopePassed: false });
  assert(mock.calls.every(call => call.method === 'GET'));
});

test('workflow isolates PR permissions and always reports App failures without publishing', async () => {
  const intake = parse(await readFile('.github/workflows/intake.yml', 'utf8'));
  assert.deepEqual(intake.jobs.onboarding.permissions, { contents: 'write', issues: 'write', 'pull-requests': 'write' });
  assert(!JSON.stringify(intake.jobs.onboarding).includes('SOLUTION_APP_PRIVATE_KEY'));
  assert.equal(intake.jobs.intake.needs, 'onboarding');
  assert(intake.jobs.intake.if.includes("needs.onboarding.outputs.ready == 'true'"));
  const workflow = parse(await readFile('.github/workflows/onboarding.yml', 'utf8'));
  assert.equal(workflow.concurrency.group, intake.concurrency.group);
  assert.deepEqual(workflow.permissions, {});
  const steps = workflow.jobs.check.steps;
  assert(steps.find(step => step.run === 'node scripts/onboarding.mjs check').if.includes('!cancelled()'));
  assert(!JSON.stringify(workflow).includes('scripts/run.mjs'));
  const ci = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  assert(Object.hasOwn(ci.on, 'workflow_dispatch'));
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert(!JSON.stringify(ci).includes('SOLUTION_APP_PRIVATE_KEY'));
});
