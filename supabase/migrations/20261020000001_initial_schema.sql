-- Essay Studio — initial schema
-- All Essay Studio objects live in their own "essay" schema so the app can share a Supabase
-- project (and its user accounts) with Recommendation Letter Studio, whose tables live in
-- "public", without any name collisions. Nothing in "public" is created or changed here.
-- Every user-owned table carries user_id and is protected by Row Level Security, so an
-- authenticated user can only read and write their own records. Insert/update policies on
-- child and link tables additionally verify that every referenced row belongs to the same
-- user, so nobody can attach another user's records to their own.

create schema if not exists essay;
grant usage on schema essay to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function essay.set_updated_at()
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

create table essay.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 200),
  full_name text check (char_length(full_name) <= 200),
  -- Default writing preferences, copied into each new application (tone, formality, voice…).
  writing_preferences jsonb not null default '{}'::jsonb,
  -- Default export settings (font, size, margins, spacing, page numbers).
  export_settings jsonb not null default '{}'::jsonb,
  -- AI features can be switched off entirely; nothing is then sent to the AI provider.
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function essay.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = essay
as $$
begin
  insert into essay.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger essay_on_auth_user_created
  after insert on auth.users
  for each row execute function essay.handle_new_user();

-- Accounts that already exist (e.g. created in Letter Studio) get an Essay Studio profile too.
insert into essay.profiles (id) select id from auth.users on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table essay.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  institution text not null default '' check (char_length(institution) <= 300),
  programme text not null default '' check (char_length(programme) <= 300),
  category text not null default 'masters_admission' check (category in (
    'undergraduate_admission', 'masters_admission', 'phd_admission', 'scholarship',
    'fellowship', 'research_programme', 'leadership_programme', 'other'
  )),
  country text check (char_length(country) <= 120),
  official_url text check (char_length(official_url) <= 2000),
  deadline timestamptz,
  course_description text check (char_length(course_description) <= 30000),
  reason_for_applying text check (char_length(reason_for_applying) <= 10000),
  selection_criteria text check (char_length(selection_criteria) <= 30000),
  official_instructions text check (char_length(official_instructions) <= 30000),
  -- Tone, formality, style, themes, experiences, topics to avoid, voice, extra instructions.
  writing_preferences jsonb not null default '{}'::jsonb,
  notes text check (char_length(notes) <= 30000),
  -- Wizard progress: the last step reached (1–4); setup_completed_at is set on finish.
  setup_step smallint not null default 1 check (setup_step between 1 and 4),
  setup_completed_at timestamptz,
  submitted_at timestamptz,
  archived_at timestamptz,
  duplicated_from uuid references essay.applications (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_idx on essay.applications (user_id, archived_at, deadline);

-- Checklist requirements and milestones for an application.
create table essay.application_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references essay.applications (id) on delete cascade,
  kind text not null default 'requirement' check (kind in ('requirement', 'milestone')),
  title text not null check (char_length(title) between 1 and 500),
  details text check (char_length(details) <= 5000),
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index application_requirements_app_idx on essay.application_requirements (application_id, position);

-- ---------------------------------------------------------------------------
-- Supporting documents (files in private storage + extracted text)
-- ---------------------------------------------------------------------------

create table essay.supporting_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Null for library documents not tied to one application (e.g. a CV reused everywhere).
  application_id uuid references essay.applications (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  doc_type text not null default 'other' check (doc_type in (
    'cv', 'research_proposal', 'transcript', 'certificate', 'programme_description',
    'scholarship_guidance', 'previous_statement', 'project_documentation',
    'official_instructions', 'other'
  )),
  file_path text check (char_length(file_path) <= 500),
  file_name text check (char_length(file_name) <= 300),
  mime_type text,
  size_bytes integer check (size_bytes >= 0),
  content_sha256 text,
  extraction_status text not null default 'pending' check (extraction_status in (
    'pending', 'extracted', 'needs_ocr', 'unsupported', 'failed'
  )),
  extraction_error text,
  extracted_text text check (char_length(extracted_text) <= 400000),
  page_count integer,
  word_count integer not null default 0,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supporting_documents_user_idx on essay.supporting_documents (user_id, created_at desc);
create index supporting_documents_app_idx on essay.supporting_documents (application_id);

-- ---------------------------------------------------------------------------
-- Personal profile evidence
-- ---------------------------------------------------------------------------

create table essay.personal_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in (
    'background', 'education', 'academic_achievement', 'work_experience', 'leadership',
    'volunteering', 'projects_research', 'awards', 'skills', 'challenges',
    'career_goals', 'long_term_ambitions', 'impact_goals', 'motivations'
  )),
  title text not null check (char_length(title) between 1 and 300),
  details text check (char_length(details) <= 20000),
  organisation text check (char_length(organisation) <= 300),
  period text check (char_length(period) <= 200),
  classification text not null default 'unverified' check (classification in (
    'verified_fact', 'personal_reflection', 'quantified_achievement', 'goal_aspiration', 'unverified'
  )),
  -- Where the fact comes from (e.g. "Transcript 2024", "Employer letter").
  source text check (char_length(source) <= 1000),
  source_document_id uuid references essay.supporting_documents (id) on delete set null,
  position integer not null default 0,
  archived_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(details, '') || ' ' || coalesce(organisation, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_evidence_user_idx on essay.personal_evidence (user_id, section, position);
create index personal_evidence_search_idx on essay.personal_evidence using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Story bank
-- ---------------------------------------------------------------------------

create table essay.story_bank_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  context text check (char_length(context) <= 10000),
  challenge text check (char_length(challenge) <= 10000),
  actions text check (char_length(actions) <= 10000),
  outcome text check (char_length(outcome) <= 10000),
  measurable_impact text check (char_length(measurable_impact) <= 5000),
  lessons text check (char_length(lessons) <= 10000),
  motivation text check (char_length(motivation) <= 10000),
  skills text[] not null default '{}',
  related_criteria text[] not null default '{}',
  supporting_evidence text check (char_length(supporting_evidence) <= 5000),
  tags text[] not null default '{}',
  period text check (char_length(period) <= 200),
  verification_status text not null default 'self_reported' check (verification_status in (
    'verified', 'self_reported', 'needs_confirmation'
  )),
  -- Where an imported story came from, e.g. "letter-studio:evidence:<id>". Copies, never live links.
  source_ref text check (char_length(source_ref) <= 200),
  archived_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(context, '') || ' ' || coalesce(challenge, '') || ' ' ||
      coalesce(actions, '') || ' ' || coalesce(outcome, '') || ' ' || coalesce(lessons, '') || ' ' ||
      coalesce(motivation, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index story_bank_user_idx on essay.story_bank_items (user_id, archived_at, updated_at desc);
create index story_bank_search_idx on essay.story_bank_items using gin (search_vector);
create index story_bank_tags_idx on essay.story_bank_items using gin (tags);
create unique index story_bank_source_ref_uq on essay.story_bank_items (user_id, source_ref) where source_ref is not null;

-- ---------------------------------------------------------------------------
-- Exemplar library
-- ---------------------------------------------------------------------------

create table essay.exemplars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  essay_category text not null default 'custom' check (essay_category in (
    'statement_of_purpose', 'personal_statement', 'motivation_letter', 'scholarship_essay',
    'development_impact', 'leadership_essay', 'career_goals', 'fellowship_application',
    'research_statement', 'research_proposal', 'study_plan', 'short_answer', 'custom'
  )),
  institution text check (char_length(institution) <= 300),
  programme text check (char_length(programme) <= 300),
  author_attribution text check (char_length(author_attribution) <= 300),
  original_prompt text check (char_length(original_prompt) <= 10000),
  original_word_limit integer check (original_word_limit between 1 and 100000),
  application_year integer check (application_year between 1900 and 2100),
  source_url text check (char_length(source_url) <= 2000),
  -- Never inferred from the upload itself: the user states what they know.
  provenance text not null default 'unknown' check (provenance in (
    'official_sample', 'uploader_reported', 'independently_verified', 'unknown'
  )),
  notes text check (char_length(notes) <= 10000),
  tags text[] not null default '{}',
  file_path text check (char_length(file_path) <= 500),
  file_name text check (char_length(file_name) <= 300),
  mime_type text,
  size_bytes integer,
  -- The essay text (extracted or pasted). Read-only once analysed; edits create a new hash.
  source_text text not null default '' check (char_length(source_text) <= 200000),
  source_hash text,
  word_count integer not null default 0,
  extraction_status text not null default 'pending' check (extraction_status in (
    'pending', 'extracted', 'needs_ocr', 'unsupported', 'failed'
  )),
  extraction_error text,
  -- The user confirmed they may use this material and removed third-party personal data.
  permission_confirmed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exemplars_user_idx on essay.exemplars (user_id, archived_at, updated_at desc);
create index exemplars_tags_idx on essay.exemplars using gin (tags);

create table essay.exemplar_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exemplar_id uuid not null references essay.exemplars (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed')),
  -- Cache key: an analysis belongs to exactly one version of the source text and one spec.
  source_hash text not null,
  spec_version text not null,
  prompt_version text not null,
  model text,
  report jsonb,
  error_message text,
  job_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index exemplar_analyses_exemplar_idx on essay.exemplar_analyses (exemplar_id, created_at desc);
-- At most one analysis in progress per exemplar (prevents duplicate, billed processing).
create unique index exemplar_analyses_one_active on essay.exemplar_analyses (exemplar_id)
  where status in ('queued', 'running');

create table essay.exemplar_application_links (
  exemplar_id uuid not null references essay.exemplars (id) on delete cascade,
  application_id uuid not null references essay.applications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (exemplar_id, application_id)
);

create index exemplar_application_links_app_idx on essay.exemplar_application_links (application_id);

-- ---------------------------------------------------------------------------
-- Essays and versions
-- ---------------------------------------------------------------------------

create table essay.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references essay.applications (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  essay_type text not null default 'personal_statement' check (essay_type in (
    'statement_of_purpose', 'personal_statement', 'motivation_letter', 'scholarship_essay',
    'development_impact', 'leadership_essay', 'career_goals', 'fellowship_application',
    'research_statement', 'research_proposal', 'study_plan', 'short_answer', 'custom'
  )),
  -- The exact official wording; never rewritten by the app.
  prompt text not null default '' check (char_length(prompt) <= 20000),
  min_words integer check (min_words between 0 and 100000),
  max_words integer check (max_words between 1 and 100000),
  required_themes text[] not null default '{}',
  selection_criteria text check (char_length(selection_criteria) <= 20000),
  required_format text check (char_length(required_format) <= 5000),
  instructions text check (char_length(instructions) <= 20000),
  restrictions text check (char_length(restrictions) <= 5000),
  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'needs_review', 'ready_to_submit', 'submitted'
  )),
  position integer not null default 0,
  -- Current working draft (TipTap JSON) with optimistic-concurrency revision.
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  plain_text text not null default '',
  word_count integer not null default 0,
  revision integer not null default 1,
  last_autosaved_at timestamptz,
  -- Staged-workflow state. Each is validated by the application before it is stored.
  prompt_analysis jsonb,
  gap_questions jsonb not null default '[]'::jsonb,
  outline jsonb,
  outline_status text not null default 'none' check (outline_status in ('none', 'draft', 'approved')),
  outline_approved_at timestamptz,
  blueprint jsonb,
  -- Exemplar guidance is opt-in per essay, and per aspect.
  use_exemplars boolean not null default false,
  exemplar_aspects text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_words is null or max_words is null or min_words <= max_words)
);

create index essays_user_idx on essay.essays (user_id, updated_at desc);
create index essays_application_idx on essay.essays (application_id, position);

create table essay.ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'prompt_analysis', 'gap_questions', 'evidence_recommendation', 'exemplar_analysis',
    'exemplar_comparison', 'blueprint', 'outline', 'draft', 'rewrite', 'critique', 'readiness_review'
  )),
  action text,
  essay_id uuid references essay.essays (id) on delete set null,
  exemplar_id uuid references essay.exemplars (id) on delete set null,
  application_id uuid references essay.applications (id) on delete set null,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  model text not null,
  prompt_version text not null,
  settings jsonb not null default '{}'::jsonb,
  -- Which stories, evidence, documents and exemplar lessons informed the output.
  source_refs jsonb not null default '{}'::jsonb,
  -- SHA-256 of the exact prompt; the prompt text itself is never stored.
  input_digest text,
  usage jsonb,
  stop_reason text,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index ai_jobs_user_recent_idx on essay.ai_generation_jobs (user_id, created_at desc);
create index ai_jobs_essay_idx on essay.ai_generation_jobs (essay_id, kind, created_at desc);

alter table essay.exemplar_analyses
  add constraint exemplar_analyses_job_fk foreign key (job_id) references essay.ai_generation_jobs (id) on delete set null;

create table essay.essay_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  essay_id uuid not null references essay.essays (id) on delete cascade,
  version_number integer not null default 0,
  -- The draft's name; renameable.
  title text not null default 'Draft' check (char_length(title) between 1 and 200),
  content jsonb not null,
  plain_text text not null default '',
  word_count integer not null default 0,
  source text not null check (source in (
    'manual', 'ai_draft', 'ai_revision', 'restore', 'pre_restore', 'pre_ai', 'duplicate'
  )),
  change_summary text check (char_length(change_summary) <= 2000),
  ai_job_id uuid references essay.ai_generation_jobs (id) on delete set null,
  evidence_refs jsonb not null default '{}'::jsonb,
  review_status text not null default 'unreviewed' check (review_status in (
    'unreviewed', 'needs_improvement', 'strong'
  )),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (essay_id, version_number)
);

create index essay_versions_essay_idx on essay.essay_versions (essay_id, version_number desc);

-- Stories, profile evidence and documents selected for an essay. Exactly one target per row.
create table essay.essay_evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  essay_id uuid not null references essay.essays (id) on delete cascade,
  story_id uuid references essay.story_bank_items (id) on delete cascade,
  evidence_id uuid references essay.personal_evidence (id) on delete cascade,
  document_id uuid references essay.supporting_documents (id) on delete cascade,
  note text check (char_length(note) <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (num_nonnulls(story_id, evidence_id, document_id) = 1)
);

create unique index essay_evidence_story_uq on essay.essay_evidence_links (essay_id, story_id) where story_id is not null;
create unique index essay_evidence_evidence_uq on essay.essay_evidence_links (essay_id, evidence_id) where evidence_id is not null;
create unique index essay_evidence_document_uq on essay.essay_evidence_links (essay_id, document_id) where document_id is not null;
create index essay_evidence_story_idx on essay.essay_evidence_links (story_id);

-- Exemplar lessons the user chose to apply. Content is copied so a reanalysis never
-- silently changes what a past draft was based on.
create table essay.exemplar_selected_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exemplar_id uuid not null references essay.exemplars (id) on delete cascade,
  analysis_id uuid references essay.exemplar_analyses (id) on delete set null,
  essay_id uuid references essay.essays (id) on delete cascade,
  application_id uuid references essay.applications (id) on delete cascade,
  aspect text not null check (aspect in (
    'structure', 'opening', 'evidence', 'narrative', 'tone', 'conclusion', 'lesson'
  )),
  lesson_key text not null check (char_length(lesson_key) <= 100),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (essay_id is not null or application_id is not null)
);

create unique index exemplar_lessons_essay_uq on essay.exemplar_selected_lessons (essay_id, exemplar_id, lesson_key) where essay_id is not null;
create index exemplar_lessons_exemplar_idx on essay.exemplar_selected_lessons (exemplar_id);

create table essay.essay_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  essay_id uuid not null references essay.essays (id) on delete cascade,
  kind text not null check (kind in ('checks', 'ai')),
  job_id uuid references essay.ai_generation_jobs (id) on delete set null,
  -- The draft revision and word count that were reviewed.
  essay_revision integer not null,
  word_count integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  dismissed_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index essay_reviews_essay_idx on essay.essay_reviews (essay_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at before update on essay.profiles for each row execute function essay.set_updated_at();
create trigger applications_updated_at before update on essay.applications for each row execute function essay.set_updated_at();
create trigger application_requirements_updated_at before update on essay.application_requirements for each row execute function essay.set_updated_at();
create trigger supporting_documents_updated_at before update on essay.supporting_documents for each row execute function essay.set_updated_at();
create trigger personal_evidence_updated_at before update on essay.personal_evidence for each row execute function essay.set_updated_at();
create trigger story_bank_updated_at before update on essay.story_bank_items for each row execute function essay.set_updated_at();
create trigger exemplars_updated_at before update on essay.exemplars for each row execute function essay.set_updated_at();
create trigger essays_updated_at before update on essay.essays for each row execute function essay.set_updated_at();
create trigger essay_versions_updated_at before update on essay.essay_versions for each row execute function essay.set_updated_at();
create trigger essay_reviews_updated_at before update on essay.essay_reviews for each row execute function essay.set_updated_at();

-- Version numbers are assigned in the database so concurrent saves cannot collide.
create or replace function essay.assign_essay_version_number()
returns trigger
language plpgsql
as $$
begin
  perform 1 from essay.essays where id = new.essay_id for update;
  select coalesce(max(version_number), 0) + 1 into new.version_number
  from essay.essay_versions where essay_id = new.essay_id;
  return new;
end;
$$;

create trigger essay_versions_number before insert on essay.essay_versions
  for each row execute function essay.assign_essay_version_number();

-- Saved versions are history: their content cannot be edited, only renamed, archived or relabelled.
create or replace function essay.protect_essay_version_content()
returns trigger
language plpgsql
as $$
begin
  if new.content is distinct from old.content
     or new.plain_text is distinct from old.plain_text
     or new.essay_id is distinct from old.essay_id
     or new.version_number is distinct from old.version_number
     or new.source is distinct from old.source then
    raise exception 'essay versions are immutable';
  end if;
  return new;
end;
$$;

create trigger essay_versions_immutable before update on essay.essay_versions
  for each row execute function essay.protect_essay_version_content();

-- A new exemplar text invalidates cached analyses: mark the exemplar's text hash.
create or replace function essay.exemplar_source_hash()
returns trigger
language plpgsql
as $$
begin
  new.source_hash = encode(sha256(convert_to(coalesce(new.source_text, ''), 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger exemplars_source_hash before insert or update of source_text on essay.exemplars
  for each row execute function essay.exemplar_source_hash();

-- ---------------------------------------------------------------------------
-- Ownership helpers used by RLS policies (security invoker: they see only the caller's rows)
-- ---------------------------------------------------------------------------

create or replace function essay.owns_application(aid uuid)
returns boolean language sql stable security invoker as $$
  select aid is null or exists (select 1 from essay.applications a where a.id = aid and a.user_id = auth.uid());
$$;

create or replace function essay.owns_essay(eid uuid)
returns boolean language sql stable security invoker as $$
  select eid is null or exists (select 1 from essay.essays e where e.id = eid and e.user_id = auth.uid());
$$;

create or replace function essay.owns_story(sid uuid)
returns boolean language sql stable security invoker as $$
  select sid is null or exists (select 1 from essay.story_bank_items s where s.id = sid and s.user_id = auth.uid());
$$;

create or replace function essay.owns_evidence(eid uuid)
returns boolean language sql stable security invoker as $$
  select eid is null or exists (select 1 from essay.personal_evidence e where e.id = eid and e.user_id = auth.uid());
$$;

create or replace function essay.owns_document(did uuid)
returns boolean language sql stable security invoker as $$
  select did is null or exists (select 1 from essay.supporting_documents d where d.id = did and d.user_id = auth.uid());
$$;

create or replace function essay.owns_exemplar(xid uuid)
returns boolean language sql stable security invoker as $$
  select xid is null or exists (select 1 from essay.exemplars x where x.id = xid and x.user_id = auth.uid());
$$;

create or replace function essay.owns_analysis(nid uuid)
returns boolean language sql stable security invoker as $$
  select nid is null or exists (select 1 from essay.exemplar_analyses n where n.id = nid and n.user_id = auth.uid());
$$;

create or replace function essay.owns_job(jid uuid)
returns boolean language sql stable security invoker as $$
  select jid is null or exists (select 1 from essay.ai_generation_jobs j where j.id = jid and j.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table essay.profiles enable row level security;
alter table essay.applications enable row level security;
alter table essay.application_requirements enable row level security;
alter table essay.supporting_documents enable row level security;
alter table essay.personal_evidence enable row level security;
alter table essay.story_bank_items enable row level security;
alter table essay.exemplars enable row level security;
alter table essay.exemplar_analyses enable row level security;
alter table essay.exemplar_application_links enable row level security;
alter table essay.exemplar_selected_lessons enable row level security;
alter table essay.essays enable row level security;
alter table essay.essay_versions enable row level security;
alter table essay.essay_evidence_links enable row level security;
alter table essay.ai_generation_jobs enable row level security;
alter table essay.essay_reviews enable row level security;

create policy "profiles: own row" on essay.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "applications: own rows" on essay.applications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_application(duplicated_from));

create policy "application_requirements: own rows" on essay.application_requirements
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_application(application_id));

create policy "supporting_documents: own rows" on essay.supporting_documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and essay.owns_application(application_id)
    and (file_path is null or split_part(file_path, '/', 1) = auth.uid()::text)
  );

create policy "personal_evidence: own rows" on essay.personal_evidence
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_document(source_document_id));

create policy "story_bank: own rows" on essay.story_bank_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "exemplars: own rows" on essay.exemplars
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (file_path is null or split_part(file_path, '/', 1) = auth.uid()::text));

create policy "exemplar_analyses: own rows" on essay.exemplar_analyses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_exemplar(exemplar_id) and essay.owns_job(job_id));

create policy "exemplar_application_links: own rows" on essay.exemplar_application_links
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_exemplar(exemplar_id) and essay.owns_application(application_id));

create policy "exemplar_selected_lessons: own rows" on essay.exemplar_selected_lessons
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and essay.owns_exemplar(exemplar_id) and essay.owns_analysis(analysis_id)
    and essay.owns_essay(essay_id) and essay.owns_application(application_id)
  );

create policy "essays: own rows" on essay.essays
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_application(application_id));

create policy "essay_versions: own rows" on essay.essay_versions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_essay(essay_id) and essay.owns_job(ai_job_id));

create policy "essay_evidence_links: own rows" on essay.essay_evidence_links
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and essay.owns_essay(essay_id) and essay.owns_story(story_id)
    and essay.owns_evidence(evidence_id) and essay.owns_document(document_id)
  );

create policy "ai_jobs: own rows" on essay.ai_generation_jobs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and essay.owns_essay(essay_id) and essay.owns_exemplar(exemplar_id)
    and essay.owns_application(application_id)
  );

create policy "essay_reviews: own rows" on essay.essay_reviews
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_essay(essay_id) and essay.owns_job(job_id));

-- ---------------------------------------------------------------------------
-- Account deletion: deletes the signed-in user's auth account. The account is shared with
-- Recommendation Letter Studio, so this removes the user's data in both apps (all cascade).
-- Runs with definer rights but only ever touches auth.uid().
-- ---------------------------------------------------------------------------

create or replace function essay.delete_my_account()
returns void
language plpgsql
security definer
set search_path = essay
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

revoke all on function essay.delete_my_account() from public;
grant execute on function essay.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants these automatically only in "public"; RLS above still limits
-- every row to its owner.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema essay to authenticated;
grant usage, select on all sequences in schema essay to authenticated;
grant all on all tables in schema essay to service_role;
alter default privileges in schema essay grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema essay grant all on tables to service_role;
