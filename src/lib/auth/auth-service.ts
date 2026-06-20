import crypto from "node:crypto";

import type { MonitoringRepository } from "@/lib/db/monitoring-repository";
import { isSupabaseMonitoringRepository } from "@/lib/db/monitoring-repository";
import { assertSafeSupabaseBootstrapCredentials } from "@/lib/cloud/cloud-readiness";
import {
  deleteRows,
  eq,
  insertRows,
  selectOne,
  selectRows
} from "@/lib/supabase/data-api";
import { normalizeWorkspaceId } from "@/lib/workspace/workspace-context";

export interface AuthSession {
  token: string;
  userId: string;
  workspaceId: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
}

interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
}

interface AuthMembershipRow {
  workspace_id: string;
  workspace_name: string;
}

const DEFAULT_BOOTSTRAP_EMAIL = "admin@aicontentfactory.local";
const DEFAULT_BOOTSTRAP_PASSWORD = "Admin@123456";
const DEFAULT_BOOTSTRAP_NAME = "Admin";
const DEFAULT_SESSION_TTL_DAYS = 30;

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hashedValue: string) {
  const [salt, expectedHash] = hashedValue.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const currentHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const currentBuffer = Buffer.from(currentHash, "hex");

  if (expectedBuffer.length !== currentBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, currentBuffer);
}

function createOpaqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function getBootstrapConfig() {
  assertSafeSupabaseBootstrapCredentials();

  const email = (process.env.ACF_BOOTSTRAP_EMAIL ?? DEFAULT_BOOTSTRAP_EMAIL)
    .trim()
    .toLowerCase();
  const password = (process.env.ACF_BOOTSTRAP_PASSWORD ?? DEFAULT_BOOTSTRAP_PASSWORD).trim();
  const displayName = (process.env.ACF_BOOTSTRAP_NAME ?? DEFAULT_BOOTSTRAP_NAME).trim();
  const workspaceName = (process.env.ACF_BOOTSTRAP_WORKSPACE_NAME ?? "Default Workspace").trim();
  const workspaceId = normalizeWorkspaceId(
    process.env.ACF_BOOTSTRAP_WORKSPACE_ID ?? "default-workspace"
  );

  return {
    email,
    password,
    displayName: displayName || DEFAULT_BOOTSTRAP_NAME,
    workspaceName: workspaceName || "Default Workspace",
    workspaceId
  };
}

async function ensureAuthBootstrapSupabase() {
  const existing = await selectOne<{ id: string }>("auth_users", {
    select: "id",
    limit: 1
  });

  if (existing) {
    return;
  }

  const config = getBootstrapConfig();
  const now = new Date().toISOString();
  const userId = createOpaqueId("user");
  const workspaceId = config.workspaceId || slugify("default-workspace");

  await insertRows("auth_users", {
    id: userId,
    email: config.email,
    password_hash: hashPassword(config.password),
    display_name: config.displayName,
    status: "active",
    created_at: now,
    updated_at: now
  });
  await insertRows("auth_workspaces", {
    id: workspaceId,
    name: config.workspaceName,
    owner_user_id: userId,
    created_at: now,
    updated_at: now
  });
  await insertRows("auth_workspace_members", {
    workspace_id: workspaceId,
    user_id: userId,
    role: "owner",
    created_at: now
  });
}

async function authenticateUserSupabase(
  emailRaw: string,
  password: string
): Promise<AuthenticatedUser | null> {
  await ensureAuthBootstrapSupabase();

  const email = emailRaw.trim().toLowerCase();
  const user = await selectOne<AuthUserRow>("auth_users", {
    filters: { email: eq(email), status: eq("active") }
  });

  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  const membership = await selectOne<{
    workspace_id: string;
    user_id: string;
    role: string;
    created_at: string;
  }>("auth_workspace_members", {
    filters: { user_id: eq(user.id) },
    order: "created_at.asc"
  });

  if (!membership) {
    return null;
  }

  const workspace = await selectOne<{ id: string; name: string }>("auth_workspaces", {
    filters: { id: eq(membership.workspace_id) }
  });

  if (!workspace) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    workspaceId: workspace.id,
    workspaceName: workspace.name
  };
}

async function createAuthSessionSupabase(input: {
  userId: string;
  workspaceId: string;
  ttlDays?: number;
}): Promise<AuthSession> {
  const now = new Date();
  const token = createSessionToken();
  const ttlDays = input.ttlDays ?? DEFAULT_SESSION_TTL_DAYS;
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  await insertRows("auth_sessions", {
    token,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    expires_at: expiresAt,
    created_at: createdAt
  });

  return {
    token,
    userId: input.userId,
    workspaceId: input.workspaceId,
    expiresAt,
    createdAt
  };
}

async function getSessionByTokenSupabase(tokenRaw: string): Promise<AuthSession | null> {
  const token = tokenRaw.trim();

  if (!token) {
    return null;
  }

  const row = await selectOne<{
    token: string;
    user_id: string;
    workspace_id: string;
    expires_at: string;
    created_at: string;
  }>("auth_sessions", {
    filters: { token: eq(token) }
  });

  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteRows("auth_sessions", { token: eq(row.token) });
    return null;
  }

  return {
    token: row.token,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

async function revokeSessionSupabase(tokenRaw: string) {
  const token = tokenRaw.trim();

  if (!token) {
    return;
  }

  await deleteRows("auth_sessions", { token: eq(token) });
}

async function getAuthenticatedUserBySessionSupabase(
  sessionToken: string
): Promise<AuthenticatedUser | null> {
  const session = await getSessionByTokenSupabase(sessionToken);

  if (!session) {
    return null;
  }

  const user = await selectOne<{
    id: string;
    email: string;
    display_name: string;
  }>("auth_users", {
    filters: { id: eq(session.userId), status: eq("active") }
  });

  if (!user) {
    return null;
  }

  const workspace = await selectOne<{ id: string; name: string }>("auth_workspaces", {
    filters: { id: eq(session.workspaceId) }
  });

  if (!workspace) {
    return null;
  }

  const membership = await selectOne<{ role: string }>("auth_workspace_members", {
    filters: { workspace_id: eq(workspace.id), user_id: eq(user.id) }
  });

  if (!membership) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    workspaceId: workspace.id,
    workspaceName: workspace.name
  };
}

export function ensureAuthBootstrap(repository: MonitoringRepository) {
  if (isSupabaseMonitoringRepository(repository)) {
    return ensureAuthBootstrapSupabase() as unknown as void;
  }

  const existingCount = repository.database
    .prepare("SELECT COUNT(1) AS count FROM auth_users")
    .get() as { count: number };

  if ((existingCount?.count ?? 0) > 0) {
    return;
  }

  const config = getBootstrapConfig();
  const now = new Date().toISOString();
  const userId = createOpaqueId("user");
  const workspaceId = config.workspaceId || slugify("default-workspace");

  repository.database.exec("BEGIN");

  try {
    repository.database
      .prepare(
        `INSERT INTO auth_users (
          id,
          email,
          password_hash,
          display_name,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(userId, config.email, hashPassword(config.password), config.displayName, now, now);

    repository.database
      .prepare(
        `INSERT INTO auth_workspaces (
          id,
          name,
          owner_user_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(workspaceId, config.workspaceName, userId, now, now);

    repository.database
      .prepare(
        `INSERT INTO auth_workspace_members (
          workspace_id,
          user_id,
          role,
          created_at
        ) VALUES (?, ?, 'owner', ?)`
      )
      .run(workspaceId, userId, now);

    repository.database.exec("COMMIT");
  } catch (error) {
    repository.database.exec("ROLLBACK");
    throw error;
  }
}

export function authenticateUser(
  repository: MonitoringRepository,
  emailRaw: string,
  password: string
): AuthenticatedUser | null {
  if (isSupabaseMonitoringRepository(repository)) {
    return authenticateUserSupabase(emailRaw, password) as unknown as AuthenticatedUser | null;
  }

  ensureAuthBootstrap(repository);

  const email = emailRaw.trim().toLowerCase();
  const user = repository.database
    .prepare(
      `SELECT id, email, password_hash, display_name
       FROM auth_users
       WHERE email = ? AND status = 'active'
       LIMIT 1`
    )
    .get(email) as AuthUserRow | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  const membership = repository.database
    .prepare(
      `SELECT m.workspace_id, w.name AS workspace_name
       FROM auth_workspace_members m
       INNER JOIN auth_workspaces w
         ON w.id = m.workspace_id
       WHERE m.user_id = ?
       ORDER BY m.created_at ASC
       LIMIT 1`
    )
    .get(user.id) as AuthMembershipRow | undefined;

  if (!membership) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    workspaceId: membership.workspace_id,
    workspaceName: membership.workspace_name
  };
}

export function createAuthSession(
  repository: MonitoringRepository,
  input: {
    userId: string;
    workspaceId: string;
    ttlDays?: number;
  }
): AuthSession {
  if (isSupabaseMonitoringRepository(repository)) {
    return createAuthSessionSupabase(input) as unknown as AuthSession;
  }

  const now = new Date();
  const token = createSessionToken();
  const ttlDays = input.ttlDays ?? DEFAULT_SESSION_TTL_DAYS;
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  repository.database
    .prepare(
      `INSERT INTO auth_sessions (
        token,
        user_id,
        workspace_id,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .run(token, input.userId, input.workspaceId, expiresAt, createdAt);

  return {
    token,
    userId: input.userId,
    workspaceId: input.workspaceId,
    expiresAt,
    createdAt
  };
}

export function getSessionByToken(
  repository: MonitoringRepository,
  tokenRaw: string
): AuthSession | null {
  if (isSupabaseMonitoringRepository(repository)) {
    return getSessionByTokenSupabase(tokenRaw) as unknown as AuthSession | null;
  }

  const token = tokenRaw.trim();

  if (!token) {
    return null;
  }

  const row = repository.database
    .prepare(
      `SELECT token, user_id, workspace_id, expires_at, created_at
       FROM auth_sessions
       WHERE token = ?
       LIMIT 1`
    )
    .get(token) as
    | {
        token: string;
        user_id: string;
        workspace_id: string;
        expires_at: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    repository.database.prepare("DELETE FROM auth_sessions WHERE token = ?").run(row.token);
    return null;
  }

  return {
    token: row.token,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

export function revokeSession(repository: MonitoringRepository, tokenRaw: string) {
  if (isSupabaseMonitoringRepository(repository)) {
    return revokeSessionSupabase(tokenRaw) as unknown as void;
  }

  const token = tokenRaw.trim();

  if (!token) {
    return;
  }

  repository.database.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
}

export function getAuthenticatedUserBySession(
  repository: MonitoringRepository,
  sessionToken: string
): AuthenticatedUser | null {
  if (isSupabaseMonitoringRepository(repository)) {
    return getAuthenticatedUserBySessionSupabase(sessionToken) as unknown as AuthenticatedUser | null;
  }

  const session = getSessionByToken(repository, sessionToken);

  if (!session) {
    return null;
  }

  const user = repository.database
    .prepare(
      `SELECT id, email, display_name
       FROM auth_users
       WHERE id = ? AND status = 'active'
       LIMIT 1`
    )
    .get(session.userId) as
    | {
        id: string;
        email: string;
        display_name: string;
      }
    | undefined;

  if (!user) {
    return null;
  }

  const workspace = repository.database
    .prepare(
      `SELECT id, name
       FROM auth_workspaces
       WHERE id = ?
       LIMIT 1`
    )
    .get(session.workspaceId) as
    | {
        id: string;
        name: string;
      }
    | undefined;

  if (!workspace) {
    return null;
  }

  const membership = repository.database
    .prepare(
      `SELECT role
       FROM auth_workspace_members
       WHERE workspace_id = ? AND user_id = ?
       LIMIT 1`
    )
    .get(workspace.id, user.id) as { role: string } | undefined;

  if (!membership) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    workspaceId: workspace.id,
    workspaceName: workspace.name
  };
}
