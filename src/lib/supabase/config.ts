export type AppDatabaseProvider = "sqlite" | "supabase";
export type AppStorageProvider = "local" | "supabase";

export interface SupabaseRuntimeConfig {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  storageBucket: string;
}

function normalizeProvider(value: string | undefined, fallback: AppDatabaseProvider) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "supabase" ? "supabase" : fallback;
}

function normalizeStorageProvider(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "supabase") {
    return "supabase";
  }

  if (normalized === "local") {
    return "local";
  }

  return null;
}

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getAppDatabaseProvider(): AppDatabaseProvider {
  return normalizeProvider(process.env.APP_DATABASE_PROVIDER, "sqlite");
}

export function getAppStorageProvider(): AppStorageProvider {
  return (
    normalizeStorageProvider(process.env.APP_STORAGE_PROVIDER) ??
    (getAppDatabaseProvider() === "supabase" ? "supabase" : "local")
  );
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const url = (trimEnv("SUPABASE_URL") || trimEnv("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, "");
  const publishableKey =
    trimEnv("SUPABASE_PUBLISHABLE_KEY") ||
    trimEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    trimEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = trimEnv("SUPABASE_SERVICE_ROLE_KEY");
  const storageBucket = trimEnv("SUPABASE_STORAGE_BUCKET") || "assets";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    publishableKey,
    serviceRoleKey,
    storageBucket
  };
}

export function requireSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const config = getSupabaseRuntimeConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return config;
}

export function encodeSupabaseObjectPath(pathSegments: string[]) {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
}
