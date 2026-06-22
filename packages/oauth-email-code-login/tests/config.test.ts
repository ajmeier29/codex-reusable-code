import assert from "node:assert/strict";
import test from "node:test";
import { createAuthConfigFromEnv } from "../src/config.js";

test("requires a long session secret", () => {
  assert.throws(
    () =>
      createAuthConfigFromEnv({
        AUTH_APP_NAME: "Demo",
        AUTH_APP_URL: "https://example.com",
        AUTH_SESSION_SECRET: "short"
      }),
    /AUTH_SESSION_SECRET/
  );
});

test("creates explicit provider config when provider vars are present", () => {
  const config = createAuthConfigFromEnv({
    AUTH_APP_NAME: "Demo",
    AUTH_APP_URL: "https://example.com/path",
    AUTH_SESSION_SECRET: "12345678901234567890123456789012",
    GOOGLE_OAUTH_CLIENT_ID: "client",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret"
  });
  assert.equal(config.appUrl, "https://example.com");
  assert.equal(config.sessionCookieName, "app_session");
  assert.equal(config.google?.clientId, "client");
});
