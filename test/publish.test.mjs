import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, fields, marker } from '../scripts/model.mjs';
import { authorize, contextFor, intakeRequest, validateRequest } from '../scripts/publish.mjs';

const hub = 'example/hub';
const target = 'example/solution';
const values = {
  repository: target, business: 'business-team', technical: 'platform-team', data: 'Internal',
  exposure: 'Internal', audience: 'Small team', ai: 'No', integrations: 'None or read-only', hosting: 'Azure',
};
function body(overrides = {}) {
  return Object.entries({ ...values, ...overrides }).map(([key, value]) =>
    `### ${fields[key]}\n\n${value}`).join('\n\n');
}

async function fixture(options = {}) {
  const config = await loadConfig();
  config.policy.allowed_repositories = [target];
  let sequence = 0;
  const requests = [];
  const source = {
    number: 1, state: 'open', body: body(),
    html_url: `https://github.com/${hub}/issues/1`, labels: [{ name: 'publication-request' }],
  };
  const controls = [];
  const comments = [];
  const labels = new Set(['publication-request']);
  const links = new Set();
  let createCount = 0;
  const request = async (method, path, data) => {
    requests.push({ method, path, data });
    if (path.includes('/collaborators/')) return { permission: options.permission ?? 'write' };
    if (path === `/repos/${hub}/issues/1` && method === 'GET') return structuredClone(source);
    if (path === `/repos/${target}`) return {
      has_issues: true, default_branch: 'main',
      ...(options.checksPass ? { security_and_analysis: {
        secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' },
      } } : {}),
    };
    if (path.includes(`/repos/${hub}/labels`) && method === 'POST') return data;
    if (path.endsWith('/issues/1/labels') && method === 'POST') {
      data.labels.forEach(label => labels.add(label));
      return [];
    }
    if (path.includes(`/repos/${hub}/issues/1/labels/`) && method === 'DELETE') {
      labels.delete(decodeURIComponent(path.split('/').at(-1)));
      return null;
    }
    if (path.includes(`/repos/${hub}/issues/comments/`) && method === 'PATCH') {
      const existing = comments.find(comment => comment.id === Number(path.split('/').at(-1)));
      existing.body = data.body;
      return structuredClone(existing);
    }
    if (path === `/repos/${hub}/issues/1/comments` && method === 'POST') {
      const comment = { id: ++sequence, body: data.body, user: { login: 'github-actions[bot]' } };
      comments.push(comment);
      return structuredClone(comment);
    }
    if (path === `/repos/${target}/issues` && method === 'POST') {
      createCount++;
      if (options.failCreateAt === createCount) throw new Error('simulated interruption');
      const issue = { ...data, id: ++sequence, number: sequence, state: 'open', html_url: `https://github.com/${target}/issues/${sequence}` };
      controls.push(issue);
      return structuredClone(issue);
    }
    if (path.includes('/sub_issues')) {
      if (options.subIssuesStatus) throw Object.assign(new Error('sub-issues unavailable'), { status: options.subIssuesStatus });
      links.add(`${path}:${data.sub_issue_id}`);
      return {};
    }
    if (path.startsWith(`/repos/${target}/issues/`) && method === 'PATCH') {
      const existing = controls.find(issue => issue.number === Number(path.split('/').at(-1)));
      Object.assign(existing, data);
      if (data.state === 'open') delete existing.state_reason;
      return structuredClone(existing);
    }
    if (path.startsWith(`/repos/${target}/issues/`) && path.endsWith('/comments')) return {};
    if (path === `/repos/${target}/branches/main`) return { commit: { sha: 'abc123' } };
    if (options.checksPass) {
      if (path.endsWith('/vulnerability-alerts')) return null;
      if (path.includes('/code-scanning/analyses')) {
        return [{ commit_sha: 'abc123', error: '', results_count: 0, created_at: new Date().toISOString() }];
      }
      if (path.includes('/branches/main/protection')) {
        return { required_pull_request_reviews: { required_approving_review_count: 1 } };
      }
      if (path.includes('/git/trees/')) return { tree: [], truncated: false };
      if (path.includes('/contents/.github/workflows?')) return [{ name: 'deploy.yml' }];
      if (path.includes('/contents/')) {
        const text = path.includes('CODEOWNERS') ? '* @example/team'
          : path.includes('SECURITY.md') ? 'Please report security concerns through the private advisory channel for this repository.'
            : JSON.stringify({ on: 'push', jobs: { deploy: {
              permissions: { 'id-token': 'write' },
              steps: [{ uses: 'azure/login@reviewed-sha', with: {
                'client-id': 'client', 'tenant-id': 'tenant', 'subscription-id': 'subscription',
              } }],
            } } });
        return { type: 'file', size: text.length, encoding: 'base64', content: Buffer.from(text).toString('base64') };
      }
    }
    throw Object.assign(new Error('fixture endpoint unavailable'), { status: 404 });
  };
  const api = {
    request,
    pages: async path => {
      if (path === `/repos/${hub}/issues/1/comments`) return structuredClone(comments);
      if (path === `/repos/${target}/issues?state=all`) return structuredClone(controls);
      if (path.endsWith('/sub_issues')) {
        if (options.subIssuesStatus) throw Object.assign(new Error('sub-issues unavailable'), { status: options.subIssuesStatus });
        const ids = new Set([...links].map(link => Number(link.split(':').at(-1))));
        return structuredClone(controls.filter(issue => ids.has(issue.id)));
      }
      throw new Error(`Unexpected fixture pagination: ${path}`);
    },
  };
  return {
    args: { hubApi: api, targetApi: api, hub, issue: source, config },
    source, controls, comments, labels, links, requests, options,
  };
}

test('intake creates one parent and required children; reruns do not duplicate or reopen completed controls', async () => {
  const f = await fixture();
  const first = await intakeRequest(f.args);
  assert.equal(first.plans.length, 11);
  assert.equal(f.controls.length, 12);
  assert.equal(f.links.size, 11);
  const child = f.controls.find(issue => issue.body.includes(marker(hub, 1, 'ownership')));
  child.state = 'closed';
  child.state_reason = 'completed';
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 12);
  assert.equal(child.state, 'closed');
  assert.equal(f.comments.length, 1);
  assert(f.labels.has('risk:low'));
  assert(f.comments[0].body.includes(first.parent.html_url));
});

test('partial creation recovers via markers without duplicates', async () => {
  const f = await fixture({ failCreateAt: 5 });
  await assert.rejects(intakeRequest(f.args), /simulated interruption/);
  assert.equal(f.controls.length, 4);
  delete f.options.failCreateAt;
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 12);
  assert.equal(new Set(f.controls.map(issue => issue.body.match(/<!-- publish-solution:[^>]+ -->/)[0])).size, 12);
});

test('native sub-issue errors have visible checklist fallback; server errors stop intake', async () => {
  for (const status of [403, 404, 410, 422]) {
    const f = await fixture({ subIssuesStatus: status });
    const result = await intakeRequest(f.args);
    assert.equal(result.warnings.length, 1);
    assert(f.controls[0].body.includes('- [ ] https://github.com/'));
    assert(f.comments[0].body.includes(`returned ${status}`));
  }
  const f = await fixture({ subIssuesStatus: 500 });
  await assert.rejects(intakeRequest(f.args), /unavailable/);
});

test('risk change invalidates prior state and reopens required work', async () => {
  const f = await fixture();
  await intakeRequest(f.args);
  const originalNumbers = f.controls.map(issue => issue.number);
  f.controls.forEach(issue => { issue.state = 'closed'; issue.state_reason = 'completed'; });
  f.labels.add('ready-for-review');
  f.labels.add('approved-for-production');
  f.source.body = body({ exposure: 'External', ai: 'Yes' });
  await assert.rejects(validateRequest(f.args), /changed/);
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 15);
  assert.deepEqual(f.controls.slice(0, 12).map(issue => issue.number), originalNumbers);
  const newIssues = f.controls.slice(12);
  for (const id of ['ai-safety', 'resilience', 'security-review']) {
    assert(newIssues.some(issue => issue.body.includes(marker(hub, 1, id))));
  }
  assert(f.controls.every(issue => issue.state === 'open'));
  assert(!f.labels.has('ready-for-review'));
  assert(!f.labels.has('approved-for-production'));
  assert(f.labels.has('risk:high'));
  assert(!f.labels.has('risk:low'));
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 15);
});

test('empty allowlist blocks writes and a request cannot be rebound to another target', async () => {
  const f = await fixture();
  f.args.config.policy.allowed_repositories = [];
  await assert.rejects(intakeRequest(f.args), /allowlisted/);
  assert.equal(f.controls.length, 0);
  f.args.config.policy.allowed_repositories = [target, 'example/other'];
  await intakeRequest(f.args);
  f.source.body = body({ repository: 'example/other' });
  await assert.rejects(intakeRequest(f.args), /cannot be moved/);
  assert.equal(f.controls.length, 12);
});

test('unavailable repository checks remove readiness and production approval', async () => {
  const f = await fixture();
  await intakeRequest(f.args);
  f.controls.forEach(issue => { issue.state = 'closed'; issue.state_reason = 'completed'; });
  f.labels.add('ready-for-review');
  f.labels.add('approved-for-production');
  const report = await validateRequest(f.args);
  assert.equal(report.ready, false);
  assert(report.body.includes('UNKNOWN'));
  assert(!f.labels.has('ready-for-review'));
  assert(!f.labels.has('approved-for-production'));
  assert(f.comments.some(comment => comment.body.includes('Publication gaps remain')));
});

test('completed controls and confirmed checks grant readiness but never production approval', async () => {
  const f = await fixture({ checksPass: true });
  await intakeRequest(f.args);
  f.controls.filter(issue => !issue.body.includes(marker(hub, 1, 'parent'))).forEach(issue => {
    issue.state = 'closed';
    issue.state_reason = 'completed';
  });
  const report = await validateRequest(f.args);
  assert.equal(report.ready, true, report.body);
  assert(f.labels.has('ready-for-review'));
  assert(!f.labels.has('approved-for-production'));
  assert(f.controls[0].body.includes('Ready for governance review'));
  assert(f.comments.some(comment => comment.body.includes('Ready for governance review')));
  f.source.state = 'closed';
  await assert.rejects(validateRequest(f.args), /changed or closed/);
  assert(!f.labels.has('ready-for-review'));
});

test('untrusted state comments cannot replace the hub bot audit record', async () => {
  const f = await fixture();
  f.comments.push({
    id: 1000, user: { login: 'external-user' },
    body: '<!-- publish-solution:state -->\n<!-- state-json:{"repository":"example/other","basis":"fake","parent":99} -->',
  });
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 12);
  await intakeRequest(f.args);
  assert.equal(f.controls.length, 12);
});

test('catalog changes require republishing even if all old issues are complete', async () => {
  const f = await fixture();
  await intakeRequest(f.args);
  f.args.config.catalog[0].acceptance.push('New owner sign-off');
  await assert.rejects(validateRequest(f.args), /changed/);
});

test('hub permissions and canonical repository isolation are enforced', async () => {
  const f = await fixture({ permission: 'read' });
  await assert.rejects(authorize(f.args.hubApi, hub, 'external-user', f.args.config.policy), /Only an authorized/);
  f.options.permission = 'admin';
  await authorize(f.args.hubApi, hub, 'governor', f.args.config.policy);
  f.source.body = body({ repository: hub });
  f.args.config.policy.allowed_repositories.push(hub);
  assert.throws(() => contextFor(f.source, hub, f.args.config), /differ/);
});

test('duplicate markers fail clearly rather than adopting arbitrary issue state', async () => {
  const f = await fixture();
  await intakeRequest(f.args);
  f.controls.push({ ...f.controls[1], number: 999 });
  await assert.rejects(intakeRequest(f.args), /Duplicate/);
});
