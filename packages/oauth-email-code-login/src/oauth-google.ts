import { createRemoteJWKSet, jwtVerify } from "jose";
import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { requireOAuthProviderConfig } from "./config.js";
import type { OAuthProfile, OAuthStatePayload } from "./types.js";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function createGoogleAuthorizationUrl(input: {
  state: string;
  payload: OAuthStatePayload;
  redirectUri: string;
  config: OAuthEmailCodeLoginConfig;
}) {
  const google = requireOAuthProviderConfig(input.config, "google");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", google.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.payload.nonce);
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
  nonce: string;
  config: OAuthEmailCodeLoginConfig;
}): Promise<OAuthProfile> {
  const google = requireOAuthProviderConfig(input.config, "google");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code"
    })
  });
  const token = await parseTokenResponse(response);
  const { payload } = await jwtVerify(token.id_token, googleJwks, {
    audience: google.clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"]
  });
  if (payload.nonce !== input.nonce) throw new Error("OAuth nonce mismatch.");
  const email = stringClaim(payload.email);
  const sub = stringClaim(payload.sub);
  if (!email || !sub) throw new Error("Google did not return the required account claims.");
  return {
    provider: "google",
    providerAccountId: sub,
    email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: stringClaim(payload.name)
  };
}

async function parseTokenResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as { id_token?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.id_token) {
    throw new Error(payload?.error_description || payload?.error || "Google OAuth token exchange failed.");
  }
  return { id_token: payload.id_token };
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
