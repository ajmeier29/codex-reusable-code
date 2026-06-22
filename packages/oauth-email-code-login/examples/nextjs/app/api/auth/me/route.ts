import { auth, authConfig } from "@/lib/auth";
import { getSessionFromRequest } from "@codex-reusable/oauth-email-code-login/next";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSessionFromRequest({ request, auth, config: authConfig });
  if (!session) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: session.user });
}
