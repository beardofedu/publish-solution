import { parse } from 'yaml';
import { checkIds } from './model.mjs';

const pass = detail => ({ status: 'PASS', detail });
const fail = detail => ({ status: 'FAIL', detail });
const unknown = detail => ({ status: 'UNKNOWN', detail });

const providerLabels = { azure: 'Azure', aws: 'AWS', gcp: 'Google Cloud' };
const hasUnresolvedExpression = value => typeof value === 'string' && /\$\{\{|\}\}/.test(value);
const literalInput = value => typeof value === 'string' && value.trim() && !hasUnresolvedExpression(value);
const explicitlyFalse = value => value === false || (typeof value === 'string' && value.trim().toLowerCase() === 'false');
const oidcLogins = {
  azure: step => /^azure\/login@/i.test(step.uses ?? '') &&
    step.with?.['client-id'] && step.with?.['tenant-id'] &&
    step.with?.['subscription-id'] && !step.with?.creds &&
    step.with?.['auth-type'] !== 'IDENTITY',
  aws: step => /^aws-actions\/configure-aws-credentials@/i.test(step.uses ?? '') &&
    literalInput(step.with?.['role-to-assume']) && literalInput(step.with?.['aws-region']) &&
    !step.with?.['aws-access-key-id'] && !step.with?.['aws-secret-access-key'] &&
    !step.with?.['aws-session-token'] && !step.with?.['web-identity-token-file'] &&
    ['role-chaining', 'use-existing-credentials'].every(key =>
      !Object.hasOwn(step.with ?? {}, key) || explicitlyFalse(step.with[key])),
  gcp: step => /^google-github-actions\/auth@/i.test(step.uses ?? '') &&
    step.with?.workload_identity_provider && !step.with?.credentials_json,
};

export function hasOidcDeployment(workflow, providers = ['azure']) {
  if (!workflow?.on || !workflow.jobs || typeof workflow.jobs !== 'object') return false;
  return Object.values(workflow.jobs).some(job => {
    const permissions = job.permissions ?? workflow.permissions;
    return permissions?.['id-token'] === 'write' && Array.isArray(job.steps) &&
      job.steps.some(step => providers.some(provider => oidcLogins[provider](step)));
  });
}

export function unsafeEnvPaths(tree) {
  return tree.filter(item => item.type === 'blob' && /(^|\/)\.env($|\.)/.test(item.path) &&
    !/(^|\/)\.env\.(example|sample|template)$/.test(item.path)).map(item => item.path);
}

const defaultCheckConfig = Object.fromEntries(checkIds.map(id => [id, { enabled: true, ...(id === 'deployment-oidc' ? { providers: ['azure'] } : {}) }]));

export function effectiveCheckPolicy(tier, checkConfig = defaultCheckConfig) {
  return Object.fromEntries(checkIds.map(id => {
    const setting = checkConfig[id] ?? defaultCheckConfig[id];
    const enabled = setting.enabled !== false && (!tier || !setting.tiers || setting.tiers.includes(tier));
    return [id, {
      enabled,
      ...(id === 'deployment-oidc' ? { providers: [...(setting.providers ?? ['azure'])] } : {}),
    }];
  }));
}

export async function automatedChecks(api, repository, metadata, policy,
  { now = Date.now(), tier, checkConfig = defaultCheckConfig } = {}) {
  const root = `/repos/${repository}`;
  const branch = metadata.default_branch;
  const checks = [];
  const skipped = [];
  const effectivePolicy = effectiveCheckPolicy(tier, checkConfig);
  const applies = id => effectivePolicy[id].enabled;
  async function check(id, name, run) {
    if (id && !applies(id)) {
      skipped.push(name);
      return;
    }
    try {
      checks.push({ name, ...await run() });
    } catch (error) {
      // Unavailable endpoints, permissions, and feature/plan limits are gaps.
      if (![403, 404, 409, 422].includes(error.status)) throw error;
      checks.push({ name, ...unknown(`API returned ${error.status}; verify permissions, plan, and feature availability.`) });
    }
  }
  const content = async (path, sha) => {
    const file = await api.request('GET', `${root}/contents/${path}?ref=${encodeURIComponent(sha)}`);
    if (file.type !== 'file' || file.encoding !== 'base64' || !file.content || file.size > 1_000_000) {
      throw new Error(`Cannot inspect ${path}: unsupported content response or file too large.`);
    }
    return Buffer.from(file.content, 'base64').toString('utf8');
  };
  await check('secret-scanning', 'Secret scanning and push protection', async () => {
    const security = metadata.security_and_analysis;
    if (!security?.secret_scanning || !security?.secret_scanning_push_protection) {
      return unknown('Security settings are not visible to this token or available on this plan.');
    }
    return security.secret_scanning.status === 'enabled' &&
      security.secret_scanning_push_protection.status === 'enabled'
      ? pass('Both repository settings are enabled.') : fail('Enable both repository settings.');
  });
  await check('dependabot-alerts', 'Dependabot alerts', async () => {
    try {
      await api.request('GET', `${root}/vulnerability-alerts`);
      return pass('Dependabot alerts are enabled; human triage is still required.');
    } catch (error) {
      if (error.status === 404) return unknown('Alerts may be disabled or hidden from this token; verify in Settings.');
      throw error;
    }
  });
  const ref = await api.request('GET', `${root}/branches/${encodeURIComponent(branch)}`);
  const sha = ref.commit.sha;
  await check('code-scanning', 'Code scanning at the default-branch head', async () => {
    const analyses = await api.request('GET',
      `${root}/code-scanning/analyses?ref=${encodeURIComponent(`refs/heads/${branch}`)}&per_page=100`);
    const cutoff = now - policy.scan_max_age_days * 86_400_000;
    return analyses.some(analysis => analysis.commit_sha === sha && !analysis.error &&
      analysis.results_count !== undefined && Date.parse(analysis.created_at) >= cutoff)
      ? pass(`Successful analysis at ${sha.slice(0, 12)} within ${policy.scan_max_age_days} days; findings need review.`)
      : fail('No recent successful analysis of the current default-branch commit was found among the latest 100 analyses.');
  });
  await check('branch-reviews', 'Default-branch pull request reviews', async () => {
    const reviews = protection => (protection?.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1;
    let classic;
    try {
      classic = await api.request('GET', `${root}/branches/${encodeURIComponent(branch)}/protection`);
    } catch (error) {
      if (![403, 404].includes(error.status)) throw error;
    }
    if (reviews(classic)) return pass('Classic protection requires pull requests and at least one approval; review bypass separately.');
    const rules = await api.request('GET', `${root}/rules/branches/${encodeURIComponent(branch)}`);
    return rules.some(rule => rule.type === 'pull_request' &&
      rule.parameters?.required_approving_review_count >= 1)
      ? pass('An active applicable ruleset requires pull requests and approvals; review bypass separately.')
      : fail('Require pull requests and at least one approval on the default branch.');
  });
  for (const [id, name, paths] of [
    ['codeowners', 'CODEOWNERS', ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']],
    ['security-policy', 'SECURITY.md', ['.github/SECURITY.md', 'SECURITY.md', 'docs/SECURITY.md']],
  ]) {
    await check(id, name, async () => {
      for (const path of paths) {
        try {
          const text = await content(path, sha);
          const meaningful = text.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
          if (name === 'CODEOWNERS'
            ? meaningful.some(line => /^\S+\s+\S+/.test(line))
            : meaningful.join('').length >= 40) {
            return pass(`${path} exists with substantive content; verify owners and reporting route manually.`);
          }
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }
      return fail(`Add a substantive ${name} file at a recognized location.`);
    });
  }
  await check('env-files', 'No committed .env files at head', async () => {
    const tree = await api.request('GET', `${root}/git/trees/${sha}?recursive=1`);
    if (tree.truncated) return unknown('Repository tree is truncated; a full approved local scan is required.');
    const unsafe = unsafeEnvPaths(tree.tree);
    // Do not reflect untrusted repository filenames into a governance report.
    return unsafe.length ? fail(`${unsafe.length} non-template .env file(s) found. Remove and assess credential rotation.`)
      : pass('No non-template .env filenames found at head. This is not a scan of contents or history.');
  });
  const providers = effectivePolicy['deployment-oidc'].providers;
  const clouds = providers.map(provider => providerLabels[provider]).join(', ');
  const oidcName = providers.length === 1 && providers[0] === 'azure'
    ? 'OIDC Azure deployment workflow' : `OIDC deployment workflow (${clouds})`;
  await check('deployment-oidc', oidcName, async () => {
    const workflows = await api.request('GET', `${root}/contents/.github/workflows?ref=${encodeURIComponent(sha)}`);
    for (const file of workflows.filter(file => /\.ya?ml$/.test(file.name))) {
      const text = await content(`.github/workflows/${encodeURIComponent(file.name)}`, sha);
      let workflow;
      try {
        workflow = parse(text, { uniqueKeys: true, maxAliasCount: 0 });
      } catch {
        return unknown('A deployment workflow cannot be parsed safely; inspect its YAML manually. No repository file contents were logged.');
      }
      if (hasOidcDeployment(workflow, providers)) {
        return pass(`${clouds} OIDC login with id-token: write and federated identifiers found. Verify enabled workflow, cloud trust, environment reviewers, and an actual deployment manually.`);
      }
    }
    return fail(`No ${clouds} OIDC workflow pattern found. Other deployment targets need an approved equivalent and manual governance review.`);
  });
  // Always runs: it binds every other result to one commit.
  await check(null, 'Default-branch validation basis', async () => {
    const latestMetadata = await api.request('GET', root);
    if (latestMetadata.default_branch !== branch) {
      return fail(`Default branch changed during validation (${branch} to ${latestMetadata.default_branch}); rerun validation.`);
    }
    const latest = await api.request('GET', `${root}/branches/${encodeURIComponent(branch)}`);
    return latest.commit.sha === sha
      ? pass(`All automated checks used the current default-branch commit ${sha}.`)
      : fail(`Default branch changed during validation (${sha} to ${latest.commit.sha}); rerun validation.`);
  });
  return { checks, commitSha: sha, skipped };
}

export function validationReport(plans, checks, handoff = '', skipped = []) {
  const incomplete = plans.filter(plan => !plan.existing || plan.existing.state !== 'closed' ||
    plan.existing.state_reason !== 'completed');
  const ready = plans.length > 0 && checks.length > 0 && incomplete.length === 0 &&
    checks.every(check => check.status === 'PASS');
  const lines = [
    `## ${ready ? 'Ready for governance review' : 'Publication gaps remain'}`,
    '',
    `${plans.length - incomplete.length}/${plans.length} required control issues closed as completed.`,
    '',
    ...incomplete.map(plan => `- ${plan.control.id}: ${plan.existing ? plan.existing.html_url : 'missing; rerun intake'}`),
    '',
    '| Automated check | Status | Detail |',
    '| --- | --- | --- |',
    ...checks.map(check => `| ${check.name} | ${check.status} | ${check.detail} |`),
    ...(skipped.length ? ['', `Not run for this tier under hub configuration (config/checks.yml): ${skipped.join(', ')}. Governance must decide whether manual evidence covers them.`] : []),
    '',
    'UNKNOWN is a blocking gap, not a pass. Closing an issue as not planned or duplicate does not satisfy the gate.',
    'These are configuration signals, not a security audit or compliance certification. They do not verify cloud state, resolved alerts, or evidence quality.',
    'A governance reviewer must inspect evidence and apply approved-for-production. The automation never grants production approval.',
    ...(handoff ? ['', handoff] : []),
  ];
  return { ready, body: lines.join('\n') };
}
