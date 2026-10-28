# Essay Studio

An application-writing workspace for university admissions, scholarships, fellowships and research programmes.

**Build from evidence. Learn from exemplars. Write with purpose. Refine with intention.**

Essay Studio helps applicants turn true, specific evidence into original essays. You record your experiences once, set up each application with its exact prompts and requirements, and study successful essays for their techniques (never to copy them). Then you plan, draft, edit and review each essay against its actual requirements, and export it.

## Contents

- [Features](#features)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Database setup](#1-database-setup-supabase)
- [Authentication](#2-authentication)
- [Storage](#3-storage)
- [AI provider](#4-ai-provider-anthropic)
- [Deployment](#5-deploy-to-vercel)
- [Architecture](#architecture)
- [Testing](#testing)
- [Security and privacy](#security-and-privacy)
- [Known limitations](#known-limitations)

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Active applications with status and progress derived from essay data, recent essays, upcoming deadlines, recently used evidence and recently analysed exemplars. First-time users get a guided empty state. |
| **Applications** | Multiple applications, each with several essays. Every essay has its own prompt, limits, outline, draft, versions and reviews. Applications also hold a checklist, milestones, notes, documents and linked exemplars. You can duplicate an application's structure without copying drafts or documents, archive it, reopen it or mark it submitted. |
| **Setup wizard** | Four resumable steps: opportunity details, essay requirements (multiple questions, exact prompt wording kept), supporting materials, and writing preferences. Progress is saved on the server after each step. |
| **Story Bank** | A personal evidence library in 13 sections: Background, Education, Tech, Health, CV and Professional Profile, Volunteering, Achievements, Leadership, Projects and Research, Community and Development, Failures and Growth, Future Goals, and Documents. Each entry combines structured facts (role, organisation, dates, figures), an optional STAR story, a long-form narrative in your own words, linked documents and a classification (Verified Fact … Goal or Aspiration … Unverified). One entry can appear in several sections without being copied. Each section has guidance on what to record and AI-guided follow-up questions. A Key facts view lists every structured fact. |
| **Privacy and reuse controls** | Every entry is **Private** (never sent to the AI), **Ask first** (used only in an essay you approve it for) or **Available**. Each section has a default; Health defaults to Ask first. The server enforces this before anything reaches the AI, including guided questions and evidence recommendations. Relevant Ask-first entries are suggested for approval by local matching, without being sent. |
| **Supporting Documents** | Private PDF, DOCX and TXT uploads with text extraction. Scanned PDFs are detected and flagged. You can inspect, correct or paste the text. |
| **Exemplar Library** | Upload or paste exemplars with metadata and an explicit provenance. You check the extracted text before analysis. Each analysis is a structured report: overview, opening, structure, evidence, prompt alignment, techniques, limitations, transferable lessons and a reusable blueprint. The library has search across seven filters, side-by-side comparison, reanalysis, archive and delete, and lets you attach exemplars to applications and choose which lessons apply to which essay. |
| **Essay Studio** | A three-panel workspace: navigation, requirements, evidence, references and draft history on the left; the editor in the centre; and the Workflow, Assist, Evidence, Exemplars and Review tabs on the right. Both side panels collapse, and become drawers on small screens. |
| **Staged workflow** | Analyse the prompt, gather evidence, choose writing references, answer gap questions, then generate an outline that you edit and approve. Next comes the original draft, followed by review, refinement and finalising. |
| **AI editing** | Nineteen actions, applied to a selection, the current paragraph or the whole essay. Each shows the original and revised text, explains the main changes, and offers **Accept**, **Reject** or **Insert as new version**. Accepted edits can be undone with ⌘Z. |
| **Review** | Instant deterministic checks plus an AI readiness review. Findings are labelled Strong, Needs Improvement or Missing Evidence, marked critical or optional, linked to the relevant passage, and can be dismissed. A final checklist ends with **Mark Ready to Submit**. |
| **Versions** | Autosave plus named versions. You can compare versions, restore one (the current text is backed up first), and rename, duplicate or archive drafts. |
| **Export** | DOCX, PDF or text, for one essay or a selection. You can set the font, size, margins, line spacing and page numbers, and add an optional cover page (off by default). Exports contain only the essay text. |
| **Settings** | Profile, default writing preferences, export defaults, an AI on/off switch with a data-flow explanation, connected services, theme, password, JSON data export, delete Essay Studio data, and delete the shared account (both apps). |
| **Import from Letter Studio** | The Story Bank can copy evidence you recorded in Recommendation Letter Studio, using the same account, into the matching sections. Imports are copies, never live links. Evidence flagged for checking stays flagged, each entry takes its section's privacy default, and repeat imports are skipped. |

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict)
- Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, React Hook Form, Zod 4
- TipTap 3 rich-text editor
- Supabase: Postgres, Auth, private Storage and Row Level Security
- Anthropic Claude API through `@anthropic-ai/sdk`, called only from server code (Opus 5.5 for writing, Sonnet 5.5 for planning and edits, Haiku 5.5 for guided questions)
- `unpdf` for PDF text extraction, `mammoth` for DOCX extraction, `docx` for Word export, `pdf-lib` for PDF export
- Vitest, Playwright, and SQL tests against a throwaway Postgres

The design system, Supabase/auth infrastructure, AI client, autosave queue and export pipeline are adapted from the sibling *Recommendation Letter Studio* project. They were copied in, not shared, so the two products stay independent.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in the values (see below)
pnpm dev                     # http://localhost:3001 (Letter Studio uses 3000)
```

Without Supabase configured, the app shows a setup page instead of failing. Without an Anthropic key, everything except the AI actions works, and the AI buttons explain why they are unavailable.

## 1. Database setup (Supabase)

Essay Studio can share a Supabase project, and its user accounts, with **Recommendation Letter Studio**. That is the intended setup: one sign-in for both apps. Everything Essay Studio stores lives in its own `essay` schema. Its tables, functions, triggers and storage bucket all have names that cannot collide with Letter Studio's objects in `public`, and Essay Studio never writes to `public`. `pnpm test:db` proves this by applying Letter Studio's migrations first and checking they still work afterwards.

1. **Choose a project.** Use the existing Letter Studio project (recommended) or a new one.
2. **Apply the migrations** in filename order, using either method:
   - **SQL editor:** run `supabase/migrations/20261020000001_initial_schema.sql`, `20261020000002_private_storage.sql`, then `20261021000003_story_bank_library.sql` (the Story Bank library; it moves any existing profile entries and stories into it).
   - **Supabase CLI:** in a project directory linked to this Supabase project, run `npx supabase db push`.
3. **Expose the schema to the API.** Go to **Project Settings → Data API → Exposed schemas**, add `essay` to the list (keep `public` and anything else already there), and save. Without this, every page shows a database error.
4. **Copy the keys.** Under **Project Settings → API**, copy the project URL and the publishable (or legacy anon) key into `.env.local`.

No service-role key is used. Every query runs as the signed-in user under RLS.

**Accounts that already exist** get an Essay Studio profile when the migration runs, and new sign-ups get one through the `essay_on_auth_user_created` trigger, which runs alongside Letter Studio's own trigger.

## 2. Authentication

- **Authentication → Providers → Email:** keep it enabled. "Confirm email" is recommended.
- **Authentication → URL Configuration:** add Essay Studio's callback URLs to the redirect URLs, alongside Letter Studio's: `http://localhost:3001/auth/callback` (Essay Studio's dev port) and `https://<essay-studio-domain>/auth/callback`. The Site URL can stay pointed at Letter Studio; confirmation links from Essay Studio carry their own redirect.

## 3. Storage

The second migration creates a private bucket, `essay-files`, with a 10 MB limit. It accepts PDF, DOCX and TXT for uploads (PNG and JPEG are allowed at bucket level for future use). Objects live under `<user id>/documents/…` or `<user id>/exemplars/…`, storage policies restrict each folder to its owner, and files are opened only through 60-second signed URLs.

## 4. AI provider (Anthropic)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. Set `ANTHROPIC_API_KEY` in `.env.local` and in Vercel. It is read only on the server; never prefix it with `NEXT_PUBLIC_`.
3. Optional settings:
   - `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_STANDARD`, `ANTHROPIC_MODEL_LIGHT` override the three model tiers (see below).
   - `AI_RATE_LIMIT_PER_HOUR` sets the per-user limit (default 40).

AI models and cost — each operation runs on one of three tiers (mapping in `src/lib/ai/client.ts`):

| Tier | Default model | Operations |
|---|---|---|
| quality | `claude-opus-5-5` | draft, outline, readiness review, exemplar analysis |
| standard | `claude-sonnet-5-5` | prompt analysis, gap questions, evidence recommendation, blueprint, rewrite/edit actions, critique, exemplar comparison |
| light | `claude-haiku-5-5` | Story Bank guided questions |

Operations not listed default to the quality tier. The model that served each request is recorded on its `ai_generation_jobs` row along with token usage. To put everything back on Opus, set `ANTHROPIC_MODEL_STANDARD` and `ANTHROPIC_MODEL_LIGHT` to `claude-opus-5-5`.

How requests are made:

- Every call streams with a structured JSON-schema output format. Effort is `high` for analysis, outlines, drafts and reviews, and `medium` for edits and planning.
- Opus and Sonnet calls use Anthropic's server-side refusal fallback (`fallbacks: "default"`); Haiku has none, so a declined guided-question request simply shows an error.
- Every output is validated with Zod before it is saved or shown. Malformed output is reported as a retryable failure; nothing is saved.

**Data flow.** An AI action sends the relevant requirements, the evidence you selected (or the most relevant items), excerpts of linked documents and the text being worked on to Anthropic. Retention follows the terms of the Anthropic account the deployment uses; this app makes no zero-retention claim. Users can switch AI off in Settings, after which nothing is sent.

## 5. Deploy to Vercel

1. Push to GitHub and import the repository in Vercel. The framework preset is Next.js.
2. Add these environment variables for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `ANTHROPIC_API_KEY`
   - optionally `ANTHROPIC_MODEL` and `AI_RATE_LIMIT_PER_HOUR`
3. Add the production `/auth/callback` URL to Supabase's redirect URLs.

AI routes set `maxDuration = 300` seconds, which fits Vercel's default function limits on Fluid Compute. Exemplar analysis runs in the background through `after()`, and the page polls for the result.

## Architecture

```
src/
  app/(app)/            authenticated pages: dashboard, applications (+ setup wizard), studio, profile,
                        stories, exemplars (+ compare), documents, settings
  app/api/              essays/[id]/ai · exemplars/[id]/analyse · exemplars/compare · export · account/export
  server/               server actions (applications, essays, exemplars, library, documents, account)
  server/internal/      server-only helpers: essay data loader, AI runner, file extraction
  lib/ai/               client, guard (rate limit + idempotency), schemas, context builder, prompts/, mock fixtures
  lib/essay/            document model, word limits, deterministic checks, exemplar-overlap detector, export
  lib/documents/        upload validation and text extraction
  lib/domain/           constants, types, Zod form schemas, progress derivation
supabase/migrations/    schema, RLS, triggers, private storage
```

### Data model

| Table | Purpose |
|---|---|
| `profiles` | Name, default writing preferences, export defaults, AI on/off |
| `applications` | Opportunity details, criteria, instructions, writing preferences, wizard progress, archive and submit state |
| `application_requirements` | Checklist items and milestones |
| `supporting_documents` | File metadata, SHA-256, extraction status and errors, extracted text |
| `library_entries` | Story Bank entries: section and cross-listed sections, structured facts, STAR story, narrative, classification, privacy, import source; full-text indexed |
| `library_section_settings` | Per-user default privacy for each section |
| `entry_documents` | Documents that substantiate an entry |
| `exemplars` | Metadata, provenance, permission confirmation, source text, source hash (set by trigger) |
| `exemplar_analyses` | Report JSON, keyed to source hash and spec version; at most one in progress per exemplar |
| `exemplar_application_links` | Many-to-many between exemplars and applications |
| `exemplar_selected_lessons` | Lessons chosen for an essay, copied so later reanalysis never silently changes a past draft's basis |
| `essays` | Requirements, current draft (TipTap JSON) with an optimistic-concurrency `revision`, staged-workflow state |
| `essay_versions` | Immutable snapshots (a trigger blocks content edits) with numbered versions, change summary, AI job and evidence references |
| `essay_evidence_links` | Entries and documents selected for an essay (exactly one target per row); linking an Ask-first entry is the approval to use it there |
| `ai_generation_jobs` | Every AI call: kind, model, prompt version, settings, source references, prompt SHA-256, usage, output, status |
| `essay_reviews` | Check and AI review findings with dismissals |

- **Ownership:** every table has `user_id` with RLS limited to `auth.uid()`. Insert and update policies also check that every referenced row belongs to the same user, so a user cannot attach another user's story, document, exemplar, job or essay.
- **Shared project:** Essay Studio's tables are in the `essay` schema and Letter Studio's are in `public`. The only read across is the Story Bank import, which reads `public.evidence` under Letter Studio's own RLS, so you only ever see your own rows.
- **Deletion:**
  - Deleting an application cascades to its essays, versions, reviews, links and checklist, but keeps library items (stories, documents, exemplars).
  - Deleting a document removes its file, extracted text and essay links.
  - Deleting an exemplar removes its file, cached analyses, selected lessons and links.
  - "Delete my Essay Studio data" removes only Essay Studio's records and files.
  - Deleting the account removes the shared sign-in. That cascades to both apps' data, and the action also removes both apps' stored files. Settings says so explicitly.

### AI design

- **Separate, versioned operations** live in `src/lib/ai/prompts/`: prompt analysis, gap questions, evidence recommendation, exemplar analysis, exemplar comparison, blueprint, outline, draft, rewrite, critique and readiness review. Each job records its prompt version and model.
- **The context builder** (`src/lib/ai/context.ts`) sends only what an operation needs:
  - the entries the user linked, or if none, the most relevant **Available** entries ranked by keyword overlap. Private entries are never included, and Ask-first entries only when approved (linked) for that essay;
  - relevant excerpts of linked documents, within a character budget;
  - exemplar lessons only when exemplar guidance is switched on, filtered by the chosen aspects.

  The full exemplar essay is never sent when drafting.
- **Evidence status:** facts carry a status (accomplished, aspiration, reflection or unverified). The model may state accomplished facts as facts. It must write aspirations as plans, and must mark unverified claims as `[CONFIRM: …]` or omit them. Missing facts become `[ADD: …]` placeholders, and the review treats any left in the text as critical.
- **Provenance:** short references (E1, D1) map back to record IDs, and every draft version stores which entries, documents and lessons informed it.
- **Prompt injection:** uploaded and pasted text is treated as untrusted data. It is serialised with `<` escaped inside a delimited data block, and the system prompt tells the model never to follow instructions found in it.
- **Copying guard:** generated drafts and edits are checked for runs of eight or more words shared with attached exemplars. The review flags any such passage as a critical authenticity issue.
- **Reliability:**
  - Every request carries an idempotency key, so double clicks replay the first result instead of billing a second call.
  - The same step cannot run twice at once for one essay.
  - There is a per-user hourly rate limit, and requests can be cancelled through `AbortSignal`.
  - Typed SDK errors become user-facing messages.
  - A job is marked succeeded only after its output is validated and saved.
- **Exemplar caching:** analyses are reused only when the source hash and the specification version both match. Changing the text or bumping `EXEMPLAR_SPEC_VERSION` makes old reports show as out of date, and a report is never applied to text it did not analyse.

### Editor and saving

- Autosave runs 1.5 seconds after you stop typing.
- All writes (autosave, versions and AI edits) go through one queue, and each carries the revision it expects. A save from a stale tab is rejected and autosave pauses, so newer text is never overwritten.
- AI results never replace the draft silently. Drafts and whole-essay revisions are applied by the server from the validated job output, after the current text is saved as a backup version. Selection edits replace exactly the range that was sent, and are refused if that text changed in the meantime.

## Testing

| Command | What it runs |
|---|---|
| `pnpm test` | Vitest unit and integration tests: word counting, word limits, prompt and AI-response validation, evidence selection and context budgets, injection escaping, exemplar provenance, overlap detection, review findings, extraction (PDF, scanned PDF, DOCX, TXT, corrupt files), export, progress derivation, and a full **server-side journey**. The journey runs the real server actions and route handlers against an in-memory Supabase fake, covering the application wizard, upload and extraction, exemplar analysis and caching, the staged AI workflow, idempotent replay, autosave conflicts, AI revision acceptance, review and dismissals, restore, export, cross-user isolation, the AI off switch, duplication and cascading deletes. |
| `pnpm test:db` | Applies a snapshot of Letter Studio's migrations (`supabase/tests/letter-studio/`), then Essay Studio's, to a throwaway local Postgres (needs `initdb`, `pg_ctl` and `psql`). It then runs `supabase/tests/rls_isolation.sql`, which checks RLS isolation for every table and storage, cross-user reference blocking, ownership forging, version immutability, constraints, cascades, that Letter Studio's objects still work, and that the import's source rows are owner-only. |
| `pnpm test:e2e` | Playwright drives the real app in Chromium against a local HTTP fake of the Supabase APIs (`tests/e2e/fake-supabase-server.ts`) and deterministic AI fixtures. It covers sign-up, profile, story, the application wizard, document, exemplar upload and analysis, lesson selection, prompt analysis, outline approval, draft, editing and autosave, version save, AI revision, review, restore, DOCX and PDF export, persistence after signing in again, phone-width layout and keyboard skip link. Run `pnpm exec playwright install chromium` once first. |
| `pnpm check` | Lint, typecheck, unit and integration tests, and build |

AI fixtures are used only when `AI_MOCK_RESPONSES=1` **and** `NODE_ENV` is not `production`, so a deployment can never serve simulated output. No test makes paid API calls.

## Security and privacy

- Secrets stay in server environment variables. `env.server.ts` and the AI client import `server-only`.
- Every server action and route re-validates its input with Zod and re-checks the session. RLS is the final authority.
- Uploads are checked for extension, MIME type and size before upload, and for magic bytes on the server. Paths must sit in the user's own folder.
- Stored editor JSON is sanitised to an allowlist of nodes, marks and attributes, and rendered without `dangerouslySetInnerHTML`.
- Security headers: `nosniff`, `DENY` framing, referrer policy and permissions policy.
- Logs record only error messages, never essay text, prompts or outputs. AI jobs store a SHA-256 of the prompt, not the prompt itself.
- Exemplars require a permission and redaction confirmation, are never public, and stay read-only reference material.

This project has not been audited against a formal security or privacy standard.

## Known limitations

- **No OCR.** Scanned PDFs are detected and reported as needing OCR; their text must be pasted.
- **Heuristic checks.** Deterministic checks use English keyword heuristics, so theme and criteria coverage are approximate. Like the AI review, they point at things to check and do not predict outcomes.
- **PDF fonts.** PDF export uses the standard PDF fonts, so characters outside Windows-1252 (for example CJK) are replaced. DOCX and text exports keep them.
- **Rate limit scope.** The rate limit counts a user's AI jobs, so it is per user, not per IP.
- **Background analysis.** Exemplar analysis runs in `after()` within the function's time limit. A job interrupted by a platform restart is marked failed after six minutes and can be rerun.
- **Test fakes.** The Supabase fakes used in tests implement only the API subset this app calls. Real RLS behaviour is verified separately with `pnpm test:db`, but nothing has yet been run against a hosted Supabase project.
