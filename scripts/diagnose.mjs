import { pathToFileURL } from 'node:url';
import { loadConfig, repositoryPattern } from './model.mjs';
import { GitHub } from './github.mjs';

const green = item => ({ status: 'PASS', ...item });
const amber = item => ({ status: 'LIMIT', ...item });
const red = item => ({ status: 'BLOCKED', ...item });

export function staticDiagnostics(config, hub, targets = config.policy.allowed_repositories) {
  const results = [
    config.policy.allowed_repositories.length
      ? green({ name: 'Target allowlist', detail: `${config.policy.allowed_repositories.length} exact target(s) configured.` })
      : red({ name: 'Target allowlist', detail: 'Empty by design; no target can be processed until an exact owner/name is reviewed into config/policy.yml.' }),
    green({ name: 'Workflow permissions', detail: 'Publication uses contents:read and issues:write. The hub-only onboarding job additionally requests contents:write and pull-requests:write for reviewed policy PRs. Target reads depend on separate credentials.' }),
    amber({ name: 'Credentials', detail: 'Static mode cannot inspect Actions secret/variable visibility, secret values, token validity, or App installation scope.' }),
  ];
  if (hub && !repositoryPattern.test(hub)) results.push(red({ name: 'Governance repository', detail: 'GITHUB_REPOSITORY must be owner/name.' }));
  for (const target of targets) {
    if (!repositoryPattern.test(target)) {
      results.push(red({ name: `Target ${target}`, detail: 'Invalid owner/name.' }));
    } else if (hub && target.toLowerCase() === hub.toLowerCase()) {
      results.push(red({ name: `Target ${target}`, detail: 'The solution repository must differ from the governance repository.' }));
    } else if (!config.policy.allowed_repositories.some(allowed => allowed.toLowerCase() === target.toLowerCase())) {
      results.push(red({ name: `Target ${target}`, detail: 'Not in the exact repository allowlist; no live access check will be attempted.' }));
    } else {
      results.push(green({ name: `Target ${target}`, detail: 'Matches the exact configured allowlist. This does not prove App/PAT installation or permissions.' }));
    }
  }
  return results;
}

export async function listActionItems(api, path, property) {
  const results = [];
  for (let page = 1; ; page++) {
    const response = await api.request('GET', `${path}?per_page=100&page=${page}`);
    if (!Array.isArray(response?.[property])) {
      throw new Error(`Expected GitHub Actions ${property} list response.`);
    }
    results.push(...response[property]);
    if (response[property].length < 100) return results;
  }
}

export async function liveDiagnostics(config, hub, targets, env) {
  if (!hub || !repositoryPattern.test(hub)) throw new Error('Live mode requires GITHUB_REPOSITORY=owner/name.');
  if (!env.HUB_TOKEN) throw new Error('Live mode requires HUB_TOKEN through an approved secret mechanism; no token value is printed.');
  const results = [];
  const hubApi = new GitHub(env.HUB_TOKEN, env.GITHUB_API_URL);
  const allowed = config.policy.allowed_repositories.map(repo => repo.toLowerCase());
  try {
    await hubApi.request('GET', `/repos/${hub}`);
    results.push(green({ name: 'Governance repository access', detail: 'HUB_TOKEN can read the hub repository.' }));
  } catch (error) {
    results.push(red({ name: 'Governance repository access', detail: error.message }));
    return results;
  }
  if (config.policy.onboarding_prs) {
    try {
      const permissions = await hubApi.request('GET', `/repos/${hub}/actions/permissions/workflow`);
      results.push(permissions.can_approve_pull_request_reviews === true
        ? green({ name: 'Onboarding PR creation policy', detail: 'Actions PR creation/approval setting is enabled; this does not grant PR approval authority to onboarding code.' })
        : amber({ name: 'Onboarding PR creation policy', detail: permissions.can_approve_pull_request_reviews === false
          ? 'Enable Allow GitHub Actions to create and approve pull requests if policy permits; onboarding falls back to comment-only.'
          : 'PR creation setting is unknown; inspect Actions settings before enabling automatic onboarding PRs.' }));
    } catch (error) {
      results.push(amber({ name: 'Onboarding PR creation policy', detail: `${error.message} Setting is unknown; onboarding falls back to comment-only on permission denial.` }));
    }
  }
  let variables;
  let secrets;
  try {
    variables = await listActionItems(hubApi, `/repos/${hub}/actions/variables`, 'variables');
    secrets = await listActionItems(hubApi, `/repos/${hub}/actions/secrets`, 'secrets');
    results.push(amber({ name: 'Actions configuration scope', detail: 'This diagnostic enumerates repository-scoped names only; organization/environment-scoped values may also feed the workflow and are not inspected here.' }));
    const names = new Set(variables.map(variable => variable.name));
    const secretNames = new Set(secrets.map(secret => secret.name));
    for (const name of ['SOLUTION_APP_ID', 'SOLUTION_APP_REPOSITORIES']) {
      results.push(names.has(name)
        ? green({ name: `Actions variable ${name}`, detail: 'Visible to this token; value is not printed.' })
        : amber({ name: `Actions variable ${name}`, detail: 'Not visible as a repository Actions variable. This may be expected in PAT mode; check scope and organization policy.' }));
    }
    results.push(names.has('SOLUTION_APP_OWNER')
      ? green({ name: 'Actions variable SOLUTION_APP_OWNER', detail: 'Visible to this token; value is not printed.' })
      : amber({ name: 'Actions variable SOLUTION_APP_OWNER', detail: 'Not set/visible; bundled workflows default to the hub owner.' }));
    const appKey = secretNames.has('SOLUTION_APP_PRIVATE_KEY');
    const pat = secretNames.has('SOLUTION_REPO_TOKEN');
    const appId = variables.find(variable => variable.name === 'SOLUTION_APP_ID')?.value?.trim();
    const appMode = Boolean(appId);
    if (appMode && !/^\d+$/.test(appId)) {
      results.push(red({ name: 'App ID format', detail: 'SOLUTION_APP_ID must be a numeric GitHub App ID.' }));
    }
    results.push(appKey || pat
      ? amber({ name: 'Target credential name', detail: `Visible secret name(s): ${[appKey && 'SOLUTION_APP_PRIVATE_KEY', pat && 'SOLUTION_REPO_TOKEN'].filter(Boolean).join(', ')}. Secret value, validity, selected repositories, and installation owner cannot be inspected.` })
      : amber({ name: 'Target credential name', detail: 'No target credential name is visible at repository scope; organization/environment secret scopes are not inspected.' }));
    if (appMode && !appKey) results.push(amber({ name: 'App credentials', detail: 'The App key name is not visible at repository scope; an organization-scoped secret may be supplied, otherwise App creation will fail and the PAT is not a fallback.' }));
    if (!appMode && !pat) results.push(amber({ name: 'Credential path', detail: 'No repository-scoped App ID or PAT name is visible; organization/environment scope is not inspected.' }));
    if (appMode && appKey && pat) results.push(amber({ name: 'Credential precedence', detail: 'The configured App takes precedence over the PAT in bundled workflows; the PAT is not a fallback if App setup fails.' }));
    const appRepositories = variables.find(variable => variable.name === 'SOLUTION_APP_REPOSITORIES')?.value;
    if (appMode && !appRepositories?.trim()) results.push(amber({ name: 'App repository scope', detail: 'SOLUTION_APP_REPOSITORIES is empty or not visible at repository scope. The bundled workflow guard refuses an empty value; organization-scoped variables are not inspected.' }));
    else if (appMode && appRepositories) {
      const configuredNames = appRepositories.split(',').map(value => value.trim());
      const validName = /^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/;
      if (configuredNames.some(name => !validName.test(name)) ||
          new Set(configuredNames.map(name => name.toLowerCase())).size !== configuredNames.length) {
        results.push(red({ name: 'App repository list format', detail: 'Use unique repository names only, comma-separated, with no owner prefixes or empty entries.' }));
      }
      const selectedOwner = (variables.find(variable => variable.name === 'SOLUTION_APP_OWNER')?.value || hub.split('/')[0]).toLowerCase();
      const policyTargets = config.policy.allowed_repositories.map(target => target.split('/'));
      const foreignTargets = policyTargets.filter(([owner]) => owner.toLowerCase() !== selectedOwner);
      const expectedNames = policyTargets.filter(([owner]) => owner.toLowerCase() === selectedOwner)
        .map(([, name]) => name.toLowerCase());
      const actualNames = configuredNames.map(name => name.toLowerCase());
      if (foreignTargets.length) results.push(red({
        name: 'App owner boundary',
        detail: 'The stock workflow supports one installation owner; one or more allowlisted repositories require a different owner.',
      }));
      if (actualNames.length !== expectedNames.length || expectedNames.some(name => !actualNames.includes(name))) {
        results.push(red({
          name: 'App scope versus allowlist',
          detail: 'The explicit App repository list must exactly match the reviewed allowlist under one installation owner; remove extra access or add the approved target through review.',
        }));
      } else {
        results.push(green({ name: 'App scope versus allowlist', detail: 'Explicit App repository names exactly match the reviewed allowlist for one owner.' }));
      }
      for (const target of targets.filter(name => allowed.includes(name.toLowerCase()))) {
        const [owner, name] = target.split('/');
        results.push(owner.toLowerCase() === selectedOwner.toLowerCase() && configuredNames.some(value => value.toLowerCase() === name.toLowerCase())
          ? green({ name: `App target scope ${target}`, detail: 'Target is explicitly listed under the configured installation owner.' })
          : red({ name: `App target scope ${target}`, detail: 'Target is absent from the explicit repository list or owner mapping; review the App installation and repository list.' }));
      }
    }
  } catch (error) {
    results.push(red({ name: 'Actions configuration visibility', detail: `${error.message} This token may not have permission to list Actions variables/secrets.` }));
  }
  if (!env.SOLUTION_TOKEN) {
    results.push(amber({ name: 'Target access', detail: 'No SOLUTION_TOKEN supplied. Workflow-minted App access cannot be tested locally; no writes were attempted.' }));
    return results;
  }
  const targetApi = new GitHub(env.SOLUTION_TOKEN, env.GITHUB_API_URL);
  results.push(...await targetDiagnostics(targetApi,
    targets.filter(target => allowed.includes(target.toLowerCase()) && target.toLowerCase() !== hub.toLowerCase())));
  return results;
}

export async function targetDiagnostics(targetApi, targets) {
  const results = [];
  for (const target of targets) {
    try {
      const repo = await targetApi.request('GET', `/repos/${target}`);
      if (repo.archived || repo.disabled || !repo.has_issues) {
        results.push(red({ name: `Target ${target}`, detail: 'Repository is archived, disabled, or Issues are not enabled.' }));
        continue;
      }
      await targetApi.request('GET', `/repos/${target}/issues?state=open&per_page=1`);
      results.push(green({ name: `Target read access ${target}`, detail: 'SOLUTION_TOKEN can read repository metadata and issues. This does not prove issue-write or admin/security-feature access.' }));
      results.push(amber({ name: `Feature permissions ${target}`, detail: 'Do not infer Administration, code-scanning, or plan availability from issue access. Confirm relevant reads/UNKNOWN checks during an approved pilot.' }));
    } catch (error) {
      results.push(red({ name: `Target access ${target}`, detail: error.message }));
    }
  }
  return results;
}

export function formatDiagnostics(results) {
  return results.map(result => `${result.status} ${result.name}: ${result.detail}`).join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const targets = [];
  let live = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--live') live = true;
    else if (args[index] === '--target' && args[index + 1]) targets.push(args[++index]);
    else throw new Error('Usage: node scripts/diagnose.mjs [--target owner/name]... [--live]');
  }
  const config = await loadConfig();
  const hub = process.env.GITHUB_REPOSITORY;
  const selected = targets.length ? targets : config.policy.allowed_repositories;
  const results = staticDiagnostics(config, hub, selected);
  console.log(formatDiagnostics(results));
  if (!live) {
    console.log('\nStatic mode is read-only and requires no credentials. Use --live only with approved read-scoped credentials; it never creates or edits GitHub resources.');
    return;
  }
  const remote = await liveDiagnostics(config, hub, selected, process.env);
  console.log(`\n${formatDiagnostics(remote)}`);
  if ([...results, ...remote].some(result => result.status === 'BLOCKED')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
