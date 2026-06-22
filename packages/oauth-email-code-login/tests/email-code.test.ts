import assert from "node:assert/strict";
import test from "node:test";
import { createAuthConfigFromEnv } from "../src/config.js";
import { startEmailCodeLogin, verifyEmailCodeLogin } from "../src/email-code.js";
import type { EmailCodeMessage } from "../src/types.js";
import { TestAuthStore } from "./test-store.js";

const config = createAuthConfigFromEnv({
  AUTH_APP_NAME: "Demo",
  AUTH_APP_URL: "https://example.com",
  AUTH_SESSION_SECRET: "12345678901234567890123456789012"
});

test("signup email code creates a user and session", async () => {
  const store = new TestAuthStore();
  const sent: EmailCodeMessage[] = [];
  const sender = {
    async sendEmailCode(message: EmailCodeMessage) {
      sent.push(message);
    }
  };

  const started = await startEmailCodeLogin({
    email: "USER@Example.com",
    intent: "signup",
    legalAccepted: true,
    name: "Test User",
    nextPath: "/dashboard",
    store,
    sender,
    config
  });

  assert.equal(started.email, "user@example.com");
  const code = sent[0]?.code;
  assert.ok(code);

  const verified = await verifyEmailCodeLogin({
    requestId: started.requestId,
    code,
    store,
    config
  });

  assert.equal(verified.user.email, "user@example.com");
  assert.equal(verified.nextPath, "/dashboard");
  assert.ok(verified.sessionToken.length > 20);
  assert.equal(store.sessions.size, 1);
});

test("wrong code increments attempts and fails", async () => {
  const store = new TestAuthStore();
  const sender = { async sendEmailCode(_message: EmailCodeMessage) {} };
  const started = await startEmailCodeLogin({
    email: "user@example.com",
    intent: "signup",
    legalAccepted: true,
    store,
    sender,
    config
  });

  await assert.rejects(
    () =>
      verifyEmailCodeLogin({
        requestId: started.requestId,
        code: "000000",
        store,
        config
      }),
    /Invalid or expired/
  );
  assert.equal((await store.findEmailCodeById(started.requestId))?.attemptCount, 1);
});
