import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTicket } from '../examples/triage-helper/src/render.mjs';

test('synthetic helper escapes untrusted markup and renders ordinary input', () => {
  const html = renderTicket({
    title: '<img src=x onerror=alert(1)>',
    summary: 'A plain synthetic request & summary.',
    requestedBy: "team'alias",
  });
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(html.includes('request &amp; summary'));
  assert(html.includes('team&#39;alias'));
  assert(!html.includes('<img'));
});

test('synthetic helper rejects empty, non-string, and oversized fields', () => {
  assert.throws(() => renderTicket({ title: '', summary: 'Summary', requestedBy: 'team' }), /title/);
  assert.throws(() => renderTicket({ title: 'Title', summary: 4, requestedBy: 'team' }), /summary/);
  assert.throws(() => renderTicket({ title: 'x'.repeat(301), summary: 'Summary', requestedBy: 'team' }), /title/);
});
