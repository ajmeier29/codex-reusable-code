import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { generateSessionToken, hashSessionToken } from "./crypto.js";
import type { AuthSession, AuthStore, AuthUser, SessionResult } from "./types.js";

export async function createUserSession(input: {
  user: AuthUser;
  store: AuthStore;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}): Promise<SessionResult> {
  const now = input.now ?? new Date();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken, input.config);
  const expiresAt = new Date(now.getTime() + input.config.sessionTtlDays * 24 * 60 * 60_000);
  await input.store.createSession({
    userId: input.user.id,
    tokenHash: sessionTokenHash,
    expiresAt,
    createdAt: now
  });
  await input.store.markUserLogin(input.user.id, now);
  return { user: input.user, sessionToken, sessionTokenHash, expiresAt };
}

export async function resolveSession(input: {
  sessionToken: string;
  store: AuthStore;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}): Promise<{ session: AuthSession; user: AuthUser } | null> {
  const now = input.now ?? new Date();
  const session = await input.store.findSessionByTokenHash(hashSessionToken(input.sessionToken, input.config));
  if (!session || session.expiresAt <= now) return null;
  const user = await input.store.findUserById(session.userId);
  return user ? { session, user } : null;
}

export async function deleteSession(input: { sessionToken: string; store: AuthStore; config: OAuthEmailCodeLoginConfig }) {
  await input.store.deleteSessionByTokenHash(hashSessionToken(input.sessionToken, input.config));
}

export function buildSessionCookie(input: {
  config: OAuthEmailCodeLoginConfig;
  sessionToken: string;
  expiresAt: Date;
}) {
  const pieces = [
    `${input.config.sessionCookieName}=${encodeURIComponent(input.sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${input.expiresAt.toUTCString()}`
  ];
  if (input.config.secureCookies) pieces.push("Secure");
  return pieces.join("; ");
}

export function buildClearSessionCookie(config: OAuthEmailCodeLoginConfig) {
  return `${config.sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${config.secureCookies ? "; Secure" : ""}`;
}

export function readCookie(header: string | null | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}
