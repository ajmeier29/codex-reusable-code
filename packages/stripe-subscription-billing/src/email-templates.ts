import type { BillingEmail } from "./types.js";

type SubscriptionEmailInput = {
  brandName: string;
  to: string;
  planLabel: string;
  accessEndsAt?: Date | null;
  dashboardUrl?: string;
  supportEmail?: string;
};

export function billingConfirmationEmail(input: SubscriptionEmailInput): BillingEmail {
  const subject = `${input.brandName} membership confirmed`;
  const accessLine = input.accessEndsAt
    ? `Your current billing period runs through ${formatDate(input.accessEndsAt)}.`
    : "Your membership is active.";

  return buildEmail(input, {
    subject,
    title: "Membership confirmed",
    body: [
      `Your ${input.planLabel} membership is active.`,
      accessLine,
      "You can manage billing from your account at any time.",
    ],
  });
}

export function membershipCancellationEmail(input: SubscriptionEmailInput & { accessEndsAt: Date }): BillingEmail {
  return buildEmail(input, {
    subject: `${input.brandName} membership cancellation confirmed`,
    title: "Cancellation confirmed",
    body: [
      `Your ${input.planLabel} membership has been canceled.`,
      `You will keep access through ${formatDate(input.accessEndsAt)}.`,
      "You will not be billed again unless you reactivate your membership.",
    ],
  });
}

export function membershipReactivatedEmail(input: SubscriptionEmailInput): BillingEmail {
  return buildEmail(input, {
    subject: `${input.brandName} membership reactivated`,
    title: "Membership reactivated",
    body: [
      `Your ${input.planLabel} membership is active again.`,
      "Your subscription will continue on its normal billing schedule.",
    ],
  });
}

export function membershipAccessEndedEmail(input: SubscriptionEmailInput & { accessEndsAt: Date }): BillingEmail {
  return buildEmail(input, {
    subject: `${input.brandName} membership access ended`,
    title: "Membership access ended",
    body: [
      `Your ${input.planLabel} membership access ended on ${formatDate(input.accessEndsAt)}.`,
      "Thank you for being a customer.",
    ],
  });
}

function buildEmail(
  input: SubscriptionEmailInput,
  content: { subject: string; title: string; body: string[] },
): BillingEmail {
  const dashboardLine = input.dashboardUrl ? `\n\nManage your account: ${input.dashboardUrl}` : "";
  const supportLine = input.supportEmail ? `\n\nQuestions? Contact ${input.supportEmail}.` : "";
  const text = `${content.title}\n\n${content.body.join("\n\n")}${dashboardLine}${supportLine}`;
  const html = [
    `<h1>${escapeHtml(content.title)}</h1>`,
    ...content.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    input.dashboardUrl ? `<p><a href="${escapeAttribute(input.dashboardUrl)}">Manage your account</a></p>` : "",
    input.supportEmail ? `<p>Questions? Contact ${escapeHtml(input.supportEmail)}.</p>` : "",
  ].join("");

  return {
    to: input.to,
    subject: content.subject,
    text,
    html,
  };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
