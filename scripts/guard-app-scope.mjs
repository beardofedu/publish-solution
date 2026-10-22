import { pathToFileURL } from 'node:url';
import { loadConfig, repositoryPattern } from './model.mjs';

const repoName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function appRepositoryNames(appId, value) {
  if (appId === undefined || appId === '') return [];
  if (!/^\d+$/.test(appId.trim())) throw new Error('SOLUTION_APP_ID must be a non-empty numeric App ID.');
  const entries = (value ?? '').split(',').map(name => name.trim());
  if (!value?.trim() || entries.some(name => !name || !repoName.test(name)) ||
      new Set(entries.map(name => name.toLowerCase())).size !== entries.length) {
    throw new Error('SOLUTION_APP_REPOSITORIES must explicitly list unique repository names only (comma-separated, no owner prefix); refusing to mint a wider token.');
  }
  return entries;
}

export function validateAppRepositoryScope(names, allowedRepositories, hub, ownerOverride = '') {
  if (!repositoryPattern.test(hub ?? '')) throw new Error('GITHUB_REPOSITORY must be owner/name.');
  if (!allowedRepositories.length) throw new Error('App mode requires at least one reviewed allowlist target.');
  const installationOwner = (ownerOverride || hub.split('/')[0]).toLowerCase();
  const expected = [];
  for (const target of allowedRepositories) {
    if (!repositoryPattern.test(target)) throw new Error('The target allowlist contains an invalid owner/name.');
    const [owner, name] = target.split('/');
    if (owner.toLowerCase() !== installationOwner) {
      throw new Error('The target allowlist spans multiple owners; stock App routing supports one installation owner only.');
    }
    expected.push(name.toLowerCase());
  }
  const actual = names.map(name => name.toLowerCase());
  if (new Set(expected).size !== expected.length || actual.length !== expected.length ||
      expected.some(name => !actual.includes(name))) {
    throw new Error('SOLUTION_APP_REPOSITORIES must exactly match the reviewed allowlist under the App owner; refusing missing or extra repository access.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const main = async () => {
    const names = appRepositoryNames(process.env.SOLUTION_APP_ID, process.env.SOLUTION_APP_REPOSITORIES);
    if (!names.length) {
      console.log('App mode is not configured; the scope guard is not applicable.');
      return;
    }
    const config = await loadConfig();
    validateAppRepositoryScope(names, config.policy.allowed_repositories,
      process.env.GITHUB_REPOSITORY, process.env.SOLUTION_APP_OWNER);
    console.log(`Validated exact App/allowlist scope (${names.length} name(s)); values are not logged.`);
  };
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
