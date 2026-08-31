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
  icon = <Trash2 className="size-4" />,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  /** Confirm-button glyph. Defaults to the trash can; pass a fitting icon (or null) for non-delete confirms. */
  icon?: React.ReactNode;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      footer={
        <>
          {/* Focus starts on the safe choice, not the X in the header. */}
          <Button data-autofocus variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
