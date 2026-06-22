import type { OAuthEmailCodeLoginConfig } from "./config.js";
import { generateEmailCode, generateId, hashEmail, hashEmailCode, normalizeEmail, normalizeEmailCode, safeEqual, safeNextPath } from "./crypto.js";
import { createUserSession } from "./session.js";
import type { AuthStore, EmailCodeSender, EmailLoginIntent, StartEmailCodeResult, VerifyEmailCodeResult } from "./types.js";

export class EmailCodeCooldownError extends Error {
  retryAfterSeconds: number;
  resendAvailableAt: Date;

  constructor(resendAvailableAt: Date) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resendAvailableAt.getTime() - Date.now()) / 1000));
    super(`Wait ${retryAfterSeconds} seconds before requesting another code.`);
    this.name = "EmailCodeCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.resendAvailableAt = resendAvailableAt;
  }
}

export class EmailCodeVerificationError extends Error {
  constructor(message = "Invalid or expired code.") {
    super(message);
    this.name = "EmailCodeVerificationError";
  }
}

export async function startEmailCodeLogin(input: {
  email: string;
  intent: EmailLoginIntent;
  name?: string | null;
  legalAccepted?: boolean;
  nextPath?: string | null;
  store: AuthStore;
  sender: EmailCodeSender;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}): Promise<StartEmailCodeResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const emailHash = hashEmail(email, input.config);
  const cooldownSince = new Date(now.getTime() - input.config.emailCodeCooldownSeconds * 1000);
  const activeCode = await input.store.findActiveEmailCode({ emailHash, intent: input.intent, createdAfter: cooldownSince });
  if (activeCode) {
    throw new EmailCodeCooldownError(new Date(activeCode.createdAt.getTime() + input.config.emailCodeCooldownSeconds * 1000));
  }

  const requestId = generateId();
  const code = generateEmailCode();
  const expiresAt = new Date(now.getTime() + input.config.emailCodeTtlMinutes * 60_000);
  await input.store.createEmailCode({
    id: requestId,
    email,
    emailHash,
    codeHash: hashEmailCode(requestId, code, input.config),
    intent: input.intent,
    name: input.name?.trim() || null,
    legalAccepted: input.legalAccepted === true,
    nextPath: safeNextPath(input.nextPath),
    maxAttempts: input.config.emailCodeMaxAttempts,
    expiresAt,
    createdAt: now
  });

  try {
    await input.sender.sendEmailCode({
      to: email,
      code,
      intent: input.intent,
      appName: input.config.appName,
      expiresInMinutes: input.config.emailCodeTtlMinutes
    });
    await input.store.markEmailCodeDelivery({ id: requestId, status: "sent", sentAt: now });
  } catch (error) {
    await input.store.markEmailCodeDelivery({ id: requestId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  return {
    requestId,
    email,
    expiresAt,
    resendAvailableAt: new Date(now.getTime() + input.config.emailCodeCooldownSeconds * 1000)
  };
}

export async function verifyEmailCodeLogin(input: {
  requestId: string;
  code: string;
  store: AuthStore;
  config: OAuthEmailCodeLoginConfig;
  now?: Date;
}): Promise<VerifyEmailCodeResult> {
  const now = input.now ?? new Date();
  const record = await input.store.findEmailCodeById(input.requestId);
  if (!record || record.consumedAt || record.expiresAt <= now || record.attemptCount >= record.maxAttempts) {
    throw new EmailCodeVerificationError();
  }

  await input.store.incrementEmailCodeAttempts(record.id);
  const expectedHash = hashEmailCode(record.id, normalizeEmailCode(input.code), input.config);
  if (!safeEqual(record.codeHash, expectedHash)) throw new EmailCodeVerificationError();

  await input.store.consumeEmailCode(record.id, now);
  let user = await input.store.findUserByEmail(record.email);
  if (!user && record.intent === "login") throw new EmailCodeVerificationError();
  if (!user && record.intent === "signup") {
    if (!record.legalAccepted) throw new EmailCodeVerificationError("Legal acceptance is required to create an account.");
    user = await input.store.createUser({
      email: record.email,
      name: record.name,
      emailVerifiedAt: now,
      acceptedTermsAt: now,
      acceptedPrivacyAt: now,
      acceptedRiskDisclosureAt: now
    });
  }
  if (!user) throw new EmailCodeVerificationError();

  return {
    ...(await createUserSession({ user, store: input.store, config: input.config, now })),
    nextPath: record.nextPath
  };
}
