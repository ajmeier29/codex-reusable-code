import { buildClearSessionCookie, buildSessionCookie, readCookie } from "./session.js";
import type { AuthService } from "./auth-service.js";
import type { OAuthEmailCodeLoginConfig } from "./config.js";
import type { OAuthProviderId } from "./types.js";

export function redirectUriForProvider(appUrl: string, provider: OAuthProviderId) {
  return new URL(`/api/auth/oauth/${provider}/callback`, appUrl).toString();
}

export async function handleEmailCodeStartRequest(input: {
  request: Request;
  auth: AuthService;
}) {
  const body = await input.request.json();
  const result = await input.auth.startEmailCode({
    email: body.email,
    intent: body.intent,
    name: body.name,
    legalAccepted: Boolean(body.acceptedTerms && body.acceptedPrivacy && body.acceptedRiskDisclosure),
    nextPath: body.nextPath
  });
  return Response.json({
    requestId: result.requestId,
    email: result.email,
    expiresAt: result.expiresAt.toISOString(),
    resendAvailableAt: result.resendAvailableAt.toISOString()
  });
}

export async function handleEmailCodeVerifyRequest(input: {
  request: Request;
  auth: AuthService;
  config: OAuthEmailCodeLoginConfig;
}) {
  const body = await input.request.json();
  const result = await input.auth.verifyEmailCode({
    requestId: body.requestId,
    code: body.code
  });
  return jsonWithSessionCookie(
    {
      user: result.user,
      nextPath: result.nextPath
    },
    result.sessionToken,
    result.expiresAt,
    input.config
  );
}

export function handleOAuthStartRequest(input: {
  requestUrl: string;
  auth: AuthService;
  config: OAuthEmailCodeLoginConfig;
  provider: OAuthProviderId;
}) {
  const url = new URL(input.requestUrl);
  const result = input.auth.startOAuth({
    provider: input.provider,
    intent: url.searchParams.get("intent") === "signup" ? "signup" : "login",
    legalAccepted: url.searchParams.get("legalAccepted") === "true",
    nextPath: url.searchParams.get("nextPath"),
    redirectUri: redirectUriForProvider(input.config.appUrl, input.provider)
  });
  return Response.redirect(result.url);
}

export async function handleOAuthCallbackRequest(input: {
  request: Request;
  auth: AuthService;
  config: OAuthEmailCodeLoginConfig;
  provider: OAuthProviderId;
}) {
  const url = new URL(input.request.url);
  let code = url.searchParams.get("code") ?? "";
  let state = url.searchParams.get("state") ?? "";
  if (input.request.method === "POST") {
    const form = await input.request.formData();
    code = String(form.get("code") ?? code);
    state = String(form.get("state") ?? state);
  }
  const result = await input.auth.finishOAuth({
    provider: input.provider,
    code,
    state,
    redirectUri: redirectUriForProvider(input.config.appUrl, input.provider)
  });
  return redirectWithSessionCookie(new URL(result.nextPath, input.config.appUrl), result.sessionToken, result.expiresAt, input.config);
}

export async function getSessionFromRequest(input: {
  request: Request;
  auth: AuthService;
  config: OAuthEmailCodeLoginConfig;
}) {
  const bearer = input.request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const cookieToken = readCookie(input.request.headers.get("cookie"), input.config.sessionCookieName);
  const token = bearer ?? cookieToken;
  return token ? input.auth.resolveSession(token) : null;
}

export async function handleLogoutRequest(input: {
  request: Request;
  auth: AuthService;
  config: OAuthEmailCodeLoginConfig;
}) {
  const cookieToken = readCookie(input.request.headers.get("cookie"), input.config.sessionCookieName);
  if (cookieToken) await input.auth.deleteSession(cookieToken);
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": buildClearSessionCookie(input.config) }
  });
}

function jsonWithSessionCookie(body: unknown, token: string, expiresAt: Date, config: OAuthEmailCodeLoginConfig) {
  return Response.json(body, {
    headers: {
      "Set-Cookie": buildSessionCookie({ config, sessionToken: token, expiresAt })
    }
  });
}

function redirectWithSessionCookie(url: URL, token: string, expiresAt: Date, config: OAuthEmailCodeLoginConfig) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Set-Cookie": buildSessionCookie({ config, sessionToken: token, expiresAt })
    }
  });
}
