import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { requireOAuthProviderConfig } from "./config.js";
import type { OAuthProfile, OAuthStatePayload } from "./types.js";

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export function createAppleAuthorizationUrl(input: {
  state: string;
  payload: OAuthStatePayload;
  redirectUri: string;
  config: OAuthEmailCodeLoginConfig;
}) {
  const apple = requireOAuthProviderConfig(input.config, "apple");
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", apple.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.payload.nonce);
  return url;
}

export async function exchangeAppleCode(input: {
  code: string;
  redirectUri: string;
  nonce: string;
  config: OAuthEmailCodeLoginConfig;
}): Promise<OAuthProfile> {
  const apple = requireOAuthProviderConfig(input.config, "apple");
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: apple.clientId,
      client_secret: await createAppleClientSecret(input.config),
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code"
    })
  });
  const token = await parseTokenResponse(response);
  const { payload } = await jwtVerify(token.id_token, appleJwks, {
    audience: apple.clientId,
    issuer: "https://appleid.apple.com"
  });
  if (payload.nonce !== input.nonce) throw new Error("OAuth nonce mismatch.");
  const email = stringClaim(payload.email);
  const sub = stringClaim(payload.sub);
  if (!email || !sub) throw new Error("Apple did not return the required account claims.");
  return {
    provider: "apple",
    providerAccountId: sub,
    email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: stringClaim(payload.name)
  };
}

export async function createAppleClientSecret(config: OAuthEmailCodeLoginConfig) {
  const apple = requireOAuthProviderConfig(config, "apple");
  const privateKey = apple.privateKey.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: apple.keyId })
    .setIssuer(apple.teamId)
    .setSubject(apple.clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(key);
}

async function parseTokenResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as { id_token?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.id_token) {
    throw new Error(payload?.error_description || payload?.error || "Apple OAuth token exchange failed.");
  }
  return { id_token: payload.id_token };
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
