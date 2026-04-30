import { nanoid } from "nanoid";
import type { AppDatabase } from "@/lib/server/db";
import type { Category, CloudFile, FileFamily, Project, ProjectStatus, Tag } from "@/lib/shared/types";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_system: number;
  sort_order: number;
};

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type FileRow = {
  id: string;
  name: string;
  extension: string;
  family: FileFamily;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  storage_path: string;
  project_id: string | null;
  category_id: string | null;
  source_device: string;
  uploaded_at: string;
  updated_at: string;
};

type TagRow = {
  id: string;
  name: string;
  slug: string;
};

type CreateProjectInput = {
  name: string;
  description?: string;
  categoryId?: string | null;
};

type CreateFileInput = {
  name: string;
  extension: string;
  family: FileFamily;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  projectId?: string | null;
  categoryId?: string | null;
  sourceDevice: string;
};

type ListFilesFilters = {
  query?: string;
  projectId?: string | null;
  categoryId?: string | null;
};

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

export function fileFromRow(row: FileRow, tags: Tag[] = []): CloudFile {
  return {
    id: row.id,
    name: row.name,
    extension: row.extension,
    family: row.family,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    storagePath: row.storage_path,
    projectId: row.project_id,
    categoryId: row.category_id,
    sourceDevice: row.source_device,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    tags
  };
}

export function createMetadataRepository(db: AppDatabase) {
  return {
    createProject(input: CreateProjectInput): Project {
      const now = new Date().toISOString();
      const project: Project = {
        id: `proj_${nanoid(12)}`,
        name: input.name,
        slug: uniqueSlug(db, "projects", slugify(input.name)),
        description: input.description ?? "",
        categoryId: input.categoryId ?? null,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      db.prepare(`
        insert into projects (id, name, slug, description, category_id, status, created_at, updated_at)
        values (@id, @name, @slug, @description, @categoryId, @status, @createdAt, @updatedAt)
      `).run(project);

      return project;
    },

    createFile(input: CreateFileInput): CloudFile {
      const now = new Date().toISOString();
      const file = {
        id: `file_${nanoid(12)}`,
        name: input.name,
        extension: input.extension,
        family: input.family,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        storagePath: input.storagePath,
        projectId: input.projectId ?? null,
        categoryId: input.categoryId ?? null,
        sourceDevice: input.sourceDevice,
        uploadedAt: now,
        updatedAt: now
      };

      db.prepare(`
        insert into files (
          id, name, extension, family, mime_type, size_bytes, checksum, storage_path,
          project_id, category_id, source_device, uploaded_at, updated_at
        )
        values (
          @id, @name, @extension, @family, @mimeType, @sizeBytes, @checksum, @storagePath,
          @projectId, @categoryId, @sourceDevice, @uploadedAt, @updatedAt
        )
      `).run(file);

      return { ...file, tags: [] };
    },

    listCategories(): Category[] {
      return db
        .prepare<[], CategoryRow>("select * from categories order by sort_order, name")
        .all()
        .map(categoryFromRow);
    },

    listProjects(): Project[] {
      return db
        .prepare<[], ProjectRow>("select * from projects order by created_at desc, name")
        .all()
        .map(projectFromRow);
    },

    listFiles(filters: ListFilesFilters = {}): CloudFile[] {
      const where: string[] = [];
      const params: Record<string, string | null> = {};

      if (filters.query) {
        where.push("(name like @query or storage_path like @query)");
        params.query = `%${filters.query}%`;
      }

      if (filters.projectId !== undefined) {
        where.push(filters.projectId === null ? "project_id is null" : "project_id = @projectId");
        params.projectId = filters.projectId;
      }

      if (filters.categoryId !== undefined) {
        where.push(filters.categoryId === null ? "category_id is null" : "category_id = @categoryId");
        params.categoryId = filters.categoryId;
      }

      const sql = `select * from files${where.length ? ` where ${where.join(" and ")}` : ""} order by uploaded_at desc, name`;
      const files = db.prepare<Record<string, string | null>, FileRow>(sql).all(params);
      return filesFromRowsWithTags(db, files);
    },

    listTags(): Tag[] {
      return db.prepare<[], TagRow>("select * from tags order by name").all().map(tagFromRow);
    }
  };
}

function uniqueSlug(db: AppDatabase, tableName: "projects" | "tags", baseSlug: string): string {
  const exists = db.prepare<[string], { id: string }>(`select id from ${tableName} where slug = ? limit 1`);
  let candidate = baseSlug;
  let suffix = 2;

  while (exists.get(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function filesFromRowsWithTags(db: AppDatabase, rows: FileRow[]): CloudFile[] {
  if (rows.length === 0) {
    return [];
  }

  const tagsByFileId = new Map<string, Tag[]>();
  const placeholders = rows.map(() => "?").join(", ");
  const tagRows = db
    .prepare<string[], TagRow & { file_id: string }>(`
      select file_tags.file_id, tags.id, tags.name, tags.slug
      from file_tags
      inner join tags on tags.id = file_tags.tag_id
      where file_tags.file_id in (${placeholders})
      order by tags.name
    `)
    .all(...rows.map((row) => row.id));

  for (const row of tagRows) {
    const tags = tagsByFileId.get(row.file_id) ?? [];
    tags.push(tagFromRow(row));
    tagsByFileId.set(row.file_id, tags);
  }

  return rows.map((row) => fileFromRow(row, tagsByFileId.get(row.id) ?? []));
}

function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order
  };
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categoryId: row.category_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function tagFromRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug
  };
}
