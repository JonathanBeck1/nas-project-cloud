export type FileFamily = "cad" | "image" | "video" | "document" | "archive" | "software" | "other";

export type FileStatus = "active" | "archived";

export type ProjectStatus = "active" | "paused" | "complete" | "archived";

export type Category = {
  id: string;
  name: string;
  slug: string;
  color: string;
  isSystem: boolean;
  sortOrder: number;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type CloudFile = {
  id: string;
  name: string;
  extension: string;
  family: FileFamily;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  projectId: string | null;
  categoryId: string | null;
  sourceDevice: string;
  status: FileStatus;
  archivedAt: string | null;
  uploadedAt: string;
  updatedAt: string;
  tags: Tag[];
};

export type SmartViewKey =
  | "inbox"
  | "recent"
  | "unsorted"
  | "large-files"
  | "cad"
  | "media"
  | "images"
  | "videos"
  | "from-windows"
  | "from-mac";

export type FileClassification = {
  extension: string;
  family: FileFamily;
  label: string;
};
