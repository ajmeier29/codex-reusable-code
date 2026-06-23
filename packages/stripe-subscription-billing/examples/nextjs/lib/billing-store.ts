import type { StripeBillingStore } from "@codex-reusable/stripe-subscription-billing";

export const stripeBillingStore: StripeBillingStore = {
  async getBillingSettings() {
    throw new Error("Implement getBillingSettings with your database.");
  },
  async upsertBillingSettings() {
    throw new Error("Implement upsertBillingSettings with your database.");
  },
  async getLatestStripeCustomerIdForUser() {
    throw new Error("Implement getLatestStripeCustomerIdForUser with your database.");
  },
  async getSubscriptionByStripeSubscriptionId() {
    throw new Error("Implement getSubscriptionByStripeSubscriptionId with your database.");
  },
  async getSubscriptionByUserAndCustomer() {
    throw new Error("Implement getSubscriptionByUserAndCustomer with your database.");
  },
  async listStripeSubscriptionsForUser() {
    throw new Error("Implement listStripeSubscriptionsForUser with your database.");
  },
  async upsertSubscription() {
    throw new Error("Implement upsertSubscription with your database.");
  },
  async patchSubscriptionMetadata() {
    throw new Error("Implement patchSubscriptionMetadata with your database.");
  },
  async findUserIdByStripeCustomerId() {
    throw new Error("Implement findUserIdByStripeCustomerId with your database.");
  },
  async findSubscriptionForSchedule() {
    throw new Error("Implement findSubscriptionForSchedule with your database.");
  },
  async updateUserPlan() {
    throw new Error("Implement updateUserPlan with your database.");
  },
  async getBillingRecipient() {
    throw new Error("Implement getBillingRecipient with your database.");
  },
  async upsertFailureTicket() {
    throw new Error("Implement upsertFailureTicket with your database.");
  },
  async listFailureTickets() {
    throw new Error("Implement listFailureTickets with your database.");
  },
  async countOpenFailureTickets() {
    throw new Error("Implement countOpenFailureTickets with your database.");
  },
};
