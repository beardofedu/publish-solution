# Contributing

Keep changes focused and use synthetic examples only. Do not submit customer-specific policies, secrets, regulated data, or confidential architecture.

Use Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm test
npm run check
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7
```

When changing a control, update its YAML and rendered guide section together. When changing intake fields, update the issue form, parser choices, tier rules, tests, and guide. Add unit or mocked integration coverage for behavior changes, especially idempotency, partial failure recovery, authorization, and fail-closed validation.

Do not make live API calls from tests. Do not weaken unknown/missing checks into passes. Pin third-party Actions to reviewed full commit SHAs and retain least-privilege workflow permissions.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
