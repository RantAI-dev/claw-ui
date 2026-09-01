// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emptyTemplate } from "@/lib/skill-md";

const skillContent = vi.fn();
const saveSkillContent = vi.fn();
const createSkill = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    skillContent: (slug: string) => skillContent(slug),
    saveSkillContent: (slug: string, content: string) => saveSkillContent(slug, content),
    createSkill: (name: string, content: string) => createSkill(name, content),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { SkillEditor } from "./skill-editor";

const TEMPLATE_DOC = emptyTemplate("Kopi Pagi").replace("## Instructions\n- \n", "## Instructions\n- Weigh 15 g\n");
const PROSE_DOC = `---
name: Prose Only
description: Paragraph instructions.
tags: []
---

# Prose Only

## Instructions

Read the whole file first.
`;

const onClose = vi.fn();
const onSaved = vi.fn();

function renderCreate() {
  return render(<SkillEditor mode="create" existing={[]} onClose={onClose} onSaved={onSaved} />);
}
function renderEdit(slug = "kopi-pagi") {
  return render(<SkillEditor mode="edit" slug={slug} existing={[]} onClose={onClose} onSaved={onSaved} />);
}

const escape = () => fireEvent.keyDown(document, { key: "Escape" });
const discardDialog = (): HTMLElement | null =>
  (screen.queryByText(/^Discard (this skill|changes to)/)?.closest('[role="dialog"]') as HTMLElement | undefined) ?? null;

beforeEach(() => {
  skillContent.mockImplementation((slug: string) =>
    Promise.resolve({ slug, name: slug === "prose-only" ? "Prose Only" : "Kopi Pagi", content: slug === "prose-only" ? PROSE_DOC : TEMPLATE_DOC }),
  );
  createSkill.mockImplementation((name: string) => Promise.resolve({ name, slug: "x", created: true }));
  saveSkillContent.mockImplementation((slug: string) => Promise.resolve({ slug, name: "Kopi Pagi", written: true }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SkillEditor: unsaved work", () => {
  it("asks before discarding a changed document, on Escape and on Cancel", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kopi" } });
    escape();
    const dialog = await waitFor(() => {
      const d = discardDialog();
      expect(d).toBeTruthy();
      return d as HTMLElement;
    });
    expect(within(dialog).getByText("Discard this skill?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(discardDialog()).toBeNull());
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Kopi");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const again = await waitFor(() => {
      const d = discardDialog();
      expect(d).toBeTruthy();
      return d as HTMLElement;
    });
    fireEvent.click(within(again).getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes an untouched document at once", () => {
    renderCreate();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardDialog()).toBeNull();
  });

  it("names the skill when discarding edits", async () => {
    renderEdit();
    const description = await screen.findByLabelText("Description");
    fireEvent.change(description, { target: { value: "Changed." } });
    escape();
    await waitFor(() => expect(discardDialog()).toBeTruthy());
    expect(screen.getByText("Discard changes to “Kopi Pagi”?")).toBeTruthy();
  });
});

describe("SkillEditor: what the form can and cannot hold", () => {
  it("opens a prose Instructions section in Markdown and says why", async () => {
    renderEdit("prose-only");
    const source = (await screen.findByLabelText("SKILL.md source")) as HTMLTextAreaElement;
    expect(source.value).toContain("Read the whole file first.");
    expect(screen.queryByRole("button", { name: "Form" })).toBeNull();
    expect(
      screen.getByText(
        "The form can't map this file: its Instructions are not a bullet list, or its structure was changed by hand. Edit the Markdown here; nothing is lost.",
      ),
    ).toBeTruthy();
  });

  it("lands on the first field that can change", async () => {
    renderEdit();
    await screen.findByLabelText("Description");
    await waitFor(() => expect(document.activeElement?.id).toBe("skill-description"));
    cleanup();
    renderEdit("prose-only");
    await screen.findByLabelText("SKILL.md source");
    await waitFor(() => expect(document.activeElement?.id).toBe("skill-markdown"));
    cleanup();
    renderCreate();
    await waitFor(() => expect(document.activeElement?.id).toBe("skill-name"));
  });

  it("does not flag an empty name the operator has not touched", () => {
    renderCreate();
    const name = screen.getByLabelText("Name");
    fireEvent.blur(name);
    expect(screen.queryByText("Needs a name.")).toBeNull();
    fireEvent.change(name, { target: { value: "x" } });
    fireEvent.change(name, { target: { value: "" } });
    expect(screen.getByText("Needs a name.")).toBeTruthy();
  });

  it("uses honest placeholders and no em dash", () => {
    renderCreate();
    expect(screen.getByPlaceholderText("Skill name")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("When should the model use this skill? One or two sentences."),
    ).toBeTruthy();
    expect(screen.getByText("Folder: chosen from the name")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kopi Pagi" } });
    expect(screen.getByText("Folder: kopi-pagi")).toBeTruthy();
    expect(document.body.textContent).not.toContain("—");
  });
});

describe("SkillEditor: drawer chrome", () => {
  it("is a dialog named by its title", () => {
    renderCreate();
    expect(screen.getByRole("dialog", { name: "Write a skill" })).toBeTruthy();
  });

  it("gives the remove buttons a focus ring and a touch size", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "kopi" } });
    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });
    for (const name of ["Remove tag kopi", "Remove step 1"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("focus-visible:outline-2");
      expect(cls).toContain("pointer-coarse:min-h-10");
    }
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("focus-visible:outline-2");
  });

  it("returns focus to whatever opened it", async () => {
    function Host({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Open</button>
          {open && <SkillEditor mode="create" existing={[]} onClose={onClose} onSaved={onSaved} />}
        </>
      );
    }
    const { rerender } = render(<Host open={false} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    rerender(<Host open />);
    await waitFor(() => expect(document.activeElement?.id).toBe("skill-name"));
    rerender(<Host open={false} />);
    expect(document.activeElement).toBe(trigger);
  });
});

