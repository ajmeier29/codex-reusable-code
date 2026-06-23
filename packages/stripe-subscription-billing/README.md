# Stripe Subscription Billing

Reusable Stripe subscription billing package for web apps that need checkout, embedded checkout, the customer portal, cancel/reactivate flow, Stripe webhooks, subscription sync, billing lifecycle emails, and payment-failure issue/ticket dedupe.

This package is intentionally strict:

- No fallback Stripe client.
- No fallback database.
- No fallback email sender.
- No silent "not configured" production behavior.
- Missing settings, missing price IDs, unmapped Stripe users, and missing billing recipients throw clear errors.

## What It Includes

- Core `StripeBillingService`
- Strict environment/config validation
- Subscription checkout and embedded checkout
- Stripe customer portal and cancel-flow portal sessions
- Reactivate subscription support
- Stripe webhook handler
- Subscription and subscription schedule sync
- Confirmation, cancellation, reactivation, and access-ended email templates
- Payment failure ticket fingerprinting so repeated Stripe failures do not create duplicate operational tickets
- SQL schema contract
- Next.js route helper examples

## Environment Variables

```bash
NEXT_PUBLIC_APP_URL=https://your-app.example.com

STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_PUBLISHABLE_KEY=pk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

STRIPE_PRICE_TRADER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PREMIUM=price_...
```

Use test keys in staging and live keys in production. Do not mix Stripe modes.

## Database Schema

Run:

```bash
psql "$DATABASE_URL" -f packages/stripe-subscription-billing/migrations/0001_stripe_billing.sql
```

The migration creates:

- `stripe_billing_settings`
- `stripe_subscriptions`
- `stripe_failure_tickets`

Your app still owns the users table. The reusable package stores `user_id` as text so it can be wired to any application user model.

## Basic Setup

```ts
import {
  StripeBillingService,
  createStripeBillingConfigFromEnv,
} from "@codex-reusable/stripe-subscription-billing";
import { billingEmailSender, stripeBillingStore } from "./billing-adapters";

export const stripeBilling = new StripeBillingService({
  config: createStripeBillingConfigFromEnv(process.env, {
    brandName: "Your App",
    freePlanId: "free",
    paidPlans: [
      { id: "trader", label: "Trader", envPriceKey: "STRIPE_PRICE_TRADER", rank: 10 },
      { id: "pro", label: "Pro", envPriceKey: "STRIPE_PRICE_PRO", rank: 20 },
      { id: "premium", label: "Premium", envPriceKey: "STRIPE_PRICE_PREMIUM", rank: 30 },
    ],
    supportEmail: "support@example.com",
  }),
  store: stripeBillingStore,
  emailSender: billingEmailSender,
});
```

## Required Store Adapter

Implement `StripeBillingStore` from `src/types.ts`.

The adapter must:

- Read and update billing settings.
- Persist Stripe customers and subscriptions.
- Map Stripe customers/subscriptions back to application users.
- Update the application user plan after subscription sync.
- Return a billing recipient email for lifecycle emails.
- Upsert payment failure tickets by unique fingerprint.

There is no dummy store in this package. If the store is missing or incomplete, the package should not be used.

## Required Email Sender

Implement `BillingEmailSender`:

```ts
export const billingEmailSender = {
  async send(input) {
    // Send with Resend, SES, Postmark, etc.
    // Throw if the provider is not configured or delivery fails.
    return { sentAt: new Date(), providerMessageId: "provider-message-id" };
  },
};
```

Do not return success without actually sending the email.

## Next.js Routes

```ts
import { createStripeCheckoutRoute } from "@codex-reusable/stripe-subscription-billing/next";
import { stripeBilling } from "@/lib/billing";
import { requireBillingUser, assertMutationAllowed } from "@/lib/auth";

export const { POST } = createStripeCheckoutRoute({
  service: stripeBilling,
  requireUser: requireBillingUser,
  assertMutationAllowed,
});
```

Provided helpers:

- `createStripeCheckoutRoute`
- `createStripeEmbeddedCheckoutRoute`
- `createStripePortalRoute`
- `createStripeReactivateRoute`
- `createStripeCheckoutReturnRoute`
- `createStripeWebhookRoute`

## Stripe Webhooks

Send these events to the webhook route:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `subscription_schedule.created`
- `subscription_schedule.updated`
- `subscription_schedule.released`
- `subscription_schedule.canceled`
- `invoice.payment_failed`
- `payment_intent.payment_failed`
- `charge.failed`

## Billing Lifecycle Emails

The service sends:

- Membership confirmation when a paid subscription first syncs.
- Cancellation confirmation when Stripe reports `cancel_at_period_end` or `cancel_at`.
- Reactivation confirmation when a scheduled cancellation is undone through `reactivateSubscription`.
- Access-ended email when Stripe syncs a non-paid subscription after the paid-through date.

Each email is marked in subscription metadata to prevent repeat sends.

## AI Implementation Prompt

Use this prompt when asking an AI agent to implement the package in a new app:

```text
Implement @codex-reusable/stripe-subscription-billing in this app.

Requirements:
- Run the package SQL migration.
- Add Stripe env vars for the current environment only.
- Create a real StripeBillingStore adapter backed by the app database.
- Create a real BillingEmailSender backed by the app email provider.
- Wire checkout, embedded checkout, portal, reactivate, checkout-return, and webhook routes using the package route helpers.
- Register the Stripe webhook events listed in the package README.
- Do not add fallbacks, mock billing success, dummy emails, or silent "not configured" behavior.
- If a required Stripe, database, email, or auth dependency is missing, throw a clear error.
- Add tests for checkout creation, webhook subscription sync, cancellation email, reactivation, and payment-failure dedupe.
```

## Tests

```bash
pnpm --filter @codex-reusable/stripe-subscription-billing typecheck
pnpm --filter @codex-reusable/stripe-subscription-billing test
```
