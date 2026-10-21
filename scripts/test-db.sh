#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local Postgres cluster (with a stub of the
# Supabase auth/storage schemas, plus Letter Studio's schema) and runs the RLS isolation tests.
# Requires initdb/pg_ctl/psql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/rls-db.XXXXXX")"
PORT="${TEST_DB_PORT:-54329}"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
# Essay Studio shares a Supabase project with Recommendation Letter Studio. Apply that app's
# migrations first (snapshot in supabase/tests/letter-studio) to prove the two never collide.
for f in "$ROOT"/supabase/tests/letter-studio/*.sql; do
  echo "applying letter-studio/$(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_isolation.sql"
