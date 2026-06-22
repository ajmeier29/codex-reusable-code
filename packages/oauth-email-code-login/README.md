# OAuth + Email Code Login

Reusable authentication package extracted from the FilingShock login system. It covers:

- Email code login and signup.
- Google OAuth 2.0 login/signup.
- Apple OAuth login/signup with Apple client-secret JWT support.
- Session-token creation, hashing, cookie helpers, bearer-session lookup, and logout.
- Resend email-code delivery.
- Storage interfaces so each app can use its own database adapter.
- Next.js App Router route helpers and example routes.

The core package is not tied to FilingShock. App-specific concerns such as plans, profile pages, local admin settings, and billing are intentionally outside this package.

## Folder

```text
packages/oauth-email-code-login/
  src/                         reusable TypeScript auth core
  examples/nextjs/             route examples for Next.js App Router
  migrations/0001_auth.sql     Postgres table contract
  .env.example                 required environment variables
  tests/                       package tests
```

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `AUTH_APP_NAME` | Product name shown in email-code messages. |
| `AUTH_APP_URL` | Public app origin, for example `https://app.example.com`. |
| `AUTH_SESSION_SECRET` | At least 32 random characters. Used to hash sessions, email codes, email lookup values, and OAuth state. |
| `AUTH_SESSION_COOKIE_NAME` | Optional. Defaults to `app_session`. |
| `AUTH_EMAIL_FROM` | Sender address for Resend email-code messages. |
| `RESEND_API_KEY` | Resend API key. Required when using `createResendEmailCodeSender`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth web client id. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth web client secret. |
| `APPLE_CLIENT_ID` | Apple Services ID / web client id. |
| `APPLE_TEAM_ID` | Apple developer team id. |
| `APPLE_KEY_ID` | Apple Sign in with Apple key id. |
| `APPLE_PRIVATE_KEY` | Apple private key, with newlines escaped as `\n` when stored in env. |

No production fallback sender or fallback database is included. If a required secret or adapter is missing, the implementation should fail loudly.

## Database Contract

Run `migrations/0001_auth.sql`, or translate it into the host app's migration system.

The package expects an `AuthStore` implementation. That adapter owns the actual database calls for:

- users
- email-code requests
- OAuth account links
- sessions

Use `email_hash`, `provider_account_id_hash`, and `token_hash` for lookups. The package calculates those hashes with `AUTH_SESSION_SECRET`; do not store raw session tokens or email login codes.

## Basic Integration

```ts
import {
  createAuthConfigFromEnv,
  createAuthService,
  createResendEmailCodeSender
} from "@codex-reusable/oauth-email-code-login";
import { createPostgresAuthStore } from "./auth-store";

const config = createAuthConfigFromEnv(process.env);

export const auth = createAuthService({
  config,
  store: createPostgresAuthStore(),
  emailSender: createResendEmailCodeSender({
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.AUTH_EMAIL_FROM!
  })
});
```

## Next.js Routes

The `src/next.ts` helpers are thin wrappers. They do not hide storage or env setup. See `examples/nextjs/app/api/auth/*`.

Minimum routes:

- `POST /api/auth/email/start`
- `POST /api/auth/email/verify`
- `GET /api/auth/oauth/google/start`
- `GET /api/auth/oauth/google/callback`
- `GET /api/auth/oauth/apple/start`
- `POST /api/auth/oauth/apple/callback`
- `POST /api/auth/logout`

OAuth callback URLs to configure:

```text
https://YOUR_DOMAIN/api/auth/oauth/google/callback
https://YOUR_DOMAIN/api/auth/oauth/apple/callback
```

## Email-Code Flow

1. User submits email, intent, legal acceptance for signup, and optional name.
2. `startEmailCode` checks cooldown, creates a six-digit code, stores only the hash, and sends via the injected sender.
3. User submits the code.
4. `verifyEmailCode` validates expiry, max attempts, and hash.
5. For signup, the user is created only after legal acceptance is present.
6. A session token is generated, only the token hash is stored, and the raw token is set in an HttpOnly cookie.

## OAuth Flow

1. `startOAuth` signs state with `AUTH_SESSION_SECRET`.
2. User is redirected to Google or Apple.
3. Callback verifies signed state and nonce.
4. Token exchange verifies the provider ID token through provider JWKS.
5. Existing OAuth account is used, or an email match is linked.
6. Signup creates a user only when legal acceptance was present.
7. Session token is generated and stored as a hash.

## AI Implementation Prompt

Use this prompt when asking an AI agent to install this login package into a new app:

```text
Implement the reusable OAuth + email-code login system from packages/oauth-email-code-login.

Requirements:
- Do not create fallback auth, mock production auth, or silent dev-only login paths.
- Add the auth database tables from migrations/0001_auth.sql or translate them to this app's migration framework.
- Implement an AuthStore adapter for this app's database. Store session tokens and email codes only as hashes.
- Configure createAuthConfigFromEnv with AUTH_APP_NAME, AUTH_APP_URL, AUTH_SESSION_SECRET, OAuth variables, RESEND_API_KEY, and AUTH_EMAIL_FROM.
- Wire createResendEmailCodeSender for email code delivery.
- Add Next.js App Router routes for email start, email verify, Google OAuth start/callback, Apple OAuth start/callback, and logout.
- Add the login/signup UI using the host app's design system. Email signup must require legal acceptance before sending a signup code.
- Protect private app routes by resolving the session cookie or bearer token through the auth service.
- Configure Google and Apple redirect URLs exactly as:
  https://YOUR_DOMAIN/api/auth/oauth/google/callback
  https://YOUR_DOMAIN/api/auth/oauth/apple/callback
- Run typecheck and auth tests. Do not ship if any required env var, provider credential, database adapter, or email sender is missing.
```

## Testing This Package

```bash
pnpm install
pnpm --filter @codex-reusable/oauth-email-code-login typecheck
pnpm --filter @codex-reusable/oauth-email-code-login test
```
