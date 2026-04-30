import type { Category, SmartViewKey } from "./types";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_cad", name: "3D / CAD", slug: "3d-cad", color: "#3b5f73", isSystem: true, sortOrder: 10 },
  { id: "cat_media", name: "Media", slug: "media", color: "#b25f2c", isSystem: true, sortOrder: 20 },
  { id: "cat_documents", name: "Documents", slug: "documents", color: "#256d5a", isSystem: true, sortOrder: 30 },
  { id: "cat_software", name: "Software", slug: "software", color: "#6650a4", isSystem: true, sortOrder: 40 },
  { id: "cat_personal", name: "Personal", slug: "personal", color: "#735f32", isSystem: true, sortOrder: 50 },
  { id: "cat_archive", name: "Archive", slug: "archive", color: "#626b5f", isSystem: true, sortOrder: 60 },
  { id: "cat_inbox", name: "Inbox", slug: "inbox", color: "#9a6b25", isSystem: true, sortOrder: 70 }
];

export const SMART_VIEWS: Array<{ key: SmartViewKey; name: string; description: string }> = [
  { key: "inbox", name: "Inbox", description: "Files waiting to be sorted" },
  { key: "recent", name: "Recent Uploads", description: "Newest files first" },
  { key: "unsorted", name: "Unsorted", description: "Files without a project" },
  { key: "large-files", name: "Large Files", description: "Files larger than 1 GB" },
  { key: "cad", name: "CAD Files", description: "STL, 3MF, STEP, OBJ, and related files" },
  { key: "media", name: "Media", description: "Images and videos" },
  { key: "images", name: "Images", description: "Image files" },
  { key: "videos", name: "Videos", description: "Video files" },
  { key: "from-windows", name: "From Windows PC", description: "Files uploaded from Windows devices" },
  { key: "from-mac", name: "From Mac", description: "Files uploaded from macOS devices" }
];
