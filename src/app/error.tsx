"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // Surface to the console; no external reporting in a self-hosted tool.
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">This view failed to render</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          The console hit an error drawing this page. Try again re-renders it; if it keeps
          failing, check the gateway log.
        </p>
        {/* The raw message can carry upstream gateway text (filesystem paths and
            the like), so keep it out of the headline and behind a disclosure. */}
        {error.message && (
          <details className="mt-2 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
            <pre className="mt-1 max-w-md overflow-auto text-[11px]">{error.message}</pre>
          </details>
        )}
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
