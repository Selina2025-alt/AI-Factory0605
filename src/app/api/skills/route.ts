import { NextResponse } from "next/server";

import { migrateDatabase } from "@/lib/db/migrate";
import { listSkills } from "@/lib/db/repositories/skill-repository";

export const runtime = "nodejs";

export async function GET() {
  migrateDatabase();
  return NextResponse.json(await listSkills());
}
