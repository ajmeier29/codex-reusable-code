import { auth, authConfig } from "@/lib/auth";
import { handleLogoutRequest } from "@codex-reusable/oauth-email-code-login/next";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleLogoutRequest({ request, auth, config: authConfig });
}
