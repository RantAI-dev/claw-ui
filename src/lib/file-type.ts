// File-type icon + color mapping for KB documents. Ported from the main app's
// file-type-utils.ts, keyed off the gateway's lowercased `file_type` enum string
// (mime_type is frequently null). Colors use chart tokens + tasteful per-type
// Tailwind variants so the grid reads as a colour-coded library.
import {
  FileText,
  FileType,
  Image,
  Globe,
  FileCode,
  Code,
  Table2,
  Sigma,
  Presentation,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export interface FileTypeInfo {
  Icon: LucideIcon;
  /** Tailwind text-color class for the glyph. */
  iconColor: string;
  /** Tailwind background class for the tinted tile behind the glyph. */
  bgColor: string;
}

const TYPE_MAP: Record<string, FileTypeInfo> = {
  image: {
    Icon: Image,
    iconColor: "text-chart-2",
    bgColor: "bg-chart-2/10",
  },
  pdf: {
    Icon: FileType,
    iconColor: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  docx: {
    Icon: FileText,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  doc: {
    Icon: FileText,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  markdown: {
    Icon: FileText,
    iconColor: "text-chart-1",
    bgColor: "bg-chart-1/10",
  },
  md: {
    Icon: FileText,
    iconColor: "text-chart-1",
    bgColor: "bg-chart-1/10",
  },
  text: {
    Icon: FileText,
    iconColor: "text-muted-foreground",
    bgColor: "bg-muted/40",
  },
  txt: {
    Icon: FileText,
    iconColor: "text-muted-foreground",
    bgColor: "bg-muted/40",
  },
  csv: {
    Icon: Table2,
    iconColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  sheet: {
    Icon: Table2,
    iconColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  xlsx: {
    Icon: Table2,
    iconColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  code: {
    Icon: Code,
    iconColor: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  python: {
    Icon: Terminal,
    iconColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  html: {
    Icon: Globe,
    iconColor: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  react: {
    Icon: FileCode,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  latex: {
    Icon: Sigma,
    iconColor: "text-rose-500",
    bgColor: "bg-rose-500/10",
  },
  slides: {
    Icon: Presentation,
    iconColor: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
  },
  pptx: {
    Icon: Presentation,
    iconColor: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
  },
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
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
