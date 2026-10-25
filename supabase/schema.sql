-- Run this whole file in Supabase Dashboard > SQL Editor.
-- Uses authenticated-user ownership and RLS for every user-owned record.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  notifications_enabled boolean not null default false,
  reminder_minutes integer not null default 1440 check (reminder_minutes in (10, 30, 60, 1440)),
  created_at timestamptz not null default now()
);

create table if not exists public.portions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  notes text not null default '',
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  exam_at timestamptz not null,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  studied_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.portions enable row level security;
alter table public.exams enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Users manage own portions" on public.portions;
create policy "Users manage own portions" on public.portions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage own exams" on public.exams;
create policy "Users manage own exams" on public.exams for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage own sessions" on public.study_sessions;
create policy "Users manage own sessions" on public.study_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists portions_user_id_idx on public.portions(user_id);
create index if not exists exams_user_id_exam_at_idx on public.exams(user_id, exam_at);
create index if not exists study_sessions_user_id_studied_at_idx on public.study_sessions(user_id, studied_at);