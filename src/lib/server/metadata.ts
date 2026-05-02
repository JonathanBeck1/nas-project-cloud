import { nanoid } from "nanoid";
import type { AppDatabase } from "@/lib/server/db";
import type {
  Category,
  AuthSession,
  CloudFile,
  DevicePairingCode,
  FileFamily,
  FileStatus,
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

type UploadSessionRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  received_bytes: number;
  checksum: string | null;
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

type CreateUploadSessionInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
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
    status: row.status,
    archivedAt: row.archived_at,
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

    listProjects(): Project[] {
      return db
        .prepare<[], ProjectRow>("select * from projects order by created_at desc, name")
        .all()
        .map(projectFromRow);
    },

    getFileById(id: string): CloudFile | null {
      const row = db.prepare<[string], FileRow>("select * from files where id = ? limit 1").get(id);
      return row ? filesFromRowsWithTags(db, [row])[0] : null;
    },

    getProjectById(id: string): Project | null {
      const row = db.prepare<[string], ProjectRow>("select * from projects where id = ? limit 1").get(id);
      return row ? projectFromRow(row) : null;
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
          id, filename, mime_type, size_bytes, received_bytes, checksum, target_kind,
          source_device, project_id, project_slug, category_id, status, temp_path,
          storage_path, error, created_at, updated_at, completed_at
        )
        values (
          @id, @filename, @mimeType, @sizeBytes, @receivedBytes, @checksum, @targetKind,
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
