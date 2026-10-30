import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHandoff } from '../scripts/handoff.mjs';

test('handoff separates prepared evidence from human decisions and escapes intake text', () => {
  const markdown = renderHandoff({
    issue: { html_url: 'https://github.com/example/hub/issues/9' },
    intake: {
      repository: 'example/solution', business: 'team`x', technical: 'platform-team',
    },
    tier: 'Moderate',
    plans: [
      { control: { id: 'identity' }, existing: { state: 'closed', state_reason: 'completed', html_url: 'https://github.com/example/solution/issues/2' } },
      { control: { id: 'data-protection' }, existing: { state: 'open', html_url: 'https://github.com/example/solution/issues/3' } },
    ],
    checks: [{ name: 'Live cloud trust', status: 'UNKNOWN', detail: 'Cannot verify cloud state.' }],
    skipped: ['CODEOWNERS'],
    commitSha: 'abc123',
    validationBasis: 'def456',
    validatedAt: '2026-10-22T12:00:00.000Z',
  });
  assert(markdown.includes('**Package state:** Prepared with gaps'));
  assert(markdown.includes('Validation basis:** `def456`'));
  assert(markdown.includes('Target commit:** `abc123`'));
  assert(markdown.includes('Completed — `identity`'));
  assert(markdown.includes('UNKNOWN — Live cloud trust'));
  assert(markdown.includes('NOT RUN — CODEOWNERS'));
  assert(markdown.includes('PENDING (approve / reject / defer)'));
  assert(markdown.includes('Acceptance: PENDING'));
  assert(markdown.includes('team\\`x'));
  assert(!markdown.includes('approved-for-production was granted'));
});
