-- Seeds data in the pre-library shape (profile entries + stories + essay links) so the
-- library migration can be checked to move it across without loss.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'migrate@example.test');
insert into essay.applications (id, user_id, name) values ('ac000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Pre-library app');
insert into essay.essays (id, user_id, application_id, title) values ('ec000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'ac000000-0000-0000-0000-000000000001', 'Essay');
insert into essay.supporting_documents (id, user_id, title) values ('dc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Transcript');
insert into essay.personal_evidence (id, user_id, section, title, classification, source_document_id)
  values ('fc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'academic_achievement', 'First class honours', 'verified_fact', 'dc000000-0000-0000-0000-000000000001'),
         ('fc000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'career_goals', 'Lead a health-tech venture', 'goal_aspiration', null);
insert into essay.story_bank_items (id, user_id, title, tags, verification_status, source_ref)
  values ('5c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Coding club', array['leadership'], 'needs_confirmation', 'letter-studio:evidence:x');
insert into essay.essay_evidence_links (user_id, essay_id, story_id) values ('00000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001');
insert into essay.essay_evidence_links (user_id, essay_id, evidence_id) values ('00000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001');
