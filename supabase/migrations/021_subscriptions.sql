-- Stripe billing subscriptions per organization
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'trial',
  status text not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  setup_fee_paid boolean not null default false,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_org on public.subscriptions;
create policy subscriptions_select_org on public.subscriptions
  for select using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

create index if not exists idx_subscriptions_organization_id on public.subscriptions (organization_id);
create index if not exists idx_subscriptions_stripe_subscription_id on public.subscriptions (stripe_subscription_id);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions (stripe_customer_id);
