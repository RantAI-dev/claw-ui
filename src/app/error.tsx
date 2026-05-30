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
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while rendering this view."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
