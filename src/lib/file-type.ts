// File-type icon + colour for KB documents, keyed by the gateway's lowercased
// `file_type` enum: `markdown | pdf | image | document | text`
// (RantAIClaw `src/kb/file/mod.rs`, `SupportedFileType`). The map used to
// carry eighteen keys (`csv`, `python`, `react`, …) in raw Tailwind hues the
// gateway could never send; a `.csv` and a `.json` both arrive as `text`.
import { FileText, FileType, Image, type LucideIcon } from "lucide-react";

export interface FileTypeInfo {
  Icon: LucideIcon;
  /** Tailwind text-colour class for the glyph. */
  iconColor: string;
  /** Tailwind background class for the tinted tile behind the glyph. */
  bgColor: string;
}

const TYPE_MAP: Record<string, FileTypeInfo> = {
  markdown: { Icon: FileText, iconColor: "text-chart-1", bgColor: "bg-chart-1/10" },
  pdf: { Icon: FileType, iconColor: "text-destructive", bgColor: "bg-destructive/10" },
  image: { Icon: Image, iconColor: "text-chart-2", bgColor: "bg-chart-2/10" },
  document: { Icon: FileText, iconColor: "text-chart-3", bgColor: "bg-chart-3/10" },
  text: { Icon: FileText, iconColor: "text-muted-foreground", bgColor: "bg-muted/40" },
};

const DEFAULT_INFO: FileTypeInfo = {
  Icon: FileText,
  iconColor: "text-chart-1",
  bgColor: "bg-chart-1/10",
};

/** Resolve a colour-coded icon for a gateway `file_type` enum string. */
export function getFileTypeIcon(fileType?: string | null): FileTypeInfo {
  if (!fileType) return DEFAULT_INFO;
  return TYPE_MAP[fileType.toLowerCase()] ?? DEFAULT_INFO;
}

/** Human-readable byte size; mirrors the main app's formatFileSize. */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
