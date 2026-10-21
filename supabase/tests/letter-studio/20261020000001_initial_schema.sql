-- Recommendation Letter Studio — initial schema
-- Every user-owned table carries user_id and is protected by Row Level Security so that an
-- authenticated user can only read and write their own records. Child rows additionally
-- verify that the parent rows they reference belong to the same user.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  applicant_legal_name text,
  default_timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Recommenders
-- ---------------------------------------------------------------------------

create table public.recommenders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  professional_title text,
  organisation text,
  email text,
  relationship_type text not null default 'lecturer' check (relationship_type in (
    'lecturer', 'capstone_supervisor', 'research_supervisor', 'learning_coach',
    'manager', 'internship_supervisor', 'professional_mentor', 'other'
  )),
  relationship_description text,
  shared_context text,
  interaction_period text,
  interaction_frequency text,
  assessable_areas text[] not null default '{}',
  observed_work text,
  notes text,
  preferred_turnaround text,
  submission_instructions text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recommenders_user_idx on public.recommenders (user_id, archived_at);

-- ---------------------------------------------------------------------------
-- Programmes / opportunities
-- ---------------------------------------------------------------------------

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution text not null check (char_length(institution) between 1 and 300),
  programme_name text not null check (char_length(programme_name) between 1 and 300),
  opportunity_type text not null default 'degree' check (opportunity_type in ('degree', 'scholarship', 'job', 'fellowship', 'other')),
  degree_level text,
  funding_scheme text,
  official_url text,
  application_deadline timestamptz,
  deadline_timezone text,
  selection_criteria text,
  referee_questions text[] not null default '{}',
  recommended_length text,
  submission_requirements text,
  personal_statement text,
  research_proposal text,
  -- Set only when the user confirms they checked the official source themselves.
  criteria_source_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programmes_user_idx on public.programmes (user_id, application_deadline);

-- ---------------------------------------------------------------------------
-- Evidence library
-- ---------------------------------------------------------------------------

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  category text not null check (category in (
    'academic_work', 'research', 'product_development', 'technical_work', 'leadership',
    'community_impact', 'professional_experience', 'awards', 'personal_development'
  )),
  description text,
  period text,
  role text,
  individual_contribution text,
  problem text,
  decisions text,
  outcome text,
  quantified_impact text,
  supporting_url text,
  file_path text,
  file_name text,
  information_source text,
  -- user_supplied: facts I supplied; document_supported: backed by a document;
  -- needs_verification: claim needing verification; recommender_confirmed: confirmed by a recommender.
  verification_status text not null default 'user_supplied' check (verification_status in (
    'user_supplied', 'document_supported', 'needs_verification', 'recommender_confirmed'
  )),
  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(individual_contribution, '') || ' ' || coalesce(outcome, '') || ' ' ||
      coalesce(problem, '') || ' ' || coalesce(role, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_user_idx on public.evidence (user_id, category);
create index evidence_search_idx on public.evidence using gin (search_vector);

-- Which recommenders personally observed or can verify a piece of evidence.
create table public.evidence_observers (
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  recommender_id uuid not null references public.recommenders (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  observation_note text,
  created_at timestamptz not null default now(),
  primary key (evidence_id, recommender_id)
);

create index evidence_observers_recommender_idx on public.evidence_observers (recommender_id);

-- ---------------------------------------------------------------------------
-- Recommendation requests
-- ---------------------------------------------------------------------------

create table public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recommender_id uuid references public.recommenders (id) on delete set null,
  programme_id uuid references public.programmes (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  status text not null default 'information_gathering' check (status in (
    'information_gathering', 'ready_to_generate', 'draft_in_progress',
    'awaiting_recommender_review', 'revisions_requested', 'approved', 'submitted'
  )),
  review_deadline date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requests_user_idx on public.recommendation_requests (user_id, status);
create index requests_recommender_idx on public.recommendation_requests (recommender_id);
create index requests_programme_idx on public.recommendation_requests (programme_id);

-- Status history for review and submission tracking.
create table public.request_status_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.recommendation_requests (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index status_events_request_idx on public.request_status_events (request_id, created_at desc);

-- One row per intake section (A–F); data is validated by the application.
create table public.intake_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.recommendation_requests (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in ('A', 'B', 'C', 'D', 'E', 'F')),
  data jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, section)
);

-- Evidence selected for a request, optionally tied to a strength the letter should show.
create table public.request_evidence (
  request_id uuid not null references public.recommendation_requests (id) on delete cascade,
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strength_label text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (request_id, evidence_id)
);

create index request_evidence_evidence_idx on public.request_evidence (evidence_id);

-- ---------------------------------------------------------------------------
-- Letters, versions and generation metadata
-- ---------------------------------------------------------------------------

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_id uuid not null references public.recommendation_requests (id) on delete cascade,
  title text not null default 'Recommendation letter draft',
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  plain_text text not null default '',
  word_count integer not null default 0,
  -- Incremented on every save; used to detect conflicting writes from stale tabs.
  revision integer not null default 1,
  last_autosaved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index letters_user_idx on public.letters (user_id, updated_at desc);
create index letters_request_idx on public.letters (request_id);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_id uuid references public.recommendation_requests (id) on delete cascade,
  letter_id uuid references public.letters (id) on delete set null,
  kind text not null check (kind in ('letter', 'rewrite', 'review')),
  action text,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  model text not null,
  settings jsonb not null default '{}'::jsonb,
  source_evidence_ids uuid[] not null default '{}',
  prompt_version text not null,
  input_digest text,
  usage jsonb,
  stop_reason text,
  output_flags jsonb,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index generations_user_recent_idx on public.generations (user_id, created_at desc);
create index generations_request_idx on public.generations (request_id, created_at desc);

create table public.letter_versions (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version_number integer not null default 0,
  content jsonb not null,
  plain_text text not null default '',
  word_count integer not null default 0,
  source text not null check (source in ('generation', 'manual_save', 'ai_rewrite', 'restore', 'pre_restore')),
  label text,
  generation_id uuid references public.generations (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (letter_id, version_number)
);

create index letter_versions_letter_idx on public.letter_versions (letter_id, version_number desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger recommenders_updated_at before update on public.recommenders for each row execute function public.set_updated_at();
create trigger programmes_updated_at before update on public.programmes for each row execute function public.set_updated_at();
create trigger evidence_updated_at before update on public.evidence for each row execute function public.set_updated_at();
create trigger requests_updated_at before update on public.recommendation_requests for each row execute function public.set_updated_at();
create trigger intake_updated_at before update on public.intake_responses for each row execute function public.set_updated_at();
create trigger letters_updated_at before update on public.letters for each row execute function public.set_updated_at();

-- Version numbers are assigned in the database so concurrent saves cannot collide.
create or replace function public.assign_letter_version_number()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.letters where id = new.letter_id for update;
  select coalesce(max(version_number), 0) + 1 into new.version_number
  from public.letter_versions where letter_id = new.letter_id;
  return new;
end;
$$;

create trigger letter_versions_number before insert on public.letter_versions
  for each row execute function public.assign_letter_version_number();

-- ---------------------------------------------------------------------------
-- Ownership helpers used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.owns_request(rid uuid)
returns boolean language sql stable security invoker as $$
  select exists (select 1 from public.recommendation_requests r where r.id = rid and r.user_id = auth.uid());
$$;

create or replace function public.owns_recommender(rid uuid)
returns boolean language sql stable security invoker as $$
  select rid is null or exists (select 1 from public.recommenders r where r.id = rid and r.user_id = auth.uid());
$$;

create or replace function public.owns_programme(pid uuid)
returns boolean language sql stable security invoker as $$
  select pid is null or exists (select 1 from public.programmes p where p.id = pid and p.user_id = auth.uid());
$$;

create or replace function public.owns_evidence(eid uuid)
returns boolean language sql stable security invoker as $$
  select exists (select 1 from public.evidence e where e.id = eid and e.user_id = auth.uid());
$$;

create or replace function public.owns_letter(lid uuid)
returns boolean language sql stable security invoker as $$
  select lid is null or exists (select 1 from public.letters l where l.id = lid and l.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.recommenders enable row level security;
alter table public.programmes enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_observers enable row level security;
alter table public.recommendation_requests enable row level security;
alter table public.request_status_events enable row level security;
alter table public.intake_responses enable row level security;
alter table public.request_evidence enable row level security;
alter table public.letters enable row level security;
alter table public.generations enable row level security;
alter table public.letter_versions enable row level security;

create policy "profiles: own row" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "recommenders: own rows" on public.recommenders
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "programmes: own rows" on public.programmes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "evidence: own rows" on public.evidence
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "evidence_observers: own rows" on public.evidence_observers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_evidence(evidence_id) and public.owns_recommender(recommender_id));

create policy "requests: own rows" on public.recommendation_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_recommender(recommender_id) and public.owns_programme(programme_id));

create policy "status_events: own rows" on public.request_status_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_request(request_id));

create policy "intake: own rows" on public.intake_responses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_request(request_id));

create policy "request_evidence: own rows" on public.request_evidence
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_request(request_id) and public.owns_evidence(evidence_id));

create policy "letters: own rows" on public.letters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_request(request_id));

create policy "generations: own rows" on public.generations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (request_id is null or public.owns_request(request_id)) and public.owns_letter(letter_id));

create policy "letter_versions: own rows" on public.letter_versions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_letter(letter_id));

-- ---------------------------------------------------------------------------
-- Account deletion: lets a signed-in user delete their own auth account
-- (all owned rows cascade). Runs with definer rights but only ever touches auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
