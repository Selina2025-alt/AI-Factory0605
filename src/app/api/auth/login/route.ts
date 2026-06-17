import { NextRequest, NextResponse } from "next/server";

import { createMonitoringRepository } from "@/lib/db/monitoring-repository";
import {
  authenticateUser,
  createAuthSession,
  ensureAuthBootstrap
} from "@/lib/auth/auth-service";
import {
  SESSION_TOKEN_COOKIE,
  WORKSPACE_ID_COOKIE
} from "@/lib/workspace/workspace-context";

interface LoginRequestBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    await ensureAuthBootstrap(repository);

    const body = (await request.json()) as LoginRequestBody;
    const email = body.email?.trim() ?? "";
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const user = await authenticateUser(repository, email, password);

    if (!user) {
      return NextResponse.json(
        { error: "invalid credentials" },
        { status: 401 }
      );
    }

    const session = await createAuthSession(repository, {
      userId: user.id,
      workspaceId: user.workspaceId
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        workspaceId: user.workspaceId,
        workspaceName: user.workspaceName
      }
    });

    const expires = new Date(session.expiresAt);

    response.cookies.set(SESSION_TOKEN_COOKIE, session.token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires
    });
    response.cookies.set(WORKSPACE_ID_COOKIE, user.workspaceId, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Login failed"
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}
