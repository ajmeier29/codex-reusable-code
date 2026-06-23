import {
  StripeBillingService,
  createStripeBillingConfigFromEnv,
} from "@codex-reusable/stripe-subscription-billing";
import { billingEmailSender } from "./email-sender";
import { stripeBillingStore } from "./billing-store";

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
