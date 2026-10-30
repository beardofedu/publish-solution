import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controlBody, deriveTier, fields, fingerprint, hasLabel, loadConfig, marker, parseIntake, planIssues, tierLabel } from '../scripts/model.mjs';

export const answers = {
  repository: 'Example/Solution', business: 'business-team', technical: 'platform-team',
  data: 'Internal', exposure: 'Internal', audience: 'Small team', ai: 'No',
  integrations: 'None or read-only', hosting: 'Azure',
};
export function form(values = {}) {
  return Object.entries({ ...answers, ...values }).map(([key, value]) => `### ${fields[key]}\n\n${value}`).join('\n\n');
}

test('label matching is case-insensitive and does not mutate preserved labels', () => {
  const issue = { labels: [{ name: 'Publication-Request' }] };
  assert.equal(hasLabel(issue, 'publication-request'), true);
  assert.equal(hasLabel(issue, 'reassessment-request'), false);
  assert.equal(hasLabel({ labels: [{ name: null }] }, 'publication-request'), false);
  assert.equal(hasLabel({}, 'publication-request'), false);
  assert.equal(issue.labels[0].name, 'Publication-Request');
});

test('intake accepts the issue form and normalizes repository case and CRLF', () => {
  const parsed = parseIntake(form().replaceAll('\n', '\r\n'));
  assert.equal(parsed.repository, 'example/solution');
  assert.equal(parsed.business, 'business-team');
  assert.equal(parsed.hosting, 'Azure');
});

test('intake rejects missing, ambiguous, multiline, and malicious values', () => {
  for (const values of [
    { data: '_No response_' }, { data: 'Secret' }, { business: '' },
    { repository: 'https://github.com/example/app' }, { repository: 'example/app.git' }, { repository: 'example/..' },
    { technical: '<script>' }, { business: 'team\nmore text' }, { ai: 'Maybe' },
  ]) assert.throws(() => parseIntake(form(values)), undefined, JSON.stringify(values));
  assert.throws(() => parseIntake(`${form()}\n\n### Exposure\n\nExternal`), /Duplicate/);
  assert.throws(() => parseIntake('not an issue form'), /Missing/);
});

test('default catalog and tier config load with all controls', async () => {
  const { catalog, tierConfig, workPackages } = await loadConfig();
  assert.equal(catalog.length, 14);
  assert.equal(Object.keys(workPackages).length, catalog.length);
  for (const control of catalog) {
    const work = workPackages[control.id];
    assert(['citizen', 'platform', 'security', 'data'].includes(work.owner_role), control.id);
    assert(work.evidence_template.length, control.id);
    assert(work.evidence_examples.acceptable.length, control.id);
    assert(work.evidence_examples.insufficient.length, control.id);
  }
  assert.equal(deriveTier(answers, tierConfig), 'Low');
  for (const override of [
    { data: 'Confidential' }, { audience: 'Organization-wide' },
    { integrations: 'Business-system writes' }, { ai: 'Yes' },
  ]) assert.equal(deriveTier({ ...answers, ...override }, tierConfig), 'Moderate');
  for (const override of [
    { exposure: 'External' }, { data: 'PII' }, { data: 'PHI' },
    { data: 'PCI' }, { data: 'Regulated' }, { integrations: 'Privileged', ai: 'Yes' },
  ]) assert.equal(deriveTier({ ...answers, ...override }, tierConfig), 'High');
});

test('runtime AI controls are conditional and high controls include the baseline', async () => {
  const { catalog } = await loadConfig();
  const low = planIssues(catalog, 'Low', [], 'Example/Hub', 7, 'No');
  const moderate = planIssues(catalog, 'Moderate', [], 'Example/Hub', 7, 'Yes');
  const high = planIssues(catalog, 'High', [], 'Example/Hub', 7, 'Yes');
  assert.equal(low.length, 11);
  assert.equal(moderate.length, 13);
  assert.equal(high.length, 14);
  assert(!low.some(plan => plan.control.id === 'ai-safety'));
  assert(moderate.some(plan => plan.control.id === 'ai-safety'));
});

test('planning reuses open and closed issues, ignores pull requests and other requests', async () => {
  const { catalog } = await loadConfig();
  const tag = marker('example/hub', 7, catalog[0].id);
  const existing = [
    { number: 10, state: 'closed', body: tag },
    { number: 11, body: tag, pull_request: {} },
    { number: 12, body: marker('example/hub', 8, catalog[1].id) },
  ];
  const planned = planIssues(catalog, 'Low', existing, 'Example/Hub', 7, 'No');
  assert.equal(planned[0].existing.number, 10);
  assert.equal(planned[1].existing, undefined);
  assert.throws(() => planIssues(catalog, 'Low', [...existing, { number: 13, body: tag }], 'example/hub', 7, 'No'), /Duplicate/);
});

test('issue bodies have guidance, evidence criteria, Copilot prompts and stable marker', async () => {
  const { catalog } = await loadConfig();
  const tag = marker('example/hub', 1, catalog[0].id);
  const body = controlBody(catalog[0], tag, {
    source: 'https://github.com/example/hub/issues/1', tier: 'Low', guide: 'https://example.github.io/hub',
    workPackages: (await loadConfig()).workPackages,
  });
  for (const required of [tag, '## Why this matters', '## Steps', '## Acceptance criteria',
    '## Work package', '## Evidence to attach', '**Acceptable**', '**Insufficient**',
    '## Suggested Copilot prompts', 'https://example.github.io/hub/controls.html#ownership']) {
    assert(body.includes(required));
  }
  assert.equal(fingerprint(answers), fingerprint({ ...answers }));
  assert.notEqual(fingerprint(answers), fingerprint({ ...answers, ai: 'Yes' }));
});

test('catalog rejects malformed controls and policy; tier precedence is normalized', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'publish-solution-test-'));
  try {
    for (const path of ['controls', 'config']) await cp(path, join(directory, path), { recursive: true });
    await writeFile(join(directory, 'config/tiers.yml'), `default: Low\nrules:\n  - tier: Moderate\n    any:\n      ai: [Yes]\n  - tier: High\n    any:\n      exposure: [External]\n`);
    const config = await loadConfig(directory);
    assert.equal(deriveTier({ ...answers, exposure: 'External', ai: 'Yes' }, config.tierConfig), 'High');
    const policyPath = join(directory, 'config/policy.yml');
    const policy = await readFile(policyPath, 'utf8');
    await writeFile(policyPath, JSON.stringify({ ...config.policy, onboarding_prs: 'true' }));
    await assert.rejects(loadConfig(directory), /Invalid config/);
    const policyWithoutInstallation = { ...config.policy, onboarding_prs: true };
    delete policyWithoutInstallation.onboarding_installation_id;
    await writeFile(policyPath, JSON.stringify(policyWithoutInstallation));
    await assert.rejects(loadConfig(directory), /Invalid config/);
    await writeFile(policyPath, JSON.stringify({ ...config.policy, onboarding_prs: true, onboarding_installation_id: 123 }));
    assert.equal((await loadConfig(directory)).policy.onboarding_installation_id, 123);
    await writeFile(policyPath, policy);
    await writeFile(join(directory, 'controls/bad.yml'), 'id: broken\ntiers: [Low]\n');
    await assert.rejects(loadConfig(directory), /Invalid control/);
    const missingId = { ...config.catalog[0] };
    delete missingId.id;
    await writeFile(join(directory, 'controls/bad.yml'), JSON.stringify(missingId));
    await assert.rejects(loadConfig(directory), /Invalid control/);
    await rm(join(directory, 'controls/bad.yml'));
    const packagePath = join(directory, 'config/work-packages.yml');
    const packages = await readFile(packagePath, 'utf8');
    await writeFile(packagePath, packages.replace('  depends_on: []', '  depends_on: [repository-hygiene]'));
    await assert.rejects(loadConfig(directory), /Cyclic work-package dependency/);
    await writeFile(join(directory, 'config/policy.yml'), 'allowed_repositories: ["https://evil.example/repo"]\n');
    await assert.rejects(loadConfig(directory), /Invalid config/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('custom tier levels, roles and check settings load and are validated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'publish-solution-test-'));
  try {
    for (const path of ['controls', 'config']) await cp(path, join(directory, path), { recursive: true });
    const write = (path, text) => writeFile(join(directory, path), text);
    const ownershipPath = join(directory, 'controls/01-ownership.yml');
    const ownership = await readFile(ownershipPath, 'utf8');
    await write('config/tiers.yml', 'levels: [Low, Moderate, High, Business Critical]\ndefault: Low\nrules:\n' +
      '  - tier: High\n    any:\n      exposure: [External]\n  - tier: Business Critical\n    any:\n      data: [PHI]\n');
    await assert.rejects(loadConfig(directory), /unconditional controls for every tier/);
    await writeFile(ownershipPath, ownership.replace(/^tiers: \[.*\]$/m, 'tiers: [Low, Moderate, High, Business Critical]'));
    let config = await loadConfig(directory);
    assert.deepEqual(config.tierConfig.levels, ['Low', 'Moderate', 'High', 'Business Critical']);
    assert.equal(deriveTier({ ...answers, data: 'PHI', exposure: 'External' }, config.tierConfig), 'Business Critical');
    assert.equal(tierLabel('Business Critical'), 'risk:business-critical');
    assert.equal(planIssues(config.catalog, 'Business Critical', [], 'hub/repo', 1, 'No').length, 1);
    for (const levels of ['[]', '[low]', '[Low, Low]', '[Low, LOW]', '"Low"']) {
      await write('config/tiers.yml', `levels: ${levels}\ndefault: Low\nrules: []\n`);
      await assert.rejects(loadConfig(directory), /Invalid config\/tiers.yml/, levels);
    }
    await writeFile(ownershipPath, ownership);
    await cp('config/tiers.yml', join(directory, 'config/tiers.yml'));

    await rm(join(directory, 'config/roles.yml'));
    await rm(join(directory, 'config/checks.yml'));
    config = await loadConfig(directory);
    assert.equal(config.roles.platform.name, 'Platform engineering');
    assert.deepEqual(config.checks['deployment-oidc'].providers, ['azure']);
    assert(Object.values(config.checks).every(check => check.enabled));

    const packagesPath = join(directory, 'config/work-packages.yml');
    const packages = await readFile(packagesPath, 'utf8');
    await write('config/roles.yml', 'roles:\n  citizen: { name: Maker }\n  platform: { name: Cloud Center of Excellence }\n' +
      '  security: { name: AppSec }\n  data: { name: Privacy }\n  architecture: { name: Enterprise architecture }\n');
    await writeFile(packagesPath, packages.replace('supporting_roles: [platform, data]', 'supporting_roles: [platform, architecture]'));
    config = await loadConfig(directory);
    const body = controlBody(config.catalog[0], 'tag', {
      source: 'src', tier: 'Low', guide: 'https://example.github.io/hub', workPackages: config.workPackages, roles: config.roles,
    });
    assert(body.includes('**Lead:** Maker (`citizen`)'));
    assert(body.includes('Enterprise architecture (`architecture`)'));
    await write('config/roles.yml', 'roles:\n  citizen: { name: Maker }\n');
    await assert.rejects(loadConfig(directory), /Invalid work package/);
    for (const roles of ['roles: []', 'roles:\n  Bad_Id: { name: X }', 'roles:\n  citizen: {}', 'other: 1']) {
      await write('config/roles.yml', roles);
      await assert.rejects(loadConfig(directory), /Invalid config\/roles.yml/, roles);
    }
    await writeFile(packagesPath, packages);
    await cp('config/roles.yml', join(directory, 'config/roles.yml'));

    await write('config/checks.yml', 'checks:\n  code-scanning: { tiers: [Moderate, High] }\n' +
      '  env-files: { enabled: false }\n  deployment-oidc: { providers: [aws, gcp] }\n');
    config = await loadConfig(directory);
    assert.deepEqual(config.checks['code-scanning'], { enabled: true, tiers: ['Moderate', 'High'] });
    assert.equal(config.checks['env-files'].enabled, false);
    assert.deepEqual(config.checks['deployment-oidc'].providers, ['aws', 'gcp']);
    assert.deepEqual(config.checks['secret-scanning'].tiers, ['Low', 'Moderate', 'High']);
    for (const checks of ['checks:\n  unknown-check: { enabled: false }', 'checks:\n  env-files: { enabled: "no" }',
      'checks:\n  env-files: { tiers: [Critical] }', 'checks:\n  env-files: { tiers: [] }',
      'checks:\n  env-files: { providers: [aws] }', 'checks:\n  deployment-oidc: { providers: [oracle] }',
      'checks: []', 'other: 1']) {
      await write('config/checks.yml', checks);
      await assert.rejects(loadConfig(directory), /Invalid config\/checks.yml/, checks);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
