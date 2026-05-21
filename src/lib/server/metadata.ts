import { nanoid } from "nanoid";
import type { AppDatabase } from "@/lib/server/db";
import type {
  Category,
  AuthSession,
  CloudFile,
  DevicePairingCode,
  FilePreview,
  FilePreviewKind,
  FilePreviewStatus,
  FileFamily,
  FileStatus,
  PreviewJob,
  Project,
  ProjectStatus,
  Tag,
  TrustedDevice,
  TrustedDeviceKind,
  UploadSession,
  UploadSessionStatus,
  UploadTargetKind,
  User,
  UserRole,
  UserWithPasswordHash
} from "@/lib/shared/types";

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
  status: FileStatus;
  archived_at: string | null;
  uploaded_at: string;
  updated_at: string;
};

type TagRow = {
  id: string;
  name: string;
  slug: string;
};

type FilePreviewRow = {
  file_id: string;
  kind: FilePreviewKind;
  status: FilePreviewStatus;
  preview_path: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type PendingPreviewJobRow = FilePreviewRow &
  Omit<FileRow, "status" | "updated_at"> & {
    file_status: FileStatus;
    file_updated_at: string;
  };

type UploadSessionRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  received_bytes: number;
  checksum: string | null;
  user_id: string;
  device_id: string | null;
  target_kind: UploadTargetKind;
  source_device: string;
  project_id: string | null;
  project_slug: string | null;
  category_id: string | null;
  status: UploadSessionStatus;
  temp_path: string;
  storage_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

type DeviceRow = {
  id: string;
  user_id: string;
  name: string;
  kind: TrustedDeviceKind;
  created_at: string;
  last_seen_at: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
};

type DevicePairingCodeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  device_name: string;
  device_kind: TrustedDeviceKind;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type CreateProjectInput = {
  name: string;
  description?: string;
  categoryId?: string | null;
};

type CreateCategoryInput = {
  name: string;
  color: string;
};

type UpdateProjectInput = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  categoryId?: string | null;
};

type UpdateCategoryInput = {
  name?: string;
  color?: string;
};

export class SystemCategoryError extends Error {
  constructor(message = "system categories cannot be modified") {
    super(message);
    this.name = "SystemCategoryError";
  }
}

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
  status?: FileStatus;
  archivedAt?: string | null;
};

type CreateTagInput = {
  name: string;
};

type ListFilesFilters = {
  query?: string;
  projectId?: string | null;
  categoryId?: string | null;
  includeArchived?: boolean;
};

export const SEARCH_FILES_LIMIT = 200;

export type SearchFilesFilters = {
  query?: string;
  projectId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  family?: FileFamily;
  minBytes?: number;
  maxBytes?: number;
  from?: string;
  to?: string;
  includeArchived?: boolean;
  limit?: number;
};

export type SearchFilesResult = {
  files: CloudFile[];
  truncated: boolean;
};

type UpdateFileInput = {
  projectId?: string | null;
  categoryId?: string | null;
  storagePath?: string;
  status?: FileStatus;
  archivedAt?: string | null;
};

type UpdateFileConditions = {
  storagePath?: string;
  status?: FileStatus;
};

type BulkUpdateFilesInput = {
  fileIds: string[];
  projectId?: string | null;
  categoryId?: string | null;
};

type UpsertFilePreviewInput = {
  fileId: string;
  kind: FilePreviewKind;
  status: FilePreviewStatus;
  previewPath?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  error?: string | null;
};

type CreateUploadSessionInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  userId: string;
  deviceId?: string | null;
  targetKind: UploadTargetKind;
  sourceDevice: string;
  projectId?: string | null;
  projectSlug?: string | null;
  categoryId?: string | null;
  tempPath: string;
};

type AdvanceUploadSessionInput = {
  expectedReceivedBytes: number;
  receivedBytes: number;
};

type CompleteUploadSessionInput = {
  storagePath: string;
};

type ListOpenUploadSessionsFilters = {
  userId?: string;
  deviceId?: string | null;
};

type CreateUserInput = {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
};

type CreateDeviceInput = {
  userId: string;
  name: string;
  kind: TrustedDeviceKind;
};

type CreateSessionInput = {
  userId: string;
  deviceId?: string | null;
  tokenHash: string;
  expiresAt: string;
};

type CreateDevicePairingCodeInput = {
  userId: string;
  codeHash: string;
  deviceName: string;
  deviceKind: TrustedDeviceKind;
  expiresAt: string;
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

export function fileFromRow(row: FileRow, tags: Tag[] = [], preview: FilePreview | null = null): CloudFile {
  const file: CloudFile = {
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
    status: row.status,
    archivedAt: row.archived_at,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    tags
  };

  if (preview) {
    file.preview = preview;
  }

  return file;
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
        status: input.status ?? "active",
        archivedAt: input.archivedAt ?? null,
        uploadedAt: now,
        updatedAt: now
      };

      db.prepare(`
        insert into files (
          id, name, extension, family, mime_type, size_bytes, checksum, storage_path,
          project_id, category_id, source_device, status, archived_at, uploaded_at, updated_at
        )
        values (
          @id, @name, @extension, @family, @mimeType, @sizeBytes, @checksum, @storagePath,
          @projectId, @categoryId, @sourceDevice, @status, @archivedAt, @uploadedAt, @updatedAt
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

    getCategoryById(id: string): Category | null {
      const row = db
        .prepare<[string], CategoryRow>("select * from categories where id = ? limit 1")
        .get(id);
      return row ? categoryFromRow(row) : null;
    },

    getCategoryBySlug(slug: string): Category | null {
      const row = db
        .prepare<[string], CategoryRow>("select * from categories where slug = ? limit 1")
        .get(slug);
      return row ? categoryFromRow(row) : null;
    },

    createCategory(input: CreateCategoryInput): Category {
      const next = db
        .prepare<[], { next_sort: number | null }>("select max(sort_order) as next_sort from categories")
        .get();
      const sortOrder = (next?.next_sort ?? 0) + 10;
      const category = {
        id: `cat_${nanoid(12)}`,
        name: input.name,
        slug: uniqueSlug(db, "categories", slugify(input.name)),
        color: input.color,
        isSystem: 0,
        sortOrder
      };

      db.prepare(`
        insert into categories (id, name, slug, color, is_system, sort_order)
        values (@id, @name, @slug, @color, @isSystem, @sortOrder)
      `).run(category);

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        isSystem: false,
        sortOrder: category.sortOrder
      };
    },

    updateCategory(id: string, input: UpdateCategoryInput): Category | null {
      const existing = this.getCategoryById(id);
      if (!existing) {
        return null;
      }
      if (existing.isSystem) {
        throw new SystemCategoryError();
      }

      const fields: string[] = [];
      const params: Record<string, string> = { id };

      if (input.name !== undefined) {
        fields.push("name = @name");
        params.name = input.name;
      }
      if (input.color !== undefined) {
        fields.push("color = @color");
        params.color = input.color;
      }

      if (fields.length === 0) {
        return existing;
      }

      db.prepare(`update categories set ${fields.join(", ")} where id = @id`).run(params);
      return this.getCategoryById(id);
    },

    deleteCategory(id: string): boolean {
      const existing = this.getCategoryById(id);
      if (!existing) {
        return false;
      }
      if (existing.isSystem) {
        throw new SystemCategoryError();
      }

      // files.category_id falls back to null via on-delete-set-null FK.
      const result = db.prepare<[string]>("delete from categories where id = ?").run(id);
      return result.changes > 0;
    },

    listProjects(): Project[] {
      return db
        .prepare<[], ProjectRow>("select * from projects order by created_at desc, name")
        .all()
        .map(projectFromRow);
    },

    updateProject(id: string, input: UpdateProjectInput): Project | null {
      const existing = this.getProjectById(id);
      if (!existing) {
        return null;
      }

      const fields: string[] = [];
      const params: Record<string, string | null> = { id, updatedAt: new Date().toISOString() };

      if (input.name !== undefined) {
        fields.push("name = @name");
        params.name = input.name;
      }
      if (input.description !== undefined) {
        fields.push("description = @description");
        params.description = input.description;
      }
      if (input.status !== undefined) {
        fields.push("status = @status");
        params.status = input.status;
      }
      if (input.categoryId !== undefined) {
        fields.push("category_id = @categoryId");
        params.categoryId = input.categoryId;
      }

      if (fields.length === 0) {
        return existing;
      }

      fields.push("updated_at = @updatedAt");

      db.prepare(`update projects set ${fields.join(", ")} where id = @id`).run(params);
      return this.getProjectById(id);
    },

    deleteProject(id: string): { removed: boolean; detachedFiles: number } {
      const existing = this.getProjectById(id);
      if (!existing) {
        return { removed: false, detachedFiles: 0 };
      }

      const detached = db
        .prepare<[string], { count: number }>("select count(*) as count from files where project_id = ?")
        .get(id);

      // files.project_id falls back to null via on-delete-set-null FK.
      const result = db.prepare<[string]>("delete from projects where id = ?").run(id);
      return { removed: result.changes > 0, detachedFiles: detached?.count ?? 0 };
    },

    getFileById(id: string): CloudFile | null {
      const row = db.prepare<[string], FileRow>("select * from files where id = ? limit 1").get(id);
      return row ? filesFromRowsWithTags(db, [row])[0] : null;
    },

    getProjectById(id: string): Project | null {
      const row = db.prepare<[string], ProjectRow>("select * from projects where id = ? limit 1").get(id);
      return row ? projectFromRow(row) : null;
    },

    deleteFile(id: string): boolean {
      const result = db.prepare<[string]>("delete from files where id = ?").run(id);
      return result.changes > 0;
    },

    updateFile(id: string, input: UpdateFileInput, conditions: UpdateFileConditions = {}): CloudFile | null {
      const existing = this.getFileById(id);
      if (!existing) {
        return null;
      }

      if (conditions.storagePath !== undefined && existing.storagePath !== conditions.storagePath) {
        return null;
      }

      if (conditions.status !== undefined && existing.status !== conditions.status) {
        return null;
      }

      const next = {
        id,
        projectId: input.projectId !== undefined ? input.projectId : existing.projectId,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        storagePath: input.storagePath ?? existing.storagePath,
        status: input.status ?? existing.status,
        archivedAt: input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
        updatedAt: new Date().toISOString(),
        expectedStoragePath: conditions.storagePath,
        expectedStatus: conditions.status
      };

      const where = [
        "id = @id",
        conditions.storagePath !== undefined ? "storage_path = @expectedStoragePath" : "",
        conditions.status !== undefined ? "status = @expectedStatus" : ""
      ]
        .filter(Boolean)
        .join(" and ");

      const result = db.prepare(`
        update files
        set project_id = @projectId,
            category_id = @categoryId,
            storage_path = @storagePath,
            status = @status,
            archived_at = @archivedAt,
            updated_at = @updatedAt
        where ${where}
      `).run(next);

      if (result.changes === 0) {
        return null;
      }

      return this.getFileById(id);
    },

    bulkUpdateFiles(input: BulkUpdateFilesInput): CloudFile[] {
      const uniqueFileIds = Array.from(new Set(input.fileIds));
      if (uniqueFileIds.length === 0) {
        return [];
      }

      const fields = [
        input.projectId !== undefined ? "project_id = @projectId" : "",
        input.categoryId !== undefined ? "category_id = @categoryId" : "",
        "updated_at = @updatedAt"
      ].filter(Boolean);

      const updateFiles = db.transaction(() => {
        const statement = db.prepare(`
          update files
          set ${fields.join(", ")}
          where id = @id
        `);

        for (const id of uniqueFileIds) {
          statement.run({
            id,
            projectId: input.projectId,
            categoryId: input.categoryId,
            updatedAt: new Date().toISOString()
          });
        }
      });

      updateFiles();

      return uniqueFileIds.flatMap((id) => {
        const file = this.getFileById(id);
        return file ? [file] : [];
      });
    },

    listFiles(filters: ListFilesFilters = {}): CloudFile[] {
      const where: string[] = [];
      const params: Record<string, string | null> = {};

      if (!filters.includeArchived) {
        where.push("status = 'active'");
      }

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

    searchFiles(filters: SearchFilesFilters = {}): SearchFilesResult {
      const where: string[] = [];
      const params: Record<string, string | number> = {};

      if (!filters.includeArchived) {
        where.push("files.status = 'active'");
      }

      const trimmedQuery = filters.query?.trim();
      if (trimmedQuery) {
        where.push("(files.name like @query or files.storage_path like @query or files.extension like @query)");
        params.query = `%${trimmedQuery}%`;
      }

      if (filters.projectId !== undefined) {
        if (filters.projectId === null) {
          where.push("files.project_id is null");
        } else {
          where.push("files.project_id = @projectId");
          params.projectId = filters.projectId;
        }
      }

      if (filters.categoryId !== undefined) {
        if (filters.categoryId === null) {
          where.push("files.category_id is null");
        } else {
          where.push("files.category_id = @categoryId");
          params.categoryId = filters.categoryId;
        }
      }

      if (filters.family !== undefined) {
        where.push("files.family = @family");
        params.family = filters.family;
      }

      if (typeof filters.minBytes === "number") {
        where.push("files.size_bytes >= @minBytes");
        params.minBytes = filters.minBytes;
      }

      if (typeof filters.maxBytes === "number") {
        where.push("files.size_bytes <= @maxBytes");
        params.maxBytes = filters.maxBytes;
      }

      if (filters.from) {
        where.push("files.uploaded_at >= @from");
        params.from = filters.from;
      }

      if (filters.to) {
        where.push("files.uploaded_at <= @to");
        params.to = filters.to;
      }

      const tagJoin = filters.tagId ? "inner join file_tags on file_tags.file_id = files.id" : "";
      if (filters.tagId) {
        where.push("file_tags.tag_id = @tagId");
        params.tagId = filters.tagId;
      }

      const limit = Math.max(1, Math.min(filters.limit ?? SEARCH_FILES_LIMIT, SEARCH_FILES_LIMIT));
      const fetchLimit = limit + 1;
      params.limit = fetchLimit;

      const sql = `
        select files.* from files
        ${tagJoin}
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by files.uploaded_at desc, files.name
        limit @limit
      `;
      const rows = db.prepare<Record<string, string | number>, FileRow>(sql).all(params);
      const truncated = rows.length > limit;
      const trimmed = truncated ? rows.slice(0, limit) : rows;
      return {
        files: filesFromRowsWithTags(db, trimmed),
        truncated
      };
    },

    upsertFilePreview(input: UpsertFilePreviewInput): FilePreview {
      const existing = this.getFilePreview(input.fileId, input.kind);
      const now = new Date().toISOString();
      const preview: FilePreview = {
        fileId: input.fileId,
        kind: input.kind,
        status: input.status,
        previewPath: input.previewPath !== undefined ? input.previewPath : existing?.previewPath ?? null,
        width: input.width !== undefined ? input.width : existing?.width ?? null,
        height: input.height !== undefined ? input.height : existing?.height ?? null,
        durationSeconds: input.durationSeconds !== undefined ? input.durationSeconds : existing?.durationSeconds ?? null,
        error: input.error !== undefined ? input.error : existing?.error ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      db.prepare(`
        insert into file_previews (
          file_id, kind, status, preview_path, width, height, duration_seconds, error, created_at, updated_at
        )
        values (
          @fileId, @kind, @status, @previewPath, @width, @height, @durationSeconds, @error, @createdAt, @updatedAt
        )
        on conflict(file_id, kind) do update set
          status = excluded.status,
          preview_path = excluded.preview_path,
          width = excluded.width,
          height = excluded.height,
          duration_seconds = excluded.duration_seconds,
          error = excluded.error,
          updated_at = excluded.updated_at
      `).run(preview);

      const saved = this.getFilePreview(input.fileId, input.kind);
      if (!saved) {
        throw new Error("preview metadata write failed");
      }
      return saved;
    },

    getFilePreview(fileId: string, kind: FilePreviewKind): FilePreview | null {
      const row = db
        .prepare<[string, FilePreviewKind], FilePreviewRow>("select * from file_previews where file_id = ? and kind = ? limit 1")
        .get(fileId, kind);
      return row ? filePreviewFromRow(row) : null;
    },

    listPendingPreviewJobs(limit = 100): PreviewJob[] {
      const rows = db
        .prepare<[number], PendingPreviewJobRow>(`
          select
            file_previews.file_id,
            file_previews.kind,
            file_previews.status as status,
            file_previews.preview_path,
            file_previews.width,
            file_previews.height,
            file_previews.duration_seconds,
            file_previews.error,
            file_previews.created_at,
            file_previews.updated_at,
            files.id,
            files.name,
            files.extension,
            files.family,
            files.mime_type,
            files.size_bytes,
            files.checksum,
            files.storage_path,
            files.project_id,
            files.category_id,
            files.source_device,
            files.status as file_status,
            files.archived_at,
            files.uploaded_at,
            files.updated_at as file_updated_at
          from file_previews
          inner join files on files.id = file_previews.file_id
          where file_previews.status = 'pending' and files.status = 'active'
          order by file_previews.updated_at asc
          limit ?
        `)
        .all(limit);

      return rows.map((row) => {
        const fileRow: FileRow = {
          id: row.id,
          name: row.name,
          extension: row.extension,
          family: row.family,
          mime_type: row.mime_type,
          size_bytes: row.size_bytes,
          checksum: row.checksum,
          storage_path: row.storage_path,
          project_id: row.project_id,
          category_id: row.category_id,
          source_device: row.source_device,
          status: row.file_status,
          archived_at: row.archived_at,
          uploaded_at: row.uploaded_at,
          updated_at: row.file_updated_at
        };

        return {
          file: filesFromRowsWithTags(db, [fileRow])[0],
          preview: filePreviewFromRow(row)
        };
      });
    },

    listTags(): Tag[] {
      return db.prepare<[], TagRow>("select * from tags order by name").all().map(tagFromRow);
    },

    createTag(input: CreateTagInput): Tag {
      const tag: Tag = {
        id: `tag_${nanoid(12)}`,
        name: input.name,
        slug: uniqueSlug(db, "tags", slugify(input.name))
      };

      db.prepare(`
        insert into tags (id, name, slug)
        values (@id, @name, @slug)
      `).run(tag);

      return tag;
    },

    getTagBySlug(slug: string): Tag | null {
      const row = db.prepare<[string], TagRow>("select * from tags where slug = ? limit 1").get(slug);
      return row ? tagFromRow(row) : null;
    },

    deleteTag(id: string): boolean {
      // file_tags rows for this tag are removed by FK on delete cascade.
      const result = db.prepare<[string]>("delete from tags where id = ?").run(id);
      return result.changes > 0;
    },

    setFileTags(fileId: string, tagIds: string[]): CloudFile | null {
      const existing = this.getFileById(fileId);
      if (!existing) {
        return null;
      }

      const setTags = db.transaction(() => {
        db.prepare<[string]>("delete from file_tags where file_id = ?").run(fileId);

        const insert = db.prepare(`
          insert or ignore into file_tags (file_id, tag_id)
          values (@fileId, @tagId)
        `);

        for (const tagId of tagIds) {
          insert.run({ fileId, tagId });
        }
      });

      setTags();
      return this.getFileById(fileId);
    },

    countUsers(): number {
      const row = db.prepare<[], { count: number }>("select count(*) as count from users").get();
      return row?.count ?? 0;
    },

    createUser(input: CreateUserInput): User {
      const now = new Date().toISOString();
      const user = {
        id: `user_${nanoid(12)}`,
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
        updatedAt: now
      };

      db.prepare(`
        insert into users (id, email, name, password_hash, role, created_at, updated_at)
        values (@id, @email, @name, @passwordHash, @role, @createdAt, @updatedAt)
      `).run(user);

      return userWithoutPasswordHash(user);
    },

    getUserByEmail(email: string): UserWithPasswordHash | null {
      const row = db.prepare<[string], UserRow>("select * from users where email = ? limit 1").get(email);
      return row ? userWithPasswordHashFromRow(row) : null;
    },

    createDevice(input: CreateDeviceInput): TrustedDevice {
      const now = new Date().toISOString();
      const device: TrustedDevice = {
        id: `device_${nanoid(12)}`,
        userId: input.userId,
        name: input.name,
        kind: input.kind,
        createdAt: now,
        lastSeenAt: null
      };

      db.prepare(`
        insert into devices (id, user_id, name, kind, created_at, last_seen_at)
        values (@id, @userId, @name, @kind, @createdAt, @lastSeenAt)
      `).run(device);

      return device;
    },

    listDevices(userId: string): TrustedDevice[] {
      return db
        .prepare<[string], DeviceRow>("select * from devices where user_id = ? order by created_at desc")
        .all(userId)
        .map(deviceFromRow);
    },

    revokeDevice(userId: string, deviceId: string): boolean {
      const revoke = db.transaction(() => {
        const device = db
          .prepare<[string, string], DeviceRow>("select * from devices where id = ? and user_id = ? limit 1")
          .get(deviceId, userId);
        if (!device) {
          return false;
        }

        db.prepare<[string, string]>("delete from sessions where device_id = ? and user_id = ?").run(deviceId, userId);
        const result = db.prepare<[string, string]>("delete from devices where id = ? and user_id = ?").run(deviceId, userId);
        return result.changes > 0;
      });

      return revoke();
    },

    createSession(input: CreateSessionInput): AuthSession {
      const now = new Date().toISOString();
      const session: AuthSession = {
        id: `session_${nanoid(12)}`,
        userId: input.userId,
        deviceId: input.deviceId ?? null,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: now,
        lastSeenAt: now
      };

      db.prepare(`
        insert into sessions (id, user_id, device_id, token_hash, expires_at, created_at, last_seen_at)
        values (@id, @userId, @deviceId, @tokenHash, @expiresAt, @createdAt, @lastSeenAt)
      `).run(session);

      return session;
    },

    getSessionByTokenHash(tokenHash: string): AuthSession | null {
      const row = db.prepare<[string], SessionRow>("select * from sessions where token_hash = ? limit 1").get(tokenHash);
      return row ? sessionFromRow(row) : null;
    },

    deleteSession(id: string): void {
      db.prepare<[string]>("delete from sessions where id = ?").run(id);
    },

    touchSession(id: string, expiresAt: string, lastSeenAt: string = new Date().toISOString()): void {
      db.prepare<[string, string, string]>(
        "update sessions set expires_at = ?, last_seen_at = ? where id = ?"
      ).run(expiresAt, lastSeenAt, id);
    },

    touchDevice(deviceId: string, lastSeenAt: string = new Date().toISOString()): void {
      db.prepare<[string, string]>("update devices set last_seen_at = ? where id = ?")
        .run(lastSeenAt, deviceId);
    },

    createDevicePairingCode(input: CreateDevicePairingCodeInput): DevicePairingCode {
      const code: DevicePairingCode = {
        id: `pair_${nanoid(12)}`,
        userId: input.userId,
        codeHash: input.codeHash,
        deviceName: input.deviceName,
        deviceKind: input.deviceKind,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: new Date().toISOString()
      };

      db.prepare(`
        insert into device_pairing_codes (
          id, user_id, code_hash, device_name, device_kind, expires_at, consumed_at, created_at
        )
        values (
          @id, @userId, @codeHash, @deviceName, @deviceKind, @expiresAt, @consumedAt, @createdAt
        )
      `).run(code);

      return code;
    },

    getDevicePairingCodeByHash(codeHash: string): DevicePairingCode | null {
      const row = db
        .prepare<[string], DevicePairingCodeRow>("select * from device_pairing_codes where code_hash = ? limit 1")
        .get(codeHash);
      return row ? devicePairingCodeFromRow(row) : null;
    },

    consumeDevicePairingCode(id: string): DevicePairingCode | null {
      const consumedAt = new Date().toISOString();
      const result = db.prepare(`
        update device_pairing_codes
        set consumed_at = @consumedAt
        where id = @id and consumed_at is null
      `).run({ id, consumedAt });

      if (result.changes === 0) {
        return null;
      }

      const row = db.prepare<[string], DevicePairingCodeRow>("select * from device_pairing_codes where id = ? limit 1").get(id);
      return row ? devicePairingCodeFromRow(row) : null;
    },

    createUploadSession(input: CreateUploadSessionInput): UploadSession {
      const now = new Date().toISOString();
      const session: UploadSession = {
        id: `upload_${nanoid(12)}`,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        receivedBytes: 0,
        checksum: input.checksum ?? null,
        userId: input.userId,
        deviceId: input.deviceId ?? null,
        targetKind: input.targetKind,
        sourceDevice: input.sourceDevice,
        projectId: input.projectId ?? null,
        projectSlug: input.projectSlug ?? null,
        categoryId: input.categoryId ?? null,
        status: "open",
        tempPath: input.tempPath,
        storagePath: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null
      };

      db.prepare(`
        insert into upload_sessions (
          id, filename, mime_type, size_bytes, received_bytes, checksum, user_id, device_id, target_kind,
          source_device, project_id, project_slug, category_id, status, temp_path,
          storage_path, error, created_at, updated_at, completed_at
        )
        values (
          @id, @filename, @mimeType, @sizeBytes, @receivedBytes, @checksum, @userId, @deviceId, @targetKind,
          @sourceDevice, @projectId, @projectSlug, @categoryId, @status, @tempPath,
          @storagePath, @error, @createdAt, @updatedAt, @completedAt
        )
      `).run(session);

      return session;
    },

    getUploadSession(id: string): UploadSession | null {
      const row = db.prepare<[string], UploadSessionRow>("select * from upload_sessions where id = ? limit 1").get(id);
      return row ? uploadSessionFromRow(row) : null;
    },

    listOpenUploadSessions(filters: ListOpenUploadSessionsFilters = {}): UploadSession[] {
      const clauses = ["status = 'open'"];
      const params: Record<string, string> = {};

      if (filters.userId) {
        clauses.push("user_id = @userId");
        params.userId = filters.userId;
      }
      if (filters.deviceId) {
        clauses.push("device_id = @deviceId");
        params.deviceId = filters.deviceId;
      }

      return db
        .prepare<Record<string, string>, UploadSessionRow>(`
          select * from upload_sessions
          where ${clauses.join(" and ")}
          order by updated_at desc
        `)
        .all(params)
        .map(uploadSessionFromRow);
    },

    listStaleUploadSessions(olderThanIso: string): UploadSession[] {
      return db
        .prepare<[string], UploadSessionRow>(`
          select * from upload_sessions
          where status = 'open' and updated_at < ?
          order by updated_at asc
        `)
        .all(olderThanIso)
        .map(uploadSessionFromRow);
    },

    advanceUploadSession(id: string, input: AdvanceUploadSessionInput): UploadSession | null {
      const result = db.prepare(`
        update upload_sessions
        set received_bytes = @receivedBytes,
            updated_at = @updatedAt
        where id = @id
          and status = 'open'
          and received_bytes = @expectedReceivedBytes
      `).run({
        id,
        receivedBytes: input.receivedBytes,
        expectedReceivedBytes: input.expectedReceivedBytes,
        updatedAt: new Date().toISOString()
      });

      return result.changes === 0 ? null : this.getUploadSession(id);
    },

    completeUploadSession(id: string, input: CompleteUploadSessionInput): UploadSession | null {
      const now = new Date().toISOString();
      const result = db.prepare(`
        update upload_sessions
        set status = 'completed',
            storage_path = @storagePath,
            updated_at = @now,
            completed_at = @now
        where id = @id
      `).run({ id, storagePath: input.storagePath, now });

      return result.changes === 0 ? null : this.getUploadSession(id);
    },

    failUploadSession(id: string, error: string): UploadSession | null {
      const result = db.prepare(`
        update upload_sessions
        set status = 'failed',
            error = @error,
            updated_at = @updatedAt
        where id = @id
      `).run({ id, error, updatedAt: new Date().toISOString() });

      return result.changes === 0 ? null : this.getUploadSession(id);
    },

    abortUploadSession(id: string): UploadSession | null {
      const result = db.prepare(`
        update upload_sessions
        set status = 'aborted',
            updated_at = @updatedAt
        where id = @id and status = 'open'
      `).run({ id, updatedAt: new Date().toISOString() });

      return result.changes === 0 ? null : this.getUploadSession(id);
    }
  };
}

function uniqueSlug(db: AppDatabase, tableName: "projects" | "tags" | "categories", baseSlug: string): string {
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
  const previewsByFileId = new Map<string, FilePreview>();
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

  const previewRows = db
    .prepare<string[], FilePreviewRow>(`
      select * from file_previews
      where status = 'ready' and kind = 'image' and file_id in (${placeholders})
      order by updated_at desc
    `)
    .all(...rows.map((row) => row.id));

  for (const row of previewRows) {
    if (!previewsByFileId.has(row.file_id)) {
      previewsByFileId.set(row.file_id, filePreviewFromRow(row));
    }
  }

  return rows.map((row) => fileFromRow(row, tagsByFileId.get(row.id) ?? [], previewsByFileId.get(row.id) ?? null));
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

function filePreviewFromRow(row: FilePreviewRow): FilePreview {
  return {
    fileId: row.file_id,
    kind: row.kind,
    status: row.status,
    previewPath: row.preview_path,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function userWithoutPasswordHash(user: UserWithPasswordHash): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function userWithPasswordHashFromRow(row: UserRow): UserWithPasswordHash {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function deviceFromRow(row: DeviceRow): TrustedDevice {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function sessionFromRow(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function devicePairingCodeFromRow(row: DevicePairingCodeRow): DevicePairingCode {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    deviceName: row.device_name,
    deviceKind: row.device_kind,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at
  };
}

function uploadSessionFromRow(row: UploadSessionRow): UploadSession {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    receivedBytes: row.received_bytes,
    checksum: row.checksum,
    userId: row.user_id,
    deviceId: row.device_id,
    targetKind: row.target_kind,
    sourceDevice: row.source_device,
    projectId: row.project_id,
    projectSlug: row.project_slug,
    categoryId: row.category_id,
    status: row.status,
    tempPath: row.temp_path,
    storagePath: row.storage_path,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
