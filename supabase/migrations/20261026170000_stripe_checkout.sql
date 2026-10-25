-- Pro via Stripe Checkout: NZ$7.99/month or NZ$49.99/year, 30-day trial with no card.
-- NOT APPLIED ANYWHERE (prototype schema, like the others).
-- Trial end with no card: Stripe cancels the subscription (trial_settings.end_behavior.missing_payment_method
-- = 'cancel'), customer.subscription.deleted arrives, and the webhook sets profiles.plan = 'free'.
-- The webhook (service role) upserts subscriptions by user_id (subscription_data.metadata.user_id /
-- Checkout client_reference_id) and writes profiles.plan + trial_ends_at:
--   trialing -> 'trial' (trial_ends_at = trial_end), active/past_due -> 'pro' or 'pro_annual', else 'free'.
alter table public.subscriptions
  add column if not exists trial_end             timestamptz,
  add column if not exists latest_invoice_id     text,
  add column if not exists latest_invoice_status text check (latest_invoice_status in ('paid','payment_failed'));
comment on column public.subscriptions.trial_end is 'Stripe subscription.trial_end. Webhook only.';
comment on column public.subscriptions.latest_invoice_status is 'From invoice.paid / invoice.payment_failed. Webhook only.';
-- RLS unchanged: users read their own row ("own sub read"); only the service role writes.
