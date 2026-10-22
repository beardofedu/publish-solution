# Security policy

This toolkit is governance assistance, not a deployment authorization boundary or a compliance certification. Protect cloud deployments independently with reviewed code, scoped identities, protected environments, and human review.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal information, exploit details, or sensitive customer data. Use this repository's **Security → Advisories → Report a vulnerability** feature if available. If private reporting is unavailable, open a minimal issue asking the maintainer to provide a private reporting channel, with no vulnerability details.

## Operational precautions

- Run confidential intakes in a private governance instance; review Pages visibility separately.
- Install the GitHub App on selected repositories or use an approved fine-grained PAT with narrow scope and expiry.
- Protect configuration, scripts, control catalog, dependency locks, and workflows with code review.
- Never execute target repository code under governance credentials.
- A clean scan or closed issue does not prove safety. Validate evidence and live cloud settings.
- Do not put real secrets in tests, issues, guides, or AI prompts.

The initial release is a reference implementation. Organizations are responsible for assessing it and operating their own credential, data, exception, incident, and production-release processes.
