# Gate 5: Guide publication and citizen-developer Copilot policies

[Index](README.md) | Previous: [Azure](04-azure.md) | Next: [Operations](06-operations.md)

**Accountable:** platform owner for Pages; AI governance owner for Copilot. **Sign-off:** information security and AI governance.

## 1. Publish the guide to the intended audience

- [ ] Review [docs/](../docs/) for internal URLs, support contacts, policy language and accidental sensitive data. The repository guide is the source; this administrator runbook does not replace it.
- [ ] On GHEC, ask the org owner to permit **privately published** Pages sites under **Settings > Member privileges > Pages creation**. An organization-owned private/internal **project** repository can publish a private project site; this is not the organization homepage site model.
- [ ] Configure **repository Settings > Pages** to match the adopted [Pages workflow](../.github/workflows/pages.yml), normally GitHub Actions as the publishing source. Explicitly select private visibility before exposing internal content.
- [ ] Check the workflow's exact environment name (commonly `github-pages`), deployment branch policy and permissions (`pages: write`, `id-token: write`, and read/build permissions as required). Approve its exact build/artifact/deploy actions.
- [ ] Record the URL shown by Pages after deployment. Do not construct a private-site URL from the repo name; private sites use a separate domain and the generator's base path may need adjustment.
- [ ] Test an authorized reader, a signed-in user without repo read access and an unauthenticated/private-browser session. Capture the observed denied/allowed behavior.
- [ ] If your enterprise cannot provide the required authenticated guide audience, keep Pages disabled and use an approved authenticated documentation host. Record its URL, owner and publication process.

**A private/internal repository does not by itself guarantee a private website.** On GHEC without Enterprise Managed Users (EMU), sites can be public or private depending on policy/configuration. Private project sites are restricted to readers of the source repo. EMU sites are private and restricted to enterprise members; verify the intended audience against the current EMU limits. Data-residency enterprises use EMU and must also verify the local domain and feature behavior.

**Optional bootstrap is not private-site automation.** With approved hub-only credentials, preview `npm run bootstrap -- --repo contoso/publish-solution --pages`. Creation requires explicit `--pages --apply --acknowledge-public-pages`, a public GitHub.com repository, verified hub admin access, enabled Actions, no existing site, and an active default-branch Pages workflow with **only `workflow_dispatch`** (remove the stock push trigger through review). Review applicable organization/plan policy, content and environment first. The script never dispatches deployment, changes an existing site's source/access/publication settings, or publishes private/internal content. It refuses private/internal/ambiguous prerequisites; use the manual checklist above or an approved authenticated host. Creation is not audience verification. Permissions, reruns and failure recovery are in [SETUP.md](../SETUP.md#optional-preview-first-bootstrap); no live bootstrap pilot is claimed.

Sources: [Pages visibility and access control](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site); [Organization Pages policy](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/managing-the-publication-of-github-pages-sites-for-your-organization); [Data-residency feature differences](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/feature-overview-for-github-enterprise-cloud-with-data-residency).

### GHES is a separate hosting/access decision

- [ ] Have the appliance administrator verify Pages availability, DNS/TLS and subdomain isolation for the installed version.
- [ ] Keep **Public Pages** disabled for an internal guide. The GHES 3.22 documentation warns that enabling it makes every Pages site on the instance publicly accessible.
- [ ] Verify private-mode authentication and the actual audience. Do not claim GHES instance-level Pages settings provide Cloud's per-project, repository-reader private-site access model.
- [ ] Confirm the adopted publishing action is supported by your GHES version. If not, use a supported publishing mechanism or authenticated documentation host and record the deviation; do not assume Cloud Pages Actions work unchanged.
- [ ] Test access with an authenticated instance user who cannot read the repo as well as an unauthenticated user, and obtain explicit acceptance of that audience.

Sources: [GHES 3.22 Pages administration](https://docs.github.com/en/enterprise-server@3.22/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise); [GHES subdomain isolation](https://docs.github.com/en/enterprise-server@3.22/admin/configuring-settings/hardening-security-for-your-enterprise/enabling-subdomain-isolation).

## 2. Approve Copilot use before onboarding

Copilot is not required to run the publication workflows. The approval process must also work for code written without AI. A Copilot seat does not confer publication or production approval.

- [ ] Assign approved Copilot seats to the pilot group and record the entitlement owner/budget. Apply enterprise policy first and then permitted organization-level choices.
- [ ] Review the enterprise **AI controls** and applicable organization settings: allowed features/clients, models, agent capabilities, public-code matching, MCP/external tools, privacy and usage/cost controls. Approve each surface the program will use; one enabled client does not imply all are permitted.
- [ ] Document allowed data classifications in prompts, prohibited secrets/personal/customer data, approved repositories/tools and required human review. Train developers to treat generated code and tool output as untrusted.
- [ ] Verify the scope and limits of content exclusion and other controls for each selected client/model/agent against current documentation. Do not promise one policy prevents all data leaving every tool or third-party host.
- [ ] Do not give agents the intake App PEM, unrestricted PAT, cloud Owner access or production bypass rights. Any MCP integration needs its own access and data-governance review.
- [ ] For GHES, validate the enterprise's supported Copilot identity/network arrangement and client availability separately; installing this toolkit on an appliance does not install a locally hosted Copilot service.
- [ ] Publish acceptable-use, licensing/IP review, security-review and escalation guidance in the internal guide. Test approved and denied features with a pilot user.

Source: [Managing enterprise Copilot policies and features](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-enterprise-policies).

**Gate exit:** guidance is reachable only by its approved audience, and citizen developers have a signed, tested AI-use policy.
