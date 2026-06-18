import { WechatLibraryShell } from "@/components/library/wechat-library-shell";
import { migrateDatabase } from "@/lib/db/migrate";
import { getWechatLibraryPayload } from "@/lib/library/wechat-library-service";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  migrateDatabase();

  const payload = await getWechatLibraryPayload();

  return (
    <WechatLibraryShell
      items={payload.items}
      recentActions={payload.recentActions}
    />
  );
}
