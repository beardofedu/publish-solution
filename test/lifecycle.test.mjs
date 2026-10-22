import test from 'node:test';
import assert from 'node:assert/strict';
import { exceptionReminder, invalidateForReassessment, linkedExceptions, linkedIssueNumber } from '../scripts/lifecycle.mjs';

const hub = 'example/governance';

test('lifecycle links are limited to exact same-hub issue URLs', () => {
  const body = `### Original publication request\n\nhttps://github.com/${hub}/issues/23`;
  assert.equal(linkedIssueNumber(body, 'Original publication request', hub), 23);
  assert.equal(linkedIssueNumber(body.replace(hub, 'other/repo'), 'Original publication request', hub), null);
  assert.equal(linkedIssueNumber(body.replace('/issues/23', '/issues/23#comment-1'), 'Original publication request', hub), null);
});

test('exception reminders surface due/expired or invalid records without approving or bypassing checks', () => {
  const issue = {
    number: 40,
    body: `### Original publication request\n\nhttps://github.com/${hub}/issues/23\n\n### Expiry date\n\n2026-10-22`,
  };
  const reminder = exceptionReminder(issue, hub, new Date('2026-10-22T12:00:00Z'));
  assert(reminder.includes('DUE — 2026-10-22'));
  assert(reminder.includes('not an approval, renewal, or validation bypass'));
  assert(exceptionReminder({ ...issue, body: issue.body.replace('2026-10-22', '2026-02-30') }, hub,
    new Date('2026-10-22T12:00:00Z')).includes('ACTION REQUIRED'));
  assert.equal(exceptionReminder({ ...issue, body: issue.body.replace('2026-10-22', '2027-02-28') }, hub,
    new Date('2026-10-22T12:00:00Z')), null);
  assert(exceptionReminder({ ...issue, body: issue.body.replace('2026-10-22', '2026-10-21') }, hub,
    new Date('2026-10-22T12:00:00Z')).includes('EXPIRED'));
});

test('handoff exception lookup includes only records linked to this original request', async () => {
  const linked = {
    number: 42, state: 'closed', html_url: `https://github.com/${hub}/issues/42`,
    body: `### Original publication request\n\nhttps://github.com/${hub}/issues/23\n\n### Control ID\n\nidentity\n\n### Expiry date\n\n2026-10-21`,
  };
  const results = await linkedExceptions({ pages: async () => [
    linked,
    { ...linked, number: 43, body: linked.body.replace('/issues/23', '/issues/24') },
    { ...linked, number: 44, pull_request: {}, body: linked.body.replace('/issues/23', '/issues/23') },
  ] }, hub, 23, new Date('2026-10-22T12:00:00Z'));
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'EXPIRED');
  assert.equal(results[0].control_id, 'identity');
  assert.equal(results[0].state, 'closed');
});

test('reassessment invalidation only clears a linked publication issue in the hub', async () => {
  const labels = new Set(['ready-for-review', 'approved-for-production', 'publication-request']);
  const comments = [];
  const api = {
    request: async (method, path, data) => {
      if (method === 'GET' && path.endsWith('/issues/23')) {
        return { number: 23, labels: [...labels].map(name => ({ name })) };
      }
      if (path.endsWith('/issues/23/labels')) {
        data.labels.forEach(label => labels.add(label));
        return [];
      }
      if (path.includes('/issues/23/labels/')) {
        labels.delete(decodeURIComponent(path.split('/').at(-1)));
        return null;
      }
      if (method === 'POST' && path.endsWith('/labels')) return data;
      if (method === 'POST' && path.endsWith('/issues/23/comments')) {
        comments.push(data.body);
        return { id: 1, body: data.body, user: { login: 'github-actions[bot]' } };
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    },
    pages: async path => path.endsWith('/issues/23/comments') ? [{
      user: { login: 'github-actions[bot]' },
      body: '<!-- publish-solution:state -->\n<!-- state-json:{"repository":"example/solution","basis":"fixture","parent":24} -->',
    }] : [],
  };
  const issue = {
    number: 30,
    state: 'open',
    html_url: `https://github.com/${hub}/issues/30`,
    labels: [{ name: 'reassessment-request' }],
    body: `### Original publication request\n\nhttps://github.com/${hub}/issues/23\n\n### Solution repository\n\nexample/solution`,
  };
  assert.equal(await invalidateForReassessment({ hubApi: api, hub, issue }), 23);
  assert(!labels.has('ready-for-review'));
  assert(!labels.has('approved-for-production'));
  assert(comments.some(body => body.includes('Reassessment request [#30]')));
  await assert.rejects(invalidateForReassessment({
    hubApi: api, hub, issue: { ...issue, body: issue.body.replace('/issues/23', '/issues/999') },
  }), /Unexpected request/);
  await assert.rejects(invalidateForReassessment({
    hubApi: api, hub, issue: { ...issue, body: issue.body.replace('example/solution', 'other/solution') },
  }), /does not match/);
});
