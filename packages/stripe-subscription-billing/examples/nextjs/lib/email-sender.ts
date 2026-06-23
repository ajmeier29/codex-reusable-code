import type { BillingEmailSender } from "@codex-reusable/stripe-subscription-billing";

export const billingEmailSender: BillingEmailSender = {
  async send() {
    throw new Error("Implement billingEmailSender with your email provider.");
  },
};
