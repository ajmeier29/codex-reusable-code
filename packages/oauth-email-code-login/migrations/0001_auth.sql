create table if not exists auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_hash text not null unique,
  name text,
  email_verified_at timestamptz,
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  accepted_risk_disclosure_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx on auth_sessions(user_id);
create index if not exists auth_sessions_expires_at_idx on auth_sessions(expires_at);

create table if not exists auth_email_codes (
  id uuid primary key,
  email text not null,
  email_hash text not null,
  code_hash text not null,
  intent text not null,
  name text,
  legal_accepted boolean not null default false,
  next_path text not null default '/dashboard',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  delivery_status text not null default 'pending',
  delivery_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_email_codes_lookup_idx on auth_email_codes(email_hash, intent, created_at desc);
create index if not exists auth_email_codes_expiry_idx on auth_email_codes(expires_at);

create table if not exists auth_oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  provider_account_id_hash text not null,
  email text,
  email_hash text,
  name text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id_hash)
);

create index if not exists auth_oauth_accounts_user_id_idx on auth_oauth_accounts(user_id);
