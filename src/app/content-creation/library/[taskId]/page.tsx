import { notFound } from "next/navigation";

import { WechatArticleDetail } from "@/components/library/wechat-article-detail";
import { migrateDatabase } from "@/lib/db/migrate";
import { getWechatLibraryDetail } from "@/lib/library/wechat-library-service";

export default async function LibraryArticleDetailPage(props: {
  params: Promise<{ taskId: string }>;
}) {
  migrateDatabase();

  const { taskId } = await props.params;
  const detail = await getWechatLibraryDetail(taskId);

  if (!detail) {
    notFound();
  }

  return <WechatArticleDetail detail={detail} />;
}
