import {
  createAuthConfigFromEnv,
  createAuthService,
  createResendEmailCodeSender
} from "@codex-reusable/oauth-email-code-login";
import { createPostgresAuthStore } from "./auth-store";

export const authConfig = createAuthConfigFromEnv(process.env);

export const auth = createAuthService({
  config: authConfig,
  store: createPostgresAuthStore(),
  emailSender: createResendEmailCodeSender({
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.AUTH_EMAIL_FROM!
  })
});
