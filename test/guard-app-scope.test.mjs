import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { appRepositoryNames, validateAppRepositoryScope, verifyInstallationScope } from '../scripts/guard-app-scope.mjs';

test('App scope is required, exact, and unique before token creation', () => {
  assert.deepEqual(appRepositoryNames('', ''), []);
  assert.deepEqual(appRepositoryNames('123', ' team-helper,expense-helper '), ['team-helper', 'expense-helper']);
  assert.throws(() => appRepositoryNames('   ', 'team-helper'), /numeric App ID/);
  for (const value of ['', '   ', 'team-helper,', 'org/team-helper', 'team-helper,TEAM-HELPER', ',team-helper']) {
    assert.throws(() => appRepositoryNames('123', value), /refusing to mint/);
  }
});

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

test('live scope inspects full installation with metadata-only token and revokes it on success or mismatch', async () => {
  for (const mode of ['exact', 'extra', 'missing', 'foreign', 'all', 'suspended', 'unknown', 'denied', 'revoke']) {
    const calls = [];
    const fetcher = async (url, options) => {
      const path = new URL(url).pathname;
      calls.push({ path, ...options });
      const ok = data => new Response(JSON.stringify(data));
      if (path === '/app/installations') return ok([{
        id: 123, account: { login: 'Example' }, repository_selection: mode === 'all' ? 'all' : 'selected',
        suspended_at: mode === 'suspended' ? '2026-01-01' : null,
      }]);
      if (path.endsWith('/access_tokens')) return ok({ token: 'test-metadata-token' });
      if (path === '/installation/token') return new Response(null, { status: mode === 'revoke' ? 403 : 204 });
      if (mode === 'denied') return new Response(null, { status: 403 });
      const repositories = (
        mode === 'extra' ? ['example/app', 'example/extra'] :
          mode === 'missing' ? [] : mode === 'foreign' ? ['other/app'] : ['example/app']
      ).map(full_name => ({ full_name }));
      return ok(mode === 'unknown' ? {} : { repositories, total_count: repositories.length });
    };
    const promise = verifyInstallationScope({ appId: '123', privateKey, owner: 'example',
      allowedRepositories: ['example/app'], fetcher });
    if (mode === 'exact') await promise;
    else await assert.rejects(promise, /blocked/);
    const token = calls.find(call => call.path.endsWith('/access_tokens'));
    if (token) {
      assert.deepEqual(JSON.parse(token.body), { permissions: { metadata: 'read' } });
      assert.equal(calls.at(-1).method, 'DELETE');
      assert.equal(calls.at(-1).path, '/installation/token');
    }
    assert(calls.every(call => !call.body?.includes('test-metadata-token')));
  }
});

test('App repository scope must exactly equal allowlist for one owner', () => {
  validateAppRepositoryScope(['team-helper', 'expense-helper'],
    ['example/team-helper', 'example/expense-helper'], 'example/hub');
  assert.throws(() => validateAppRepositoryScope(['team-helper', 'extra'],
    ['example/team-helper'], 'example/hub'), /exactly match/);
  assert.throws(() => validateAppRepositoryScope(['team-helper'],
    ['example/team-helper', 'other/expense-helper'], 'example/hub'), /multiple owners/);
  assert.throws(() => validateAppRepositoryScope([], [], 'example/hub'), /at least one/);
});

test('installation scope fully paginates installations and repositories, and rejects truncated counts', async () => {
  const allowedRepositories = Array.from({ length: 101 }, (_, index) => `example/app-${index}`);
  for (const truncated of [false, true]) {
    const calls = [];
    const fetcher = async (url, options) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));
      calls.push({ path: parsed.pathname, page, method: options.method });
      const ok = data => new Response(JSON.stringify(data));
      if (parsed.pathname === '/app/installations') return ok(page === 1
        ? Array.from({ length: 100 }, (_, id) => ({ id, account: { login: `other-${id}` } }))
        : [{ id: 123, repository_selection: 'selected', account: { login: 'example' } }]);
      if (parsed.pathname.endsWith('/access_tokens')) return ok({ token: 'metadata-only-fixture' });
      if (parsed.pathname === '/installation/token') return new Response(null, { status: 204 });
      return ok({ total_count: allowedRepositories.length,
        repositories: (truncated ? [] : allowedRepositories.slice((page - 1) * 100, page * 100))
          .map(full_name => ({ full_name })) });
    };
    const result = verifyInstallationScope({ appId: '123', privateKey, owner: 'example', allowedRepositories, fetcher });
    if (truncated) await assert.rejects(result, /exactly match/);
    else {
      await result;
      assert(calls.some(call => call.path === '/installation/repositories' && call.page === 2));
    }
    assert(calls.some(call => call.path === '/app/installations' && call.page === 2));
    assert.equal(calls.at(-1).method, 'DELETE');
  }
});
