import type { AuthStore } from "@codex-reusable/oauth-email-code-login";

export function createPostgresAuthStore(): AuthStore {
  throw new Error(
    "Implement this adapter with your database client. Map the methods to the tables in migrations/0001_auth.sql."
  );
}
