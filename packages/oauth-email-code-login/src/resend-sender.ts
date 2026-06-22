import { emailCodeHtml, emailCodeSubject, emailCodeText } from "./email-template.js";
import type { EmailCodeMessage, EmailCodeSender } from "./types.js";

export interface ResendEmailCodeSenderOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export function createResendEmailCodeSender(options: ResendEmailCodeSenderOptions): EmailCodeSender {
  if (!options.apiKey.trim()) throw new Error("Resend apiKey is required.");
  if (!options.from.trim()) throw new Error("Resend from address is required.");

  return {
    async sendEmailCode(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: options.from,
          to: message.to,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          subject: emailCodeSubject(message.appName, message.intent),
          text: emailCodeText(message),
          html: emailCodeHtml(message)
        })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Resend email-code delivery failed with ${response.status}: ${body.slice(0, 500)}`);
      }
    }
  };
}
