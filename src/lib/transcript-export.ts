import type { SessionDetail } from "./types";

// The gateway persists clean user text (the KB/history/GUI decorations are added
// only to the SENT payload, never stored), so the transcript from api.session()
// needs no de-decoration here — it is exported verbatim.

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
    lines.push(m.content ?? "");
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Format a session transcript as pretty-printed JSON (the raw detail record). */
export function toJson(detail: SessionDetail): string {
  return JSON.stringify(detail, null, 2);
}
