import { NextRequest, NextResponse } from "next/server";

import { createMonitoringRepository } from "@/lib/db/monitoring-repository";
import { revokeSession } from "@/lib/auth/auth-service";
import {
  SESSION_TOKEN_COOKIE,
  WORKSPACE_ID_COOKIE
} from "@/lib/workspace/workspace-context";

export async function POST(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    const token = request.cookies.get(SESSION_TOKEN_COOKIE)?.value ?? "";
    await revokeSession(repository, token);
  } finally {
    repository.database.close();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
  response.cookies.set(WORKSPACE_ID_COOKIE, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });

  return response;
}
