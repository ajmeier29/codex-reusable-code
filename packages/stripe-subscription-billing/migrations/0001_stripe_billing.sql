create table if not exists stripe_billing_settings (
  id integer primary key default 1 check (id = 1),
  checkout_enabled boolean not null default false,
  customer_portal_enabled boolean not null default false,
  allow_promotion_codes boolean not null default true,
  success_path text not null default '/dashboard',
  cancel_path text not null default '/pricing',
  billing_path text not null default '/pricing',
  price_overrides jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  platform text not null default 'stripe',
  stripe_customer_id text not null,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_product_id text,
  plan text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stripe_subscriptions_subscription_uidx
  on stripe_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists stripe_subscriptions_user_idx
  on stripe_subscriptions (user_id, updated_at desc);

create index if not exists stripe_subscriptions_customer_idx
  on stripe_subscriptions (stripe_customer_id);

create table if not exists stripe_failure_tickets (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  event_id text,
  event_type text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  amount_due_cents integer,
  currency text,
  failure_code text,
  failure_message text,
  status text not null default 'open',
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists stripe_failure_tickets_status_idx
  on stripe_failure_tickets (status, last_seen_at desc);
