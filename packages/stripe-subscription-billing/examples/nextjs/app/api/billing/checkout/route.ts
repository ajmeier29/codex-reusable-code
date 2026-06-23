import { createStripeCheckoutRoute } from "@codex-reusable/stripe-subscription-billing/next";
import { stripeBilling } from "../../../../lib/billing";
import { assertMutationAllowed, requireBillingUser } from "../../../../lib/session";

export const { POST } = createStripeCheckoutRoute({
  service: stripeBilling,
  requireUser: requireBillingUser,
  assertMutationAllowed,
});
