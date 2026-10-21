// In-memory stand-in for the subset of the Supabase client used by server actions and route
// handlers. It scopes every query to the signed-in user (like the RLS policies), applies the
// schema defaults, triggers, unique constraints and cascades the server code relies on.
// Real RLS and constraint behaviour is verified separately against Postgres (pnpm test:db).

import { createHash, randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

const DEFAULTS: Record<string, () => Row> = {
  profiles: () => ({ display_name: null, full_name: null, writing_preferences: {}, export_settings: {}, ai_enabled: true }),
  applications: () => ({ institution: "", programme: "", category: "masters_admission", writing_preferences: {}, setup_step: 1, setup_completed_at: null, submitted_at: null, archived_at: null, duplicated_from: null, notes: null, deadline: null, selection_criteria: null, official_instructions: null, course_description: null, reason_for_applying: null, country: null, official_url: null }),
  essays: () => ({
    essay_type: "personal_statement",
    prompt: "",
    min_words: null,
    max_words: null,
    required_themes: [],
    selection_criteria: null,
    required_format: null,
    instructions: null,
    restrictions: null,
    status: "not_started",
    position: 0,
    content: { type: "doc", content: [] },
    plain_text: "",
    word_count: 0,
    revision: 1,
    last_autosaved_at: null,
    prompt_analysis: null,
    gap_questions: [],
    outline: null,
    outline_status: "none",
    outline_approved_at: null,
    blueprint: null,
    use_exemplars: false,
    exemplar_aspects: [],
    archived_at: null,
  }),
  essay_versions: () => ({ title: "Draft", change_summary: null, ai_job_id: null, evidence_refs: {}, review_status: "unreviewed", archived_at: null }),
  essay_evidence_links: () => ({ entry_id: null, document_id: null, note: null, position: 0 }),
  essay_reviews: () => ({ job_id: null, findings: [], summary: {}, dismissed_ids: [] }),
  ai_generation_jobs: () => ({ status: "pending", action: null, essay_id: null, exemplar_id: null, application_id: null, settings: {}, source_refs: {}, output: null, error_message: null, completed_at: null }),
  exemplars: () => ({ essay_category: "custom", provenance: "unknown", tags: [], source_text: "", word_count: 0, extraction_status: "pending", file_path: null, archived_at: null, permission_confirmed_at: null }),
  exemplar_analyses: () => ({ status: "queued", report: null, model: null, error_message: null, job_id: null, started_at: null, completed_at: null }),
  exemplar_selected_lessons: () => ({ analysis_id: null, essay_id: null, application_id: null }),
  library_entries: () => ({ also_in: [], skills: [], related_criteria: [], tags: [], classification: "verified_fact", privacy: "available", source_ref: null, position: 0, archived_at: null, narrative: null }),
  supporting_documents: () => ({ application_id: null, doc_type: "other", extraction_status: "pending", word_count: 0, file_path: null }),
  application_requirements: () => ({ kind: "requirement", details: null, due_date: null, completed_at: null, position: 0 }),
};

/** Unique constraints: a row conflicts when every listed column matches (and the predicate holds). */
const UNIQUE: Record<string, { cols: string[]; where?: (r: Row) => boolean }[]> = {
  ai_generation_jobs: [{ cols: ["user_id", "idempotency_key"] }],
  exemplar_analyses: [{ cols: ["exemplar_id"], where: (r) => r.status === "queued" || r.status === "running" }],
  essay_evidence_links: [
    { cols: ["essay_id", "entry_id"], where: (r) => r.entry_id != null },
    { cols: ["essay_id", "document_id"], where: (r) => r.document_id != null },
  ],
  exemplar_selected_lessons: [{ cols: ["essay_id", "exemplar_id", "lesson_key"], where: (r) => r.essay_id != null }],
  exemplar_application_links: [{ cols: ["exemplar_id", "application_id"] }],
  library_entries: [{ cols: ["user_id", "source_ref"], where: (r) => r.source_ref != null }],
  library_section_settings: [{ cols: ["user_id", "section"] }],
  entry_documents: [{ cols: ["entry_id", "document_id"] }],
};

/** ON DELETE CASCADE relationships the server code relies on. */
const CASCADE: Record<string, [string, string][]> = {
  applications: [["essays", "application_id"], ["application_requirements", "application_id"], ["exemplar_application_links", "application_id"]],
  essays: [["essay_versions", "essay_id"], ["essay_evidence_links", "essay_id"], ["essay_reviews", "essay_id"], ["exemplar_selected_lessons", "essay_id"]],
  exemplars: [["exemplar_analyses", "exemplar_id"], ["exemplar_application_links", "exemplar_id"], ["exemplar_selected_lessons", "exemplar_id"]],
  library_entries: [["essay_evidence_links", "entry_id"], ["entry_documents", "entry_id"]],
  supporting_documents: [["essay_evidence_links", "document_id"], ["entry_documents", "document_id"]],
};

export class FakeDb {
  tables = new Map<string, Row[]>();
  files = new Map<string, Uint8Array>();
  userId: string | null = null;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  owns(table: string, r: Row): boolean {
    if (!this.userId) return false;
    return table === "profiles" ? r.id === this.userId : r.user_id === this.userId;
  }

  conflicts(table: string, row: Row, except?: Row): boolean {
    return (UNIQUE[table] ?? []).some((u) => {
      if (u.where && !u.where(row)) return false;
      return this.rows(table).some((r) => r !== except && (!u.where || u.where(r)) && u.cols.every((c) => r[c] === row[c]));
    });
  }

  prepareInsert(table: string, input: Row): Row {
    const now = new Date().toISOString();
    const row: Row = { id: randomUUID(), created_at: now, updated_at: now, ...(DEFAULTS[table]?.() ?? {}), ...input };
    if (table !== "profiles") row.user_id = this.userId;
    if (table === "essay_versions") {
      const max = Math.max(0, ...this.rows(table).filter((r) => r.essay_id === row.essay_id).map((r) => Number(r.version_number)));
      row.version_number = max + 1;
    }
    if (table === "exemplars") row.source_hash = createHash("sha256").update(String(row.source_text ?? "")).digest("hex");
    return row;
  }

  cascadeDelete(table: string, row: Row) {
    for (const [child, col] of CASCADE[table] ?? []) {
      const children = this.rows(child).filter((r) => r[col] === row.id);
      this.tables.set(child, this.rows(child).filter((r) => r[col] !== row.id));
      for (const c of children) this.cascadeDelete(child, c);
    }
  }
}

type Filter = (r: Row) => boolean;

/** Postgres compares typed values; over HTTP every filter value arrives as a string. */
const same = (a: unknown, b: unknown) => a === b || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b));
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private singleMode: "one" | "maybe" | null = null;
  private countMode = false;
  private head = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.mode = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.mode = "update";
    this.payload = p;
    return this;
  }
  upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = "upsert";
    this.payload = p;
    this.upsertOpts = opts;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => same(r[c], v));
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => !same(r[c], v));
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.some((v) => same(r[c], v)));
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (r[c] ?? null) !== v);
    return this;
  }
  gte(c: string, v: string | number) {
    this.filters.push((r) => (r[c] as string | number) >= v);
    return this;
  }
  lt(c: string, v: string | number) {
    this.filters.push((r) => (r[c] as string | number) < v);
    return this;
  }
  contains(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.every((v) => (r[c] as unknown[]).includes(v)));
    return this;
  }
  /** PostgREST "or" filters of the form "col.eq.value,col.cs.{value}". */
  or(expr: string) {
    const parts = expr.replace(/^\(|\)$/g, "").split(/,(?![^{]*})/);
    const tests = parts.map((p) => {
      const [col, op, ...rest] = p.split(".");
      const val = rest.join(".");
      if (op === "eq") return (r: Row) => same(r[col], val);
      if (op === "cs") return (r: Row) => val.replace(/^\{|\}$/g, "").split(",").every((v) => (r[col] as unknown[] | undefined)?.includes(v));
      throw new Error(`fake: unsupported or() operator ${op}`);
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  textSearch(_c: string, q: string) {
    this.filters.push((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
    return this;
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending ?? true, nullsFirst: opts.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }
  returns() {
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve(this.run()).then(ok, fail);
  }

  private visible(): Row[] {
    return this.db.rows(this.table).filter((r) => this.db.owns(this.table, r) && this.filters.every((f) => f(r)));
  }

  private finish(rows: Row[]): Result {
    let out = [...rows];
    for (const o of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const x = a[o.col] as string | number | null;
        const y = b[o.col] as string | number | null;
        if (x === y) return 0;
        if (x === null || x === undefined) return o.nullsFirst ? -1 : 1;
        if (y === null || y === undefined) return o.nullsFirst ? 1 : -1;
        return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    const copy = structuredClone(out);
    if (this.head) return { data: null, error: null, count: copy.length };
    if (this.singleMode) {
      if (copy.length > 1) return { data: null, error: { message: "multiple rows" } };
      if (copy.length === 0 && this.singleMode === "one") return { data: null, error: { message: "no rows", code: "PGRST116" } };
      return { data: copy[0] ?? null, error: null };
    }
    return { data: copy, error: null, count: this.countMode ? copy.length : undefined };
  }

  private run(): Result {
    const db = this.db;
    if (!db.userId) return { data: null, error: { message: "not authenticated" } };
    const table = db.rows(this.table);
    if (this.mode === "select") return this.finish(this.visible());

    if (this.mode === "insert" || this.mode === "upsert") {
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const inserted: Row[] = [];
      for (const input of inputs) {
        if (this.mode === "upsert") {
          const keys = this.upsertOpts.onConflict?.split(",") ?? (this.table === "exemplar_application_links" ? ["exemplar_id", "application_id"] : ["id"]);
          const existing = table.find((r) => db.owns(this.table, r) && keys.every((k) => r[k] === input[k]));
          if (existing) {
            if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, input, { updated_at: new Date().toISOString() });
            inserted.push(existing);
            continue;
          }
        }
        const row = db.prepareInsert(this.table, input);
        if (db.conflicts(this.table, row)) return { data: null, error: { message: "duplicate key", code: "23505" } };
        table.push(row);
        inserted.push(row);
      }
      if (!this.returning) return { data: null, error: null };
      this.singleMode ??= inserted.length === 1 && !Array.isArray(this.payload) ? "one" : null;
      return this.finish(inserted);
    }

    if (this.mode === "update") {
      const targets = this.visible();
      for (const r of targets) {
        if (this.table === "essay_versions" && ["content", "plain_text", "essay_id", "version_number", "source"].some((k) => k in this.payload! && JSON.stringify((this.payload as Row)[k]) !== JSON.stringify(r[k]))) {
          return { data: null, error: { message: "essay versions are immutable" } };
        }
        Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
        if (this.table === "exemplars" && this.payload && "source_text" in this.payload) {
          r.source_hash = createHash("sha256").update(String(r.source_text ?? "")).digest("hex");
        }
      }
      return this.returning ? this.finish(targets) : { data: null, error: null };
    }

    const targets = this.visible();
    db.tables.set(this.table, table.filter((r) => !targets.includes(r)));
    for (const r of targets) db.cascadeDelete(this.table, r);
    return this.returning ? this.finish(targets) : { data: null, error: null };
  }
}

/** A client bound to the fake database for the current user. */
export function fakeClient(db: FakeDb) {
  return {
    from: (table: string) => new Query(db, table),
    // The app's own schema ("essay") uses plain table names; other schemas are prefixed, e.g. "public.evidence".
    schema: (name: string) => ({ from: (table: string) => new Query(db, name === "essay" ? table : `${name}.${table}`) }),
    rpc: async (name: string) => {
      if (name === "delete_my_account") {
        for (const [t, rows] of db.tables) db.tables.set(t, rows.filter((r) => !db.owns(t, r)));
        return { data: null, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    },
    auth: {
      getUser: async () => ({ data: { user: db.userId ? { id: db.userId, email: "applicant@example.test" } : null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    storage: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- one bucket; the name is ignored
      from: (_bucket?: string) => ({
        upload: async (path: string, body: Uint8Array) => {
          if (!db.userId || !path.startsWith(`${db.userId}/`)) return { data: null, error: { message: "forbidden" } };
          db.files.set(path, body);
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          const f = db.userId && path.startsWith(`${db.userId}/`) ? db.files.get(path) : undefined;
          return f ? { data: new Blob([new Uint8Array(f)]), error: null } : { data: null, error: { message: "not found" } };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) if (db.userId && p.startsWith(`${db.userId}/`)) db.files.delete(p);
          return { data: null, error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}?token=x` }, error: null }),
        list: async (prefix: string) => ({
          data: [...db.files.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => ({ name: k.slice(prefix.length + 1) })),
          error: null,
        }),
      }),
    },
  };
}
