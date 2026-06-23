import { createStripeWebhookRoute } from "@codex-reusable/stripe-subscription-billing/next";
import { stripeBilling } from "../../../../lib/billing";

export const { POST } = createStripeWebhookRoute(stripeBilling);
