import { controlBody, deriveTier, fingerprint, marker, parseIntake, planIssues, tiers } from './model.mjs';
import { automatedChecks, validationReport } from './checks.mjs';
import { setLabels, upsertComment } from './github.mjs';

const stateTag = '<!-- publish-solution:state -->';
export const reportTag = '<!-- publish-solution:report -->';

export async function authorize(hubApi, hub, actor, policy) {
  const result = await hubApi.request('GET', `/repos/${hub}/collaborators/${encodeURIComponent(actor)}/permission`);
  if (!policy.requester_permissions.includes(result.permission)) {
    throw new Error('Only an authorized governance repository collaborator may trigger publication or validation. Ask a maintainer to comment /publish.');
  }
}

export function contextFor(issue, hub, config) {
  const intake = parseIntake(issue.body);
  if (!config.policy.allowed_repositories.map(repo => repo.toLowerCase()).includes(intake.repository)) {
    throw new Error('Target repository is not explicitly allowlisted in config/policy.yml.');
  }
  if (intake.repository === hub.toLowerCase()) throw new Error('The solution repository must differ from the governance repository.');
  const tier = deriveTier(intake, config.tierConfig);
  const selected = planIssues(config.catalog, tier, [], hub, issue.number, intake.ai).map(plan => plan.control);
  return { intake, tier, basis: fingerprint({ intake, tier, controls: selected }) };
}

async function savedState(api, hub, number) {
  const comments = await api.pages(`/repos/${hub}/issues/${number}/comments`);
  const comment = comments.find(comment => comment.user?.login === 'github-actions[bot]' &&
    comment.body?.startsWith(stateTag));
  if (!comment) return null;
  const match = comment.body.match(/<!-- state-json:({[^\n]+}) -->/);
  if (!match) throw new Error('Publication state is missing or damaged; a maintainer must investigate.');
  const state = JSON.parse(match[1]);
  if (!state.repository || !state.basis || !Number.isInteger(state.parent)) {
    throw new Error('Invalid saved publication state.');
  }
  return state;
}

export async function clearGate(api, hub, number, approval = true) {
  return setLabels(api, hub, number, [], ['ready-for-review', ...(approval ? ['approved-for-production'] : [])]);
}

export async function intakeRequest({ hubApi, targetApi, hub, issue, config }) {
  await clearGate(hubApi, hub, issue.number);
  const context = contextFor(issue, hub, config);
  const { intake, tier, basis } = context;
  const old = await savedState(hubApi, hub, issue.number);
  if (old && old.repository !== intake.repository) {
    throw new Error('A request cannot be moved to another repository. Open a new request to preserve its audit trail.');
  }
  const root = `/repos/${intake.repository}`;
  const metadata = await targetApi.request('GET', root);
  if (metadata.archived || metadata.disabled || !metadata.has_issues) {
    throw new Error('Target repository must be active and have issues enabled.');
  }
  const existing = await targetApi.pages(`${root}/issues?state=all`);
  const parentTag = marker(hub, issue.number, 'parent');
  const parents = existing.filter(item => !item.pull_request && item.body?.includes(parentTag));
  if (parents.length > 1) throw new Error('Multiple parent tracking issues found; reconcile duplicates before continuing.');
  let parent = parents[0];
  if (!parent) parent = await targetApi.request('POST', `${root}/issues`, {
    title: `[Publication] Production readiness (${tier})`,
    body: `${parentTag}\nPublication checklist being prepared. Source: ${issue.html_url}`,
  });
  if (parent.state !== 'open') {
    await targetApi.request('PATCH', `${root}/issues/${parent.number}`, { state: 'open' });
  }
  const plans = planIssues(config.catalog, tier, existing, hub, issue.number, intake.ai);
  const warnings = [];
  let linkedIds;
  try {
    linkedIds = new Set((await targetApi.pages(`${root}/issues/${parent.number}/sub_issues`)).map(child => child.id));
  } catch (error) {
    if (![403, 404, 410, 422].includes(error.status)) throw error;
    warnings.push(`Sub-issue API returned ${error.status}; using the tracking checklist instead of native links.`);
  }
  // Saving only after all creates is safe: stable markers recover partial runs.
  for (const plan of plans) {
    if (!plan.existing) {
      plan.existing = await targetApi.request('POST', `${root}/issues`, {
        title: `[Publication] ${plan.control.title}`,
        body: controlBody(plan.control, plan.marker, {
          source: issue.html_url, tier, guide: config.policy.guide_url.replace(/\/$/, ''),
        }),
      });
    } else if (!old || old.basis !== basis) {
      plan.existing = await targetApi.request('PATCH', `${root}/issues/${plan.existing.number}`, { state: 'open' });
      await targetApi.request('POST', `${root}/issues/${plan.existing.number}/comments`, {
        body: `Publication scope or control requirements changed (or intake is recovering a partial run). Reconfirm evidence before closing.\n\n${controlBody(plan.control, plan.marker, {
          source: issue.html_url, tier, guide: config.policy.guide_url.replace(/\/$/, ''),
        })}`,
      });
    }
    if (linkedIds && !linkedIds.has(plan.existing.id)) {
      try {
        await targetApi.request('POST', `${root}/issues/${parent.number}/sub_issues`, { sub_issue_id: plan.existing.id });
        linkedIds.add(plan.existing.id);
      } catch (error) {
        if (![403, 404, 410, 422].includes(error.status)) throw error;
        warnings.push(`Sub-issue API returned ${error.status} for ${plan.control.id}; the tracking checklist remains authoritative.`);
      }
    }
  }
  const checklist = plans.map(plan => `- [${plan.existing.state === 'closed' && plan.existing.state_reason === 'completed' ? 'x' : ' '}] ${plan.existing.html_url}`);
  await targetApi.request('PATCH', `${root}/issues/${parent.number}`, {
    title: `[Publication] Production readiness (${tier})`,
    body: `${parentTag}\nSource: ${issue.html_url}\nRisk tier: **${tier}**\n\n${checklist.join('\n')}\n\n${warnings.join('\n')}\n\nComplete each control with evidence. Validate in the source request; governance approval is separate.`,
  });
  const state = { repository: intake.repository, basis, parent: parent.number };
  await upsertComment(hubApi, hub, issue.number, stateTag,
    `<!-- state-json:${JSON.stringify(state)} -->\n## Publication plan: ${tier}\n\n[Parent tracking issue](${parent.html_url})\n\n${checklist.join('\n')}\n\n${warnings.join('\n')}\n\nWhen evidence is complete, ask a maintainer to comment \`/validate\`. Changes to intake or catalog require \`/publish\` again and reopen required controls.`);
  await setLabels(hubApi, hub, issue.number, [`risk:${tier.toLowerCase()}`, 'publication-request'],
    tiers.filter(value => value !== tier).map(value => `risk:${value.toLowerCase()}`));
  return { parent, plans, tier, warnings };
}

export async function validateRequest({ hubApi, targetApi, hub, issue, config }) {
  await clearGate(hubApi, hub, issue.number, false);
  const { intake, tier, basis } = contextFor(issue, hub, config);
  const state = await savedState(hubApi, hub, issue.number);
  if (!state || state.repository !== intake.repository || state.basis !== basis) {
    throw new Error('No current intake plan: request or catalog changed. A maintainer must run /publish before validation.');
  }
  const metadata = await targetApi.request('GET', `/repos/${intake.repository}`);
  if (metadata.archived || metadata.disabled || !metadata.has_issues) throw new Error('The solution repository is not active.');
  const existing = await targetApi.pages(`/repos/${intake.repository}/issues?state=all`);
  const plans = planIssues(config.catalog, tier, existing, hub, issue.number, intake.ai);
  const checks = await automatedChecks(targetApi, intake.repository, metadata, config.policy);
  const parent = existing.find(item => item.number === state.parent &&
    item.body?.includes(marker(hub, issue.number, 'parent')));
  if (!parent) checks.push({ name: 'Tracking issue', status: 'FAIL', detail: 'Tracking issue is missing. Rerun /publish.' });
  const report = validationReport(plans, checks);
  if (parent) {
    const checklist = plans.map(plan => plan.existing
      ? `- [${plan.existing.state === 'closed' && plan.existing.state_reason === 'completed' ? 'x' : ' '}] ${plan.existing.html_url}`
      : `- [ ] ${plan.control.id}: missing; rerun /publish`);
    await targetApi.request('PATCH', `/repos/${intake.repository}/issues/${parent.number}`, {
      body: `${marker(hub, issue.number, 'parent')}\nSource: ${issue.html_url}\nRisk tier: **${tier}**\n\n${checklist.join('\n')}\n\n${report.body}`,
    });
  }
  // Re-read the request before granting readiness to catch edits during checks.
  const live = await hubApi.request('GET', `/repos/${hub}/issues/${issue.number}`);
  if (live.state !== 'open' || contextFor(live, hub, config).basis !== basis) {
    throw new Error('The request changed or closed during validation; run /publish again.');
  }
  await upsertComment(hubApi, hub, issue.number, reportTag, report.body);
  await setLabels(hubApi, hub, issue.number, report.ready ? ['ready-for-review'] : [],
    report.ready ? [] : ['ready-for-review', 'approved-for-production']);
  return report;
}
