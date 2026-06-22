import { auth, authConfig } from "@/lib/auth";
import { handleOAuthCallbackRequest } from "@codex-reusable/oauth-email-code-login/next";
import type { OAuthProviderId } from "@codex-reusable/oauth-email-code-login";

export const runtime = "nodejs";

export function GET(request: Request, context: { params: { provider: OAuthProviderId } }) {
  return handleOAuthCallbackRequest({
    request,
    auth,
    config: authConfig,
    provider: context.params.provider
  });
}

export function POST(request: Request, context: { params: { provider: OAuthProviderId } }) {
  return handleOAuthCallbackRequest({
    request,
    auth,
    config: authConfig,
    provider: context.params.provider
  });
}
