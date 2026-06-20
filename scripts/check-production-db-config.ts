import {
  getCloudReadinessReport,
  REQUIRED_PRODUCTION_ENV_KEYS,
  SUPABASE_PUBLIC_KEY_ENV_KEYS
} from "@/lib/cloud/cloud-readiness";

function maskValue(value: string) {
  if (!value) {
    return "<missing>";
  }

  if (value.length <= 10) {
    return "<set>";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function main() {
  const rows = [...REQUIRED_PRODUCTION_ENV_KEYS, ...SUPABASE_PUBLIC_KEY_ENV_KEYS].map((key) => {
    const value = process.env[key]?.trim() ?? "";

    return {
      key,
      present: Boolean(value),
      preview: maskValue(value)
    };
  });

  console.table(rows);
  const report = await getCloudReadinessReport({ probeSupabase: false });

  console.table(
    report.checks.map((check) => ({
      id: check.id,
      status: check.status,
      message: check.message
    }))
  );

  if (report.status !== "ready") {
    throw new Error("Production cloud readiness checks are blocked.");
  }

  console.log("Production cloud readiness configuration looks complete.");
}

main();
