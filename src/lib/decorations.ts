/** Decorations the console USED to add to the SENT message, and how to take
 * them back off.
 *
 * Nothing is appended to `message` any more. KB context rides the structured
 * `context` field, the gateway owns conversation history, and the generative-UI
 * instruction is selected by `render_mode` — the gateway applies it to the
 * prompt for that turn and never persists it.
 *
 * The constants and the strip stay because the gateway persists `body.message`
 * verbatim, so turns stored by older console versions still carry these markers
 * and must render and export cleanly. Rewriting stored history to tidy it is
 * deliberately not done.
 *
 * `GUI_INSTRUCTION` is now a COPY of the gateway's `GUI_RENDER_INSTRUCTION`,
 * kept only to recognise those older turns. It is no longer what the model is
 * told — do not re-add it to an outgoing message.
 */

export const GUI_INSTRUCTION = [
  "[RENDER MODE: GENERATIVE UI]",
  "When a structured, data-heavy, or interactive answer would help, include ONE fenced code block with language `ui` holding a JSON array of components (plus optional prose around it). Otherwise reply normally in markdown.",
  "Components: ",
  '{"type":"heading","text":"..."}, {"type":"text","text":"markdown"}, {"type":"divider"},',
  '{"type":"card","title":"...","tone":"sky|green|amber|red|purple","children":[...nested components...]},',
  '{"type":"metrics","items":[{"label":"p95","value":"41ms","tone":"green"}]},',
  '{"type":"keyvalue","items":[{"k":"model","v":"..."}]},',
  '{"type":"table","columns":["A","B"],"rows":[["1","2"]]},',
  '{"type":"list","items":["..."]}, {"type":"badges","items":[{"label":"OK","tone":"green"}]},',
  '{"type":"callout","tone":"amber","text":"..."},',
  '{"type":"choices","prompt":"Pick one","options":[{"label":"Yes","value":"yes"}]}.',
  "Keep the JSON strictly valid. `choices` options send their value back as the next user message.",
  "---",
  "",
].join("\n");

// Sentinels that older clients wrapped around KB context and prior-conversation
// history INSIDE the sent message. Neither is sent any more — KB context rides
// the structured `context` field, and the gateway owns conversation history —
// but transcripts stored before that still carry them, so the strip-on-reload
// below stays.
//
// **The gateway owns conversation history.** It replays a continued session's
// stored messages itself (`load_session_history` → `restore_history`, up to
// `HISTORY_REPLAY_MAX`), so a client that also prepends its own transcript
// sends it twice — and because the gateway persists the message verbatim, the
// blob is stored inside the user message and replayed again next turn. Do not
// re-add it: send only the new turn.
const KB_OPEN = "<<<KB_CONTEXT>>>";
const KB_CLOSE = "<<<END_KB_CONTEXT>>>";
const HIST_OPEN = "<<<CONVERSATION_SO_FAR>>>";
const HIST_CLOSE = "<<<END_CONVERSATION>>>";

/** Strip appended decorations (history + KB context + GUI instruction) for display. */
export function stripDecorations(content: string): string {
  let c = content;
  if (c.endsWith(GUI_INSTRUCTION))
    c = c.slice(0, c.length - GUI_INSTRUCTION.length);
  c = c.replace(
    new RegExp(`\\n*${KB_OPEN}\\n[\\s\\S]*?\\n${KB_CLOSE}`, "g"),
    "",
  );
  c = c.replace(
    new RegExp(`\\n*${HIST_OPEN}\\n[\\s\\S]*?\\n${HIST_CLOSE}`, "g"),
    "",
  );
  return c.replace(/\s+$/, "");
}
