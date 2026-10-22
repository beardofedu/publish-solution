import { readFile } from 'node:fs/promises';
import { GitHub } from './github.mjs';
import { loadConfig } from './model.mjs';
import { authorize, clearGate } from './publish.mjs';
import { upsertComment } from './github.mjs';
import { reportTag } from './tags.mjs';

try {
  if (!['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const { policy } = await loadConfig(process.env.TOOLKIT_PATH ?? process.cwd());
    const api = new GitHub(process.env.HUB_TOKEN, process.env.GITHUB_API_URL);
    if (process.env.GITHUB_EVENT_NAME === 'issues' && event.issue &&
        event.issue.labels?.some(label => label.name === 'publication-request') &&
        ['edited', 'reopened'].includes(event.action)) {
      // An untrusted edit must invalidate the old advisory decision, even when
      // its author is not allowed to mint a cross-repository token.
      await clearGate(api, process.env.GITHUB_REPOSITORY, event.issue.number);
      await upsertComment(api, process.env.GITHUB_REPOSITORY, event.issue.number, reportTag,
        '## Handoff invalidated\n\nThe original publication request was edited or reopened. Its prior validation package is no longer current; an authorized maintainer must rerun `/publish` and `/validate` before a new human review.');
    }
    await authorize(api, process.env.GITHUB_REPOSITORY, event.sender.login, policy);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
