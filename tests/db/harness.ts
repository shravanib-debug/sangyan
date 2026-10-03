import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Runs the real migrations on an in-process Postgres (PGlite) with Supabase's roles,
 * default privileges and auth.uid() stubbed, then offers a small supabase-js lookalike
 * so application code (sync, pact store, ingest) is exercised against the real schema,
 * grants and RLS rather than against mocks.
 */
export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    -- Supabase grants everything on new public objects; migrations must revoke what clients may not have.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);

  const directory = "supabase/migrations";
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(directory, file), "utf8").replace(/create extension[^;]*;/gi, "");
    await db.exec(sql);
  }
  return db;
}

export async function createUser(db: PGlite, email = "user@example.com"): Promise<string> {
  const result = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return result.rows[0]!.id;
}

type Role = { role: "authenticated"; userId: string } | { role: "service_role" } | { role: "anon" };

interface Filter {
  column: string;
  operator: string;
  value: unknown;
}

const IDENTIFIER = /^[\w\s,*]+$/;

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  // PostgREST renders bytea as a backslash-x hex string.
  if (value instanceof Uint8Array) return "\\x" + Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalise(child)]));
  }
  return value;
}

function param(value: unknown): unknown {
  if (typeof value === "string" && /^\\x([0-9a-f]{2})*$/i.test(value)) return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
  return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
}

class Query implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> {
  private operation: "select" | "insert" | "update" | "upsert" = "select";
  private columns = "*";
  private values: Record<string, unknown> | undefined;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | undefined;
  private max: number | undefined;
  private mode: "many" | "single" | "maybe" = "many";
  private returning = false;
  private conflict: { target: string; ignore: boolean } | undefined;

  constructor(
    private readonly db: PGlite,
    private readonly role: Role,
    private readonly table: string
  ) {}

  select(columns = "*") {
    if (!IDENTIFIER.test(columns)) throw new Error(`unsupported select list: ${columns}`);
    this.columns = columns;
    if (this.operation !== "select") this.returning = true;
    return this;
  }
  insert(values: Record<string, unknown>) {
    this.operation = "insert";
    this.values = values;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.values = values;
    return this;
  }
  upsert(values: Record<string, unknown>, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.operation = "upsert";
    this.values = values;
    this.conflict = { target: options.onConflict ?? "id", ignore: Boolean(options.ignoreDuplicates) };
    return this;
  }
  private filter(operator: string, column: string, value: unknown) {
    this.filters.push({ column, operator, value });
    return this;
  }
  eq(column: string, value: unknown) {
    return this.filter("=", column, value);
  }
  is(column: string, value: null) {
    return this.filter("is", column, value);
  }
  gt(column: string, value: unknown) {
    return this.filter(">", column, value);
  }
  gte(column: string, value: unknown) {
    return this.filter(">=", column, value);
  }
  lt(column: string, value: unknown) {
    return this.filter("<", column, value);
  }
  lte(column: string, value: unknown) {
    return this.filter("<=", column, value);
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private sql() {
    const params: unknown[] = [];
    const add = (value: unknown) => {
      params.push(param(value));
      return `$${params.length}`;
    };
    const where = this.filters.length
      ? ` where ${this.filters
          .map((f) => (f.operator === "is" ? `${f.column} is null` : `${f.column} ${f.operator} ${add(f.value)}`))
          .join(" and ")}`
      : "";
    const returning = this.returning ? ` returning ${this.columns}` : "";
    const entries = Object.entries(this.values ?? {});
    const table = `public.${this.table}`;

    if (this.operation === "select") {
      const order = this.orderBy ? ` order by ${this.orderBy.column} ${this.orderBy.ascending ? "asc" : "desc"}` : "";
      const limit = this.max ? ` limit ${this.max}` : "";
      return { text: `select ${this.columns} from ${table}${where}${order}${limit}`, params };
    }
    if (this.operation === "update") {
      const set = entries.map(([key, value]) => `${key} = ${add(value)}`).join(", ");
      return { text: `update ${table} set ${set}${where}${returning}`, params };
    }
    const cols = entries.map(([key]) => key).join(", ");
    const placeholders = entries.map(([, value]) => add(value)).join(", ");
    let text = `insert into ${table} (${cols}) values (${placeholders})`;
    if (this.operation === "upsert" && this.conflict) {
      const targets = this.conflict.target.split(",").map((part) => part.trim());
      const updates = entries
        .map(([key]) => key)
        .filter((key) => !targets.includes(key))
        .map((key) => `${key} = excluded.${key}`);
      text += this.conflict.ignore || updates.length === 0
        ? ` on conflict (${this.conflict.target}) do nothing`
        : ` on conflict (${this.conflict.target}) do update set ${updates.join(", ")}`;
    }
    return { text: text + returning, params };
  }

  async then<T1, T2>(
    onfulfilled?: ((value: { data: unknown; error: { code?: string; message: string } | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    try {
      const { text, params } = this.sql();
      const rows = await runAs(this.db, this.role, text, params);
      const wrote = this.operation === "select" || this.returning;
      if (!wrote) return { data: null, error: null };
      if (this.mode === "single") {
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "expected one row" } };
      }
      if (this.mode === "maybe") {
        return rows.length > 1
          ? { data: null, error: { code: "PGRST116", message: "multiple rows" } }
          : { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (error) {
      const failure = error as { code?: string; message: string };
      return { data: null, error: { code: failure.code, message: failure.message } };
    }
  }
}

async function runAs(db: PGlite, role: Role, text: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role.role}`);
    if (role.role === "authenticated") await tx.exec(`set local "request.jwt.claim.sub" = '${role.userId}'`);
    const result = await tx.query<Record<string, unknown>>(text, params);
    return result.rows.map((row) => normalise(row) as Record<string, unknown>);
  });
}

export function supabaseOver(db: PGlite, role: Role): SupabaseClient {
  const client = {
    from: (table: string) => new Query(db, role, table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      try {
        const keys = Object.keys(args);
        const call = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
        const rows = await runAs(db, role, `select * from public.${name}(${call})`, keys.map((key) => param(args[key])));
        const first = rows[0];
        const scalar = first && Object.keys(first).length === 1 && Object.keys(first)[0] === name;
        return { data: scalar ? first[name] : rows, error: null };
      } catch (error) {
        const failure = error as { code?: string; message: string };
        return { data: null, error: { code: failure.code, message: failure.message } };
      }
    }
  };
  return client as unknown as SupabaseClient;
}
