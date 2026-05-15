-- Run this once in Supabase SQL Editor.
-- It stores app money settings in Supabase so PC/mobile use the same values.

create table if not exists public.asset_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.asset_settings enable row level security;

drop policy if exists "asset_settings_select_all" on public.asset_settings;
drop policy if exists "asset_settings_insert_all" on public.asset_settings;
drop policy if exists "asset_settings_update_all" on public.asset_settings;

create policy "asset_settings_select_all"
on public.asset_settings
for select
using (true);

create policy "asset_settings_insert_all"
on public.asset_settings
for insert
with check (true);

create policy "asset_settings_update_all"
on public.asset_settings
for update
using (true)
with check (true);

-- Used keys:
-- asset_state           : 시작자산, 이번달 수입상세, 월별 기타보유금
-- dashboard_budget_map  : 월별 예산
