const REQUIRED_ENV_KEYS = [
  "APP_DATABASE_PROVIDER",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "CRON_SECRET"
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
  const rows = REQUIRED_ENV_KEYS.map((key) => {
    const value = process.env[key]?.trim() ?? "";

    return {
      key,
      present: Boolean(value),
      preview: maskValue(value)
    };
  });

  const missing = rows.filter((row) => !row.present);

  console.table(rows);

  if (process.env.APP_DATABASE_PROVIDER !== "supabase") {
    console.warn("APP_DATABASE_PROVIDER is not set to supabase.");
  }

  if (process.env.SUPABASE_STORAGE_BUCKET !== "assets") {
    console.warn("SUPABASE_STORAGE_BUCKET is expected to be assets for this deployment.");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.map((row) => row.key).join(", ")}`);
  }

  console.log("Production database configuration looks complete.");
}

main();
