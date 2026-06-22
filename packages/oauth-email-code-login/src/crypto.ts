import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { OAuthEmailCodeLoginConfig } from "./config.js";

export function generateEmailCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeEmailCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 6);
}

export function generateId() {
  return randomUUID();
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(value: string, config: OAuthEmailCodeLoginConfig, namespace: string) {
  return createHmac("sha256", `${config.sessionSecret}:${namespace}`).update(value).digest("base64url");
}

export function hashEmail(email: string, config: OAuthEmailCodeLoginConfig) {
  return hashSecret(normalizeEmail(email), config, "email");
}

export function hashEmailCode(requestId: string, code: string, config: OAuthEmailCodeLoginConfig) {
  return hashSecret(`${requestId}:${normalizeEmailCode(code)}`, config, "email-code");
}

export function hashSessionToken(token: string, config: OAuthEmailCodeLoginConfig) {
  return hashSecret(token, config, "session");
}

export function hashProviderAccountId(provider: string, providerAccountId: string, config: OAuthEmailCodeLoginConfig) {
  return hashSecret(`${provider}:${providerAccountId}`, config, "oauth-account");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeNextPath(value: string | undefined | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
