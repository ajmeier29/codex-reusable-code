import type Stripe from "stripe";

export type BillingPlanDefinition = {
  id: string;
  label: string;
  priceId: string;
  rank: number;
};

export type StripeBillingConfig = {
  appUrl: string;
  stripeSecretKey: string;
  stripePublishableKey?: string;
  stripeWebhookSecret: string;
  brandName: string;
  freePlanId: string;
  paidPlans: BillingPlanDefinition[];
  checkoutEnabled: boolean;
  customerPortalEnabled: boolean;
  allowPromotionCodes: boolean;
  defaultSuccessPath: string;
  defaultCancelPath: string;
  dashboardPath: string;
  billingPath: string;
  supportEmail?: string;
};

export type StripeBillingConfigFromEnvPlan = {
  id: string;
  label: string;
  envPriceKey: string;
  rank: number;
};

export type StripeBillingConfigFromEnvOptions = {
  brandName: string;
  freePlanId: string;
  paidPlans: StripeBillingConfigFromEnvPlan[];
  supportEmail?: string;
  defaultSuccessPath?: string;
  defaultCancelPath?: string;
  dashboardPath?: string;
  billingPath?: string;
  checkoutEnabledDefault?: boolean;
  customerPortalEnabledDefault?: boolean;
  allowPromotionCodesDefault?: boolean;
};

export type BillingUser = {
  id: string;
  email: string;
  name?: string | null;
  plan?: string | null;
};

export type BillingSettingsRow = {
  checkoutEnabled: boolean;
  customerPortalEnabled: boolean;
  allowPromotionCodes?: boolean | null;
  successPath?: string | null;
  cancelPath?: string | null;
  billingPath?: string | null;
  priceOverrides?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
};

export type EffectiveBillingSettings = {
  checkoutEnabled: boolean;
  customerPortalEnabled: boolean;
  allowPromotionCodes: boolean;
  successPath: string;
  cancelPath: string;
  billingPath: string;
  priceByPlan: Record<string, string>;
};

export type SubscriptionRecord = {
  id: string;
  userId: string;
  platform: "stripe" | string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  plan: string;
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date | null;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpsertSubscriptionInput = Omit<SubscriptionRecord, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type BillingRecipient = {
  email: string;
  name?: string | null;
};

export type BillingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type BillingEmailResult = {
  sentAt: Date;
  providerMessageId?: string;
};

export type BillingEmailSender = {
  send(input: BillingEmail): Promise<BillingEmailResult>;
};

export type StripeFailureTicketInput = {
  fingerprint: string;
  eventId?: string | null;
  eventType: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  amountDueCents?: number | null;
  currency?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type StripeFailureTicketView = StripeFailureTicketInput & {
  id: string;
  status: string;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type StripeBillingStore = {
  getBillingSettings(): Promise<BillingSettingsRow | null>;
  upsertBillingSettings(input: BillingSettingsRow): Promise<BillingSettingsRow>;

  getLatestStripeCustomerIdForUser(userId: string): Promise<string | null>;
  getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null>;
  getSubscriptionByUserAndCustomer(userId: string, stripeCustomerId: string): Promise<SubscriptionRecord | null>;
  listStripeSubscriptionsForUser(userId: string, limit: number): Promise<SubscriptionRecord[]>;
  upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRecord>;
  patchSubscriptionMetadata(stripeSubscriptionId: string, patch: Record<string, unknown>): Promise<SubscriptionRecord>;

  findUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null>;
  findSubscriptionForSchedule(input: {
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  }): Promise<SubscriptionRecord | null>;
  updateUserPlan(userId: string, plan: string): Promise<void>;
  getBillingRecipient(userId: string): Promise<BillingRecipient | null>;

  upsertFailureTicket(input: StripeFailureTicketInput): Promise<StripeFailureTicketView>;
  listFailureTickets(limit: number): Promise<StripeFailureTicketView[]>;
  countOpenFailureTickets(): Promise<number>;
};

export type CheckoutSessionResult = {
  sessionId: string;
  url: string;
};

export type EmbeddedCheckoutSessionResult = {
  sessionId: string;
  clientSecret: string;
  publishableKey: string;
};

export type BillingPortalResult = {
  url: string;
};

export type StripeBillingServiceOptions = {
  config: StripeBillingConfig;
  store: StripeBillingStore;
  emailSender: BillingEmailSender;
  stripeClient?: Stripe;
};

export type StripeWebhookResult = {
  received: true;
  eventId: string;
  eventType: string;
};

export class StripeBillingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "StripeBillingError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "stripe_billing_error";
  }
}
