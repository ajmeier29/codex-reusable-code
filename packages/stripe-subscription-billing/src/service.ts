import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  appUrl,
  createStripeBillingConfig,
  mergeBillingSettings,
  resolvePriceForPlan,
  validatePath,
} from "./config.js";
import {
  billingConfirmationEmail,
  membershipAccessEndedEmail,
  membershipCancellationEmail,
  membershipReactivatedEmail,
} from "./email-templates.js";
import {
  type BillingPortalResult,
  type BillingUser,
  type CheckoutSessionResult,
  type EmbeddedCheckoutSessionResult,
  type EffectiveBillingSettings,
  type StripeBillingConfig,
  StripeBillingError,
  type StripeBillingServiceOptions,
  type StripeFailureTicketInput,
  type StripeFailureTicketView,
  type StripeWebhookResult,
  type SubscriptionRecord,
  type UpsertSubscriptionInput,
} from "./types.js";

type ExpandableStripeId = string | { id: string } | null | undefined;
type StripeSubscriptionLike = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

export class StripeBillingService {
  readonly config: StripeBillingConfig;
  private readonly stripe: Stripe;
  private readonly store: StripeBillingServiceOptions["store"];
  private readonly emailSender: StripeBillingServiceOptions["emailSender"];

  constructor(options: StripeBillingServiceOptions) {
    if (!options.store) {
      throw new StripeBillingError("StripeBillingStore is required.", { code: "missing_store" });
    }
    if (!options.emailSender) {
      throw new StripeBillingError("BillingEmailSender is required.", { code: "missing_email_sender" });
    }
    this.config = createStripeBillingConfig(options.config);
    this.store = options.store;
    this.emailSender = options.emailSender;
    this.stripe = options.stripeClient ?? new Stripe(this.config.stripeSecretKey);
  }

  async getBillingSettings(): Promise<EffectiveBillingSettings> {
    return mergeBillingSettings(this.config, await this.store.getBillingSettings());
  }

  async updateBillingSettings(input: Parameters<typeof this.store.upsertBillingSettings>[0]) {
    return this.store.upsertBillingSettings(input);
  }

  async createCheckoutSession(user: BillingUser, planId: string): Promise<CheckoutSessionResult> {
    const settings = await this.getBillingSettings();
    assertCheckoutEnabled(settings);
    const priceId = resolvePriceForPlan(settings, planId);
    const stripeCustomerId = await this.ensureStripeCustomer(user);

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: settings.allowPromotionCodes,
      success_url: `${appUrl(this.config, settings.successPath)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: appUrl(this.config, settings.cancelPath),
      metadata: { userId: user.id, plan: planId },
      subscription_data: { metadata: { userId: user.id, plan: planId } },
    });

    if (!session.url) {
      throw new StripeBillingError("Stripe did not return a checkout URL.", { code: "missing_checkout_url" });
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  async createEmbeddedCheckoutSession(
    user: BillingUser,
    planId: string,
    options: { nextPath?: string } = {},
  ): Promise<EmbeddedCheckoutSessionResult> {
    const settings = await this.getBillingSettings();
    assertCheckoutEnabled(settings);
    const publishableKey = this.config.stripePublishableKey?.trim();
    if (!publishableKey) {
      throw new StripeBillingError("STRIPE_PUBLISHABLE_KEY is required for embedded checkout.", {
        code: "missing_publishable_key",
      });
    }

    const nextPath = options.nextPath ?? settings.successPath;
    validatePath(nextPath, "nextPath");
    const priceId = resolvePriceForPlan(settings, planId);
    const stripeCustomerId = await this.ensureStripeCustomer(user);

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      ui_mode: "embedded",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: settings.allowPromotionCodes,
      return_url: `${appUrl(this.config, nextPath)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      metadata: { userId: user.id, plan: planId },
      subscription_data: { metadata: { userId: user.id, plan: planId } },
    });

    if (!session.client_secret) {
      throw new StripeBillingError("Stripe did not return an embedded checkout client secret.", {
        code: "missing_client_secret",
      });
    }

    return {
      sessionId: session.id,
      clientSecret: session.client_secret,
      publishableKey,
    };
  }

  async createPortalSession(
    user: BillingUser,
    options: {
      returnPath?: string;
      flow?: "subscription_cancel";
    } = {},
  ): Promise<BillingPortalResult> {
    const settings = await this.getBillingSettings();
    if (!settings.customerPortalEnabled) {
      throw new StripeBillingError("Stripe customer portal is not enabled.", { code: "portal_disabled" });
    }

    const returnPath = options.returnPath ?? settings.billingPath;
    validatePath(returnPath, "returnPath");
    const stripeCustomerId = await this.ensureStripeCustomer(user);
    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: stripeCustomerId,
      return_url: appUrl(this.config, returnPath),
    };

    if (options.flow === "subscription_cancel") {
      const subscription = await this.getLatestSubscriptionForUser(user.id);
      if (!subscription?.stripeSubscriptionId) {
        throw new StripeBillingError("No active Stripe subscription was found for this account.", {
          code: "missing_subscription",
        });
      }
      params.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: subscription.stripeSubscriptionId,
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: appUrl(this.config, returnPath) },
        },
      };
    }

    const session = await this.stripe.billingPortal.sessions.create(params);
    return { url: session.url };
  }

  async reactivateSubscription(user: BillingUser): Promise<SubscriptionRecord> {
    const latest = await this.getLatestSubscriptionForUser(user.id);
    if (!latest?.stripeSubscriptionId) {
      throw new StripeBillingError("No Stripe subscription was found for this account.", {
        code: "missing_subscription",
      });
    }

    const current = await this.stripe.subscriptions.retrieve(latest.stripeSubscriptionId, {
      expand: ["items.data.price.product"],
    });
    if (!hasScheduledCancellation(current)) {
      throw new StripeBillingError("This subscription is not scheduled for cancellation.", {
        code: "subscription_not_canceling",
      });
    }

    const updated = await this.stripe.subscriptions.update(latest.stripeSubscriptionId, {
      cancel_at_period_end: false,
      expand: ["items.data.price.product"],
    });
    const synced = await this.syncSubscription(updated);
    await this.sendReactivationEmailOnce(synced);
    return synced;
  }

  async retrieveCheckoutSession(user: BillingUser, sessionId: string): Promise<Stripe.Checkout.Session> {
    if (!sessionId.trim()) {
      throw new StripeBillingError("sessionId is required.", { code: "missing_session_id" });
    }
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price.product"],
    });
    const metadataUserId = stringOrNull(session.metadata?.userId);
    if (metadataUserId && metadataUserId !== user.id) {
      throw new StripeBillingError("Checkout session does not belong to the current account.", {
        status: 403,
        code: "checkout_account_mismatch",
      });
    }
    if (session.subscription && typeof session.subscription !== "string") {
      await this.syncSubscription(session.subscription);
    }
    return session;
  }

  async syncLatestStripeSubscriptionForUser(userId: string): Promise<SubscriptionRecord | null> {
    const stripeCustomerId = await this.store.getLatestStripeCustomerIdForUser(userId);
    if (!stripeCustomerId) {
      return null;
    }

    const subscriptions = await this.stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price.product"],
    });
    const newest = subscriptions.data.sort((left, right) => right.created - left.created)[0];
    return newest ? this.syncSubscription(newest) : null;
  }

  async handleWebhook(payload: string | Buffer, signature: string): Promise<StripeWebhookResult> {
    if (!signature.trim()) {
      throw new StripeBillingError("Stripe signature header is required.", { status: 400, code: "missing_signature" });
    }

    const event = this.stripe.webhooks.constructEvent(payload, signature, this.config.stripeWebhookSecret);
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "subscription_schedule.created":
      case "subscription_schedule.updated":
      case "subscription_schedule.released":
        await this.syncSubscriptionSchedule(event.data.object as Stripe.SubscriptionSchedule);
        break;
      case "subscription_schedule.canceled":
        await this.clearSubscriptionSchedule(event.data.object as Stripe.SubscriptionSchedule);
        break;
      case "checkout.session.async_payment_failed":
      case "invoice.payment_failed":
      case "payment_intent.payment_failed":
      case "charge.failed":
        await this.recordFailureFromEvent(event);
        break;
      default:
        break;
    }

    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
    };
  }

  async syncSubscription(subscription: Stripe.Subscription): Promise<SubscriptionRecord> {
    const userId = await this.resolveUserIdForSubscription(subscription);
    const customerId = stripeId(subscription.customer);
    if (!customerId) {
      throw new StripeBillingError("Stripe subscription is missing a customer id.", {
        code: "missing_customer_id",
      });
    }

    const price = subscription.items.data[0]?.price;
    const priceId = price?.id ?? null;
    const productId = stripeId(price?.product);
    const plan = await this.planIdForPrice(priceId);
    const input: UpsertSubscriptionInput = {
      userId,
      platform: "stripe",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: productId,
      plan,
      status: subscription.status,
      currentPeriodStart: dateFromSeconds((subscription as StripeSubscriptionLike).current_period_start),
      currentPeriodEnd: dateFromSeconds((subscription as StripeSubscriptionLike).current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
      trialEnd: dateFromSeconds(subscription.trial_end),
      metadata: {
        ...metadataRecord(subscription.metadata),
        latestStripeStatus: subscription.status,
      },
    };

    const saved = await this.store.upsertSubscription(input);
    await this.store.updateUserPlan(userId, isPaidSubscriptionStatus(saved.status) ? saved.plan : this.config.freePlanId);
    await this.sendBillingLifecycleEmails(saved);
    return saved;
  }

  async syncSubscriptionSchedule(schedule: Stripe.SubscriptionSchedule): Promise<SubscriptionRecord | null> {
    const subscriptionId = stripeId(schedule.subscription);
    const customerId = stripeId(schedule.customer);
    const record = await this.store.findSubscriptionForSchedule({
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
    });
    if (!record?.stripeSubscriptionId) {
      return null;
    }

    return this.store.patchSubscriptionMetadata(record.stripeSubscriptionId, {
      stripeScheduleId: schedule.id,
      stripeScheduleStatus: schedule.status,
      stripeScheduleCanceledAt: dateIso(schedule.canceled_at),
      stripeScheduleReleasedAt: dateIso(schedule.released_at),
    });
  }

  async clearSubscriptionSchedule(schedule: Stripe.SubscriptionSchedule): Promise<SubscriptionRecord | null> {
    const subscriptionId = stripeId(schedule.subscription);
    const customerId = stripeId(schedule.customer);
    const record = await this.store.findSubscriptionForSchedule({
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
    });
    if (!record?.stripeSubscriptionId) {
      return null;
    }
    return this.store.patchSubscriptionMetadata(record.stripeSubscriptionId, {
      stripeScheduleStatus: schedule.status,
      stripeScheduleCanceledAt: dateIso(schedule.canceled_at),
    });
  }

  async recordFailureFromEvent(event: Stripe.Event): Promise<StripeFailureTicketView> {
    const input = stripeFailureFromEvent(event);
    return this.store.upsertFailureTicket(input);
  }

  async listFailureTickets(limit = 50): Promise<StripeFailureTicketView[]> {
    return this.store.listFailureTickets(limit);
  }

  async countOpenFailureTickets(): Promise<number> {
    return this.store.countOpenFailureTickets();
  }

  private async ensureStripeCustomer(user: BillingUser): Promise<string> {
    const existing = await this.store.getLatestStripeCustomerIdForUser(user.id);
    if (existing) {
      return existing;
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    await this.store.upsertSubscription({
      userId: user.id,
      platform: "stripe",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeProductId: null,
      plan: user.plan ?? this.config.freePlanId,
      status: "customer_created",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      metadata: { source: "customer_created" },
    });
    return customer.id;
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    if (session.subscription && typeof session.subscription !== "string") {
      await this.syncSubscription(session.subscription);
      return;
    }
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product"],
      });
      await this.syncSubscription(subscription);
    }
  }

  private async getLatestSubscriptionForUser(userId: string): Promise<SubscriptionRecord | null> {
    const subscriptions = await this.store.listStripeSubscriptionsForUser(userId, 10);
    return subscriptions
      .filter((subscription) => subscription.stripeSubscriptionId)
      .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0))[0] ?? null;
  }

  private async resolveUserIdForSubscription(subscription: Stripe.Subscription): Promise<string> {
    const metadataUserId = stringOrNull(subscription.metadata?.userId);
    if (metadataUserId) {
      return metadataUserId;
    }
    const customerId = stripeId(subscription.customer);
    if (customerId) {
      const userId = await this.store.findUserIdByStripeCustomerId(customerId);
      if (userId) {
        return userId;
      }
    }
    throw new StripeBillingError("Stripe subscription cannot be mapped to an application user.", {
      code: "missing_user_mapping",
    });
  }

  private async planIdForPrice(priceId: string | null | undefined): Promise<string> {
    if (!priceId) {
      return this.config.freePlanId;
    }
    const settings = await this.getBillingSettings();
    for (const [planId, configuredPriceId] of Object.entries(settings.priceByPlan)) {
      if (configuredPriceId === priceId) {
        return planId;
      }
    }
    return this.config.freePlanId;
  }

  private async sendBillingLifecycleEmails(subscription: SubscriptionRecord): Promise<void> {
    if (!subscription.stripeSubscriptionId) {
      return;
    }
    await this.sendConfirmationEmailOnce(subscription);
    await this.sendCancellationEmailOnce(subscription);
    await this.sendAccessEndedEmailOnce(subscription);
  }

  private async sendConfirmationEmailOnce(subscription: SubscriptionRecord): Promise<void> {
    if (!isPaidSubscriptionStatus(subscription.status)) {
      return;
    }
    const marker = subscription.metadata.billingConfirmationSentAt;
    if (typeof marker === "string" && marker.length > 0) {
      return;
    }
    const recipient = await this.requiredRecipient(subscription.userId);
    const planLabel = this.planLabel(subscription.plan);
    await this.emailSender.send(
      billingConfirmationEmail({
        brandName: this.config.brandName,
        to: recipient.email,
        planLabel,
        accessEndsAt: subscription.currentPeriodEnd,
        dashboardUrl: appUrl(this.config, this.config.dashboardPath),
        supportEmail: this.config.supportEmail,
      }),
    );
    await this.store.patchSubscriptionMetadata(subscription.stripeSubscriptionId!, {
      billingConfirmationPlan: subscription.plan,
      billingConfirmationSentAt: new Date().toISOString(),
    });
  }

  private async sendCancellationEmailOnce(subscription: SubscriptionRecord): Promise<void> {
    if (!subscription.cancelAtPeriodEnd || !subscription.currentPeriodEnd) {
      return;
    }
    const activeMarker = subscription.metadata.membershipCancellationActive;
    const sentForDate = subscription.metadata.membershipCancellationAccessEndsAt;
    const accessEndsAt = subscription.currentPeriodEnd.toISOString();
    if (activeMarker === true && sentForDate === accessEndsAt) {
      return;
    }
    const recipient = await this.requiredRecipient(subscription.userId);
    await this.emailSender.send(
      membershipCancellationEmail({
        brandName: this.config.brandName,
        to: recipient.email,
        planLabel: this.planLabel(subscription.plan),
        accessEndsAt: subscription.currentPeriodEnd,
        dashboardUrl: appUrl(this.config, this.config.dashboardPath),
        supportEmail: this.config.supportEmail,
      }),
    );
    await this.store.patchSubscriptionMetadata(subscription.stripeSubscriptionId!, {
      membershipCancellationActive: true,
      membershipCancellationSentAt: new Date().toISOString(),
      membershipCancellationAccessEndsAt: accessEndsAt,
    });
  }

  private async sendAccessEndedEmailOnce(subscription: SubscriptionRecord): Promise<void> {
    if (isPaidSubscriptionStatus(subscription.status) || subscription.cancelAtPeriodEnd || !subscription.currentPeriodEnd) {
      return;
    }
    const marker = subscription.metadata.membershipAccessEndedSentAt;
    if (typeof marker === "string" && marker.length > 0) {
      return;
    }
    const recipient = await this.requiredRecipient(subscription.userId);
    await this.emailSender.send(
      membershipAccessEndedEmail({
        brandName: this.config.brandName,
        to: recipient.email,
        planLabel: this.planLabel(subscription.plan),
        accessEndsAt: subscription.currentPeriodEnd,
        supportEmail: this.config.supportEmail,
      }),
    );
    await this.store.patchSubscriptionMetadata(subscription.stripeSubscriptionId!, {
      membershipAccessEndedSentAt: new Date().toISOString(),
    });
  }

  private async sendReactivationEmailOnce(subscription: SubscriptionRecord): Promise<void> {
    if (!subscription.stripeSubscriptionId) {
      return;
    }
    const recipient = await this.requiredRecipient(subscription.userId);
    await this.emailSender.send(
      membershipReactivatedEmail({
        brandName: this.config.brandName,
        to: recipient.email,
        planLabel: this.planLabel(subscription.plan),
        accessEndsAt: subscription.currentPeriodEnd,
        dashboardUrl: appUrl(this.config, this.config.dashboardPath),
        supportEmail: this.config.supportEmail,
      }),
    );
    await this.store.patchSubscriptionMetadata(subscription.stripeSubscriptionId, {
      membershipCancellationActive: false,
      membershipReactivatedSentAt: new Date().toISOString(),
    });
  }

  private async requiredRecipient(userId: string) {
    const recipient = await this.store.getBillingRecipient(userId);
    if (!recipient?.email) {
      throw new StripeBillingError(`No billing email is available for user ${userId}.`, {
        code: "missing_billing_recipient",
      });
    }
    return recipient;
  }

  private planLabel(planId: string): string {
    return this.config.paidPlans.find((plan) => plan.id === planId)?.label ?? planId;
  }
}

function assertCheckoutEnabled(settings: EffectiveBillingSettings): void {
  if (!settings.checkoutEnabled) {
    throw new StripeBillingError("Stripe checkout is not enabled.", { code: "checkout_disabled" });
  }
}

function stripeFailureFromEvent(event: Stripe.Event): StripeFailureTicketInput {
  const object = event.data.object as unknown as Record<string, unknown>;
  const stripeCustomerId = stripeId(object.customer as ExpandableStripeId);
  const stripeSubscriptionId = stripeId(object.subscription as ExpandableStripeId);
  const stripeInvoiceId = stringOrNull(object.invoice);
  const stripePaymentIntentId = stringOrNull(object.payment_intent) ?? stringOrNull(object.id);
  const amountDueCents = numberOrNull(object.amount_due) ?? numberOrNull(object.amount);
  const currency = stringOrNull(object.currency);
  const failureCode =
    nestedString(object.last_payment_error, "code") ??
    nestedString(object.last_payment_error, "decline_code") ??
    stringOrNull(object.failure_code);
  const failureMessage =
    nestedString(object.last_payment_error, "message") ??
    stringOrNull(object.failure_message) ??
    stringOrNull(object.status);
  const rootId = [
    event.type,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeInvoiceId,
    stripePaymentIntentId,
    failureCode,
  ]
    .filter(Boolean)
    .join("|");

  return {
    fingerprint: createHash("sha256").update(`stripe_failure|${rootId}`).digest("hex"),
    eventId: event.id,
    eventType: event.type,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeInvoiceId,
    stripePaymentIntentId,
    amountDueCents,
    currency,
    failureCode,
    failureMessage,
    metadata: {
      livemode: event.livemode,
      created: event.created,
    },
  };
}

function isPaidSubscriptionStatus(status: string): boolean {
  return ["active", "trialing", "past_due"].includes(status);
}

function hasScheduledCancellation(subscription: Stripe.Subscription): boolean {
  return Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
}

function stripeId(value: ExpandableStripeId): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.id;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nestedString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return stringOrNull((value as Record<string, unknown>)[key]);
}

function metadataRecord(value: Stripe.Metadata | null | undefined): Record<string, unknown> {
  return value ? { ...value } : {};
}

function dateFromSeconds(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function dateIso(value: number | null | undefined): string | null {
  const date = dateFromSeconds(value);
  return date ? date.toISOString() : null;
}
