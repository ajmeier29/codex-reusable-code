import {
  type BillingPlanDefinition,
  type EffectiveBillingSettings,
  type StripeBillingConfig,
  type StripeBillingConfigFromEnvOptions,
  type BillingSettingsRow,
  StripeBillingError,
} from "./types.js";

export function createStripeBillingConfig(input: StripeBillingConfig): StripeBillingConfig {
  validateUrl(input.appUrl, "appUrl");
  assertPresent(input.stripeSecretKey, "stripeSecretKey");
  assertPresent(input.stripeWebhookSecret, "stripeWebhookSecret");
  assertPresent(input.brandName, "brandName");
  assertPresent(input.freePlanId, "freePlanId");
  validatePath(input.defaultSuccessPath, "defaultSuccessPath");
  validatePath(input.defaultCancelPath, "defaultCancelPath");
  validatePath(input.dashboardPath, "dashboardPath");
  validatePath(input.billingPath, "billingPath");
  validatePaidPlans(input.paidPlans);

  return {
    ...input,
    appUrl: stripTrailingSlash(input.appUrl),
    paidPlans: [...input.paidPlans].sort((left, right) => left.rank - right.rank),
  };
}

export function createStripeBillingConfigFromEnv(
  env: Record<string, string | undefined>,
  options: StripeBillingConfigFromEnvOptions,
): StripeBillingConfig {
  const paidPlans = options.paidPlans.map((plan) => {
    const priceId = env[plan.envPriceKey]?.trim();
    if (!priceId) {
      throw new StripeBillingError(`Missing required Stripe price environment variable: ${plan.envPriceKey}`, {
        code: "missing_price_env",
      });
    }
    return {
      id: plan.id,
      label: plan.label,
      rank: plan.rank,
      priceId,
    };
  });

  return createStripeBillingConfig({
    appUrl: requiredEnv(env, "NEXT_PUBLIC_APP_URL"),
    stripeSecretKey: requiredEnv(env, "STRIPE_SECRET_KEY"),
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY?.trim(),
    stripeWebhookSecret: requiredEnv(env, "STRIPE_WEBHOOK_SECRET"),
    brandName: options.brandName,
    freePlanId: options.freePlanId,
    paidPlans,
    checkoutEnabled: options.checkoutEnabledDefault ?? true,
    customerPortalEnabled: options.customerPortalEnabledDefault ?? true,
    allowPromotionCodes: options.allowPromotionCodesDefault ?? true,
    defaultSuccessPath: options.defaultSuccessPath ?? "/dashboard",
    defaultCancelPath: options.defaultCancelPath ?? "/pricing",
    dashboardPath: options.dashboardPath ?? "/dashboard",
    billingPath: options.billingPath ?? "/pricing",
    supportEmail: options.supportEmail,
  });
}

export function mergeBillingSettings(
  config: StripeBillingConfig,
  row: BillingSettingsRow | null,
): EffectiveBillingSettings {
  const priceByPlan = Object.fromEntries(config.paidPlans.map((plan) => [plan.id, plan.priceId]));
  const overrides = row?.priceOverrides ?? {};
  for (const [planId, priceId] of Object.entries(overrides)) {
    assertPresent(priceId, `priceOverrides.${planId}`);
    priceByPlan[planId] = priceId;
  }

  const successPath = row?.successPath ?? config.defaultSuccessPath;
  const cancelPath = row?.cancelPath ?? config.defaultCancelPath;
  const billingPath = row?.billingPath ?? config.billingPath;
  validatePath(successPath, "successPath");
  validatePath(cancelPath, "cancelPath");
  validatePath(billingPath, "billingPath");

  return {
    checkoutEnabled: row?.checkoutEnabled ?? config.checkoutEnabled,
    customerPortalEnabled: row?.customerPortalEnabled ?? config.customerPortalEnabled,
    allowPromotionCodes: row?.allowPromotionCodes ?? config.allowPromotionCodes,
    successPath,
    cancelPath,
    billingPath,
    priceByPlan,
  };
}

export function resolvePriceForPlan(settings: EffectiveBillingSettings, planId: string): string {
  const priceId = settings.priceByPlan[planId]?.trim();
  if (!priceId) {
    throw new StripeBillingError(`No Stripe price is configured for plan "${planId}".`, {
      code: "missing_plan_price",
    });
  }
  return priceId;
}

export function appUrl(config: StripeBillingConfig, path: string): string {
  validatePath(path, "path");
  return `${config.appUrl}${path}`;
}

export function validatePath(path: string, fieldName: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new StripeBillingError(`${fieldName} must be an application path starting with "/".`, {
      code: "invalid_path",
    });
  }
}

function requiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new StripeBillingError(`Missing required environment variable: ${key}`, { code: "missing_env" });
  }
  return value;
}

function assertPresent(value: string | undefined | null, fieldName: string): void {
  if (!value || !value.trim()) {
    throw new StripeBillingError(`${fieldName} is required.`, { code: "missing_config" });
  }
}

function validateUrl(value: string, fieldName: string): void {
  assertPresent(value, fieldName);
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new StripeBillingError(`${fieldName} must be a valid http or https URL.`, { code: "invalid_url" });
  }
}

function validatePaidPlans(plans: BillingPlanDefinition[]): void {
  if (!plans.length) {
    throw new StripeBillingError("At least one paid Stripe plan is required.", { code: "missing_paid_plans" });
  }
  const ids = new Set<string>();
  for (const plan of plans) {
    assertPresent(plan.id, "plan.id");
    assertPresent(plan.label, `plan(${plan.id}).label`);
    assertPresent(plan.priceId, `plan(${plan.id}).priceId`);
    if (ids.has(plan.id)) {
      throw new StripeBillingError(`Duplicate billing plan id: ${plan.id}`, { code: "duplicate_plan_id" });
    }
    ids.add(plan.id);
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
