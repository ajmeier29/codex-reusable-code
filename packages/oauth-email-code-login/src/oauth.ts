import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { hashEmail, hashProviderAccountId, normalizeEmail } from "./crypto.js";
import { createUserSession } from "./session.js";
import type { AuthStore, OAuthProfile, OAuthProviderId, OAuthStatePayload, SessionResult } from "./types.js";
import { createAppleAuthorizationUrl, exchangeAppleCode } from "./oauth-apple.js";
import { createGoogleAuthorizationUrl, exchangeGoogleCode } from "./oauth-google.js";
import { createOAuthState, verifyOAuthState } from "./oauth-state.js";

export function createOAuthAuthorization(input: {
  provider: OAuthProviderId;
  intent: "login" | "signup";
  redirectUri: string;
  nextPath?: string | null;
  legalAccepted?: boolean;
  nativeReturnUrl?: string;
  config: OAuthEmailCodeLoginConfig;
}) {
  const state = createOAuthState(input);
  const url =
    input.provider === "google"
      ? createGoogleAuthorizationUrl({ state: state.state, payload: state.payload, redirectUri: input.redirectUri, config: input.config })
      : createAppleAuthorizationUrl({ state: state.state, payload: state.payload, redirectUri: input.redirectUri, config: input.config });
  return { ...state, url };
}

export async function finishOAuthLogin(input: {
  provider: OAuthProviderId;
  code: string;
  state: string;
  redirectUri: string;
  store: AuthStore;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}): Promise<SessionResult & { nextPath: string; profile: OAuthProfile }> {
  const now = input.now ?? new Date();
  const payload = verifyOAuthState({ state: input.state, config: input.config, now });
  if (!payload || payload.provider !== input.provider) throw new Error("Invalid OAuth state.");
  const profile = await exchangeOAuthCode({
    provider: input.provider,
    code: input.code,
    redirectUri: input.redirectUri,
    payload,
    config: input.config
  });

  const providerAccountIdHash = hashProviderAccountId(profile.provider, profile.providerAccountId, input.config);
  const linked = await input.store.findOAuthAccount(profile.provider, providerAccountIdHash);
  let user = linked ? await input.store.findUserById(linked.userId) : null;
  if (!user) user = await input.store.findUserByEmail(profile.email);
  if (!user && payload.intent === "login") throw new Error("No account is linked to this OAuth profile.");
  if (!user && payload.intent === "signup") {
    if (!payload.legalAccepted) throw new Error("Legal acceptance is required to create an account.");
    user = await input.store.createUser({
      email: normalizeEmail(profile.email),
      name: profile.name,
      emailVerifiedAt: profile.emailVerified ? now : null,
      acceptedTermsAt: now,
      acceptedPrivacyAt: now,
      acceptedRiskDisclosureAt: now
    });
  }
  if (!user) throw new Error("OAuth sign-in could not be completed.");

  await input.store.linkOAuthAccount({
    provider: profile.provider,
    providerAccountId: profile.providerAccountId,
    providerAccountIdHash,
    userId: user.id,
    email: profile.email,
    emailHash: hashEmail(profile.email, input.config),
    name: profile.name,
    emailVerifiedAt: profile.emailVerified ? now : null
  });

  return {
    ...(await createUserSession({ user, store: input.store, config: input.config, now })),
    nextPath: payload.nextPath,
    profile
  };
}

async function exchangeOAuthCode(input: {
  provider: OAuthProviderId;
  code: string;
  redirectUri: string;
  payload: OAuthStatePayload;
  config: OAuthEmailCodeLoginConfig;
}) {
  return input.provider === "google"
    ? exchangeGoogleCode({ code: input.code, redirectUri: input.redirectUri, nonce: input.payload.nonce, config: input.config })
    : exchangeAppleCode({ code: input.code, redirectUri: input.redirectUri, nonce: input.payload.nonce, config: input.config });
}
