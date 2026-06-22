import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { generateSessionToken, hashSecret, safeEqual, safeNextPath } from "./crypto.js";
import type { OAuthProviderId, OAuthStatePayload } from "./types.js";

export function createOAuthState(input: {
  provider: OAuthProviderId;
  intent: "login" | "signup";
  nextPath?: string | null;
  legalAccepted?: boolean;
  nativeReturnUrl?: string;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}) {
  const payload: OAuthStatePayload = {
    provider: input.provider,
    intent: input.intent,
    nextPath: safeNextPath(input.nextPath),
    legalAccepted: input.legalAccepted === true,
    nativeReturnUrl: input.nativeReturnUrl,
    nonce: generateSessionToken(),
    createdAt: (input.now ?? new Date()).getTime()
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    payload,
    state: `${body}.${signStateBody(body, input.config)}`
  };
}

export function verifyOAuthState(input: { state: string | null | undefined; config: OAuthEmailCodeLoginConfig; now?: Date }) {
  if (!input.state) return null;
  const [body, signature] = input.state.split(".");
  if (!body || !signature || !safeEqual(signature, signStateBody(body, input.config))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (payload.provider !== "google" && payload.provider !== "apple") return null;
    if (payload.intent !== "login" && payload.intent !== "signup") return null;
    if ((input.now ?? new Date()).getTime() - payload.createdAt > 10 * 60_000) return null;
    payload.nextPath = safeNextPath(payload.nextPath);
    return payload;
  } catch {
    return null;
  }
}

function signStateBody(body: string, config: OAuthEmailCodeLoginConfig) {
  return hashSecret(body, config, "oauth-state");
}
