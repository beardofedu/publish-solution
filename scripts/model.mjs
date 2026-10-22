import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export const fields = {
  repository: 'Solution repository',
  business: 'Business owner',
  technical: 'Technical owner',
  data: 'Data classification',
  exposure: 'Exposure',
  audience: 'Audience size',
  ai: 'AI or LLM usage at runtime',
  integrations: 'Integrations',
  hosting: 'Target hosting',
};
export const choices = {
  data: ['Public', 'Internal', 'Confidential', 'PII', 'PHI', 'PCI', 'Regulated'],
  exposure: ['Internal', 'External'],
  audience: ['Small team', 'Organization-wide', 'Public'],
  ai: ['No', 'Yes'],
  integrations: ['None or read-only', 'Business-system writes', 'Privileged'],
  hosting: ['Azure', 'Other cloud', 'Undecided'],
};
export const tiers = ['Low', 'Moderate', 'High'];
export const repositoryPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/;

export function parseIntake(body) {
  const sections = new Map();
  for (const match of (body ?? '').matchAll(/^### ([^\r\n]+)\r?\n+([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
    const heading = match[1].trim();
    if (sections.has(heading)) throw new Error('Duplicate intake field headings are not allowed.');
    sections.set(heading, match[2].trim());
  }
  const intake = Object.fromEntries(Object.entries(fields).map(([key, heading]) => {
    const value = sections.get(heading);
    if (!value || value === '_No response_' || value.length > 200 || /[\r\n<>]/.test(value)) {
      throw new Error(`Missing or invalid intake field: ${heading}`);
    }
    if (choices[key] && !choices[key].includes(value)) throw new Error(`Invalid selection: ${heading}`);
    return [key, value];
  }));
  if (!repositoryPattern.test(intake.repository) || intake.repository.endsWith('.git') ||
      ['.', '..'].includes(intake.repository.split('/')[1])) {
    throw new Error('Solution repository must be owner/name, without a URL or .git suffix.');
  }
  intake.repository = intake.repository.toLowerCase();
  return intake;
}

export function deriveTier(intake, config) {
  return config.rules.find(rule => Object.entries(rule.any).some(([field, values]) =>
    values.includes(intake[field])))?.tier ?? config.default;
}

export function fingerprint(intake) {
  return createHash('sha256').update(JSON.stringify(intake)).digest('hex');
}

export function marker(hub, number, id) {
  return `<!-- publish-solution:${hub.toLowerCase()}#${number}:${id} -->`;
}

export function planIssues(catalog, tier, existing, hub, number, ai) {
  return catalog.filter(control => control.tiers.includes(tier) &&
    (!control.when || control.when.ai === ai)).map(control => {
    const tag = marker(hub, number, control.id);
    const matches = existing.filter(issue => !issue.pull_request && issue.body?.includes(tag));
    if (matches.length > 1) throw new Error(`Duplicate generated issues for ${control.id}; reconcile before continuing.`);
    return { control, existing: matches[0], marker: tag };
  });
}

export async function loadConfig(root = process.cwd()) {
  const yaml = async path => parse(await readFile(resolve(root, path), 'utf8'), {
    uniqueKeys: true, maxAliasCount: 0,
  });
  const policy = await yaml('config/policy.yml');
  const tierConfig = await yaml('config/tiers.yml');
  if (!Array.isArray(policy.allowed_repositories) ||
      policy.allowed_repositories.some(repo => !repositoryPattern.test(repo)) ||
      !Array.isArray(policy.requester_permissions) || !policy.requester_permissions.length ||
      policy.requester_permissions.some(permission => !['admin', 'maintain', 'write'].includes(permission)) ||
      !Number.isInteger(policy.scan_max_age_days) || policy.scan_max_age_days < 1) {
    throw new Error('Invalid config/policy.yml.');
  }
  if (!/^https:\/\/[^?#\s]+$/.test(policy.guide_url)) throw new Error('guide_url must be an HTTPS base URL.');
  if (!tiers.includes(tierConfig.default) || !Array.isArray(tierConfig.rules) ||
      tierConfig.rules.some(rule => !tiers.includes(rule.tier) || !rule.any ||
        !Object.keys(rule.any).length || Object.entries(rule.any).some(([field, values]) =>
          !choices[field] || !Array.isArray(values) || !values.length ||
          values.some(value => !choices[field].includes(value))))) {
    throw new Error('Invalid config/tiers.yml.');
  }
  // A lower tier cannot take precedence over a higher matching tier.
  tierConfig.rules.sort((a, b) => tiers.indexOf(b.tier) - tiers.indexOf(a.tier));
  const catalog = [];
  for (const file of (await readdir(resolve(root, 'controls'))).filter(name => name.endsWith('.yml')).sort()) {
    const control = await yaml(`controls/${file}`);
    if (typeof control.id !== 'string' || !/^[a-z][a-z0-9-]+$/.test(control.id) || control.id === 'parent' ||
        catalog.some(item => item.id === control.id) ||
        !Array.isArray(control.tiers) || !control.tiers.length ||
        control.tiers.some(tier => !tiers.includes(tier)) ||
        ['title', 'why', 'guide'].some(key => typeof control[key] !== 'string' || !control[key].trim()) ||
        !/^[a-z-]+\.html#[a-z0-9-]+$/.test(control.guide) ||
        ['steps', 'acceptance', 'prompts'].some(key => !Array.isArray(control[key]) ||
          !control[key].length || control[key].some(item => typeof item !== 'string' || !item.trim())) ||
        (control.when && (Object.keys(control.when).length !== 1 || control.when.ai !== 'Yes'))) {
      throw new Error(`Invalid control catalog file: ${file}`);
    }
    catalog.push(control);
  }
  if (!catalog.length || tiers.some(tier => !catalog.some(control => control.tiers.includes(tier) && !control.when))) {
    throw new Error('The catalog must contain unconditional controls for every tier.');
  }
  return { policy, tierConfig, catalog };
}

export function controlBody(control, tag, context) {
  const { source, tier, guide } = context;
  return `${tag}
Source request: ${source}
Risk tier: **${tier}**

## Why this matters
${control.why}

## Steps
${control.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Acceptance criteria
${control.acceptance.map(item => `- [ ] ${item}`).join('\n')}

## Suggested Copilot prompts
${control.prompts.map(prompt => `> ${prompt}`).join('\n\n')}

## Guidance
[Read the guide](${guide}/${control.guide})

Record evidence links and reviewer confirmation in comments before closing as completed.
Do not include secrets or personal data. AI suggestions are not approval or compliance certification.
`;
}
