# Codex Reusable Code

Reusable implementation packages extracted from production application work so future projects do not need the same systems re-engineered from scratch.

## Packages

- [OAuth + Email Code Login](./packages/oauth-email-code-login/README.md): reusable email-code login, Google OAuth, Apple OAuth, session cookies, database contract, Next.js route examples, and AI implementation prompt.

## Standards

- Packages should be framework-aware at the edge and framework-agnostic in the core.
- No silent production fallbacks. Missing required credentials, secrets, database adapters, or email senders should throw clear errors.
- Every package must include a README, environment variable list, database/schema contract when needed, and tests for its core logic.
