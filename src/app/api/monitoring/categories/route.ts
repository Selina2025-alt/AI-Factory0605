import { NextRequest, NextResponse } from "next/server";

import {
  createMonitoringRepository,
  listMonitorCategories,
  listMonitorCategoryCreators,
  replaceMonitorCategoriesSnapshot
} from "@/lib/db/monitoring-repository";
import type { ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspace/workspace-context";
import { resolveAuthRequestContext } from "@/lib/auth/request-context";

interface CategoryCreatorPayload {
  id?: string;
  name?: string;
  platformId?: ReplicaTrackedPlatformId;
}

interface CategoryPayload {
  id?: string;
  icon?: string;
  name?: string;
  description?: string;
  keyword?: string;
  creators?: CategoryCreatorPayload[];
}

interface ReplaceCategoriesBody {
  categories?: CategoryPayload[];
}

function buildWorkspacePrefix(workspaceId: string) {
  return `ws-${workspaceId}-`;
}

function normalizeEntityId(input: string) {
  return input
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function scopeCategoryId(workspaceId: string, categoryId: string) {
  const normalizedId = normalizeEntityId(categoryId);

  if (!normalizedId) {
    return "";
  }

  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    return normalizedId;
  }

  const prefix = buildWorkspacePrefix(workspaceId);
  return normalizedId.startsWith(prefix) ? normalizedId : `${prefix}${normalizedId}`;
}

function isTrackedPlatformId(value: string): value is ReplicaTrackedPlatformId {
  return (
    value === "douyin" ||
    value === "xiaohongshu" ||
    value === "weibo" ||
    value === "bilibili" ||
    value === "twitter" ||
    value === "wechat" ||
    value === "zhihu"
  );
}

function normalizeCategoriesPayload(input: CategoryPayload[], workspaceId: string) {
  const seenCategoryIds = new Set<string>();

  return input
    .map((category, categoryIndex) => {
      const rawId = category.id?.trim() ?? `category-${categoryIndex + 1}`;
      const id = scopeCategoryId(workspaceId, rawId);
      const name = category.name?.trim() ?? "";

      if (!id || !name || seenCategoryIds.has(id)) {
        return null;
      }

      seenCategoryIds.add(id);
      const creators = Array.isArray(category.creators) ? category.creators : [];
      const seenCreatorIds = new Set<string>();

      return {
        id,
        icon: category.icon?.trim() || "📌",
        name,
        description: category.description?.trim() || `${name} 监控分类`,
        keyword: category.keyword?.trim().toLowerCase() || name.toLowerCase(),
        creators: creators
          .map((creator, creatorIndex) => {
            const creatorIdRaw = creator.id?.trim() ?? `creator-${creatorIndex + 1}`;
            const creatorIdNormalized =
              normalizeEntityId(creatorIdRaw) || `creator-${creatorIndex + 1}`;
            const creatorIdPrefix = `${id}--`;
            const creatorId = creatorIdNormalized.startsWith(creatorIdPrefix)
              ? creatorIdNormalized
              : `${creatorIdPrefix}${creatorIdNormalized}`;
            const creatorName = creator.name?.trim() ?? "";
            const platformIdRaw = creator.platformId?.trim() ?? "wechat";

            if (
              !creatorId ||
              !creatorName ||
              seenCreatorIds.has(creatorId) ||
              !isTrackedPlatformId(platformIdRaw)
            ) {
              return null;
            }

            seenCreatorIds.add(creatorId);
            return {
              id: creatorId,
              name: creatorName,
              platformId: platformIdRaw
            };
          })
          .filter((creator): creator is { id: string; name: string; platformId: ReplicaTrackedPlatformId } =>
            Boolean(creator)
          )
      };
    })
    .filter(
      (
        category
      ): category is {
        id: string;
        icon: string;
        name: string;
        description: string;
        keyword: string;
        creators: Array<{ id: string; name: string; platformId: ReplicaTrackedPlatformId }>;
      } => Boolean(category)
    );
}

export async function GET(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    const authContext = await resolveAuthRequestContext(repository, request);

    if (!authContext) {
      return NextResponse.json({ error: "authentication required", categories: [] }, { status: 401 });
    }

    const workspaceId = authContext.user.workspaceId;
    const categories = await listMonitorCategories(repository, workspaceId);
    const creators = await listMonitorCategoryCreators(repository, workspaceId);
    const creatorsByCategoryId = creators.reduce<Record<string, typeof creators>>((result, creator) => {
      const group = result[creator.categoryId] ?? [];
      group.push(creator);
      result[creator.categoryId] = group;
      return result;
    }, {});

    return NextResponse.json({
      workspaceId,
      categories: categories.map((category) => ({
        id: category.id,
        icon: category.icon,
        name: category.name,
        description: category.description,
        keyword: category.keyword,
        creators:
          creatorsByCategoryId[category.id]?.map((creator) => ({
            id: creator.id,
            name: creator.name,
            platformId: creator.platformId
          })) ?? []
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load categories",
        categories: []
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}

export async function POST(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    const authContext = await resolveAuthRequestContext(repository, request);

    if (!authContext) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }

    const workspaceId = authContext.user.workspaceId;
    const body = (await request.json()) as ReplaceCategoriesBody;
    const normalizedCategories = normalizeCategoriesPayload(body.categories ?? [], workspaceId);

    await replaceMonitorCategoriesSnapshot(repository, {
      workspaceId,
      categories: normalizedCategories.map((item) => ({
        id: item.id,
        icon: item.icon,
        name: item.name,
        description: item.description,
        keyword: item.keyword,
        creators: item.creators
      }))
    });

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save categories"
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}
