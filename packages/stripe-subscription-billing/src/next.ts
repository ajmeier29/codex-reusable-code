import { StripeBillingError, type BillingUser } from "./types.js";
import type { StripeBillingService } from "./service.js";

export type RequireBillingUser = (request: Request) => Promise<BillingUser>;
export type AssertMutationAllowed = (request: Request) => Promise<void> | void;

export type StripeBillingRouteOptions = {
  service: StripeBillingService;
  requireUser: RequireBillingUser;
  assertMutationAllowed?: AssertMutationAllowed;
  exposeErrors?: boolean;
};

export function createStripeCheckoutRoute(options: StripeBillingRouteOptions) {
  return {
    POST: async (request: Request) =>
      withBillingRoute(options, request, async ({ service, user }) => {
        const body = await jsonBody(request);
        const planId = requiredString(body.planId, "planId");
        return jsonResponse(await service.createCheckoutSession(user, planId));
      }),
  };
}

export function createStripeEmbeddedCheckoutRoute(options: StripeBillingRouteOptions) {
  return {
    POST: async (request: Request) =>
      withBillingRoute(options, request, async ({ service, user }) => {
        const body = await jsonBody(request);
        const planId = requiredString(body.planId, "planId");
        const nextPath = optionalString(body.nextPath);
        return jsonResponse(await service.createEmbeddedCheckoutSession(user, planId, { nextPath }));
      }),
  };
}

export function createStripePortalRoute(options: StripeBillingRouteOptions) {
  return {
    POST: async (request: Request) =>
      withBillingRoute(options, request, async ({ service, user }) => {
        const body = await jsonBody(request);
        return jsonResponse(
          await service.createPortalSession(user, {
            returnPath: optionalString(body.returnPath),
            flow: body.flow === "subscription_cancel" ? "subscription_cancel" : undefined,
          }),
        );
      }),
  };
}

export function createStripeReactivateRoute(options: StripeBillingRouteOptions) {
  return {
    POST: async (request: Request) =>
      withBillingRoute(options, request, async ({ service, user }) =>
        jsonResponse(await service.reactivateSubscription(user)),
      ),
  };
}

export function createStripeCheckoutReturnRoute(options: StripeBillingRouteOptions) {
  return {
    POST: async (request: Request) =>
      withBillingRoute(options, request, async ({ service, user }) => {
        const body = await jsonBody(request);
        return jsonResponse(await service.retrieveCheckoutSession(user, requiredString(body.sessionId, "sessionId")));
      }),
  };
}

export function createStripeWebhookRoute(service: StripeBillingService) {
  return {
    POST: async (request: Request) => {
      try {
        const signature = request.headers.get("stripe-signature") ?? "";
        const payload = await request.text();
        return jsonResponse(await service.handleWebhook(payload, signature));
      } catch (error) {
        return routeError(error, false);
      }
    },
  };
}

async function withBillingRoute(
  options: StripeBillingRouteOptions,
  request: Request,
  handler: (context: { service: StripeBillingService; user: BillingUser }) => Promise<Response>,
): Promise<Response> {
  try {
    await options.assertMutationAllowed?.(request);
    const user = await options.requireUser(request);
    return await handler({ service: options.service, user });
  } catch (error) {
    return routeError(error, options.exposeErrors ?? false);
  }
}

function routeError(error: unknown, exposeErrors: boolean): Response {
  if (error instanceof StripeBillingError) {
    return jsonResponse(
      {
        error: error.message,
        code: error.code,
      },
      error.status,
    );
  }

  const message = error instanceof Error ? error.message : "Request failed.";
  return jsonResponse(
    {
      error: exposeErrors ? message : "Request failed.",
      code: "stripe_billing_route_error",
    },
    500,
  );
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new StripeBillingError("JSON body must be an object.", { code: "invalid_json_body" });
  }
  return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new StripeBillingError(`${fieldName} is required.`, { code: "missing_field" });
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
