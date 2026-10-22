import test from 'node:test';
import assert from 'node:assert/strict';
import { automatedChecks, hasOidcDeployment, unsafeEnvPaths, validationReport } from '../scripts/checks.mjs';

const oidc = {
  on: { workflow_dispatch: null },
  jobs: { deploy: {
    permissions: { 'id-token': 'write' },
    steps: [{ uses: 'azure/login@v2', with: { 'client-id': 'id', 'tenant-id': 'tenant', 'subscription-id': 'sub' } }],
  } },
};

test('OIDC detection requires login identifiers, permissions, triggers and no creds', () => {
  assert.equal(hasOidcDeployment(oidc), true);
  for (const alter of [
    value => { delete value.jobs.deploy.permissions; },
    value => { value.jobs.deploy.permissions['id-token'] = 'read'; },
    value => { value.jobs.deploy.steps[0].with.creds = 'legacy secret'; },
    value => { delete value.jobs.deploy.steps[0].with['tenant-id']; },
    value => { delete value.on; },
  ]) {
    const value = structuredClone(oidc);
    alter(value);
    assert.equal(hasOidcDeployment(value), false);
  }
  const inherited = structuredClone(oidc);
  inherited.permissions = inherited.jobs.deploy.permissions;
  delete inherited.jobs.deploy.permissions;
  assert.equal(hasOidcDeployment(inherited), true);
});

test('.env check covers nested and suffixed files, permits only named templates', () => {
  const paths = ['.env', 'backend/.env.production', '.env.local', '.env.example', '.env.sample',
    '.env.template', 'backend/.env.example', '.env.example.local', 'foo.env', 'README.md'];
  assert.deepEqual(unsafeEnvPaths(paths.map(path => ({ type: 'blob', path }))),
    ['.env', 'backend/.env.production', '.env.local', '.env.example.local']);
});

test('validation requires completed issues and every check to pass', () => {
  const plan = { control: { id: 'test' }, existing: { state: 'closed', state_reason: 'completed', html_url: 'url' } };
  const checks = [{ name: 'a', status: 'PASS', detail: 'confirmed' }];
  assert.equal(validationReport([plan], checks).ready, true);
  assert.equal(validationReport([], checks).ready, false);
  assert.equal(validationReport([plan], []).ready, false);
  assert.equal(validationReport([{ ...plan, existing: undefined }], checks).ready, false);
  for (const state_reason of ['not_planned', 'duplicate', undefined]) {
    assert.equal(validationReport([{ ...plan, existing: { ...plan.existing, state_reason } }], checks).ready, false);
  }
  for (const status of ['FAIL', 'UNKNOWN']) {
    assert.equal(validationReport([plan], [{ ...checks[0], status }]).ready, false);
  }
});

export function detectorApi({ override = {}, truncated = false, scanSha = 'abc123', scanTime = new Date().toISOString(), rules = true, classic = false } = {}) {
  return {
    request: async (method, path) => {
      for (const [key, value] of Object.entries(override)) {
        if (path.includes(key)) {
          if (value instanceof Error) throw value;
          return value;
        }
      }
      if (path.endsWith('/vulnerability-alerts')) return null;
      if (path === '/repos/example/solution') return { default_branch: 'main' };
      if (path.includes('/branches/main/protection')) {
        if (classic) return { required_pull_request_reviews: { required_approving_review_count: 1 } };
        throw Object.assign(new Error('missing protection'), { status: 404 });
      }
      if (path === '/repos/example/solution/branches/main') return { commit: { sha: 'abc123' } };
      if (path.includes('/code-scanning/analyses')) return [{
        commit_sha: scanSha, created_at: scanTime, error: '', results_count: 0,
      }];
      if (path.includes('/rules/branches/')) return rules
        ? [{ type: 'pull_request', parameters: { required_approving_review_count: 1 } }] : [];
      if (path.includes('/git/trees/')) return { truncated, tree: [] };
      if (path.includes('/contents/.github/workflows?')) return [{ name: 'deploy.yml' }];
      if (path.includes('/contents/')) {
        const text = path.includes('CODEOWNERS') ? '* @example/team'
          : path.includes('SECURITY.md') ? '# Security\nPlease report security concerns using our private advisory reporting route.'
            : JSON.stringify(oidc);
        return { type: 'file', size: text.length, encoding: 'base64', content: Buffer.from(text).toString('base64') };
      }
      throw new Error(`Unexpected mock endpoint ${method} ${path}`);
    },
  };
}
export const metadata = {
  default_branch: 'main',
  security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } },
};
const policy = { scan_max_age_days: 30 };

test('detectors pass supported configuration and recognize active PR rules', async () => {
  const { checks, commitSha } = await automatedChecks(detectorApi(), 'example/solution', metadata, policy);
  assert.equal(checks.length, 9);
  assert.equal(commitSha, 'abc123');
  assert(checks.every(check => check.status === 'PASS'), JSON.stringify(checks));
  const { checks: classicChecks } = await automatedChecks(detectorApi({ classic: true, rules: false }), 'example/solution', metadata, policy);
  assert(classicChecks.every(check => check.status === 'PASS'));
});

test('unavailable settings and truncated tree remain unknown; stale scans fail', async () => {
  const { checks } = await automatedChecks(detectorApi({ truncated: true, scanTime: '2020-01-01' }), 'example/solution',
    { default_branch: 'main' }, policy);
  assert.equal(checks.find(check => check.name.startsWith('Secret')).status, 'UNKNOWN');
  assert.equal(checks.find(check => check.name.startsWith('No committed')).status, 'UNKNOWN');
  assert.equal(checks.find(check => check.name.startsWith('Code scanning')).status, 'FAIL');
  const { checks: wrongHead } = await automatedChecks(detectorApi({ scanSha: 'old' }), 'example/solution', metadata, policy);
  assert.equal(wrongHead.find(check => check.name.startsWith('Code scanning')).status, 'FAIL');
});

test('missing required protection fails and permission errors do not pass', async () => {
  const error = Object.assign(new Error('forbidden'), { status: 403 });
  const { checks } = await automatedChecks(detectorApi({ rules: false, override: { '/vulnerability-alerts': error } }),
    'example/solution', metadata, policy);
  assert.equal(checks.find(check => check.name.startsWith('Default-branch')).status, 'FAIL');
  assert.equal(checks.find(check => check.name.startsWith('Dependabot')).status, 'UNKNOWN');
});

test('server and network errors are explicit failures, not synthetic successful reports', async () => {
  const error = Object.assign(new Error('server error'), { status: 500 });
  await assert.rejects(automatedChecks(detectorApi({ override: { '/vulnerability-alerts': error } }),
    'example/solution', metadata, policy), /server error/);
});

test('a default-branch change during checks blocks readiness', async () => {
  const api = detectorApi();
  const request = api.request;
  let reads = 0;
  api.request = async (method, path) => {
    if (path === '/repos/example/solution/branches/main') {
      reads++;
      return { commit: { sha: reads === 1 ? 'abc123' : 'def456' } };
    }
    return request(method, path);
  };
  const { checks, commitSha } = await automatedChecks(api, 'example/solution', metadata, policy);
  assert.equal(commitSha, 'abc123');
  assert.equal(checks.find(check => check.name === 'Default-branch validation basis').status, 'FAIL');
  const branchApi = detectorApi();
  const branchRequest = branchApi.request;
  branchApi.request = async (method, path) => {
    if (path === '/repos/example/solution') {
      return { default_branch: 'trunk' };
    }
    return branchRequest(method, path);
  };
  const { checks: branchChecks } = await automatedChecks(branchApi, 'example/solution', metadata, policy);
  assert.equal(branchChecks.find(check => check.name === 'Default-branch validation basis').status, 'FAIL');
});
