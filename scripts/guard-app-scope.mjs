import { pathToFileURL } from 'node:url';
import { createSign } from 'node:crypto';
import { loadConfig, repositoryPattern } from './model.mjs';

const repoName = /^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/;

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

export async function verifyInstallationScope({ appId, privateKey, owner, allowedRepositories, fetcher = fetch, now = Date.now() }) {
  if (!privateKey) throw new Error('SOLUTION_APP_PRIVATE_KEY is required to verify installation scope.');
  if (!/^\d+$/.test(appId ?? '') || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(owner ?? '')) {
    throw new Error('Invalid App ID or installation owner.');
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540, iss: appId,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(payload);
  const jwt = `${payload}.${signer.sign(privateKey, 'base64url')}`;
  async function request(method, path, token, data) {
    const response = await fetcher(`https://api.github.com${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Installation scope verification ${method} ${path.split('?')[0]} returned ${response.status}; publication is blocked.`);
    return response.status === 204 ? null : response.json();
  }
  const installations = [];
  for (let page = 1; ; page++) {
    const items = await request('GET', `/app/installations?per_page=100&page=${page}`, jwt);
    if (!Array.isArray(items)) throw new Error('Unknown App installation response; publication is blocked.');
    installations.push(...items.filter(item => item.account?.login?.toLowerCase() === owner.toLowerCase()));
    if (items.length < 100) break;
  }
  if (installations.length !== 1 || installations[0].suspended_at ||
      installations[0].repository_selection !== 'selected' || !Number.isSafeInteger(installations[0].id)) {
    throw new Error('Require one active App installation for the owner with Only select repositories; publication is blocked.');
  }
  // A narrowed write token hides extra installation grants. Inspect the full
  // installation with metadata-only access, then revoke it before any writes.
  const credential = await request('POST', `/app/installations/${installations[0].id}/access_tokens`, jwt,
    { permissions: { metadata: 'read' } });
  if (!credential.token) throw new Error('Missing metadata token; publication is blocked.');
  try {
    const repositories = [];
    let total;
    for (let page = 1; ; page++) {
      const result = await request('GET', `/installation/repositories?per_page=100&page=${page}`, credential.token);
      if (!Array.isArray(result.repositories) || !Number.isSafeInteger(result.total_count) ||
          result.total_count < 0 || (total !== undefined && total !== result.total_count)) {
        throw new Error('Unknown or changing installation repository response; publication is blocked.');
      }
      total = result.total_count;
      repositories.push(...result.repositories.map(repository => repository.full_name?.toLowerCase()));
      if (result.repositories.length < 100) break;
    }
    const expected = allowedRepositories.map(repository => repository.toLowerCase());
    if (repositories.length !== total || repositories.length !== expected.length ||
        repositories.some(repository => !expected.includes(repository)) ||
        new Set(repositories).size !== repositories.length) {
      throw new Error('App installation repositories must exactly match the reviewed allowlist; publication is blocked.');
    }
  } finally {
    await request('DELETE', '/installation/token', credential.token);
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
    if (process.env.GITHUB_ACTIONS === 'true' || process.env.SOLUTION_APP_PRIVATE_KEY) {
      if (process.env.GITHUB_SERVER_URL !== 'https://github.com') throw new Error('Live App scope verification supports GitHub.com only.');
      await verifyInstallationScope({
        appId: process.env.SOLUTION_APP_ID.trim(), privateKey: process.env.SOLUTION_APP_PRIVATE_KEY,
        owner: process.env.SOLUTION_APP_OWNER || process.env.GITHUB_REPOSITORY.split('/')[0],
        allowedRepositories: config.policy.allowed_repositories,
      });
    }
    console.log(`Validated exact App/allowlist scope (${names.length} name(s)); values are not logged.`);
  };
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
