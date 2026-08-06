/** Most named memories to list before summarising the rest. */
const NAMED_SHOWN = 3;

/**
 * True for a key the runtime generated rather than a person naming a fact.
 *
 * Auto-save writes one entry per turn as `<prefix>_<uuid>`. The uuid is an
 * address, not a name — listing five of them fills the row while identifying
 * nothing. Mirrors `memory::is_autosave_key` on the Rust side.
 */
export function isGeneratedMemoryKey(key: string): boolean {
  return /_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
}

/**
 * Labels for the chips under an assistant turn: the memories a person named,
 * plus a count for the turns the agent saved on its own.
 */
export function summariseRecalledMemories(keys: string[]): string[] {
  const named = keys.filter((k) => !isGeneratedMemoryKey(k));
  const generated = keys.length - named.length;

  const labels = named.slice(0, NAMED_SHOWN);
  const rest = named.length - labels.length;
  if (rest > 0) labels.push(`+${rest} more`);
  if (generated > 0) {
    labels.push(`${generated} from this conversation`);
  }
  return labels;
}
