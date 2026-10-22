import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'yaml';
import { deriveTier, fields, loadConfig, parseIntake } from '../scripts/model.mjs';
import { contextFor } from '../scripts/publish.mjs';

const directory = '.github/ISSUE_TEMPLATE';
const readYaml = async path => parse(await readFile(path, 'utf8'), { uniqueKeys: true, maxAliasCount: 0 });
const form = async name => readYaml(`${directory}/${name}.yml`);
const publicationAnswers = {
  repository: 'example/solution', business: 'business-team', technical: 'technical-team',
  data: 'Internal', exposure: 'Internal', audience: 'Small team', ai: 'No',
  integrations: 'None or read-only', hosting: 'Azure',
};
const originalBody = Object.entries(publicationAnswers)
  .map(([key, value]) => `### ${fields[key]}\n\n${value}`).join('\n\n');

function renderBody(template, answers) {
  return template.body.map(field => {
    if (field.type === 'markdown') return field.attributes.value;
    const value = field.type === 'checkboxes'
      ? field.attributes.options.map(option => `- [X] ${option.label}`).join('\n')
      : answers[field.id];
    assert.equal(typeof value, 'string', `Missing test answer for ${field.id}`);
    return `### ${field.attributes.label}\n\n${value}`;
  }).join('\n\n');
}

test('publication preserves every original field ID, heading, option and required flag', async () => {
  const template = await form('request-publication');
  assert.deepEqual(template.labels, ['publication-request']);
  const expected = {
    repository: ['Solution repository'],
    business: ['Business owner'],
    technical: ['Technical owner'],
    data: ['Data classification', ['Public', 'Internal', 'Confidential', 'PII', 'PHI', 'PCI', 'Regulated']],
    exposure: ['Exposure', ['Internal', 'External']],
    audience: ['Audience size', ['Small team', 'Organization-wide', 'Public']],
    ai: ['AI or LLM usage at runtime', ['No', 'Yes']],
    integrations: ['Integrations', ['None or read-only', 'Business-system writes', 'Privileged']],
    hosting: ['Target hosting', ['Azure', 'Other cloud', 'Undecided']],
  };
  for (const [id, [label, options]] of Object.entries(expected)) {
    const field = template.body.find(field => field.id === id);
    assert(field, id);
    assert.equal(field.attributes.label, label);
    assert.equal(field.validations.required, true);
    if (options) assert.deepEqual(field.attributes.options, options);
  }
});

test('publication adds required description, date, environment and all three attestations', async () => {
  const template = await form('request-publication');
  const byId = Object.fromEntries(template.body.filter(field => field.id).map(field => [field.id, field]));
  assert.equal(byId.solution_description.type, 'textarea');
  assert(byId.solution_description.attributes.description.includes('AI'));
  assert.equal(byId.go_live_date.type, 'input');
  assert(byId.go_live_date.attributes.description.includes('YYYY-MM-DD'));
  assert.deepEqual(byId.target_environment.attributes.options, ['dev', 'test', 'prod']);
  for (const id of ['solution_description', 'go_live_date', 'target_environment']) {
    assert.equal(byId[id].validations.required, true);
  }
  assert.equal(byId.attestations.type, 'checkboxes');
  assert.equal(byId.attestations.attributes.options.length, 3);
  assert(byId.attestations.attributes.options.every(option => option.required === true));
  for (const text of ['secrets', 'read the publication guide', 'completing the generated control issues']) {
    assert(byId.attestations.attributes.options.some(option => option.label.includes(text)));
  }
});

test('rendered publication parses existing fields; metadata does not affect risk or plan basis', async () => {
  const template = await form('request-publication');
  const config = await loadConfig();
  config.policy.allowed_repositories = ['example/solution'];
  const base = contextFor({ number: 1, body: originalBody }, 'example/hub', config);
  for (const environment of ['dev', 'test', 'prod']) {
    const body = renderBody(template, {
      ...publicationAnswers,
      solution_description: 'Synthetic team helper.\nAI assisted development; no runtime model calls.',
      go_live_date: '2027-01-31',
      target_environment: environment,
    });
    assert.deepEqual(parseIntake(body), parseIntake(originalBody));
    assert.equal(contextFor({ number: 1, body }, 'example/hub', config).basis, base.basis);
    assert.equal(deriveTier(parseIntake(body), config.tierConfig), 'Low');
    const highRisk = body.replace('### Exposure\n\nInternal', '### Exposure\n\nExternal');
    assert.equal(deriveTier(parseIntake(highRisk), config.tierConfig), 'High');
  }
  const descriptionWithFieldHeading = renderBody(template, {
    ...publicationAnswers,
    solution_description: 'The app provides team guidance.\n\n### Integrations\n\nIt connects to no external services.',
    go_live_date: '2027-01-31',
    target_environment: 'prod',
  });
  assert.deepEqual(parseIntake(descriptionWithFieldHeading), parseIntake(originalBody));
});

test('all four forms have valid unique IDs, safe submission guidance and required attestations', async () => {
  const files = (await readdir(directory)).filter(file => file.startsWith('request-') && file.endsWith('.yml'));
  assert.equal(files.length, 4);
  const labels = new Set();
  for (const file of files) {
    const template = await readYaml(`${directory}/${file}`);
    assert(template.name && template.description && template.title);
    assert.equal(template.labels.length, 1);
    labels.add(template.labels[0]);
    const ids = template.body.filter(field => field.type !== 'markdown').map(field => field.id);
    assert.equal(new Set(ids).size, ids.length, file);
    assert(ids.every(id => /^[a-z][a-z0-9_]*$/.test(id)), file);
    assert(template.body.some(field => field.type === 'markdown' &&
      /Do not (?:include|paste) secrets/.test(field.attributes.value)), file);
    for (const field of template.body.filter(field => field.type !== 'markdown')) {
      if (field.type === 'checkboxes') assert(field.attributes.options.every(option => option.required), file);
      else assert.equal(field.validations.required, true, `${file}: ${field.id}`);
    }
  }
  assert.equal(labels.size, 4);
});

test('manual lifecycle forms collect review evidence without the automation label or intake schema', async () => {
  const expected = {
    'request-reassessment': {
      label: 'reassessment-request',
      fields: ['original_request', 'repository', 'changes', 'evidence_impact', 'technical_owner', 'change_date'],
    },
    'request-control-exception': {
      label: 'control-exception',
      fields: ['original_request', 'repository', 'control_id', 'control_issue', 'justification',
        'compensating_controls', 'expiry_date', 'risk_owner'],
    },
    'request-decommission': {
      label: 'decommission-request',
      fields: ['original_request', 'repository', 'accountable_owner', 'retirement_date', 'reason_impact',
        'retirement_plan', 'data_plan'],
    },
  };
  for (const [name, contract] of Object.entries(expected)) {
    const template = await form(name);
    assert.deepEqual(template.labels, [contract.label]);
    for (const id of contract.fields) assert(template.body.some(field => field.id === id), `${name}: ${id}`);
    const answers = Object.fromEntries(contract.fields.map(id => [id, 'Synthetic review context']));
    assert.throws(() => parseIntake(renderBody(template, answers)), /Missing or invalid intake field/);
    assert(template.body[0].attributes.value.includes('requests.html#'));
  }
});

test('workflows remain gated to publication requests; labels and runbooks cover each manual form', async () => {
  for (const file of ['intake', 'validate']) {
    const workflow = await readYaml(`.github/workflows/${file}.yml`);
    const job = workflow.jobs[file];
    assert(job.if.includes("contains(github.event.issue.labels.*.name, 'publication-request')"));
    const steps = job.steps;
    const scopeGuard = steps.findIndex(step => step.run === 'node scripts/guard-app-scope.mjs');
    const tokenCreation = steps.findIndex(step => step.uses?.includes('actions/create-github-app-token'));
    assert(scopeGuard >= 0 && scopeGuard < tokenCreation, `${file}: app scope must be checked before token creation`);
    for (const label of ['reassessment-request', 'control-exception', 'decommission-request']) {
      assert(!job.if.includes(label));
    }
    if (file === 'intake') {
      const lifecycle = workflow.jobs['invalidate-reassessment'];
      assert(lifecycle.if.includes("contains(github.event.issue.labels.*.name, 'reassessment-request')"));
      assert(lifecycle.steps.some(step => step.run === 'node scripts/preflight.mjs'));
      assert(lifecycle.steps.some(step => step.run === 'node scripts/lifecycle.mjs invalidate'));
    }
  }
  const runner = await readFile('scripts/run.mjs', 'utf8');
  assert(runner.includes('state=open&labels=publication-request'));
  const setup = await readFile('SETUP.md', 'utf8');
  const guide = await readFile('docs/requests.html', 'utf8');
  for (const label of ['reassessment-request', 'control-exception', 'decommission-request']) {
    assert(setup.includes(`gh label create ${label} `));
    assert(guide.includes(`<code>${label}</code>`));
  }
  const chooser = await readYaml(`${directory}/config.yml`);
  assert(chooser.contact_links.some(link => link.url.endsWith('/requests.html')));
  assert(guide.includes('id="reassessment"') && guide.includes('id="exceptions"') && guide.includes('id="decommission"'));
});
