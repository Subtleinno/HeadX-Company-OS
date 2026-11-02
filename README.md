# company-os

> **This repository is a test bed for the Super Agent.**
> It is used only to exercise, measure and debug the DeepSeek Harness (DSH)
> Super-agent prototype end to end (issue -> work item -> pull request -> human approval).
>
> It is **not** a company codebase and it holds **no company, brand, customer,
> financial or strategy information**. The real company work lives elsewhere, in
> private repositories and private infrastructure.

## Purpose

Provide a disposable, harmless sandbox where the agent can be safely tested:

- does it open a pull request instead of pushing to main?
- are forbidden actions (direct push, reading secrets, writing outside the workspace) blocked and logged?
- does a headless run auto-reject anything that needs approval?
- is the kill switch effective?

## Ground rules

1. **Test data only.** Never commit real company, brand, customer, supplier,
   financial, payroll or strategy content, nor any API key, token or password.
2. **No secrets in history.** Treat every commit as if it could be published.
   The repository is private today, but never rely on that.
3. **main is protected.** Changes arrive through pull requests reviewed by a
   human. No direct pushes, no force pushes, no branch deletion.
4. **Every PR states its risk level and rollback plan**, because an agent wrote it.

## Structure

| Path | Purpose |
|---|---|
| docs/ | Local-only project documents. Not committed; see .gitignore. |
| .gitignore | Keeps local documents, secrets and build output out of git. |

## Status

P0 - environment and guardrails are being set up. Nothing here is production code.