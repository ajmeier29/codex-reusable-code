import { auth, authConfig } from "@/lib/auth";
import { handleEmailCodeVerifyRequest } from "@codex-reusable/oauth-email-code-login/next";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEmailCodeVerifyRequest({ request, auth, config: authConfig });
}
