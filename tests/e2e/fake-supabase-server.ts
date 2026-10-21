// A local HTTP stand-in for Supabase (PostgREST, GoTrue and Storage endpoints) backed by the
// in-memory FakeDb. It lets Playwright drive the real app end to end without a Supabase project.
// Test use only: it implements just the subset of each API that Essay Studio calls.
//
//   pnpm exec tsx tests/e2e/fake-supabase-server.ts   (listens on FAKE_SUPABASE_PORT, default 54329)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { FakeDb, fakeClient } from "../support/fake-supabase";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54329);
const db = new FakeDb();
const users = new Map<string, { id: string; email: string; password: string }>();
const refreshTokens = new Map<string, string>();

// Many-to-one embeds used by the app's select strings: [from table, embed] -> foreign key column.
const EMBEDS: Record<string, string> = {
  "essay_evidence_links.library_entries": "entry_id",
  "essay_evidence_links.essays": "essay_id",
  "essays.applications": "application_id",
  "exemplar_analyses.exemplars": "exemplar_id",
  "exemplar_application_links.exemplars": "exemplar_id",
};

const b64url = (s: string) => Buffer.from(s).toString("base64url");
function jwt(user: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 }))}.c2ln`;
}
function userFromAuth(req: IncomingMessage) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (exp * 1000 < Date.now()) return null;
    return [...users.values()].find((u) => u.id === sub) ?? null;
  } catch {
    return null;
  }
}
function session(user: { id: string; email: string }) {
  const refresh = randomUUID();
  refreshTokens.set(refresh, user.id);
  return {
    access_token: jwt(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refresh,
    user: publicUser(user),
  };
}
const publicUser = (u: { id: string; email: string }) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
});

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(data === undefined ? "" : JSON.stringify(data));
}

/** Splits a PostgREST select string at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Applies a select string (columns and many-to-one embeds) to rows owned by the current user. */
function project(table: string, rows: Record<string, unknown>[], select: string): Record<string, unknown>[] {
  const parts = splitTop(select || "*");
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const p of parts) {
      const m = /^(\w+)\(([\s\S]*)\)$/.exec(p);
      if (m) {
        const [, embed, inner] = m;
        const fk = EMBEDS[`${table}.${embed}`];
        const target = fk ? db.rows(embed).find((r) => r.id === row[fk] && db.owns(embed, r)) : undefined;
        out[embed] = target ? project(embed, [target], inner)[0] : null;
      } else if (p === "*") Object.assign(out, row);
      else out[p] = row[p];
    }
    return structuredClone(out);
  });
}

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return decodeURIComponent(v.replace(/^"(.*)"$/, "$1"));
}

async function rest(req: IncomingMessage, res: ServerResponse, url: URL, table: string) {
  const client = fakeClient(db);
  const prefer = String(req.headers.prefer ?? "");
  const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
  const raw = req.method === "POST" || req.method === "PATCH" ? JSON.parse((await body(req)).toString() || "null") : null;

  if (table.startsWith("rpc/")) {
    const r = await client.rpc(table.slice(4));
    return send(res, r.error ? 400 : 200, r.error ? { message: r.error.message } : null);
  }

  // Build the query with the same fake builder the unit tests use. The schema comes from the
  // Accept-Profile / Content-Profile header, as with real PostgREST.
  const profile = String(req.headers["content-profile"] ?? req.headers["accept-profile"] ?? "essay");
  let q = client.schema(profile).from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
  if (req.method === "POST") {
    const onConflict = url.searchParams.get("on_conflict") ?? undefined;
    q = (prefer.includes("resolution=") ? q.upsert(raw, { onConflict, ignoreDuplicates: prefer.includes("ignore-duplicates") }) : q.insert(raw)) as typeof q;
  } else if (req.method === "PATCH") q = q.update(raw) as typeof q;
  else if (req.method === "DELETE") q = q.delete() as typeof q;

  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or") {
      q = q.or(decodeURIComponent(value)) as typeof q;
      continue;
    }
    const not = value.startsWith("not.");
    const v = not ? value.slice(4) : value;
    const dot = v.indexOf(".");
    const op = v.slice(0, dot);
    const arg = v.slice(dot + 1);
    if (op === "eq") q = q.eq(key, parseValue(arg)) as typeof q;
    else if (op === "neq") q = q.neq(key, parseValue(arg)) as typeof q;
    else if (op === "is") q = (not ? q.not(key, "is", null) : q.is(key, null)) as typeof q;
    else if (op === "in") q = q.in(key, arg.replace(/^\(|\)$/g, "").split(",").map(parseValue)) as typeof q;
    else if (op === "gte") q = q.gte(key, parseValue(arg)) as typeof q;
    else if (op === "lt") q = q.lt(key, parseValue(arg)) as typeof q;
    else if (op === "cs") q = q.contains(key, arg.replace(/^\{|\}$/g, "").split(",").map(parseValue)) as typeof q;
    else if (op.startsWith("wfts") || op.startsWith("fts")) q = q.textSearch(key, decodeURIComponent(arg)) as typeof q;
  }
  for (const o of (url.searchParams.get("order") ?? "").split(",").filter(Boolean)) {
    const [col, dir, nulls] = o.split(".");
    q = q.order(col, { ascending: dir !== "desc", nullsFirst: nulls === "nullsfirst" }) as typeof q;
  }
  if (url.searchParams.get("limit")) q = q.limit(Number(url.searchParams.get("limit"))) as typeof q;
  if (req.method !== "GET" && req.method !== "HEAD" && prefer.includes("return=representation")) q = q.select("*") as typeof q;

  const result = (await (q as unknown as PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>)) as {
    data: Record<string, unknown>[] | Record<string, unknown> | null;
    error: { message: string; code?: string } | null;
  };
  if (result.error) return send(res, result.error.code === "23505" ? 409 : 400, { message: result.error.message, code: result.error.code });
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  const projected = project(table, rows, url.searchParams.get("select") ?? "*");
  const headers: Record<string, string> = {};
  if (prefer.includes("count=")) headers["Content-Range"] = `0-${Math.max(0, rows.length - 1)}/${rows.length}`;
  if (req.method === "HEAD") return send(res, 200, undefined, headers);
  if (req.method !== "GET" && !prefer.includes("return=representation")) return send(res, 201, undefined, headers);
  if (wantsObject) {
    if (projected.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return send(res, 200, projected[0], headers);
  }
  return send(res, 200, projected, headers);
}

async function auth(req: IncomingMessage, res: ServerResponse, url: URL, path: string) {
  if (path === "signup" || (path === "token" && url.searchParams.get("grant_type") === "password")) {
    const { email, password } = JSON.parse((await body(req)).toString());
    let user = [...users.values()].find((u) => u.email === email);
    if (path === "signup") {
      if (user) return send(res, 422, { code: "user_already_exists", msg: "User already registered" });
      user = { id: randomUUID(), email, password };
      users.set(user.id, user);
      db.rows("profiles").push({ id: user.id, display_name: null, full_name: null, writing_preferences: {}, export_settings: {}, ai_enabled: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    if (!user || user.password !== password) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
    return send(res, 200, session(user));
  }
  if (path === "token" && url.searchParams.get("grant_type") === "refresh_token") {
    const { refresh_token } = JSON.parse((await body(req)).toString());
    const id = refreshTokens.get(refresh_token);
    const user = id ? users.get(id) : undefined;
    if (!user) return send(res, 400, { error: "invalid_grant", code: "refresh_token_not_found" });
    return send(res, 200, session(user));
  }
  const user = userFromAuth(req);
  if (path === "user") {
    if (!user) return send(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
    if (req.method === "PUT") {
      const { password } = JSON.parse((await body(req)).toString());
      if (password) user.password = password;
    }
    return send(res, 200, publicUser(user));
  }
  if (path === "logout") return send(res, 204, undefined);
  return send(res, 404, { msg: "not found" });
}

async function storage(req: IncomingMessage, res: ServerResponse, path: string) {
  const s = fakeClient(db).storage.from("essay-files");
  const objectPath = path.replace(/^object\/(sign\/|list\/|authenticated\/)?essay-files\/?/, "");
  if (req.method === "POST" && path.startsWith("object/sign/")) {
    return send(res, 200, { signedURL: `/object/sign/essay-files/${objectPath}?token=test` });
  }
  if (req.method === "POST" && path.startsWith("object/list/")) {
    const { prefix } = JSON.parse((await body(req)).toString());
    return send(res, 200, (await s.list(prefix)).data);
  }
  if (req.method === "POST" || req.method === "PUT") {
    const r = await s.upload(decodeURIComponent(objectPath), new Uint8Array(await body(req)));
    return r.error ? send(res, 403, { statusCode: "403", error: "Unauthorized", message: r.error.message }) : send(res, 200, { Key: `essay-files/${objectPath}`, Id: randomUUID() });
  }
  if (req.method === "GET") {
    const r = await s.download(decodeURIComponent(objectPath));
    if (!r.data) return send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return res.end(Buffer.from(await r.data.arrayBuffer()));
  }
  if (req.method === "DELETE") {
    const { prefixes } = JSON.parse((await body(req)).toString());
    await s.remove(prefixes);
    return send(res, 200, []);
  }
  return send(res, 404, {});
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
      return res.end();
    }
    if (url.pathname === "/__seed-letter-evidence") {
      // Test only: gives a signed-up user some Recommendation Letter Studio evidence to import.
      const user = [...users.values()].find((u) => u.email === url.searchParams.get("email"));
      if (!user) return send(res, 404, { message: "no such user" });
      for (const title of ["Led the hospital data dashboard project", "Mentored first-year students"]) {
        db.rows("public.evidence").push({
          id: randomUUID(),
          user_id: user.id,
          title,
          category: "leadership",
          description: `${title} context`,
          period: "2024",
          role: "Lead",
          individual_contribution: "Designed and ran it",
          problem: null,
          decisions: null,
          outcome: "Adopted by two wards",
          quantified_impact: null,
          supporting_url: null,
          information_source: null,
          verification_status: "recommender_confirmed",
          created_at: new Date().toISOString(),
        });
      }
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__reset") {
      db.tables.clear();
      db.files.clear();
      users.clear();
      return send(res, 200, { ok: true });
    }
    // Requests are handled one at a time on a single thread, so a per-request user is safe.
    db.userId = userFromAuth(req)?.id ?? null;
    const [, service, , ...rest_] = url.pathname.split("/");
    const tail = rest_.join("/");
    if (service === "rest") return await rest(req, res, url, tail);
    if (service === "auth") return await auth(req, res, url, tail);
    if (service === "storage") return await storage(req, res, tail);
    send(res, 404, { message: "unknown endpoint" });
  } catch (e) {
    send(res, 500, { message: e instanceof Error ? e.message : "error" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fake supabase listening on ${PORT}`));
