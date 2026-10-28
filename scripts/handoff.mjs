const safeText = value => String(value).replace(/[\\`*_{}[\]()#+\-.!|>]/g, '\\$&');

export function renderHandoff({ issue, intake, tier, plans, checks, skipped = [], exceptions = [], commitSha, validatedAt }) {
  const controls = plans.map(plan => {
    const completed = plan.existing?.state === 'closed' && plan.existing?.state_reason === 'completed';
    return `- ${completed ? 'Completed' : 'Open'} — \`${plan.control.id}\` — ${plan.existing?.html_url ?? 'Missing; rerun /publish'}. Review the issue and its evidence comments; closure alone is not evidence.`;
  });
  const checkLines = checks.map(check => `- **${check.status} — ${safeText(check.name)}:** ${safeText(check.detail)}`);
  const exceptionLines = exceptions.length
    ? exceptions.map(exception => `- ${safeText(exception.status)} — control \`${safeText(exception.control_id)}\`, expiry \`${safeText(exception.expiry)}\`, request state ${safeText(exception.state)}: ${exception.html_url}. Human decision/conditions are not inferred.`)
    : ['- No linked exception requests found by the hub API for this source request.'];
  const gaps = checks.filter(check => check.status !== 'PASS');
  const openControls = plans.filter(plan =>
    plan.existing?.state !== 'closed' || plan.existing?.state_reason !== 'completed');
  return [
    '## Handoff package — prepared for human review',
    '',
    `**Package state:** Prepared${gaps.length || openControls.length ? ' with gaps' : ' for review'} (machine-generated; not a decision).`,
    `**Validation time (UTC):** ${validatedAt}`,
    `**Validation basis:** ${commitSha ? `\`${commitSha}\`` : 'Unknown; validation is not current.'}`,
    `**Original request:** ${issue.html_url}`,
    `**Solution repository:** ${intake.repository}`,
    `**Risk tier:** ${tier}`,
    `**Requested owners:** business \`${safeText(intake.business)}\`; technical \`${safeText(intake.technical)}\`; data owner decision required.`,
    '',
    '### Applicable controls and evidence locations',
    ...controls,
    '',
    '### Automated validation results',
    ...checkLines,
    ...skipped.map(name => `- **NOT RUN — ${safeText(name)}:** disabled or out of tier scope in config/checks.yml; requires a governance decision on manual evidence.`),
    '',
    '### Linked time-bound exception requests',
    ...exceptionLines,
    'Exception status is visibility only; the stock gate does not use exceptions to bypass a failed or unknown check.',
    ...(gaps.length || openControls.length
      ? ['', '### Open gaps / residual risks', ...gaps.map(check => `- ${check.status}: ${safeText(check.name)} — ${safeText(check.detail)}`),
        ...openControls.map(plan => `- Incomplete control: ${plan.control.id}.`)]
      : ['', 'No machine-detected gaps remain in this run. Evidence quality and live-cloud state still require human verification.']),
    '',
    '### Human governance decision — not recorded by automation',
    '- Decision: PENDING (approve / reject / defer)',
    '- Named reviewer and authority:',
    '- Decision date and rationale:',
    '- Residual risks, exceptions, conditions, and expiry (if any):',
    '',
    '### Platform acceptance — separate from governance review',
    '- Acceptance: PENDING (accept / reject / defer)',
    '- Named platform owner:',
    '- Accepted deployment/release boundary and verified environment:',
    '- Rollback and operations owner:',
    '',
    'A reviewer must verify the linked evidence, current request and commit, exceptions, and live service facts. `ready-for-review`, issue closure, and this generated package are not approval or deployment authorization. Platform acceptance is a separate human record.',
  ].join('\n');
}
