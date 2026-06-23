import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  StripeBillingService,
  createStripeBillingConfig,
  type BillingEmail,
  type BillingEmailSender,
  type BillingSettingsRow,
  type StripeBillingStore,
  type StripeFailureTicketInput,
  type StripeFailureTicketView,
  type SubscriptionRecord,
  type UpsertSubscriptionInput,
} from "../src/index.js";

test("creates hosted checkout and stores a strict customer record", async () => {
  const store = new MemoryStore();
  const emails = new MemoryEmailSender();
  const service = serviceWith(store, emails);

  const result = await service.createCheckoutSession(
    { id: "user_1", email: "user@example.com", name: "User One", plan: "free" },
    "trader",
  );

  assert.equal(result.sessionId, "cs_test");
  assert.equal(result.url, "https://checkout.stripe.test/session");
  assert.equal(store.subscriptions[0]?.stripeCustomerId, "cus_test");
  assert.equal(store.subscriptions[0]?.status, "customer_created");
});

test("syncs subscription and sends cancellation email once", async () => {
  const store = new MemoryStore();
  const emails = new MemoryEmailSender();
  const service = serviceWith(store, emails);
  const subscription = fakeSubscription({ cancelAtPeriodEnd: true });

  const saved = await service.syncSubscription(subscription);
  const savedAgain = await service.syncSubscription(subscription);

  assert.equal(saved.plan, "trader");
  assert.equal(saved.cancelAtPeriodEnd, true);
  assert.equal(savedAgain.metadata.membershipCancellationActive, true);
  assert.equal(emails.sent.filter((email) => email.subject.includes("cancellation confirmed")).length, 1);
});

test("reactivates a canceling subscription through Stripe", async () => {
  const store = new MemoryStore();
  const emails = new MemoryEmailSender();
  const fakeStripe = new FakeStripe();
  const service = serviceWith(store, emails, fakeStripe as unknown as Stripe);
  await service.syncSubscription(fakeSubscription({ cancelAtPeriodEnd: true }));

  const updated = await service.reactivateSubscription({ id: "user_1", email: "user@example.com" });

  assert.equal(fakeStripe.subscriptionUpdateParams?.cancel_at_period_end, false);
  assert.equal(updated.cancelAtPeriodEnd, false);
  assert.equal(emails.sent.some((email) => email.subject.includes("reactivated")), true);
});

test("dedupes payment failure tickets by fingerprint", async () => {
  const store = new MemoryStore();
  const service = serviceWith(store, new MemoryEmailSender());
  const event = {
    id: "evt_failed",
    type: "invoice.payment_failed",
    livemode: false,
    created: 1_717_000_000,
    data: {
      object: {
        id: "in_failed",
        customer: "cus_test",
        subscription: "sub_test",
        payment_intent: "pi_test",
        amount_due: 2900,
        currency: "usd",
        failure_message: "card declined",
      },
    },
  } as unknown as Stripe.Event;

  await service.recordFailureFromEvent(event);
  await service.recordFailureFromEvent({ ...event, id: "evt_failed_2" } as Stripe.Event);

  assert.equal(store.failureTickets.length, 1);
  assert.equal(store.failureTickets[0]?.occurrenceCount, 2);
});

function serviceWith(store: MemoryStore, emails: MemoryEmailSender, stripeClient?: Stripe): StripeBillingService {
  return new StripeBillingService({
    config: createStripeBillingConfig({
      appUrl: "https://app.example.com",
      stripeSecretKey: "sk_test_123",
      stripePublishableKey: "pk_test_123",
      stripeWebhookSecret: "whsec_test",
      brandName: "Example",
      freePlanId: "free",
      paidPlans: [{ id: "trader", label: "Trader", priceId: "price_trader", rank: 10 }],
      checkoutEnabled: true,
      customerPortalEnabled: true,
      allowPromotionCodes: true,
      defaultSuccessPath: "/dashboard",
      defaultCancelPath: "/pricing",
      dashboardPath: "/dashboard",
      billingPath: "/pricing",
    }),
    store,
    emailSender: emails,
    stripeClient: stripeClient ?? (new FakeStripe() as unknown as Stripe),
  });
}

function fakeSubscription(input: { cancelAtPeriodEnd: boolean }): Stripe.Subscription {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: input.cancelAtPeriodEnd,
    cancel_at: input.cancelAtPeriodEnd ? 1_720_000_000 : null,
    current_period_start: 1_717_000_000,
    current_period_end: 1_720_000_000,
    trial_end: null,
    metadata: { userId: "user_1" },
    items: {
      data: [
        {
          price: {
            id: "price_trader",
            product: "prod_test",
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

class FakeStripe {
  subscriptionUpdateParams: Stripe.SubscriptionUpdateParams | null = null;

  customers = {
    create: async () => ({ id: "cus_test" }),
  };

  checkout = {
    sessions: {
      create: async () => ({
        id: "cs_test",
        url: "https://checkout.stripe.test/session",
        client_secret: "seti_secret",
      }),
      retrieve: async () => ({
        id: "cs_test",
        metadata: { userId: "user_1" },
        subscription: fakeSubscription({ cancelAtPeriodEnd: false }),
      }),
    },
  };

  billingPortal = {
    sessions: {
      create: async () => ({ url: "https://billing.stripe.test/session" }),
    },
  };

  subscriptions = {
    retrieve: async () => fakeSubscription({ cancelAtPeriodEnd: true }),
    update: async (_subscriptionId: string, params: Stripe.SubscriptionUpdateParams) => {
      this.subscriptionUpdateParams = params;
      return fakeSubscription({ cancelAtPeriodEnd: false });
    },
    list: async () => ({ data: [fakeSubscription({ cancelAtPeriodEnd: false })] }),
  };

  webhooks = {
    constructEvent: (payload: string | Buffer) => JSON.parse(payload.toString()) as Stripe.Event,
  };
}

class MemoryEmailSender implements BillingEmailSender {
  sent: BillingEmail[] = [];

  async send(input: BillingEmail) {
    this.sent.push(input);
    return { sentAt: new Date(), providerMessageId: `msg_${this.sent.length}` };
  }
}

class MemoryStore implements StripeBillingStore {
  settings: BillingSettingsRow | null = {
    checkoutEnabled: true,
    customerPortalEnabled: true,
    allowPromotionCodes: true,
  };
  subscriptions: SubscriptionRecord[] = [];
  failureTickets: StripeFailureTicketView[] = [];

  async getBillingSettings() {
    return this.settings;
  }

  async upsertBillingSettings(input: BillingSettingsRow) {
    this.settings = input;
    return input;
  }

  async getLatestStripeCustomerIdForUser(userId: string) {
    return this.subscriptions.find((subscription) => subscription.userId === userId)?.stripeCustomerId ?? null;
  }

  async getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
    return (
      this.subscriptions.find((subscription) => subscription.stripeSubscriptionId === stripeSubscriptionId) ?? null
    );
  }

  async getSubscriptionByUserAndCustomer(userId: string, stripeCustomerId: string) {
    return (
      this.subscriptions.find(
        (subscription) => subscription.userId === userId && subscription.stripeCustomerId === stripeCustomerId,
      ) ?? null
    );
  }

  async listStripeSubscriptionsForUser(userId: string, limit: number) {
    return this.subscriptions.filter((subscription) => subscription.userId === userId).slice(0, limit);
  }

  async upsertSubscription(input: UpsertSubscriptionInput) {
    const existingIndex = this.subscriptions.findIndex(
      (subscription) =>
        (input.stripeSubscriptionId && subscription.stripeSubscriptionId === input.stripeSubscriptionId) ||
        (!input.stripeSubscriptionId &&
          subscription.userId === input.userId &&
          subscription.stripeCustomerId === input.stripeCustomerId),
    );
    const existing = existingIndex >= 0 ? this.subscriptions[existingIndex] : null;
    const record: SubscriptionRecord = {
      ...existing,
      ...input,
      id: existing?.id ?? input.id ?? `sub_record_${this.subscriptions.length + 1}`,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
      updatedAt: new Date(),
    };
    if (existingIndex >= 0) {
      this.subscriptions[existingIndex] = record;
    } else {
      this.subscriptions.push(record);
    }
    return record;
  }

  async patchSubscriptionMetadata(stripeSubscriptionId: string, patch: Record<string, unknown>) {
    const record = this.subscriptions.find(
      (subscription) => subscription.stripeSubscriptionId === stripeSubscriptionId,
    );
    assert.ok(record);
    record.metadata = { ...record.metadata, ...patch };
    record.updatedAt = new Date();
    return record;
  }

  async findUserIdByStripeCustomerId(stripeCustomerId: string) {
    return this.subscriptions.find((subscription) => subscription.stripeCustomerId === stripeCustomerId)?.userId ?? null;
  }

  async findSubscriptionForSchedule(input: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null }) {
    return (
      this.subscriptions.find(
        (subscription) =>
          (input.stripeSubscriptionId && subscription.stripeSubscriptionId === input.stripeSubscriptionId) ||
          (input.stripeCustomerId && subscription.stripeCustomerId === input.stripeCustomerId),
      ) ?? null
    );
  }

  async updateUserPlan() {
    return undefined;
  }

  async getBillingRecipient(userId: string) {
    if (userId !== "user_1") {
      return null;
    }
    return { email: "user@example.com", name: "User One" };
  }

  async upsertFailureTicket(input: StripeFailureTicketInput) {
    const existing = this.failureTickets.find((ticket) => ticket.fingerprint === input.fingerprint);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastSeenAt = new Date();
      return existing;
    }
    const ticket: StripeFailureTicketView = {
      ...input,
      id: `ticket_${this.failureTickets.length + 1}`,
      status: "open",
      occurrenceCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.failureTickets.push(ticket);
    return ticket;
  }

  async listFailureTickets(limit: number) {
    return this.failureTickets.slice(0, limit);
  }

  async countOpenFailureTickets() {
    return this.failureTickets.filter((ticket) => ticket.status === "open").length;
  }
}
