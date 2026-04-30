import { type AppDatabase, getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { Category, CloudFile, Project, Tag } from "@/lib/shared/types";

export type WorkspaceData = {
  files: CloudFile[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
};

export function loadWorkspaceData(db: AppDatabase = getDatabase()): WorkspaceData {
  const repo = createMetadataRepository(db);

  return {
    files: repo.listFiles(),
    projects: repo.listProjects(),
    categories: repo.listCategories(),
    tags: repo.listTags()
  };
}
