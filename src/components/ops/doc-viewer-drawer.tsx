"use client";

import * as React from "react";
import { FileText, Network } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { formatNumber, relativeTime } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/chat/markdown";
import { EmptyState } from "./shared";
import { DocIntelligenceBody } from "./doc-intelligence-drawer";

type ViewerTab = "preview" | "intelligence";

/**
 * Drawer that hosts a document's Preview (full text + metadata) and Intelligence
 * (entities/relations/graph) under two top-level tabs. Replaces the standalone
 * DocIntelligenceDrawer overlay as the per-document viewer.
 */
export function DocViewerDrawer({
  documentId,
  documentTitle,
  initialTab = "preview",
  onClose,
}: {
  documentId: string;
  documentTitle: string;
  initialTab?: ViewerTab;
  onClose: () => void;
}) {
  return (
    <Drawer
      eyebrow="Document"
      title={documentTitle}
      icon={<FileText className="size-4" />}
      onClose={onClose}
    >
      <Tabs
          defaultValue={initialTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border/60 px-4 pt-3">
            <TabsList>
              <TabsTrigger value="preview">
                <FileText className="size-3.5" /> Preview
              </TabsTrigger>
              <TabsTrigger value="intelligence">
                <Network className="size-3.5" /> Intelligence
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="preview"
            className="mt-0 min-h-0 flex-1 overflow-auto p-4 scrollbar-thin"
          >
            <DocPreview documentId={documentId} />
          </TabsContent>

          <TabsContent
            value="intelligence"
            className="mt-0 min-h-0 flex-1 overflow-auto p-4 scrollbar-thin"
          >
            <DocIntelligenceBody documentId={documentId} />
          </TabsContent>
        </Tabs>
    </Drawer>
  );
}

function DocPreview({ documentId }: { documentId: string }) {
  const doc = useAsync(() => api.kbGetDocument(documentId), [documentId]);

  if (doc.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (doc.error) {
    return (
      <div className="py-10 text-center text-sm">
        <p className="text-destructive">{doc.error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={doc.refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const d = doc.data;
  if (!d) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Document not found. It may have been deleted; close this panel and refresh the list.
      </div>
    );
  }

  const meta = [formatFileSize(d.file_size), d.file_type]
    .filter(Boolean)
    .join(" · ");
  const retrievals = d.retrieval_count ?? 0;
  const content = d.content ?? "";

  return (
    <div className="space-y-3">
      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {meta && (
          <span className="font-mono">{meta}</span>
        )}
        {d.created_at != null && (
          <>
            {meta && <span className="text-muted-foreground/40">·</span>}
            <span>{relativeTime(d.created_at)}</span>
          </>
        )}
        {retrievals > 0 && (
          <Badge variant="accent" className="text-[10px]">
            {formatNumber(retrievals)} retrieval{retrievals === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* Category badges */}
      {d.categories && d.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.categories.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {/* Content */}
      {content.trim().length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No text content"
          hint="This document has no extracted text to preview."
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          {/* The stored content is the extracted text, which is markdown — render
              it as a document rather than a raw monospace dump. */}
          <Markdown content={content} className="text-sm" />
        </div>
      )}
    </div>
  );
}
