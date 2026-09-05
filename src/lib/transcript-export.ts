import type { SessionDetail } from "./types";
import { stripDecorations } from "./decorations";

// The gateway persists `body.message` VERBATIM — decorations and all. The
// comment here used to claim the opposite ("added only to the SENT payload,
// never stored"), which is why exported transcripts carried the
// `<<<CONVERSATION_SO_FAR>>>` sentinels and the generative-UI instruction.
// The transcript view already strips them for display; the export has to as
// well, and from the same function, or the two drift.

function roleLabel(role: string): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Format a session transcript as Markdown: a title header then one block per message. */
export function toMarkdown(detail: SessionDetail): string {
  const lines: string[] = [];
  lines.push(`# ${detail.title || "Untitled session"}`);
  if (detail.model) lines.push(`\n_Model: ${detail.model}_`);
  lines.push("");
  for (const m of detail.messages) {
    lines.push(`**${roleLabel(m.role)}:**`);
    lines.push("");
    lines.push(stripDecorations(m.content ?? ""));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Format a session transcript as pretty-printed JSON (the raw detail record). */
export function toJson(detail: SessionDetail): string {
  return JSON.stringify(detail, null, 2);
}
