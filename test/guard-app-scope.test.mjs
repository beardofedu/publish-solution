import test from 'node:test';
import assert from 'node:assert/strict';
import { appRepositoryNames, validateAppRepositoryScope } from '../scripts/guard-app-scope.mjs';

test('App scope is required, exact, and unique before token creation', () => {
  assert.deepEqual(appRepositoryNames('', ''), []);
  assert.deepEqual(appRepositoryNames('123', ' team-helper,expense-helper '), ['team-helper', 'expense-helper']);
  assert.throws(() => appRepositoryNames('   ', 'team-helper'), /numeric App ID/);
  for (const value of ['', '   ', 'team-helper,', 'org/team-helper', 'team-helper,TEAM-HELPER', ',team-helper']) {
    assert.throws(() => appRepositoryNames('123', value), /refusing to mint/);
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
