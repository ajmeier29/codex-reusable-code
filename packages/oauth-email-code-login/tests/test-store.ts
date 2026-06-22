import { randomUUID } from "node:crypto";
import type {
  AuthSession,
  AuthStore,
  AuthUser,
  CreateEmailCodeInput,
  CreateUserInput,
  OAuthAccount,
  OAuthProviderId,
  StoredEmailCode
} from "../src/types.js";

export class TestAuthStore implements AuthStore {
  users = new Map<string, AuthUser>();
  usersByEmail = new Map<string, string>();
  emailCodes = new Map<string, StoredEmailCode>();
  sessions = new Map<string, AuthSession>();
  oauthAccounts = new Map<string, OAuthAccount>();

  async findUserByEmail(email: string) {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async createUser(input: CreateUserInput) {
    const user: AuthUser = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      emailVerifiedAt: input.emailVerifiedAt,
      acceptedTermsAt: input.acceptedTermsAt,
      acceptedPrivacyAt: input.acceptedPrivacyAt,
      acceptedRiskDisclosureAt: input.acceptedRiskDisclosureAt,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
    return user;
  }

  async markUserLogin(_userId: string, _when: Date) {}

  async findActiveEmailCode(input: { emailHash: string; intent: StoredEmailCode["intent"]; createdAfter: Date }) {
    const rows = Array.from(this.emailCodes.values())
      .filter((row) => row.emailHash === input.emailHash && row.intent === input.intent && !row.consumedAt && row.createdAt > input.createdAfter)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows[0] ?? null;
  }

  async createEmailCode(input: CreateEmailCodeInput) {
    this.emailCodes.set(input.id, {
      ...input,
      attemptCount: 0,
      deliveryStatus: "pending",
      consumedAt: null
    });
  }

  async markEmailCodeDelivery(input: { id: string; status: "sent" | "failed"; error?: string | null; sentAt?: Date | null }) {
    const row = this.emailCodes.get(input.id);
    if (row) row.deliveryStatus = input.status;
  }

  async findEmailCodeById(id: string) {
    return this.emailCodes.get(id) ?? null;
  }

  async incrementEmailCodeAttempts(id: string) {
    const row = this.emailCodes.get(id);
    if (row) row.attemptCount += 1;
  }

  async consumeEmailCode(id: string, consumedAt: Date) {
    const row = this.emailCodes.get(id);
    if (row) row.consumedAt = consumedAt;
  }

  async findOAuthAccount(provider: OAuthProviderId, providerAccountIdHash: string) {
    return this.oauthAccounts.get(`${provider}:${providerAccountIdHash}`) ?? null;
  }

  async linkOAuthAccount(input: {
    provider: OAuthProviderId;
    providerAccountId: string;
    providerAccountIdHash: string;
    userId: string;
  }) {
    this.oauthAccounts.set(`${input.provider}:${input.providerAccountIdHash}`, {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      userId: input.userId
    });
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date; createdAt: Date }) {
    const session = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt
    };
    this.sessions.set(input.tokenHash, session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}
