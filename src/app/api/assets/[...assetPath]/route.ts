import path from "node:path";

import { NextResponse } from "next/server";

import { readGeneratedAsset } from "@/lib/storage/generated-asset-storage";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function isValidAssetPath(assetPath: string[]) {
  return (
    assetPath.length > 0 &&
    assetPath.every((segment) => segment && !segment.includes("..") && !segment.includes("\\"))
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetPath: string[] }> }
) {
  const { assetPath } = await context.params;

  if (!isValidAssetPath(assetPath ?? [])) {
    return NextResponse.json({ message: "Invalid asset path" }, { status: 400 });
  }

  try {
    const asset = await readGeneratedAsset(assetPath);

    if (!asset) {
      return NextResponse.json({ message: "Asset not found" }, { status: 404 });
    }

    const extension = path.extname(assetPath.at(-1) ?? "").toLowerCase();

    return new Response(new Uint8Array(asset.buffer), {
      headers: {
        "Content-Type": asset.contentType || contentTypes[extension] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json({ message: "Asset not found" }, { status: 404 });
  }
}
