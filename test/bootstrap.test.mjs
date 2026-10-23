import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../scripts/model.mjs';
import { ApiError, GitHub } from '../scripts/github.mjs';
import { bootstrap, main, parseArgs, requiredLabels, scaffoldProposal } from '../scripts/bootstrap.mjs';

const hub = '/repos/example/hub';
const workflow = Buffer.from('on:\n  workflow_dispatch:\njobs: {}\n').toString('base64');
const metadata = {
  full_name: 'example/hub', visibility: 'public', private: false, permissions: { admin: true },
  has_issues: true, has_pages: false, default_branch: 'main',
};
const config = await loadConfig();
const args = (...flags) => parseArgs(['--repo', 'example/hub', ...flags]);

function fixture(overrides = {}) {
  const calls = [];
  const labels = structuredClone(overrides.labels || []);
  let site = overrides.site;
  const api = new GitHub('fixture-not-secret', undefined, async (url, options) => {
    const path = url.replace('https://api.github.com', '');
    const method = options.method;
    const data = options.body && JSON.parse(options.body);
    calls.push({ method, path, data });
    const custom = await overrides.respond?.({ method, path, data, labels, calls });
    if (custom !== undefined) return custom;
    const ok = value => new Response(JSON.stringify(value));
    if (path === hub) return ok({ ...metadata, ...overrides.repo });
    if (path === `${hub}/actions/permissions`) return ok({ enabled: true, allowed_actions: 'selected', ...overrides.actions });
    if (path === `${hub}/actions/permissions/workflow`) return ok({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: false });
    if (path.startsWith(`${hub}/labels?`)) {
      const page = Number(new URL(url).searchParams.get('page'));
      return ok(labels.slice((page - 1) * 100, page * 100));
    }
    if (path === `${hub}/labels` && method === 'POST') {
      labels.push(data);
      return ok(data);
    }
    if (path.startsWith(`${hub}/labels/`)) {
      const label = labels.find(item => item.name === decodeURIComponent(path.split('/').at(-1)));
      return label ? ok(label) : new Response('', { status: 404 });
    }
    if (path === `${hub}/pages`) {
      if (method === 'POST') { site = { build_type: 'workflow', public: true }; return ok(site); }
      return site ? ok(site) : new Response('', { status: 404 });
    }
    if (path.startsWith(`${hub}/contents/.github/workflows/pages.yml?`)) {
      return ok({ encoding: 'base64', content: overrides.workflow || workflow });
    }
    if (path === `${hub}/actions/workflows/pages.yml`) return ok({ state: overrides.workflowState || 'active' });
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  });
  return { api, calls, labels };
}

async function run(flags = [], overrides = {}) {
  const mock = fixture(overrides);
  const report = await bootstrap(args(...flags), { config, api: mock.api });
  return { ...mock, ...report };
}

test('required labels match the manual setup colors and current issue forms', async () => {
  const setup = await readFile(new URL('../SETUP.md', import.meta.url), 'utf8');
  const documented = [...setup.matchAll(/^gh label create ([\w-]+) --repo YOUR-ORG\/YOUR-HUB --color ([a-f\d]{6})$/gm)]
    .map(([, name, color]) => ({ name, color }));
  assert.deepEqual(requiredLabels, documented);
  for (const name of ['publication', 'reassessment', 'control-exception', 'decommission']) {
    const file = name === 'publication' ? 'request-publication' : name === 'reassessment' ? 'request-reassessment' :
      name === 'decommission' ? 'request-decommission' : 'request-control-exception';
    const template = await readFile(new URL(`../.github/ISSUE_TEMPLATE/${file}.yml`, import.meta.url), 'utf8');
    const label = name === 'publication' ? 'publication-request' : name === 'reassessment' ? 'reassessment-request' :
      name === 'decommission' ? 'decommission-request' : 'control-exception';
    assert.match(template, new RegExp(`labels:.*${label}`));
    assert(requiredLabels.some(item => item.name === label));
  }
});

test('default preview and each explicit selection make only GET requests', async () => {
  for (const flags of [[], ['--labels'], ['--pages'], ['--scaffold', '--guide-url', 'https://guide.example/team']]) {
    const result = await run(flags);
    assert.equal(result.failed, false, JSON.stringify(result.results));
    assert(result.calls.every(call => call.method === 'GET'));
    assert(result.calls.every(call => call.path.startsWith(hub)));
    assert(!result.results.some(item => item.status === 'APPLIED'));
  }
});

test('CLI preview cannot write local files even with configuration scaffolding', () => {
  for (const flags of [[], ['--scaffold', '--guide-url', 'https://guide.example/team', '--target', 'example/solution']]) {
    const source = `
      import { main } from ${JSON.stringify(new URL('../scripts/bootstrap.mjs', import.meta.url).href)};
      globalThis.fetch = async (url, options) => {
        if (options.method !== 'GET') throw new Error('Unexpected write');
        const path = new URL(url).pathname;
        const data = path.endsWith('/labels') ? [] :
          path.endsWith('/permissions/workflow') ? { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false } :
          path.endsWith('/permissions') ? { enabled: false } : ${JSON.stringify(metadata)};
        return new Response(JSON.stringify(data));
      };
      process.exitCode = await main(${JSON.stringify(['--repo', 'example/hub', ...flags])}, { HUB_TOKEN: 'fixture-not-secret' });
    `;
    // Permission mode permits reads only; any attempted local write fails the command.
    const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
    const child = spawnSync(process.execPath, [permissionFlag, '--allow-fs-read=*', '--input-type=module', '-e', source], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr + child.stdout);
    assert.match(child.stdout, /PREVIEW: read-only, including local files/);
    assert.doesNotMatch(child.stdout, /^APPLIED /m);
    assert.match(child.stdout, /APPLIED=0/);
  }
});

test('input validation fails closed before network or writes', () => {
  for (const flags of [
    ['--apply'], ['--apply', '--scaffold', '--guide-url', 'https://guide.example'],
    ['--repo', 'example/..'], ['--repo', 'example/.'], ['--repo', 'example/hub.git'],
    ['--repo', 'https://github.com/example/hub'], ['--repo', 'example/hub?x'],
    ['--unknown'], ['--labels', '--labels'], ['--target', 'other/solution'],
    ['--scaffold'], ['--scaffold', '--guide-url', 'http://guide.example'],
    ['--scaffold', '--guide-url', 'https://user:password@guide.example'],
    ['--scaffold', '--guide-url', 'https://127.0.0.1'],
    ['--scaffold', '--guide-url', 'https://guide.example?token=value'],
    ['--scaffold', '--guide-url', 'https://guide.example/#fragment'],
    ['--scaffold', '--guide-url', 'https://guide.example/#'],
    ['--scaffold', '--guide-url', 'https://guide.example/?'],
    ['--scaffold', '--guide-url', 'https://guide.example', '--target', 'example/hub'],
    ['--scaffold', '--guide-url', 'https://guide.example', '--target', 'example/one', '--target', 'EXAMPLE/ONE'],
    ['--scaffold', '--guide-url', 'https://guide.example', '--app-id', 'not-numeric'],
    ['--scaffold', '--guide-url', 'https://guide.example', '--app-owner', '../org'],
    ['--pages', '--apply'], ['--acknowledge-public-pages'],
  ]) {
    const input = flags[0] === '--repo' ? flags : ['--repo', 'example/hub', ...flags];
    assert.throws(() => parseArgs(input), undefined, JSON.stringify(input));
  }
});

test('CLI rejects alternate API/server destinations and missing authorization', async () => {
  for (const env of [
    { GITHUB_API_URL: 'https://untrusted.example', HUB_TOKEN: 'fixture-not-secret' },
    { GITHUB_API_URL: 'https://api.github.com@untrusted.example', HUB_TOKEN: 'fixture-not-secret' },
    { GITHUB_SERVER_URL: 'https://enterprise.ghe.com', HUB_TOKEN: 'fixture-not-secret' },
  ]) await assert.rejects(main(['--repo', 'example/hub'], env), /GitHub.com only/);
  await assert.rejects(main(['--repo', 'example/hub'], {}), /token is required/);
});

test('labels apply is idempotent and preserves customizations/unrelated labels across pagination', async () => {
  const labels = [
    ...Array.from({ length: 100 }, (_, index) => ({ name: `custom-${index}`, color: 'ffffff', description: 'keep' })),
    { name: 'Publication-Request', color: 'abcdef', description: 'custom description' },
  ];
  const mock = fixture({ labels });
  const first = await bootstrap(args('--labels', '--apply'), { config, api: mock.api });
  assert.equal(first.failed, false);
  assert.deepEqual(mock.labels.slice(0, 101), labels);
  assert.equal(mock.calls.filter(call => call.method === 'POST').length, 4);
  assert(mock.calls.some(call => call.path.endsWith('page=2')));
  assert(mock.calls.filter(call => call.method !== 'GET').every(call => call.path === `${hub}/labels`));
  const count = mock.calls.length;
  const second = await bootstrap(args('--labels', '--apply'), { config, api: mock.api });
  assert.equal(second.failed, false);
  assert(mock.calls.slice(count).every(call => call.method === 'GET'));
});

test('label race is confirmed and never overwrites custom metadata; unrelated 422 fails', async () => {
  const result = await run(['--labels', '--apply'], {
    respond: ({ method, path, data, labels }) => {
      if (method === 'POST' && path === `${hub}/labels`) {
        labels.push({ name: data.name, color: 'ffffff', description: 'concurrent custom' });
        return new Response('', { status: 422 });
      }
    },
  });
  assert.equal(result.failed, false);
  assert(result.labels.every(label => label.description === 'concurrent custom'));
  const invalid = await run(['--labels', '--apply'], {
    respond: ({ method }) => method === 'POST' ? new Response('', { status: 422 }) : undefined,
  });
  assert.equal(invalid.failed, true);
});

test('permission and partial mutation failures are explicit and halt later operations', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const result = await run(['--labels', '--pages', '--apply', '--acknowledge-public-pages'], {
      respond: ({ method, path, labels }) => {
        if (method === 'POST' && labels.length === 1) return new Response('sensitive response', { status });
        if (status === 401 && path === `${hub}/actions/permissions`) return new Response('', { status });
      },
    });
    assert.equal(result.failed, true);
    assert(result.results.some(item => item.status === 'BLOCKED' && item.detail.includes(String(status))));
    assert(!JSON.stringify(result.results).includes('sensitive response'));
    assert(!result.calls.some(call => call.path === `${hub}/pages`));
    if (status !== 401) assert.equal(result.results.filter(item => item.status === 'APPLIED').length, 1);
  }
  const verify = await run(['--labels', '--apply'], {
    respond: ({ method, path }) => method === 'POST' && path === `${hub}/labels`
      ? new Response('{}') : undefined,
  });
  assert.equal(verify.failed, true);
  assert(verify.results.some(item => item.detail.includes('verification failed')));
});

test('configuration proposal preserves policy, scopes App to exact targets and never applies configuration', async () => {
  const original = structuredClone(config);
  original.policy.allowed_repositories = ['example/existing'];
  const options = args('--scaffold', '--guide-url', 'https://guide.example/path/', '--target', 'example/new', '--app-id', '123');
  const proposal = scaffoldProposal(options, original);
  assert.deepEqual(proposal.proposed_files['config/policy.yml'].allowed_repositories, ['example/existing', 'example/new']);
  assert.equal(proposal.proposed_files['config/policy.yml'].requester_permissions, original.policy.requester_permissions);
  assert.equal(proposal.proposed_actions_variables.SOLUTION_APP_REPOSITORIES, 'existing,new');
  assert.equal(proposal.proposed_files['config/policy.yml'].guide_url, 'https://guide.example/path');
  assert.equal(proposal.proposed_link_edits['.github/ISSUE_TEMPLATE/config.yml']['contact_links[1].url'], 'https://guide.example/path/requests.html');
  assert.deepEqual(original.policy.allowed_repositories, ['example/existing']);
  assert.throws(() => scaffoldProposal({ ...options, targets: ['foreign/target'] }, original), /one installation owner/);
  const result = await run(['--labels', '--apply', '--scaffold', '--guide-url', 'https://guide.example', '--target', 'foreign/target']);
  assert.equal(result.failed, true);
  assert.equal(result.calls.length, 0);
  const valid = await run(['--labels', '--apply', '--scaffold', '--guide-url', 'https://guide.example']);
  assert.equal(valid.failed, false);
  assert(valid.calls.filter(call => call.method !== 'GET').every(call => call.path === `${hub}/labels`));
});

test('unselected Pages/labels never mutate and Issues/Actions settings remain diagnostic', async () => {
  const labels = await run(['--labels', '--apply'], { repo: { has_issues: false }, actions: { enabled: false } });
  assert.equal(labels.failed, false);
  assert(labels.results.some(item => item.status === 'MANUAL' && item.detail.startsWith('Issues disabled')));
  assert(!labels.calls.some(call => call.path === `${hub}/pages`));
  const pages = await run(['--pages', '--apply', '--acknowledge-public-pages']);
  assert.equal(pages.failed, false);
  assert(!pages.calls.some(call => call.path.includes('/labels')));
  assert.deepEqual(pages.calls.filter(call => call.method !== 'GET'), [
    { method: 'POST', path: `${hub}/pages`, data: { build_type: 'workflow', public: true } },
  ]);
});

test('Pages refuses private/internal, unknown access, automatic triggers and missing prerequisites', async () => {
  for (const overrides of [
    { repo: { visibility: 'private', private: true } },
    { repo: { visibility: 'internal', private: true } },
    { repo: { visibility: undefined } },
    { repo: { permissions: {} } }, { repo: { has_pages: true } },
    { repo: { default_branch: '' } }, { repo: { archived: true } },
    { repo: { full_name: 'other/hub' } }, { actions: { enabled: false } },
    { workflowState: 'disabled_manually' },
    { workflow: Buffer.from('on: [push, workflow_dispatch]').toString('base64') },
    { workflow: Buffer.from('on:\n  push:\n  workflow_dispatch:\n').toString('base64') },
    { respond: ({ path }) => path === `${hub}/pages` ? new Response('', { status: 403 }) : undefined },
  ]) {
    const result = await run(['--pages', '--apply', '--acknowledge-public-pages'], overrides);
    assert.equal(result.failed, true, JSON.stringify(overrides));
    assert(result.calls.every(call => call.method === 'GET'));
  }
});

test('existing Pages is never changed regardless of source/access settings', async () => {
  const result = await run(['--pages', '--apply', '--acknowledge-public-pages'], {
    repo: { visibility: 'private', private: true, has_pages: true },
    site: { build_type: 'legacy', public: false, source: { branch: 'custom' } },
  });
  assert.equal(result.failed, false);
  assert(result.calls.every(call => call.method === 'GET'));
  assert(result.results.some(item => item.status === 'UNCHANGED' && item.detail.includes('Pages already exists')));
});

test('Pages races never update an existing site and failed create/verification stays blocked', async () => {
  let reads = 0;
  const concurrent = await run(['--pages', '--apply', '--acknowledge-public-pages'], {
    respond: ({ path, method }) => {
      if (path === `${hub}/pages` && method === 'GET' && ++reads === 2) return new Response('{"public":false}');
    },
  });
  assert.equal(concurrent.failed, false);
  assert(concurrent.calls.every(call => call.method === 'GET'));
  for (const status of [403, 422]) {
    const result = await run(['--pages', '--apply', '--acknowledge-public-pages'], {
      respond: ({ method, path }) => method === 'POST' && path === `${hub}/pages` ? new Response('', { status }) : undefined,
    });
    assert.equal(result.failed, true);
  }
  const verify = await run(['--pages', '--apply', '--acknowledge-public-pages'], {
    respond: ({ method, path }) => path === `${hub}/pages` && method === 'POST' ? new Response('{}') : undefined,
  });
  assert.equal(verify.failed, true);
  assert(verify.results.some(item => item.status === 'APPLIED'));
  assert(verify.results.some(item => item.status === 'BLOCKED'));
});

test('API errors retain safe status diagnostics without credentials', () => {
  assert.match(new ApiError(403, 'POST', `${hub}/labels`).message, /returned 403/);
});

test('CLI exits nonzero for requested API failures without logging secret bodies', () => {
  const source = `
    import { main } from ${JSON.stringify(new URL('../scripts/bootstrap.mjs', import.meta.url).href)};
    globalThis.fetch = async () => new Response('private-response-data', { status: 403 });
    process.exitCode = await main(['--repo', 'example/hub', '--labels', '--apply'], { HUB_TOKEN: 'fixture-not-secret' });
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stdout, /BLOCKED GitHub API GET .*returned 403/);
  assert.match(child.stdout, /APPLIED=0/);
  assert.doesNotMatch(child.stdout + child.stderr, /private-response-data|fixture-not-secret/);
});
