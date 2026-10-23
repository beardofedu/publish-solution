import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { GitHub } from './github.mjs';
import { loadConfig, repositoryPattern } from './model.mjs';
import { staticDiagnostics } from './diagnose.mjs';

// SETUP.md's form/approval labels; runtime risk/readiness labels remain runtime-owned.
export const requiredLabels = [
  { name: 'publication-request', color: '0969da' },
  { name: 'approved-for-production', color: '1a7f37' },
  { name: 'reassessment-request', color: '8250df' },
  { name: 'control-exception', color: 'bf8700' },
  { name: 'decommission-request', color: '57606a' },
  { name: 'onboarding-pending', color: 'bf8700' },
];

export const usage = `Usage: npm run bootstrap -- --repo owner/hub [--labels] [--scaffold --guide-url https://approved.example/guide [--target owner/name]... [--app-id 123] [--app-owner owner]] [--pages] [--apply] [--acknowledge-public-pages]
Default: read-only label preview and hub diagnostics. HUB_TOKEN supplies hub-only access.
--scaffold prints a review proposal only; it NEVER edits files, policy, variables or secrets.
--apply requires --labels and/or --pages. Pages also requires --acknowledge-public-pages.
No workflow dispatch, credential upload, target access, or local file writes. GitHub.com only.`;

function validRepository(value) {
  return typeof value === 'string' && repositoryPattern.test(value) &&
    !value.endsWith('.git') && !['.', '..'].includes(value.split('/')[1]);
}

function guideUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('--guide-url must be an approved absolute HTTPS base URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) ||
      /^[\d.]+$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname) ||
      /[\s\\<>?#]/.test(value)) {
    throw new Error('--guide-url must be an approved HTTPS DNS destination without credentials, port, query or fragment.');
  }
  return url.href.replace(/\/$/, '');
}

export function parseArgs(args) {
  const options = { targets: [] };
  const flags = new Map([
    ['--apply', 'apply'], ['--labels', 'labels'], ['--scaffold', 'scaffold'],
    ['--pages', 'pages'], ['--acknowledge-public-pages', 'acknowledgePublicPages'],
  ]);
  const values = new Map([
    ['--repo', 'repo'], ['--guide-url', 'guide'], ['--app-id', 'appId'], ['--app-owner', 'appOwner'],
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flags.has(flag) && !options[flags.get(flag)]) options[flags.get(flag)] = true;
    else if ((values.has(flag) || flag === '--target') && args[index + 1] && !args[index + 1].startsWith('--')) {
      const value = args[++index];
      if (flag === '--target') options.targets.push(value);
      else {
        if (options[values.get(flag)] !== undefined) throw new Error('Duplicate option. See --help.');
        options[values.get(flag)] = value;
      }
    } else throw new Error('Unknown, duplicate or incomplete option. See --help.');
  }
  if (!validRepository(options.repo)) throw new Error('--repo must be owner/name without URL, traversal or .git suffix.');
  if (options.targets.some(target => !validRepository(target) || target.toLowerCase() === options.repo.toLowerCase()) ||
      new Set(options.targets.map(target => target.toLowerCase())).size !== options.targets.length) {
    throw new Error('--target must be a unique exact owner/name different from the hub.');
  }
  if (options.guide) options.guide = guideUrl(options.guide);
  if (options.appId && !/^[1-9]\d*$/.test(options.appId)) throw new Error('--app-id must be a positive numeric App ID.');
  if (options.appOwner && !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(options.appOwner)) throw new Error('--app-owner must be one account name.');
  if (options.scaffold && !options.guide) throw new Error('--scaffold requires an explicitly reviewed --guide-url.');
  if (!options.scaffold && (options.guide || options.targets.length || options.appId || options.appOwner)) {
    throw new Error('Configuration inputs require --scaffold; no configuration is applied.');
  }
  if (options.apply && !options.labels && !options.pages) throw new Error('--apply requires explicit --labels and/or --pages.');
  if (options.apply && options.pages && !options.acknowledgePublicPages) {
    throw new Error('--apply --pages requires --acknowledge-public-pages; private/internal sites remain manual.');
  }
  if (options.acknowledgePublicPages && !options.pages) throw new Error('--acknowledge-public-pages requires --pages.');
  return options;
}

export function scaffoldProposal(options, config) {
  const targets = [...new Set([...config.policy.allowed_repositories, ...options.targets].map(value => value.toLowerCase()))];
  if (targets.some(target => !validRepository(target) || target === options.repo.toLowerCase())) {
    throw new Error('The proposed allowlist must contain exact solution repositories distinct from the hub.');
  }
  const owner = options.appOwner || options.repo.split('/')[0];
  if (targets.some(target => target.split('/')[0] !== owner.toLowerCase())) {
    throw new Error('App proposal supports one installation owner; use a separate instance for other owners.');
  }
  return {
    status: 'PROPOSAL ONLY - not applied or approved',
    hub_url: `https://github.com/${options.repo}`,
    proposed_files: {
      'config/policy.yml': { ...config.policy, allowed_repositories: targets, guide_url: options.guide },
    },
    proposed_link_edits: {
      '.github/ISSUE_TEMPLATE/config.yml': {
        'contact_links[0].url': `${options.guide}/`,
        'contact_links[1].url': `${options.guide}/requests.html`,
      },
    },
    proposed_actions_variables: {
      SOLUTION_APP_ID: options.appId || 'MANUAL: reviewed numeric App ID',
      SOLUTION_APP_OWNER: owner,
      SOLUTION_APP_REPOSITORIES: targets.map(target => target.split('/')[1]).join(','),
    },
    manual: [
      'Review this proposal in a protected PR; merge approved policy and link edits yourself. Existing targets are preserved, not automatically authorized.',
      'Update customer hub/guide/source URLs throughout docs/*.html, README.md, SETUP.md and enterprise-setup; review CODEOWNERS and default-branch filters.',
      'Register/install the App manually on selected targets; reconcile installation, variable names and exact policy allowlist before setting variables.',
      'An empty target list is intentionally unusable; do not configure an empty App repository variable or broaden installation scope.',
      'Store SOLUTION_APP_PRIVATE_KEY (or the approved alternative SOLUTION_REPO_TOKEN) manually through secure Actions secret UI/storage. Never put credentials in arguments, proposal files or logs.',
    ],
  };
}

async function readPages(api, path) {
  try { return await api.request('GET', `${path}/pages`); }
  catch (error) {
    if (error.status !== 404) throw error;
    return null; // Absence or hidden access; creation still needs independently checked prerequisites.
  }
}

async function pagesPrerequisites(api, path, repo, actions, options) {
  if (repo.visibility !== 'public' || repo.private !== false) {
    throw new Error('Private/internal Pages is manual: verify plan, organization/EMU policy, private project-site access and reader tests in enterprise-setup/05-pages-copilot.md.');
  }
  if (repo.permissions?.admin !== true || actions.enabled !== true || !repo.default_branch ||
      repo.has_pages !== false) {
    throw new Error('Pages creation requires verified hub admin access, enabled Actions, a default branch and has_pages=false. Resolve policy/visibility/404 ambiguity manually in Settings > Pages.');
  }
  const file = await api.request('GET', `${path}/contents/.github/workflows/pages.yml?ref=${encodeURIComponent(repo.default_branch)}`);
  if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('Cannot verify Pages workflow contents.');
  const workflow = parse(Buffer.from(file.content, 'base64').toString('utf8'), { uniqueKeys: true, maxAliasCount: 0 });
  const triggers = typeof workflow?.on === 'string' ? [workflow.on] :
    Array.isArray(workflow?.on) ? workflow.on :
      workflow?.on && typeof workflow.on === 'object' ? Object.keys(workflow.on) : [];
  if (triggers.length !== 1 || triggers[0] !== 'workflow_dispatch') {
    throw new Error('Remove all automatic triggers from .github/workflows/pages.yml through review; retain only workflow_dispatch before creating Pages.');
  }
  const state = await api.request('GET', `${path}/actions/workflows/pages.yml`);
  if (state.state !== 'active') throw new Error('Pages workflow is not active; approve workflow/actions/runner policy manually.');
  if (options.apply && !options.acknowledgePublicPages) throw new Error('Explicit public Pages acknowledgment is required.');
}

export async function bootstrap(options, { config, api }) {
  const results = [];
  const add = (status, detail) => results.push({ status, detail });
  const path = `/repos/${options.repo}`;
  let failed = false;
  try {
    // Validate the entire local proposal before any selected mutation can start.
    if (options.scaffold) add('PLANNED', `Configuration review proposal (never applied):\n${JSON.stringify(scaffoldProposal(options, config), null, 2)}`);
    const repo = await api.request('GET', path);
    if (repo.full_name?.toLowerCase() !== options.repo.toLowerCase() || repo.archived || repo.disabled) {
      throw new Error('Hub identity mismatch, archived or disabled repository; no bootstrap permitted.');
    }
    add(repo.has_issues ? 'UNCHANGED' : 'MANUAL', `Issues ${repo.has_issues ? 'enabled' : 'disabled; enable in Settings > General > Features before intake'}.`);
    const actions = await api.request('GET', `${path}/actions/permissions`);
    if (typeof actions.enabled !== 'boolean') throw new Error('Cannot verify Actions availability.');
    add(actions.enabled ? 'UNCHANGED' : 'MANUAL', `Actions ${actions.enabled ? 'enabled' : 'disabled; review enterprise/org/repository policy manually'}; allowed actions: ${actions.allowed_actions || 'not returned'}. No policy was changed.`);
    const permissions = await api.request('GET', `${path}/actions/permissions/workflow`);
    if (!['read', 'write'].includes(permissions.default_workflow_permissions) ||
        typeof permissions.can_approve_pull_request_reviews !== 'boolean') {
      throw new Error('Cannot verify default workflow permissions.');
    }
    add('UNCHANGED', `Default workflow token: ${permissions.default_workflow_permissions}; PR approval: ${permissions.can_approve_pull_request_reviews}. Explicit job permissions and higher-level policy still require manual review; no widening.`);
    if (options.labels || (!options.pages && !options.scaffold)) {
      const labels = await api.pages(`${path}/labels`);
      for (const label of requiredLabels) {
        if (labels.some(existing => existing.name.toLowerCase() === label.name)) {
          add('UNCHANGED', `Label ${label.name}; existing color/description preserved.`);
        } else if (!options.apply) {
          add('PLANNED', `Create missing label ${label.name} (#${label.color}); no description is specified by the manual setup.`);
        } else {
          try {
            await api.request('POST', `${path}/labels`, label);
            add('APPLIED', `Created label ${label.name}.`);
          } catch (error) {
            if (error.status !== 422) throw error;
            const existing = await api.request('GET', `${path}/labels/${encodeURIComponent(label.name)}`);
            if (existing.name?.toLowerCase() !== label.name) throw new Error(`Could not confirm concurrent label creation: ${label.name}.`);
            add('UNCHANGED', `Label ${label.name} created concurrently; preserved.`);
          }
        }
      }
      if (options.apply) {
        const verified = await api.pages(`${path}/labels`);
        if (requiredLabels.some(label => !verified.some(existing => existing.name.toLowerCase() === label.name))) {
          throw new Error('Post-apply label verification failed; rerun preview to reconcile partial changes.');
        }
        add('UNCHANGED', 'Read-only verification: all five required labels now exist.');
      }
    }
    if (options.pages) {
      const current = await readPages(api, path);
      if (current) {
        add('UNCHANGED', 'Pages already exists; publication/source/access settings are preserved. Review Settings > Pages manually; no deployment requested.');
      } else {
        await pagesPrerequisites(api, path, repo, actions, options);
        if (!options.apply) add('PLANNED', 'Create public workflow-based Pages only with --apply --pages --acknowledge-public-pages. No deployment will be dispatched.');
        else {
          // Re-read immediately before creation; never PUT/PATCH an existing site.
          const latest = await api.request('GET', path);
          if (await readPages(api, path)) add('UNCHANGED', 'Pages appeared concurrently; preserved without changes.');
          else {
            await pagesPrerequisites(api, path, latest, await api.request('GET', `${path}/actions/permissions`), options);
            try {
              await api.request('POST', `${path}/pages`, { build_type: 'workflow', public: true });
              add('APPLIED', 'Created public workflow-based Pages configuration; no deployment dispatched.');
            } catch (error) {
              if (error.status !== 409 && error.status !== 422) throw error;
              if (!await readPages(api, path)) throw error;
              add('UNCHANGED', 'Pages appeared during creation; preserved. Review its settings manually.');
            }
            if (!await readPages(api, path)) throw new Error('Pages post-apply read failed; inspect Settings > Pages before retrying.');
          }
        }
      }
    }
  } catch (error) {
    failed = true;
    add('BLOCKED', `${error.message} Stopped; earlier APPLIED changes remain, and a failed request may have reached GitHub. Rerun preview before retrying.`);
  }
  for (const result of staticDiagnostics(config, options.repo)) {
    add(result.status === 'PASS' ? 'UNCHANGED' : 'MANUAL', `Static preflight ${result.status} ${result.name}: ${result.detail}`);
  }
  add('MANUAL', 'Review protections, Issues/Actions policy, teams, licensing and App installation/credentials manually. No targets queried; no secrets uploaded; no local files written. Static checks do not prove live target permissions or workload readiness.');
  return { results, failed };
}

export async function main(args = process.argv.slice(2), env = process.env, log = console.log) {
  if (args.length === 1 && args[0] === '--help') { log(usage); return 0; }
  const options = parseArgs(args);
  if ((env.GITHUB_API_URL && env.GITHUB_API_URL !== 'https://api.github.com') ||
      (env.GITHUB_SERVER_URL && env.GITHUB_SERVER_URL !== 'https://github.com')) {
    throw new Error('Bootstrap supports stock GitHub.com only; no credentials sent to alternate hosts.');
  }
  const config = await loadConfig();
  const api = new GitHub(env.HUB_TOKEN);
  log(options.apply ? 'APPLY selected operations only; configuration scaffolding remains a proposal.' : 'PREVIEW: read-only, including local files. No changes will be applied.');
  const report = await bootstrap(options, { config, api });
  for (const result of report.results) log(`${result.status} ${result.detail}`);
  log(`SUMMARY ${['PLANNED', 'APPLIED', 'UNCHANGED', 'BLOCKED', 'MANUAL'].map(status =>
    `${status}=${report.results.filter(result => result.status === status).length}`).join(' ')}`);
  return report.failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
