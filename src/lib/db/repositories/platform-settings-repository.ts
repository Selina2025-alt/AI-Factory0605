import type { PlatformId } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/platform-settings-repository";

type UpsertPlatformSettingInput = Parameters<typeof sqlite.upsertPlatformSetting>[0];

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function getPlatformSetting(platform: PlatformId) {
  return (shouldUseSupabase() ? supabase.getPlatformSetting(platform) : sqlite.getPlatformSetting(platform)) as unknown;
}

export function upsertPlatformSetting(input: UpsertPlatformSettingInput) {
  return (shouldUseSupabase() ? supabase.upsertPlatformSetting(input) : sqlite.upsertPlatformSetting(input)) as void;
}
