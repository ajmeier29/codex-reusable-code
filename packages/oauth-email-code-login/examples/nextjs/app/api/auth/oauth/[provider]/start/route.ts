import { auth, authConfig } from "@/lib/auth";
import { handleOAuthStartRequest } from "@codex-reusable/oauth-email-code-login/next";
import type { OAuthProviderId } from "@codex-reusable/oauth-email-code-login";

export const runtime = "nodejs";

export function GET(request: Request, context: { params: { provider: OAuthProviderId } }) {
  return handleOAuthStartRequest({
    requestUrl: request.url,
    auth,
    config: authConfig,
    provider: context.params.provider
  });
}
