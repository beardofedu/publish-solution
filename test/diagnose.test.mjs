import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/model.mjs';
import { formatDiagnostics, listActionItems, staticDiagnostics } from '../scripts/diagnose.mjs';

test('static preflight reports allowlist, same-hub, and out-of-scope cases without API access', async () => {
  const config = await loadConfig();
  config.policy.allowed_repositories = ['example/solution'];
  const results = staticDiagnostics(config, 'example/hub', [
    'example/solution', 'example/hub', 'other/solution',
  ]);
  assert(results.some(result => result.name === 'Target example/solution' && result.status === 'PASS'));
  assert(results.some(result => result.name === 'Target example/hub' && result.status === 'BLOCKED'));
  assert(results.some(result => result.name === 'Target other/solution' && result.status === 'BLOCKED'));
  assert(formatDiagnostics(results).includes('cannot inspect Actions secret/variable visibility'));
  const empty = staticDiagnostics({ policy: { ...config.policy, allowed_repositories: [] } }, 'example/hub', []);
  assert(empty.some(result => result.name === 'Target allowlist' && result.status === 'BLOCKED'));
});

test('read-only Actions metadata listing handles GitHub paginated object responses', async () => {
  const pages = [];
  const values = await listActionItems({
    request: async (method, path) => {
      pages.push(path);
      const page = Number(path.match(/[?&]page=(\d+)/)?.[1]);
      return { variables: page === 1 ? Array(100).fill({ name: 'var' }) : [{ name: 'last' }] };
    },
  }, '/repos/example/hub/actions/variables', 'variables');
  assert.equal(values.length, 101);
  assert.equal(pages.length, 2);
});
