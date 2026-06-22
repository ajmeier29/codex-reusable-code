import assert from "node:assert/strict";
import test from "node:test";
import { createAuthConfigFromEnv } from "../src/config.js";
import { createOAuthState, verifyOAuthState } from "../src/oauth-state.js";

const config = createAuthConfigFromEnv({
  AUTH_APP_NAME: "Demo",
  AUTH_APP_URL: "https://example.com",
  AUTH_SESSION_SECRET: "12345678901234567890123456789012"
});

test("oauth state verifies and rejects tampering", () => {
  const { state } = createOAuthState({
    provider: "google",
    intent: "signup",
    nextPath: "/dashboard",
    legalAccepted: true,
    config
  });

  assert.equal(verifyOAuthState({ state, config })?.provider, "google");
  assert.equal(verifyOAuthState({ state: `${state}x`, config }), null);
});
