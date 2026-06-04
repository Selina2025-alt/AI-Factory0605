import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PlatformId } from "@/lib/content-creation-types";
import {
  ensureAppDirectories,
  getGeneratedAssetFilePath
} from "@/lib/fs/app-paths";
import {
  encodeSupabaseObjectPath,
  getAppStorageProvider,
  requireSupabaseRuntimeConfig
} from "@/lib/supabase/config";

export interface PersistGeneratedAssetBufferInput {
  platform: PlatformId;
  assetId: string;
  extension: string;
  buffer: Buffer;
  contentType: string;
  originalSrc: string;
}

export interface PersistedGeneratedAsset {
  src: string;
  originalSrc: string;
  filePath: string;
}

export interface ReadGeneratedAssetResult {
  buffer: Buffer;
  contentType: string;
}

const GENERATED_ASSETS_STORAGE_PREFIX = "generated-assets";
const LOCAL_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function sanitizeAssetId(assetId: string) {
  return assetId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "asset";
}

function buildAssetRelativePath(input: {
  platform: PlatformId;
  assetId: string;
  extension: string;
}) {
  const fileName = `${sanitizeAssetId(input.assetId)}-${randomUUID()}.${input.extension}`;
  return [input.platform, fileName];
}

function buildStorageObjectPath(assetPath: string[]) {
  return [GENERATED_ASSETS_STORAGE_PREFIX, ...assetPath];
}

function toAssetApiPath(assetPath: string[]) {
  return `/api/assets/${assetPath.map(encodeURIComponent).join("/")}`;
}

function assertValidAssetPath(assetPath: string[]) {
  if (
    assetPath.length === 0 ||
    assetPath.some((segment) => !segment || segment.includes("..") || segment.includes("\\"))
  ) {
    throw new Error("Invalid asset path");
  }
}

async function uploadSupabaseObject(input: {
  objectPath: string[];
  buffer: Buffer;
  contentType: string;
}) {
  const config = requireSupabaseRuntimeConfig();
  const encodedObjectPath = encodeSupabaseObjectPath(input.objectPath);
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.storageBucket)}/${encodedObjectPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": input.contentType,
        "x-upsert": "true"
      },
      body: new Uint8Array(input.buffer)
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Failed to upload generated asset to Supabase Storage: ${response.status} ${detail}`.trim()
    );
  }
}

async function readSupabaseObject(assetPath: string[]) {
  assertValidAssetPath(assetPath);

  const config = requireSupabaseRuntimeConfig();
  const objectPath = buildStorageObjectPath(assetPath);
  const encodedObjectPath = encodeSupabaseObjectPath(objectPath);
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.storageBucket)}/${encodedObjectPath}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Failed to read generated asset from Supabase Storage: ${response.status} ${detail}`.trim()
    );
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

export async function persistGeneratedAssetBuffer(
  input: PersistGeneratedAssetBufferInput
): Promise<PersistedGeneratedAsset> {
  const assetPath = buildAssetRelativePath(input);

  if (getAppStorageProvider() === "supabase") {
    const objectPath = buildStorageObjectPath(assetPath);

    await uploadSupabaseObject({
      objectPath,
      buffer: input.buffer,
      contentType: input.contentType
    });

    return {
      src: toAssetApiPath(assetPath),
      originalSrc: input.originalSrc,
      filePath: `supabase://${objectPath.join("/")}`
    };
  }

  ensureAppDirectories();

  const filePath = getGeneratedAssetFilePath(assetPath);

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, input.buffer);

  return {
    src: toAssetApiPath(assetPath),
    originalSrc: input.originalSrc,
    filePath
  };
}

export async function readGeneratedAsset(
  assetPath: string[]
): Promise<ReadGeneratedAssetResult | null> {
  if (getAppStorageProvider() === "supabase") {
    return readSupabaseObject(assetPath);
  }

  assertValidAssetPath(assetPath);

  const { readFile } = await import("node:fs/promises");
  const filePath = getGeneratedAssetFilePath(assetPath);
  const buffer = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  return {
    buffer,
    contentType: LOCAL_CONTENT_TYPES[extension] ?? "application/octet-stream"
  };
}
