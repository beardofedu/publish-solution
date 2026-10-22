import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, GitHub } from '../scripts/github.mjs';

test('API client authenticates, refuses redirects, and encodes JSON without leaking token errors', async () => {
  const client = new GitHub('test-secret', 'https://api.github.com', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/example/solution/issues');
    assert.equal(options.headers.authorization, 'Bearer test-secret');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { title: 'test' });
    return new Response(JSON.stringify({ number: 1 }), { status: 201 });
  });
  assert.deepEqual(await client.request('POST', '/repos/example/solution/issues', { title: 'test' }), { number: 1 });
  const denied = new GitHub('test-secret', undefined, async () => new Response('sensitive response', { status: 403 }));
  await assert.rejects(denied.request('GET', '/repos/example/solution'), error =>
    error instanceof ApiError && error.status === 403 && !error.message.includes('secret') && !error.message.includes('sensitive'));
  assert.throws(() => new GitHub(''), /required/);
  assert.throws(() => new GitHub('token', 'http://example.com'), /HTTPS/);
});

test('pagination includes closed controls beyond the first page', async () => {
  const calls = [];
  const client = new GitHub('token', undefined, async url => {
    calls.push(url);
    return new Response(JSON.stringify(url.endsWith('page=1') ? Array.from({ length: 100 }, (_, i) => i) : [100]));
  });
  assert.equal((await client.pages('/repos/example/solution/issues?state=all')).length, 101);
  assert(calls[1].includes('state=all&per_page=100&page=2'));
});
