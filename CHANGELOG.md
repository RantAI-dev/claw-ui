# Changelog

All notable changes to the RantaiClaw web console are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Console releases are cut alongside the runtime; the runtime's `CHANGELOG.md`
carries the paired entry and the release notes.

## [Unreleased]

## [0.3.29] — 2026-09-26

Paired with RantaiClaw `v0.32.0-alpha`, and this console needs it. The Discord, Slack,
WhatsApp Web and Lark setup cards call gateway routes that runtime adds; an older
gateway has none of them, so its only working card is Telegram's. The Slack and
Discord checklist (`setup_checklist`) and the WhatsApp Web restart wait
(`restarts_runtime`) read fields that runtime adds, and degrade as their entries say.

### Added

- **Discord and Slack can be set up from the Channels page.** (#120) A Discord card and a Slack
  card sit beside Telegram's, and each can connect, edit its allowlist live, and disconnect.
  Discord takes the bot token, the allowlist and an optional guild id. Slack takes the bot token
  and the app-level token as separate fields, the allowlist and an optional channel id. Optional
  fields are sent only when set, because the gateway reads an absent field as "keep the saved
  value". A section configured without a token now says so and offers the connect form, instead
  of reading as connected while the channel never starts.
- **WhatsApp Web can be linked from the Channels page.** (#121) Link WhatsApp streams the pairing
  from the gateway and shows its QR, rendered as an image from the gateway's SVG; a pair code
  never reaches the browser. The allowlist is edited live with a Save button like the other cards
  (#123), and a section left without a session can be cleared from the card so it can be linked
  again (#122).
- **Slack and Discord setup cards show the platform-side checklist the gateway sends.**
  A connected Slack or Discord bot can still be deaf to DMs or receive empty messages when the
  platform side is misconfigured, and the console used to show nothing about that. From RantaiClaw
  `v0.32.0-alpha`, `/api/v1/channels` carries an optional `setup_checklist` on the `slack` and
  `discord` rows, and the cards render it verbatim in the connect state, above the token input,
  under a short "On the platform side" heading. A gateway that does not yet send the field
  renders nothing extra — no fallback copy, no heading. The other channels (Telegram, WhatsApp Web, Lark) never get a checklist, and a
  buggy catalog row that carries one on the wrong key is ignored by the render, which is gated
  by the card's own key.
- **Lark can be set up from the Channels page.** The fifth setup card, alongside Telegram, Discord,
  Slack and WhatsApp Web: app id and app secret as credential fields that are never seeded and clear
  after a save, an allowlist editor applied live, and a region switch (Lark international by default,
  Feishu the alternative). The card appears only once the gateway's build actually recognises Lark
  (RantaiClaw #822/#825) — a console pointed at an older gateway sees nothing new.

### Changed

- **Locked channels get their own dimmed section.** "Other channels" used to fold an
  under-development channel into the same list as usable ones, with a badge, plus a count
  sentence naming how many of the catalog's channel types were locked. Both are replaced by an
  "Under development" section that names every locked channel by name, whether or not it has a
  configured section, with no button and no link; a configured one reads "under development · not
  started". The tier still comes from `/api/v1/channels` `support`, never a list this console
  keeps.

### Fixed

- **WhatsApp Web is listed once, not twice.** Its setup card shipped in #121, but `CARDED_CHANNELS`
  never gained the `whatsapp_web` key, so a configured WhatsApp Web section rendered both as its own
  card and as a row under "Other channels", whose controls could not connect or disconnect it. The
  "N more channels are available" count was one too high for the same reason.
- **The WhatsApp Web card says what actually happens.** Disconnecting said the paired session was
  cleared and a fresh QR would reconnect, but the gateway only clears the saved section and wa-rs has
  no logout, so the phone keeps the linked device. The dialog now says WhatsApp is disconnected from
  RantaiClaw, the runtime restarts, and the device stays on the phone until it is removed under
  WhatsApp → Linked Devices. A successful link shows a "WhatsApp linked" toast instead of a "Linked."
  line that the refetch replaced before it could be read, and the card waits for a restart only when
  the gateway's `connected` frame says one is coming (`restarts_runtime`, RantaiClaw #820); a gateway
  without the field is still treated as restarting. The timeout message no longer promises a new QR
  rotation per click.
- **The Lark card's allowlist label says `open_id`, not `user_id`.** The runtime matches only the
  Lark `open_id` (`ou_…`); pasting a Lark `user_id` into the old label built an allowlist that never
  matched. The field is now labelled "Allowed Lark open_ids (ou_…, comma-separated)" with a short
  hint that `/claim` adds one automatically. (#130)

## [0.3.28] — 2026-09-08

Paired with RantaiClaw `v0.31.0-alpha`, and this console needs it: the channel
badges below read two fields that only that runtime serves. Against an older
gateway the list still renders, by key, with no tier claimed.

### Added

- **An `env` field on the MCP panel.** The API had accepted `env` all along and the gateway
  encrypts it at rest, so a server needing a credential could be configured everywhere except
  here. Stored keys are listed with masked values, reusing the `MASK` the config viewer already
  uses. (Landed in #114, before this file existed, so it appears here rather than in its own PR
  entry.)
- **A linter, and a version that cannot fall behind.** The repository had none: `next lint` was
  removed in Next 16 and the `lint` script had been failing for a while. CI now runs ESLint and
  fails on a stale `eslint-disable`. `package.json` said `0.2.0` while the shipped tag was
  `v0.3.27`; `scripts/check-version.mjs` keeps that from happening again. (#114)

- **The console's first end-to-end tests, against a real gateway.** 695 unit tests click real
  buttons and assert real request bodies — and all of them stop at the BFF boundary. Nothing had
  ever verified that a login actually gates, that a chat turn survives a round trip, or that the
  console stays legible when the gateway is down. Five Playwright scenarios now run against the
  **released `rantaiclaw` binary** with a scratch `HOME`, not a mock; only the model is stubbed,
  because it is the one component whose answers must be deterministic and the one this suite is
  not about.
  - **The login gate** — the assertion the unit tests structurally cannot make. The gate is a Next
    middleware; a unit test can assert that file's logic, but only an end-to-end run can assert
    that the framework runs it before serving `/api/rc/*`. Verified failing: with the gate's
    `denied()` replaced by `NextResponse.next()`, the scenario goes red.
  - **A chat turn**, composer to reply, through the SSE relay and a tool call.
  - **An ops-panel write**, asserted against what the *gateway* reports afterwards rather than
    against the request the console sent — that second half is where the audits kept finding
    saves that reported success and changed nothing.
  - **The gateway going away**: the BFF answers 502 and the page names the outage, instead of a
    blank panel or a spinner that never resolves.
  - **The channel maturity badge**, end to end from the runtime's catalog to the pixel.
  Eight assertions, **17 seconds**, no retries and nothing skipped — five scenarios that always
  run beat twenty that get disabled the first time they flake. CI runs them as their own job
  against the newest published release binary; no new GitHub Action source was added.

- **A channel's maturity is visible where channels are listed.** A grid of equal-looking rows
  says all sixteen channels are equally ready; they are not. An `under_development` channel now
  carries an "Under development" badge — the existing `warning` badge variant, whose contrast
  was already checked, not a new chip — and a `supported` one carries none. The section says in
  one sentence what the label means before an operator commits credentials: these build and have
  tests, nobody has watched a message arrive, `channel doctor` does not probe them, and
  connecting one is fine as long as you expect to debug it yourself.
- **This file.** The console had no changelog, so console changes were only ever described in
  the runtime's. Each console PR now writes its own entry here.

### Changed

- **The console shows the two axes the runtime now publishes, so "supported" stops implying
  "verified".** RantaiClaw split the single channel label into a **support** axis (what the
  project commits to) and a **verification** axis (whether anyone has driven it). The console
  read the first and would have shown only that, which is the exact claim this effort has been
  removing everywhere else: a channel reading "supported" in a UI when nobody has watched a
  message arrive on it.
  The support axis keeps the badge it had. Verification reads as a quieter qualifier next to it,
  not a second chip: two chips per row would make the list unreadable and would imply the two
  facts carry equal weight, and they do not. One is a commitment and one is evidence.
  The three states now read differently at a glance. A supported and driven channel says
  **verified**, a supported and undriven one says **not yet verified**, and an under-development
  one carries both its badge and the qualifier.
- **Telegram's card says "verified" out loud** rather than leaving the good case to be inferred
  from an absence. Telegram is the only driven channel and it has its own card, so without this
  the two states would have sat on different components with nothing said on either.
- **The panel explains what "not yet verified" means** in one sentence, next to the count: the
  project stands behind these channels and nobody has watched a message arrive on one yet. An
  operator is about to hand one of them credentials.
- **A console newer than its gateway still renders.** `support` falls back to the `maturity`
  field older runtimes send, and verification stays `null` rather than being invented: a runtime
  from before the split has no opinion, and claiming "not yet verified" on its behalf would be
  making up evidence about a channel the console cannot see. The E2E asserts the two-axis case
  and the degradation separately, and passes against both the current build and the released
  binary that has neither field.

- **The linter's backlog is down from 51 warnings to 37, and what is left is named.** Plan 326's
  first three groups:
  - The one `@next/next/no-location-assign-relative-destination` finding is **justified, not
    changed**. It is not an open redirect — the rule is about a *user-controlled* relative
    destination and this is the literal `"/login"` in `logout`. The hard navigation is the point:
    it tears down the React tree, so the session list, config dump and personality this component
    holds in memory go with it. A client-side push would leave all three in a logged-out console.
    The disable carries that reason on the line.
  - **Ten unused-binding warnings, four of them genuinely dead** — two imports, a third import in a
    test, and a computed-and-never-read local. Those are deleted. The other six are bindings whose
    purpose is to be unused: `^_` parameters holding a position in a signature that cannot drop its
    leading arguments, and `ol({ start, node, ...props })` in the markdown renderer, which
    destructures `node` precisely so it does *not* land on a DOM element. The rule is told both
    conventions rather than the code bent to satisfy it, and the four deletions are what keeps
    that honest.
  - **`useAsync` no longer reads a ref during render.** It backs every ops panel. `loaded` was a
    ref, read at render and returned to callers — which works only because the write sits on the
    same line as `setData`, whose re-render is what makes the new value visible. Reorder those two
    statements and every consumer renders a stale `loaded` with nothing to say so; `PanelFrame`
    uses it to decide whether a failed refresh blanks the panel or keeps the data on screen.
    It is now a ref *and* a state value, written together and never separately.

  **Still open: 37 warnings** — 24 `react-hooks/set-state-in-effect`, 7 `react-hooks/refs`,
  3 `immutability`, 2 `use-memo`, 1 `exhaustive-deps`. Every one of them is a question about where
  state should be derived rather than set, and plan 326 asks for a live drive of the affected panel
  per file, because these bugs are invisible to unit tests by nature. The four `react-hooks` rules
  stay at `warn` until that count is zero — raising them early would be the exemption-that-nobody-
  has-to-act-on this backlog already is.

- **The console no longer keeps its own copy of the channel catalog.** `src/lib/channels.ts`
  held a hand-typed `CHANNEL_CATALOG` of all sixteen channels, mirroring the runtime's, and its
  own comment admitted the two could disagree. Two hand-maintained lists of the same thing in
  two repositories is how `/api/v1/channels` came to report 7 of 11 channels in the first place.
  The list now arrives on that endpoint and `channelLabel`, `channelMaturity`, `configuredRows`
  and `channelsVerdict` all take it as an argument. The fallback the old comment described is
  kept and now covers both directions of version skew: a key the catalog does not carry renders
  as the key, and a gateway too old to send a catalog at all leaves the rows rendering by key
  rather than blanking.
