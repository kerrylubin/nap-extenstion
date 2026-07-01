-- Run this entire file in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run

-- ─────────────────────────────────────────────
-- Profiles (one row per auth user, auto-created)
-- ─────────────────────────────────────────────
create table public.profiles (
  id                    uuid references auth.users on delete cascade primary key,
  email                 text,
  name                  text,
  avatar_url            text,
  master_email_template text,
  updated_at            timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- CVs
-- ─────────────────────────────────────────────
create table public.cvs (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.profiles on delete cascade not null,
  language     text not null,        -- 'nl', 'en', 'fr', etc.
  filename     text not null,
  storage_path text not null,        -- path inside the 'cvs' bucket
  is_primary   boolean default false,
  created_at   timestamptz default now()
);

alter table public.cvs enable row level security;
create policy "Users can manage own CVs" on public.cvs for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Applications
-- ─────────────────────────────────────────────
create table public.applications (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references public.profiles on delete cascade not null,
  job_title        text,
  company          text,
  job_url          text,
  job_description  text,
  recruiter_email  text,
  contact_name     text,
  language         text default 'nl',
  match_score      integer,
  status           text default 'liked',
  email_body       text,
  letter_path      text,
  letter_base64    text,
  email_sent_date  timestamptz,
  interview_date   timestamptz,
  follow_up_date   timestamptz,
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.applications enable row level security;
create policy "Users can manage own applications" on public.applications for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Storage bucket for CVs (private)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false)
  on conflict do nothing;

create policy "Users can upload own CVs"
  on storage.objects for insert
  with check (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own CVs"
  on storage.objects for select
  using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own CVs"
  on storage.objects for delete
  using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);
