import type { EmailLoginIntent } from "./types.js";

export function emailCodeSubject(appName: string, intent: EmailLoginIntent) {
  if (intent === "signup") return `Your ${appName} sign-up code`;
  if (intent === "email_change") return `Confirm your ${appName} email change`;
  return `Your ${appName} sign-in code`;
}

export function emailCodeText(input: { appName: string; code: string; intent: EmailLoginIntent; expiresInMinutes: number }) {
  const action = input.intent === "signup" ? "create your account" : input.intent === "email_change" ? "confirm this email change" : "sign in";
  return [
    input.appName,
    "",
    `Use this code to ${action}:`,
    "",
    input.code,
    "",
    `This code expires in ${input.expiresInMinutes} minutes.`,
    "",
    "If you did not request this code, you can ignore this email."
  ].join("\n");
}

export function emailCodeHtml(input: { appName: string; code: string; intent: EmailLoginIntent; expiresInMinutes: number }) {
  const action = input.intent === "signup" ? "create your account" : input.intent === "email_change" ? "confirm this email change" : "sign in";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#080b13;color:#f8fafc;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080b13;padding:32px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#101827;border:1px solid #26334a;border-radius:18px;padding:28px;">
            <tr>
              <td>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:32px;color:#ffffff;">${escapeHtml(input.appName)}</h1>
                <p style="margin:0 0 20px;color:#b7c3d7;font-size:15px;line-height:24px;">Use this code to ${escapeHtml(action)}.</p>
                <div style="font-size:36px;letter-spacing:10px;font-weight:700;color:#ffffff;background:#07101f;border:1px solid #2d3b54;border-radius:14px;padding:18px 20px;text-align:center;">${escapeHtml(input.code)}</div>
                <p style="margin:20px 0 0;color:#b7c3d7;font-size:14px;line-height:22px;">This code expires in ${input.expiresInMinutes} minutes. If you did not request this code, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
