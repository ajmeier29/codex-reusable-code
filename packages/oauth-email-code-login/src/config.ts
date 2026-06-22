import type { OAuthProviderId } from "./types.js";

export interface OAuthEmailCodeLoginConfig {
  appName: string;
  appUrl: string;
  sessionSecret: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  emailCodeTtlMinutes: number;
  emailCodeCooldownSeconds: number;
  emailCodeMaxAttempts: number;
  secureCookies: boolean;
  google?: GoogleOAuthConfig;
  apple?: AppleOAuthConfig;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppleOAuthConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export interface EnvConfigInput {
  AUTH_APP_NAME?: string;
  AUTH_APP_URL?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_COOKIE_NAME?: string;
  AUTH_EMAIL_CODE_TTL_MINUTES?: string;
  AUTH_EMAIL_CODE_COOLDOWN_SECONDS?: string;
  AUTH_EMAIL_CODE_MAX_ATTEMPTS?: string;
  NODE_ENV?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
}

export function createAuthConfigFromEnv(env: EnvConfigInput = process.env): OAuthEmailCodeLoginConfig {
  const appName = requireString(env.AUTH_APP_NAME, "AUTH_APP_NAME");
  const appUrl = normalizeUrl(requireString(env.AUTH_APP_URL, "AUTH_APP_URL"), "AUTH_APP_URL");
  const sessionSecret = requireString(env.AUTH_SESSION_SECRET, "AUTH_SESSION_SECRET");
  if (sessionSecret.length < 32) throw new Error("AUTH_SESSION_SECRET must be at least 32 characters.");

  const config: OAuthEmailCodeLoginConfig = {
    appName,
    appUrl,
    sessionSecret,
    sessionCookieName: env.AUTH_SESSION_COOKIE_NAME?.trim() || "app_session",
    sessionTtlDays: 30,
    emailCodeTtlMinutes: numberFromEnv(env.AUTH_EMAIL_CODE_TTL_MINUTES, 10),
    emailCodeCooldownSeconds: numberFromEnv(env.AUTH_EMAIL_CODE_COOLDOWN_SECONDS, 60),
    emailCodeMaxAttempts: numberFromEnv(env.AUTH_EMAIL_CODE_MAX_ATTEMPTS, 5),
    secureCookies: env.NODE_ENV === "production"
  };

  const googleClientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (googleClientId || googleClientSecret) {
    config.google = {
      clientId: requireString(googleClientId, "GOOGLE_OAUTH_CLIENT_ID"),
      clientSecret: requireString(googleClientSecret, "GOOGLE_OAUTH_CLIENT_SECRET")
    };
  }

  const appleClientId = env.APPLE_CLIENT_ID?.trim();
  const appleTeamId = env.APPLE_TEAM_ID?.trim();
  const appleKeyId = env.APPLE_KEY_ID?.trim();
  const applePrivateKey = env.APPLE_PRIVATE_KEY?.trim();
  if (appleClientId || appleTeamId || appleKeyId || applePrivateKey) {
    config.apple = {
      clientId: requireString(appleClientId, "APPLE_CLIENT_ID"),
      teamId: requireString(appleTeamId, "APPLE_TEAM_ID"),
      keyId: requireString(appleKeyId, "APPLE_KEY_ID"),
      privateKey: requireString(applePrivateKey, "APPLE_PRIVATE_KEY")
    };
  }

  return config;
}

export function requireOAuthProviderConfig(config: OAuthEmailCodeLoginConfig, provider: "google"): GoogleOAuthConfig;
export function requireOAuthProviderConfig(config: OAuthEmailCodeLoginConfig, provider: "apple"): AppleOAuthConfig;
export function requireOAuthProviderConfig(config: OAuthEmailCodeLoginConfig, provider: OAuthProviderId) {
  const providerConfig = config[provider];
  if (!providerConfig) throw new Error(`${provider} OAuth is not configured.`);
  return providerConfig;
}

function requireString(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function normalizeUrl(value: string, name: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function numberFromEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected a positive number, received ${value}.`);
  return parsed;
}
