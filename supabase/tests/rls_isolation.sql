-- Verifies data integrity rules and that one authenticated user cannot read or write
-- another user's records. Run by scripts/test-db.sh against a throwaway Postgres.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

do $$ begin
  if (select count(*) from essay.profiles) <> 2 then raise exception 'profile trigger failed'; end if;
end $$;

-- ---- User A creates a full workspace ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into essay.applications (id, name, institution, programme, category)
  values ('a0000000-0000-0000-0000-000000000001', 'Chevening 2027', 'FCDO', 'Chevening Scholarship', 'scholarship');
insert into essay.application_requirements (application_id, title) values ('a0000000-0000-0000-0000-000000000001', 'Two references');
insert into essay.supporting_documents (id, application_id, title, doc_type, file_path)
  values ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'CV', 'cv', '00000000-0000-0000-0000-00000000000a/cv.pdf');
insert into essay.personal_evidence (id, section, title, classification)
  values ('e0000000-0000-0000-0000-000000000001', 'education', 'BSc Computer Science', 'verified_fact');
insert into essay.story_bank_items (id, title) values ('50000000-0000-0000-0000-000000000001', 'Founded a coding club');
insert into essay.exemplars (id, title, source_text, provenance)
  values ('70000000-0000-0000-0000-000000000001', 'Sample SoP', 'An exemplar essay text.', 'official_sample');
insert into essay.exemplar_application_links (exemplar_id, application_id)
  values ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into essay.essays (id, application_id, title, prompt, max_words)
  values ('e5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Leadership', 'Describe your leadership.', 500);
insert into essay.essay_evidence_links (essay_id, story_id) values ('e5000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
insert into essay.essay_evidence_links (essay_id, document_id) values ('e5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
insert into essay.ai_generation_jobs (id, kind, essay_id, idempotency_key, model, prompt_version)
  values ('10000000-0000-0000-0000-000000000001', 'draft', 'e5000000-0000-0000-0000-000000000001', 'key-1', 'claude-opus-5-5', 'v1');
insert into essay.exemplar_analyses (id, exemplar_id, source_hash, spec_version, prompt_version, status)
  values ('a1000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'h', 's1', 'p1', 'complete');
insert into essay.exemplar_selected_lessons (exemplar_id, analysis_id, essay_id, aspect, lesson_key, content)
  values ('70000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'opening', 'opening', 'Open with a concrete scene.');
insert into essay.essay_versions (essay_id, content, source) values ('e5000000-0000-0000-0000-000000000001', '{}', 'manual');
insert into essay.essay_versions (essay_id, content, source, ai_job_id)
  values ('e5000000-0000-0000-0000-000000000001', '{}', 'ai_draft', '10000000-0000-0000-0000-000000000001');
insert into essay.essay_reviews (essay_id, kind, essay_revision) values ('e5000000-0000-0000-0000-000000000001', 'checks', 1);
insert into storage.objects (bucket_id, name) values ('essay-files', '00000000-0000-0000-0000-00000000000a/cv.pdf');

-- ---- Integrity rules ----
do $$ begin
  if (select array_agg(version_number order by version_number) from essay.essay_versions where essay_id = 'e5000000-0000-0000-0000-000000000001') <> array[1,2] then
    raise exception 'version numbers not assigned sequentially';
  end if;
  if (select source_hash from essay.exemplars where id = '70000000-0000-0000-0000-000000000001') is null then
    raise exception 'exemplar source hash not computed';
  end if;
end $$;

-- Versions are immutable history: content cannot change, but they can be renamed.
update essay.essay_versions set title = 'Renamed draft' where essay_id = 'e5000000-0000-0000-0000-000000000001' and version_number = 1;
do $$ begin
  begin
    update essay.essay_versions set content = '{"type":"doc"}' where essay_id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'version content was edited';
  exception when raise_exception then
    if sqlerrm <> 'essay versions are immutable' then raise; end if;
  end;
end $$;

-- An evidence link must point to exactly one target.
do $$ begin
  begin
    insert into essay.essay_evidence_links (essay_id) values ('e5000000-0000-0000-0000-000000000001');
    raise exception 'empty evidence link accepted';
  exception when check_violation then null; end;
  begin
    insert into essay.essay_evidence_links (essay_id, story_id) values ('e5000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
    raise exception 'duplicate story link accepted';
  exception when unique_violation then null; end;
end $$;

-- Word limits must be coherent; provenance must be a known value.
do $$ begin
  begin
    insert into essay.essays (application_id, title, min_words, max_words) values ('a0000000-0000-0000-0000-000000000001', 'Bad', 600, 500);
    raise exception 'min > max accepted';
  exception when check_violation then null; end;
  begin
    insert into essay.exemplars (title, provenance) values ('X', 'won_scholarship');
    raise exception 'invented provenance accepted';
  exception when check_violation then null; end;
end $$;

-- Only one exemplar analysis may be in progress at a time.
insert into essay.exemplar_analyses (exemplar_id, source_hash, spec_version, prompt_version, status)
  values ('70000000-0000-0000-0000-000000000001', 'h', 's1', 'p1', 'running');
do $$ begin
  begin
    insert into essay.exemplar_analyses (exemplar_id, source_hash, spec_version, prompt_version, status)
      values ('70000000-0000-0000-0000-000000000001', 'h', 's1', 'p1', 'queued');
    raise exception 'duplicate active analysis accepted';
  exception when unique_violation then null; end;
end $$;

-- AI job idempotency keys are unique per user.
do $$ begin
  begin
    insert into essay.ai_generation_jobs (kind, idempotency_key, model, prompt_version) values ('outline', 'key-1', 'm', 'v1');
    raise exception 'duplicate idempotency key accepted';
  exception when unique_violation then null; end;
end $$;

-- Deleting a story removes its essay links but keeps the essay.
insert into essay.story_bank_items (id, title) values ('50000000-0000-0000-0000-000000000002', 'Temporary story');
insert into essay.essay_evidence_links (essay_id, story_id) values ('e5000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');
delete from essay.story_bank_items where id = '50000000-0000-0000-0000-000000000002';
do $$ begin
  if exists (select 1 from essay.essay_evidence_links where story_id = '50000000-0000-0000-0000-000000000002') then raise exception 'story link not cascaded'; end if;
  if not exists (select 1 from essay.essays where id = 'e5000000-0000-0000-0000-000000000001') then raise exception 'essay removed with story'; end if;
end $$;

-- Deleting an application cascades to its essays and versions but keeps shared library items.
insert into essay.applications (id, name) values ('a0000000-0000-0000-0000-000000000002', 'Temp');
insert into essay.essays (id, application_id, title) values ('e5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'T');
insert into essay.essay_versions (essay_id, content, source) values ('e5000000-0000-0000-0000-000000000002', '{}', 'manual');
insert into essay.exemplar_application_links (exemplar_id, application_id) values ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
insert into essay.essay_evidence_links (essay_id, story_id) values ('e5000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001');
delete from essay.applications where id = 'a0000000-0000-0000-0000-000000000002';
do $$ begin
  if exists (select 1 from essay.essays where id = 'e5000000-0000-0000-0000-000000000002') then raise exception 'essay not cascaded'; end if;
  if exists (select 1 from essay.essay_versions where essay_id = 'e5000000-0000-0000-0000-000000000002') then raise exception 'versions not cascaded'; end if;
  if not exists (select 1 from essay.exemplars where id = '70000000-0000-0000-0000-000000000001') then raise exception 'shared exemplar removed'; end if;
  if not exists (select 1 from essay.story_bank_items where id = '50000000-0000-0000-0000-000000000001') then raise exception 'shared story removed'; end if;
end $$;

-- ---- User B must see nothing of A's ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$
declare n int;
begin
  select (select count(*) from essay.applications) + (select count(*) from essay.application_requirements)
       + (select count(*) from essay.supporting_documents) + (select count(*) from essay.personal_evidence)
       + (select count(*) from essay.story_bank_items) + (select count(*) from essay.exemplars)
       + (select count(*) from essay.exemplar_analyses) + (select count(*) from essay.exemplar_application_links)
       + (select count(*) from essay.exemplar_selected_lessons) + (select count(*) from essay.essays)
       + (select count(*) from essay.essay_versions) + (select count(*) from essay.essay_evidence_links)
       + (select count(*) from essay.ai_generation_jobs) + (select count(*) from essay.essay_reviews)
       + (select count(*) from storage.objects)
       + (select count(*) from essay.profiles where id <> auth.uid())
    into n;
  if n <> 0 then raise exception 'user B can read % of user A''s rows', n; end if;
end $$;

-- B cannot update or delete A's rows (silently affects zero rows).
update essay.applications set name = 'hijacked';
update essay.essays set plain_text = 'hijacked';
delete from essay.exemplars;
delete from essay.story_bank_items;

-- B creates their own application and essay, then tries to attach A's records.
insert into essay.applications (id, name) values ('a0000000-0000-0000-0000-00000000000b', 'B app');
insert into essay.essays (id, application_id, title) values ('e5000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'B essay');

do $$ begin
  begin
    insert into essay.essays (application_id, title) values ('a0000000-0000-0000-0000-000000000001', 'into A');
    raise exception 'B created an essay in A''s application';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.essay_evidence_links (essay_id, story_id) values ('e5000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000001');
    raise exception 'B linked A''s story';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.essay_evidence_links (essay_id, document_id) values ('e5000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000001');
    raise exception 'B linked A''s document';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.exemplar_application_links (exemplar_id, application_id) values ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b');
    raise exception 'B linked A''s exemplar';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.exemplar_selected_lessons (exemplar_id, essay_id, aspect, lesson_key, content)
      values ('70000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000b', 'opening', 'k', 'x');
    raise exception 'B used A''s exemplar lesson';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.essay_versions (essay_id, content, source, ai_job_id)
      values ('e5000000-0000-0000-0000-00000000000b', '{}', 'ai_draft', '10000000-0000-0000-0000-000000000001');
    raise exception 'B referenced A''s AI job';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.applications (name, user_id) values ('forged', '00000000-0000-0000-0000-00000000000a');
    raise exception 'B forged ownership';
  exception when insufficient_privilege then null; end;
  begin
    insert into essay.supporting_documents (title, file_path) values ('steal', '00000000-0000-0000-0000-00000000000a/cv.pdf');
    raise exception 'B referenced A''s storage path';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('essay-files', '00000000-0000-0000-0000-00000000000a/evil.pdf');
    raise exception 'B wrote into A''s storage folder';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- Back as A: nothing was changed by B ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select name from essay.applications where id = 'a0000000-0000-0000-0000-000000000001') <> 'Chevening 2027' then raise exception 'B modified A''s application'; end if;
  if (select count(*) from essay.exemplars) <> 1 then raise exception 'B deleted A''s exemplar'; end if;
  if (select count(*) from essay.story_bank_items) <> 1 then raise exception 'B deleted A''s story'; end if;
  if exists (select 1 from essay.essays where plain_text = 'hijacked') then raise exception 'B modified A''s essay'; end if;
end $$;

-- ---- Letter Studio is untouched, and its evidence is importable by its owner only ----
insert into public.evidence (id, title, category) values ('3e000000-0000-0000-0000-000000000001', 'Letter Studio project', 'research');
do $$ begin
  if not public.owns_evidence('3e000000-0000-0000-0000-000000000001') then raise exception 'letter studio owns_evidence broken'; end if;
  if (select count(*) from public.evidence) <> 1 then raise exception 'owner cannot read own letter studio evidence'; end if;
end $$;
insert into essay.story_bank_items (title, source_ref) values ('Imported', 'letter-studio:evidence:3e000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into essay.story_bank_items (title, source_ref) values ('Imported twice', 'letter-studio:evidence:3e000000-0000-0000-0000-000000000001');
    raise exception 'duplicate import accepted';
  exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.evidence) <> 0 then raise exception 'B can read A''s letter studio evidence'; end if;
end $$;

reset role;
do $$ begin
  -- Nothing Essay Studio defines lives in public.
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename in ('applications', 'essays', 'story_bank_items', 'exemplars')) then
    raise exception 'essay studio table created in public';
  end if;
  if (select count(*) from pg_trigger where tgname in ('on_auth_user_created', 'essay_on_auth_user_created')) <> 2 then
    raise exception 'auth triggers collided';
  end if;
end $$;
\echo 'RLS isolation and integrity tests passed (shared project with Letter Studio)'
