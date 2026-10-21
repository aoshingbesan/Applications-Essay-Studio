-- Checks the library migration moved the seeded data across and then removes it.
do $$ begin
  if (select count(*) from essay.library_entries where user_id = '00000000-0000-0000-0000-0000000000c1') <> 3 then raise exception 'entries not migrated'; end if;
  if (select section || ':' || array_to_string(also_in, ',') from essay.library_entries where id = 'fc000000-0000-0000-0000-000000000001') <> 'achievements:education' then raise exception 'achievement section mapping wrong'; end if;
  if (select section || ':' || classification from essay.library_entries where id = 'fc000000-0000-0000-0000-000000000002') <> 'future_goals:goal_aspiration' then raise exception 'goal mapping wrong'; end if;
  if (select section || ':' || classification || ':' || source_ref from essay.library_entries where id = '5c000000-0000-0000-0000-000000000001') <> 'leadership:unverified:letter-studio:evidence:x' then raise exception 'story mapping wrong'; end if;
  if not exists (select 1 from essay.entry_documents where entry_id = 'fc000000-0000-0000-0000-000000000001' and document_id = 'dc000000-0000-0000-0000-000000000001') then raise exception 'document link not migrated'; end if;
  if (select count(*) from essay.essay_evidence_links where essay_id = 'ec000000-0000-0000-0000-000000000001' and entry_id is not null) <> 2 then raise exception 'essay links not migrated'; end if;
  if exists (select 1 from information_schema.tables where table_schema = 'essay' and table_name in ('personal_evidence', 'story_bank_items')) then raise exception 'old tables still present'; end if;
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
\echo 'library migration moved existing data correctly'
