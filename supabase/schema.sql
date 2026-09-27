-- Execute no SQL Editor do projeto Supabase antes de ativar o MedStudy.
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mp_preapproval_id text unique,
  mp_preference_id text,
  mp_payment_id text,
  mp_external_reference text,
  plan_id text not null default 'monthly',
  status text not null,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions add column if not exists mp_preapproval_id text;
alter table public.user_subscriptions add column if not exists mp_preference_id text;
alter table public.user_subscriptions add column if not exists mp_payment_id text;
alter table public.user_subscriptions add column if not exists mp_external_reference text;
alter table public.user_subscriptions add column if not exists plan_id text not null default 'monthly';
alter table public.user_subscriptions alter column current_period_end drop not null;
alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;
drop policy if exists "Users can read their own subscription" on public.user_subscriptions;
create policy "Users can read their own subscription"
  on public.user_subscriptions for select
  to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medstudy-private',
  'medstudy-private',
  false,
  5368709120,
  array['application/pdf','video/mp4','video/webm','video/quicktime','video/x-matroska','video/mpeg','audio/mpeg','audio/mp4','audio/wav','application/zip']
)
on conflict (id) do update set public = false, file_size_limit = 5368709120;
-- Uploads/listagem/links passam pela API do MedStudy com checagem de sessão e assinatura.
-- Não crie políticas Storage públicas para este bucket.
