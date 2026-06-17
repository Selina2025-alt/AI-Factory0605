import type { NextRequest } from "next/server";

import type { MonitoringRepository } from "@/lib/db/monitoring-repository";
import { getAuthenticatedUserBySession } from "@/lib/auth/auth-service";
import { SESSION_TOKEN_COOKIE } from "@/lib/workspace/workspace-context";

export interface AuthRequestContext {
  sessionToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    workspaceId: string;
    workspaceName: string;
  };
}

export async function resolveAuthRequestContext(
  repository: MonitoringRepository,
  request: NextRequest
): Promise<AuthRequestContext | null> {
  const sessionToken = request.cookies.get(SESSION_TOKEN_COOKIE)?.value?.trim() ?? "";

  if (!sessionToken) {
    return null;
  }

  const user = await getAuthenticatedUserBySession(repository, sessionToken);

  if (!user) {
    return null;
  }

  return {
    sessionToken,
    user
  };
}
