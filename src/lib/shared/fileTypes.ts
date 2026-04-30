import type { FileClassification, FileFamily } from "./types";

const LABELS: Record<string, string> = {
  "3mf": "3MF Project",
  stl: "STL Model",
  step: "STEP Model",
  stp: "STEP Model",
  obj: "OBJ Model",
  f3d: "Fusion 360 Design",
  webm: "WebM Video",
  mp4: "MP4 Video",
  mov: "QuickTime Video",
  png: "PNG Image",
  jpg: "JPEG Image",
  jpeg: "JPEG Image",
  tiff: "TIFF Image",
  tif: "TIFF Image",
  pdf: "PDF Document",
  zip: "ZIP Archive",
  "7z": "7Z Archive",
  dmg: "macOS Disk Image",
  exe: "Windows Executable"
};

const FAMILIES: Record<FileFamily, Set<string>> = {
  cad: new Set(["3mf", "stl", "step", "stp", "obj", "f3d", "blend", "gcode"]),
  image: new Set(["png", "jpg", "jpeg", "tiff", "tif", "gif", "webp", "heic", "svg"]),
  video: new Set(["webm", "mp4", "mov", "mkv", "avi", "m4v"]),
  document: new Set(["pdf", "doc", "docx", "xls", "xlsx", "txt", "md", "csv"]),
  archive: new Set(["zip", "7z", "rar", "tar", "gz"]),
  software: new Set(["dmg", "exe", "msi", "pkg", "appimage"]),
  other: new Set()
};

export function classifyFile(filename: string): FileClassification {
  const extension = extensionFromName(filename);
  const family = familyForExtension(extension);
  const label = LABELS[extension] ?? `${extension.toUpperCase()} File`;

  return { extension, family, label };
}

export function extensionFromName(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) {
    return "file";
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function familyForExtension(extension: string): FileFamily {
  for (const [family, extensions] of Object.entries(FAMILIES) as Array<[FileFamily, Set<string>]>) {
    if (extensions.has(extension)) {
      return family;
    }
  }

  return "other";
}
