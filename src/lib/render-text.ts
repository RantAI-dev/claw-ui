// Pure helpers for coercing untrusted model output into safe display text.
// Kept dependency-free (no React) so they're unit-testable in the node env.

/**
 * Strip model reasoning that leaks into the answer. react-markdown drops the
 * unknown `<think>` tags but keeps their inner text, so raw chain-of-thought
 * would render as plain prose. Remove closed blocks entirely; while streaming,
 * also hide an unclosed trailing block until its `</think>` arrives.
 */
export function stripThink(content: string, streaming: boolean): string {
  let c = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  if (streaming) c = c.replace(/<think\b[^>]*>[\s\S]*$/i, "");
  return c;
}

/**
 * Coerce an unknown value the model emitted where a string was expected (e.g. a
 * generative-UI list item arriving as `{label:"…"}`). Prefer a human-readable
 * field, else compact JSON — never the useless "[object Object]".
 */
export function coerceText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["label", "text", "name", "value", "title"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
