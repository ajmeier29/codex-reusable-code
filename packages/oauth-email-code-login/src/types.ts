export type EmailLoginIntent = "login" | "signup" | "email_change";
export type OAuthProviderId = "google" | "apple";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  emailVerifiedAt?: Date | null;
  acceptedTermsAt?: Date | null;
  acceptedPrivacyAt?: Date | null;
  acceptedRiskDisclosureAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateUserInput {
  email: string;
  name?: string | null;
  emailVerifiedAt?: Date | null;
  acceptedTermsAt?: Date | null;
  acceptedPrivacyAt?: Date | null;
  acceptedRiskDisclosureAt?: Date | null;
}

export interface StoredEmailCode {
  id: string;
  email: string;
  emailHash: string;
  codeHash: string;
  intent: EmailLoginIntent;
  name?: string | null;
  legalAccepted: boolean;
  nextPath: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt?: Date | null;
  deliveryStatus?: "pending" | "sent" | "failed";
  createdAt: Date;
}

export interface CreateEmailCodeInput {
  id: string;
  email: string;
  emailHash: string;
  codeHash: string;
  intent: EmailLoginIntent;
  name?: string | null;
  legalAccepted: boolean;
  nextPath: string;
  maxAttempts: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface OAuthAccount {
  provider: OAuthProviderId;
  providerAccountId: string;
  userId: string;
}

export interface OAuthProfile {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  markUserLogin(userId: string, when: Date): Promise<void>;

  findActiveEmailCode(input: {
    emailHash: string;
    intent: EmailLoginIntent;
    createdAfter: Date;
  }): Promise<StoredEmailCode | null>;
  createEmailCode(input: CreateEmailCodeInput): Promise<void>;
  markEmailCodeDelivery(input: { id: string; status: "sent" | "failed"; error?: string | null; sentAt?: Date | null }): Promise<void>;
  findEmailCodeById(id: string): Promise<StoredEmailCode | null>;
  incrementEmailCodeAttempts(id: string): Promise<void>;
  consumeEmailCode(id: string, consumedAt: Date): Promise<void>;

  findOAuthAccount(provider: OAuthProviderId, providerAccountIdHash: string): Promise<OAuthAccount | null>;
  linkOAuthAccount(input: {
    provider: OAuthProviderId;
    providerAccountId: string;
    providerAccountIdHash: string;
    userId: string;
    email?: string | null;
    emailHash?: string | null;
    name?: string | null;
    emailVerifiedAt?: Date | null;
  }): Promise<void>;

  createSession(input: { userId: string; tokenHash: string; expiresAt: Date; createdAt: Date }): Promise<AuthSession>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
}

export interface EmailCodeMessage {
  to: string;
  code: string;
  intent: EmailLoginIntent;
  appName: string;
  expiresInMinutes: number;
}

export interface EmailCodeSender {
  sendEmailCode(message: EmailCodeMessage): Promise<void>;
}

export interface SessionResult {
  user: AuthUser;
  sessionToken: string;
  sessionTokenHash: string;
  expiresAt: Date;
}

export interface StartEmailCodeResult {
  requestId: string;
  email: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export interface VerifyEmailCodeResult extends SessionResult {
  nextPath: string;
}

export interface OAuthStatePayload {
  provider: OAuthProviderId;
  intent: "login" | "signup";
  nextPath: string;
  legalAccepted: boolean;
  nonce: string;
  createdAt: number;
  nativeReturnUrl?: string;
}
