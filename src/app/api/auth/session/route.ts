import { NextRequest, NextResponse } from "next/server";

import { createMonitoringRepository } from "@/lib/db/monitoring-repository";
import {
  ensureAuthBootstrap,
  getAuthenticatedUserBySession
} from "@/lib/auth/auth-service";
import { SESSION_TOKEN_COOKIE } from "@/lib/workspace/workspace-context";

export async function GET(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    await ensureAuthBootstrap(repository);
    const token = request.cookies.get(SESSION_TOKEN_COOKIE)?.value ?? "";
    const user = await getAuthenticatedUserBySession(repository, token);

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        workspaceId: user.workspaceId,
        workspaceName: user.workspaceName
      }
    });
  } finally {
    repository.database.close();
  }
}
