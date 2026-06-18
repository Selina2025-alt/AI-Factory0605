const REQUIRED_ENV_KEYS = [
  "APP_DATABASE_PROVIDER",
  "APP_STORAGE_PROVIDER",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "CRON_SECRET",
  "APP_BASE_URL"
];

const SUPABASE_PUBLIC_KEY_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
];

function maskValue(value: string) {
  if (!value) {
    return "<missing>";
  }

  if (value.length <= 10) {
    return "<set>";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function main() {
  const rows = [...REQUIRED_ENV_KEYS, ...SUPABASE_PUBLIC_KEY_ENV_KEYS].map((key) => {
    const value = process.env[key]?.trim() ?? "";

    return {
      key,
      present: Boolean(value),
      preview: maskValue(value)
    };
  });

  const missing = rows.filter((row) => REQUIRED_ENV_KEYS.includes(row.key) && !row.present);
  const hasSupabasePublicKey = SUPABASE_PUBLIC_KEY_ENV_KEYS.some(
    (key) => Boolean(process.env[key]?.trim())
  );

  console.table(rows);

  if (process.env.APP_DATABASE_PROVIDER !== "supabase") {
    console.warn("APP_DATABASE_PROVIDER is not set to supabase.");
  }

  if (process.env.APP_STORAGE_PROVIDER !== "supabase") {
    console.warn("APP_STORAGE_PROVIDER is not set to supabase.");
  }

  if (process.env.SUPABASE_STORAGE_BUCKET !== "assets") {
    console.warn("SUPABASE_STORAGE_BUCKET is expected to be assets for this deployment.");
  }

  if (missing.length > 0 || !hasSupabasePublicKey) {
    const missingKeys = missing.map((row) => row.key);

    if (!hasSupabasePublicKey) {
      missingKeys.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    throw new Error(`Missing required production env vars: ${missingKeys.join(", ")}`);
  }

  console.log("Production database configuration looks complete.");
}

main();
