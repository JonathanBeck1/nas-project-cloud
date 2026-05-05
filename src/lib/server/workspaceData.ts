import { type AppDatabase, getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { Category, CloudFile, Project, Tag, UploadSession } from "@/lib/shared/types";

export type WorkspaceData = {
  files: CloudFile[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  openUploadSessions?: UploadSession[];
};

export type ProjectWorkspaceData = {
  project: Project;
  files: CloudFile[];
  categories: Category[];
  tags: Tag[];
};

type WorkspaceDataFilters = {
  userId?: string;
  deviceId?: string | null;
};

export function loadWorkspaceData(db: AppDatabase = getDatabase(), filters: WorkspaceDataFilters = {}): WorkspaceData {
  const repo = createMetadataRepository(db);

  return {
    files: repo.listFiles(),
    projects: repo.listProjects(),
    categories: repo.listCategories(),
    tags: repo.listTags(),
    openUploadSessions: filters.userId
      ? repo.listOpenUploadSessions({ userId: filters.userId, deviceId: filters.deviceId ?? null })
      : []
  };
}

export function loadProjectWorkspaceData(projectId: string, db: AppDatabase = getDatabase()): ProjectWorkspaceData | null {
  const repo = createMetadataRepository(db);
  const project = repo.getProjectById(projectId);
  if (!project) {
    return null;
  }

  return {
    project,
    files: repo.listFiles({ projectId }),
    categories: repo.listCategories(),
    tags: repo.listTags()
  };
}
