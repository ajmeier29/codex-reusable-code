import assert from "node:assert/strict";
import test from "node:test";
import {
  StripeBillingError,
  createStripeBillingConfigFromEnv,
  mergeBillingSettings,
  resolvePriceForPlan,
} from "../src/index.js";

test("requires Stripe secrets and price env vars", () => {
  assert.throws(
    () =>
      createStripeBillingConfigFromEnv(
        {
          NEXT_PUBLIC_APP_URL: "https://app.example.com",
          STRIPE_WEBHOOK_SECRET: "whsec_test",
          STRIPE_PRICE_TRADER: "price_trader",
        },
        {
          brandName: "Example",
          freePlanId: "free",
          paidPlans: [{ id: "trader", label: "Trader", envPriceKey: "STRIPE_PRICE_TRADER", rank: 10 }],
        },
      ),
    /STRIPE_SECRET_KEY/,
  );
});

test("builds strict config from environment", () => {
  const config = createStripeBillingConfigFromEnv(
    {
      NEXT_PUBLIC_APP_URL: "https://app.example.com/",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_TRADER: "price_trader",
      STRIPE_PRICE_PRO: "price_pro",
    },
    {
      brandName: "Example",
      freePlanId: "free",
      paidPlans: [
        { id: "pro", label: "Pro", envPriceKey: "STRIPE_PRICE_PRO", rank: 20 },
        { id: "trader", label: "Trader", envPriceKey: "STRIPE_PRICE_TRADER", rank: 10 },
      ],
    },
  );

  assert.equal(config.appUrl, "https://app.example.com");
  assert.deepEqual(
    config.paidPlans.map((plan) => plan.id),
    ["trader", "pro"],
  );
});

test("price overrides must resolve to a real configured price", () => {
  const config = createStripeBillingConfigFromEnv(
    {
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_TRADER: "price_trader",
    },
    {
      brandName: "Example",
      freePlanId: "free",
      paidPlans: [{ id: "trader", label: "Trader", envPriceKey: "STRIPE_PRICE_TRADER", rank: 10 }],
    },
  );
  const settings = mergeBillingSettings(config, {
    checkoutEnabled: true,
    customerPortalEnabled: true,
    priceOverrides: { trader: "price_override" },
  });

  assert.equal(resolvePriceForPlan(settings, "trader"), "price_override");
  assert.throws(() => resolvePriceForPlan(settings, "premium"), StripeBillingError);
});
