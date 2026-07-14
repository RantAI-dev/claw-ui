// Pure helpers for coercing untrusted model output into safe display text.
// Kept dependency-free (no React) so they're unit-testable in the node env.

/**
 * Strip model reasoning that leaks into the answer. react-markdown drops the
 * unknown `<think>` tags but keeps their inner text, so raw chain-of-thought
 * would render as plain prose. Remove closed blocks entirely; while streaming,
 * also hide an unclosed trailing block until its `</think>` arrives.
 */
export function stripThink(content: string, streaming: boolean): string {
  let c = content;
  // A `</think>` with no matching `<think>` before it is a leaked reasoning
  // terminator — some models (e.g. MiniMax) emit a bare closer because the
  // opening tag was consumed upstream or lives in a separate reasoning field.
  // Drop everything up to and including it.
  const close = /<\/think>/i.exec(c);
  if (close) {
    const openIdx = /<think\b/i.exec(c)?.index ?? -1;
    if (openIdx === -1 || close.index < openIdx) {
      c = c.slice(close.index + close[0].length);
    }
  }
  // Remove complete reasoning blocks.
  c = c.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  // While streaming, hide an unclosed trailing block until its </think> arrives.
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
