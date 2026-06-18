import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getTaskGenerationTrace } from "@/lib/content/task-generation-trace";
import { migrateDatabase } from "@/lib/db/migrate";
import { getLibraryEntry } from "@/lib/db/repositories/library-entry-repository";
import { getTaskBundle } from "@/lib/db/repositories/task-content-repository";
import { getTaskById, listTasks } from "@/lib/db/repositories/task-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkspacePage(props: {
  params: Promise<{ taskId: string }>;
}) {
  migrateDatabase();

  const { taskId } = await props.params;
  const task = await getTaskById(taskId);

  if (!task) {
    notFound();
  }

  const history = await listTasks();

  return (
    <WorkspaceShell
      initialBundle={await getTaskBundle(taskId)}
      initialHistory={history.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt
      }))}
      initialIsInLibrary={Boolean(await getLibraryEntry(taskId))}
      initialTrace={await getTaskGenerationTrace(taskId)}
      initialTask={task}
      initialTaskId={taskId}
    />
  );
}
