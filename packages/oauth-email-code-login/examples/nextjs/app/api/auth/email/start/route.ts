import { auth } from "@/lib/auth";
import { handleEmailCodeStartRequest } from "@codex-reusable/oauth-email-code-login/next";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEmailCodeStartRequest({ request, auth });
}
