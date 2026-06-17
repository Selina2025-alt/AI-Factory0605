import { requireSupabaseRuntimeConfig } from "@/lib/supabase/config";

type FilterMap = Record<string, string>;

export interface SupabaseSelectOptions {
  select?: string;
  filters?: FilterMap;
  order?: string;
  limit?: number;
}

function getRestBaseUrl() {
  return `${requireSupabaseRuntimeConfig().url}/rest/v1`;
}

function getHeaders(prefer?: string) {
  const { serviceRoleKey } = requireSupabaseRuntimeConfig();
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function buildUrl(table: string, options: SupabaseSelectOptions = {}) {
  const params = new URLSearchParams();
  params.set("select", options.select ?? "*");

  for (const [key, value] of Object.entries(options.filters ?? {})) {
    params.set(key, value);
  }

  if (options.order) {
    params.set("order", options.order);
  }

  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }

  return `${getRestBaseUrl()}/${table}?${params.toString()}`;
}

function buildMutationUrl(table: string, filters?: FilterMap, extra?: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters ?? {})) {
    params.set(key, value);
  }

  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }

  const query = params.toString();
  return `${getRestBaseUrl()}/${table}${query ? `?${query}` : ""}`;
}

async function assertOk(response: Response, action: string) {
  if (response.ok) {
    return;
  }

  const detail = await response.text().catch(() => "");
  throw new Error(`Supabase ${action} failed: ${response.status} ${detail}`.trim());
}

export function eq(value: string | number | boolean) {
  return `eq.${String(value)}`;
}

export function isNull() {
  return "is.null";
}

export function orderBy(column: string, direction: "asc" | "desc" = "asc") {
  return `${column}.${direction}`;
}

export async function selectRows<T>(table: string, options: SupabaseSelectOptions = {}) {
  const response = await fetch(buildUrl(table, options), {
    method: "GET",
    headers: getHeaders()
  });

  await assertOk(response, `select ${table}`);
  return (await response.json()) as T[];
}

export async function selectOne<T>(table: string, options: SupabaseSelectOptions = {}) {
  const rows = await selectRows<T>(table, { ...options, limit: 1 });
  return rows[0] ?? null;
}

export async function insertRows<T extends Record<string, unknown>>(table: string, rows: T | T[]) {
  const response = await fetch(buildMutationUrl(table), {
    method: "POST",
    headers: getHeaders("return=minimal"),
    body: JSON.stringify(rows)
  });

  await assertOk(response, `insert ${table}`);
}

export async function upsertRows<T extends Record<string, unknown>>(
  table: string,
  rows: T | T[],
  onConflict: string
) {
  const response = await fetch(buildMutationUrl(table, undefined, { on_conflict: onConflict }), {
    method: "POST",
    headers: getHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(rows)
  });

  await assertOk(response, `upsert ${table}`);
}

export async function updateRows<T extends Record<string, unknown>>(
  table: string,
  filters: FilterMap,
  patch: T
) {
  const response = await fetch(buildMutationUrl(table, filters), {
    method: "PATCH",
    headers: getHeaders("return=minimal"),
    body: JSON.stringify(patch)
  });

  await assertOk(response, `update ${table}`);
}

export async function deleteRows(table: string, filters: FilterMap) {
  const response = await fetch(buildMutationUrl(table, filters), {
    method: "DELETE",
    headers: getHeaders("return=minimal")
  });

  await assertOk(response, `delete ${table}`);
}

export function parseJsonArray<T>(value: unknown, fallback: T[] = []) {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === "string" && value.trim()) {
    return JSON.parse(value) as T[];
  }

  return fallback;
}

export function parseJsonObject<T extends Record<string, unknown>>(value: unknown, fallback: T) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }

  if (typeof value === "string" && value.trim()) {
    return JSON.parse(value) as T;
  }

  return fallback;
}
