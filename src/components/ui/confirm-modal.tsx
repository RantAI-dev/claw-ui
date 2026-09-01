"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** Destructive-confirm dialog: Cancel + confirm with busy spinner. */
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  icon = <Trash2 className="size-4" />,
  tone = "destructive",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  busy?: boolean;
  onConfirm: () => void;
  /** Icon on the confirm button. Defaults to the bin (most callers delete);
   *  pass `null` for a confirm that does not delete anything. */
  icon?: React.ReactNode;
  /** The confirm button's variant. Red is right for a delete; a confirm that
   *  restores a default (reset a URL override) is not destructive. */
  tone?: "destructive" | "default";
}) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      footer={
        <>
          {/* First focus lands on the safe choice, not on the dialog's X. */}
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy} data-autofocus>
            Cancel
          </Button>
          <Button variant={tone === "default" ? "default" : "destructive"} size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
