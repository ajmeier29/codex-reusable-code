import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { deleteSession, resolveSession } from "./session.js";
import { finishOAuthLogin, createOAuthAuthorization } from "./oauth.js";
import { startEmailCodeLogin, verifyEmailCodeLogin } from "./email-code.js";
import type { AuthStore, EmailCodeSender, OAuthProviderId } from "./types.js";

export interface CreateAuthServiceInput {
  config: OAuthEmailCodeLoginConfig;
  store: AuthStore;
  emailSender: EmailCodeSender;
}

export function createAuthService(input: CreateAuthServiceInput) {
  return {
    startEmailCode(params: {
      email: string;
      intent: "login" | "signup" | "email_change";
      name?: string | null;
      legalAccepted?: boolean;
      nextPath?: string | null;
    }) {
      return startEmailCodeLogin({
        ...params,
        store: input.store,
        sender: input.emailSender,
        config: input.config
      });
    },

    verifyEmailCode(params: { requestId: string; code: string }) {
      return verifyEmailCodeLogin({
        ...params,
        store: input.store,
        config: input.config
      });
    },

    startOAuth(params: {
      provider: OAuthProviderId;
      intent: "login" | "signup";
      redirectUri: string;
      nextPath?: string | null;
      legalAccepted?: boolean;
      nativeReturnUrl?: string;
    }) {
      return createOAuthAuthorization({
        ...params,
        config: input.config
      });
    },

    finishOAuth(params: {
      provider: OAuthProviderId;
      code: string;
      state: string;
      redirectUri: string;
    }) {
      return finishOAuthLogin({
        ...params,
        store: input.store,
        config: input.config
      });
    },

    resolveSession(sessionToken: string) {
      return resolveSession({
        sessionToken,
        store: input.store,
        config: input.config
      });
    },

    deleteSession(sessionToken: string) {
      return deleteSession({
        sessionToken,
        store: input.store,
        config: input.config
      });
    }
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
