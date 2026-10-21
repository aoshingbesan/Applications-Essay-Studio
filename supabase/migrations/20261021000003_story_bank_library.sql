-- Story Bank library: one personal evidence library organised into twelve life-area sections
-- (plus the documents page). It replaces essay.personal_evidence and essay.story_bank_items:
-- every entry carries structured facts, an optional STAR story, a free narrative, linked
-- documents, a verification classification and a privacy level that the server enforces before
-- anything is sent to the AI. Existing rows are moved across with their IDs unchanged.

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------

create table essay.library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in (
    'background', 'education', 'tech', 'health', 'career', 'volunteering', 'achievements',
    'leadership', 'projects_research', 'community_development', 'failures_growth', 'future_goals'
  )),
  -- Further sections the entry also appears in (cross-listing, never copies).
  also_in text[] not null default '{}' check (also_in <@ array[
    'background', 'education', 'tech', 'health', 'career', 'volunteering', 'achievements',
    'leadership', 'projects_research', 'community_development', 'failures_growth', 'future_goals'
  ]::text[]),
  title text not null check (char_length(title) between 1 and 300),
  -- Structured facts
  summary text check (char_length(summary) <= 5000),
  organisation text check (char_length(organisation) <= 300),
  role text check (char_length(role) <= 300),
  location text check (char_length(location) <= 200),
  period text check (char_length(period) <= 200),
  figures text check (char_length(figures) <= 2000),
  links text check (char_length(links) <= 2000),
  -- Story (STAR-style, all optional)
  context text check (char_length(context) <= 10000),
  challenge text check (char_length(challenge) <= 10000),
  actions text check (char_length(actions) <= 10000),
  outcome text check (char_length(outcome) <= 10000),
  measurable_impact text check (char_length(measurable_impact) <= 5000),
  lessons text check (char_length(lessons) <= 10000),
  motivation text check (char_length(motivation) <= 10000),
  -- The applicant's own words
  narrative text check (char_length(narrative) <= 30000),
  skills text[] not null default '{}',
  related_criteria text[] not null default '{}',
  tags text[] not null default '{}',
  classification text not null default 'verified_fact' check (classification in (
    'verified_fact', 'quantified_achievement', 'personal_reflection', 'goal_aspiration', 'unverified'
  )),
  source text check (char_length(source) <= 1000),
  -- private: never sent to the AI · ask: only for essays the user approved it for · available.
  privacy text not null default 'available' check (privacy in ('private', 'ask', 'available')),
  -- Where an imported entry came from, e.g. "letter-studio:evidence:<id>".
  source_ref text check (char_length(source_ref) <= 200),
  position integer not null default 0,
  archived_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(organisation, '') || ' ' ||
      coalesce(role, '') || ' ' || coalesce(context, '') || ' ' || coalesce(challenge, '') || ' ' ||
      coalesce(actions, '') || ' ' || coalesce(outcome, '') || ' ' || coalesce(lessons, '') || ' ' ||
      coalesce(narrative, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_entries_user_idx on essay.library_entries (user_id, section, archived_at, position);
create index library_entries_also_in_idx on essay.library_entries using gin (also_in);
create index library_entries_tags_idx on essay.library_entries using gin (tags);
create index library_entries_search_idx on essay.library_entries using gin (search_vector);
create unique index library_entries_source_ref_uq on essay.library_entries (user_id, source_ref) where source_ref is not null;

create trigger library_entries_updated_at before update on essay.library_entries
  for each row execute function essay.set_updated_at();

-- Per-user default privacy for each section (new entries start with it).
create table essay.library_section_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in (
    'background', 'education', 'tech', 'health', 'career', 'volunteering', 'achievements',
    'leadership', 'projects_research', 'community_development', 'failures_growth', 'future_goals'
  )),
  default_privacy text not null check (default_privacy in ('private', 'ask', 'available')),
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

create trigger library_section_settings_updated_at before update on essay.library_section_settings
  for each row execute function essay.set_updated_at();

-- Documents that substantiate an entry.
create table essay.entry_documents (
  entry_id uuid not null references essay.library_entries (id) on delete cascade,
  document_id uuid not null references essay.supporting_documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (entry_id, document_id)
);

create index entry_documents_document_idx on essay.entry_documents (document_id);

create or replace function essay.owns_entry(eid uuid)
returns boolean language sql stable security invoker as $$
  select eid is null or exists (select 1 from essay.library_entries e where e.id = eid and e.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Move existing data across (IDs are kept, so essay links stay valid)
-- ---------------------------------------------------------------------------

insert into essay.library_entries (
  id, user_id, section, also_in, title, summary, organisation, period, classification, source,
  position, archived_at, created_at, updated_at
)
select
  id, user_id,
  case section
    when 'background' then 'background'
    when 'education' then 'education'
    when 'academic_achievement' then 'achievements'
    when 'work_experience' then 'career'
    when 'leadership' then 'leadership'
    when 'volunteering' then 'volunteering'
    when 'projects_research' then 'projects_research'
    when 'awards' then 'achievements'
    when 'skills' then 'career'
    when 'challenges' then 'failures_growth'
    when 'impact_goals' then 'community_development'
    when 'motivations' then 'background'
    else 'future_goals'
  end,
  case section
    when 'academic_achievement' then array['education']
    when 'impact_goals' then array['future_goals']
    else '{}'::text[]
  end,
  title, details, organisation, period, classification, source, position, archived_at, created_at, updated_at
from essay.personal_evidence;

insert into essay.entry_documents (entry_id, document_id, user_id)
select id, source_document_id, user_id from essay.personal_evidence where source_document_id is not null;

insert into essay.library_entries (
  id, user_id, section, title, context, challenge, actions, outcome, measurable_impact, lessons,
  motivation, skills, related_criteria, tags, period, links, classification, source_ref,
  archived_at, created_at, updated_at
)
select
  id, user_id,
  case
    when 'leadership' = any (tags) then 'leadership'
    when 'volunteering' = any (tags) then 'volunteering'
    when 'research' = any (tags) then 'projects_research'
    else 'projects_research'
  end,
  title, context, challenge, actions, outcome, measurable_impact, lessons, motivation, skills,
  related_criteria, tags, period, supporting_evidence,
  case verification_status when 'needs_confirmation' then 'unverified' else 'verified_fact' end,
  source_ref, archived_at, created_at, updated_at
from essay.story_bank_items;

-- ---------------------------------------------------------------------------
-- Essay evidence links now point at library entries (or documents)
-- ---------------------------------------------------------------------------

drop policy "essay_evidence_links: own rows" on essay.essay_evidence_links;
alter table essay.essay_evidence_links add column entry_id uuid references essay.library_entries (id) on delete cascade;
update essay.essay_evidence_links set entry_id = coalesce(story_id, evidence_id);
alter table essay.essay_evidence_links drop constraint if exists essay_evidence_links_check;
drop index if exists essay.essay_evidence_story_uq;
drop index if exists essay.essay_evidence_evidence_uq;
drop index if exists essay.essay_evidence_story_idx;
alter table essay.essay_evidence_links drop column story_id, drop column evidence_id;
alter table essay.essay_evidence_links add constraint essay_evidence_links_one_target check (num_nonnulls(entry_id, document_id) = 1);
create unique index essay_evidence_entry_uq on essay.essay_evidence_links (essay_id, entry_id) where entry_id is not null;
create index essay_evidence_entry_idx on essay.essay_evidence_links (entry_id);

drop table essay.personal_evidence;
drop table essay.story_bank_items;
drop function essay.owns_story(uuid);
drop function essay.owns_evidence(uuid);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table essay.library_entries enable row level security;
alter table essay.library_section_settings enable row level security;
alter table essay.entry_documents enable row level security;

create policy "library_entries: own rows" on essay.library_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "library_section_settings: own rows" on essay.library_section_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "entry_documents: own rows" on essay.entry_documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and essay.owns_entry(entry_id) and essay.owns_document(document_id));

create policy "essay_evidence_links: own rows" on essay.essay_evidence_links
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and essay.owns_essay(essay_id) and essay.owns_entry(entry_id)
    and essay.owns_document(document_id)
  );

grant select, insert, update, delete on essay.library_entries, essay.library_section_settings, essay.entry_documents to authenticated;
grant all on essay.library_entries, essay.library_section_settings, essay.entry_documents to service_role;

-- Guided follow-up questions for a library section are a new kind of AI job.
alter table essay.ai_generation_jobs drop constraint ai_generation_jobs_kind_check;
alter table essay.ai_generation_jobs add constraint ai_generation_jobs_kind_check check (kind in (
  'prompt_analysis', 'gap_questions', 'evidence_recommendation', 'exemplar_analysis',
  'exemplar_comparison', 'blueprint', 'outline', 'draft', 'rewrite', 'critique', 'readiness_review',
  'section_questions'
));
