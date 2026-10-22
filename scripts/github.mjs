export class ApiError extends Error {
  constructor(status, method, path) {
    super(`GitHub API ${method} ${path.split('?')[0]} returned ${status}. Check permissions, feature availability, and repository policy.`);
    this.status = status;
  }
}

export class GitHub {
  constructor(token, base = 'https://api.github.com', fetcher = fetch) {
    if (!token) throw new Error('A GitHub token is required.');
    const url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('GitHub API URL must use HTTPS.');
    this.token = token;
    this.base = base.replace(/\/$/, '');
    this.fetcher = fetcher;
  }

  async request(method, path, data) {
    if (!path.startsWith('/repos/')) throw new Error('Only repository API paths are supported.');
    const response = await this.fetcher(`${this.base}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!response.ok) throw new ApiError(response.status, method, path);
    return response.status === 204 ? null : response.json();
  }

  async pages(path) {
    const results = [];
    for (let page = 1; ; page++) {
      const items = await this.request('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(items)) throw new Error('Expected a paginated GitHub array.');
      results.push(...items);
      if (items.length < 100) return results;
    }
  }
}

export async function upsertComment(api, repo, issue, tag, body) {
  const comments = await api.pages(`/repos/${repo}/issues/${issue}/comments`);
  const existing = comments.find(comment =>
    comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(tag));
  if (existing) return api.request('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, { body: `${tag}\n${body}` });
  return api.request('POST', `/repos/${repo}/issues/${issue}/comments`, { body: `${tag}\n${body}` });
}

export async function setLabels(api, repo, issue, add, remove = []) {
  for (const name of add) {
    try {
      await api.request('POST', `/repos/${repo}/labels`, { name, color: '0969da' });
    } catch (error) {
      if (error.status !== 422) throw error;
      // Distinguish an existing label from a different validation error.
      await api.request('GET', `/repos/${repo}/labels/${encodeURIComponent(name)}`);
    }
  }
  if (add.length) await api.request('POST', `/repos/${repo}/issues/${issue}/labels`, { labels: add });
  for (const name of remove) {
    try {
      await api.request('DELETE', `/repos/${repo}/issues/${issue}/labels/${encodeURIComponent(name)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}
