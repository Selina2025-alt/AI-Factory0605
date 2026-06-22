import { Client } from "pg";

export interface DatabaseUrlSummary {
  protocol: string;
  host: string;
  port: string;
  database: string;
  ssl: "enabled" | "disabled";
}

export interface PostgresProbeResult {
  ok: boolean;
  summary?: DatabaseUrlSummary;
  error?: string;
}

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function redactKnownSecret(value: string, secret: string) {
  return secret ? value.split(secret).join("<redacted>") : value;
}

function truncateError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);

  message = redactKnownSecret(message, trimEnv("DATABASE_URL"));
  message = redactKnownSecret(message, trimEnv("SUPABASE_SERVICE_ROLE_KEY"));

  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

function parseDatabaseUrl(rawDatabaseUrl: string) {
  const parsed = new URL(rawDatabaseUrl);

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgresql:// or postgres://.");
  }

  const database = parsed.pathname.replace(/^\/+/, "");

  if (!parsed.hostname || !database) {
    throw new Error("DATABASE_URL must include host and database name.");
  }

  return parsed;
}

function shouldEnableSsl(parsed: URL) {
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();

  if (sslMode === "disable") {
    return false;
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return false;
  }

  return true;
}

function summarizeDatabaseUrl(parsed: URL): DatabaseUrlSummary {
  return {
    protocol: parsed.protocol.replace(":", ""),
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\/+/, ""),
    ssl: shouldEnableSsl(parsed) ? "enabled" : "disabled"
  };
}

export function getDatabaseUrlSummary(rawDatabaseUrl = trimEnv("DATABASE_URL")) {
  if (!rawDatabaseUrl) {
    return null;
  }

  return summarizeDatabaseUrl(parseDatabaseUrl(rawDatabaseUrl));
}

export async function probePostgresDatabase(
  rawDatabaseUrl = trimEnv("DATABASE_URL")
): Promise<PostgresProbeResult> {
  if (!rawDatabaseUrl) {
    return {
      ok: false,
      error: "DATABASE_URL is missing."
    };
  }

  let parsed: URL;

  try {
    parsed = parseDatabaseUrl(rawDatabaseUrl);
  } catch (error) {
    return {
      ok: false,
      error: truncateError(error)
    };
  }

  const summary = summarizeDatabaseUrl(parsed);
  const client = new Client({
    connectionString: rawDatabaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    ssl: shouldEnableSsl(parsed) ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    await client.query("select 1 as ok");

    return {
      ok: true,
      summary
    };
  } catch (error) {
    return {
      ok: false,
      summary,
      error: truncateError(error)
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
