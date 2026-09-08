# Changelog

All notable changes to the RantaiClaw web console are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Console releases are cut alongside the runtime; the runtime's `CHANGELOG.md`
carries the paired entry and the release notes.

## [Unreleased]

### Added

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


### Changed

- **The console no longer keeps its own copy of the channel catalog.** `src/lib/channels.ts`
  held a hand-typed `CHANNEL_CATALOG` of all sixteen channels, mirroring the runtime's, and its
  own comment admitted the two could disagree. Two hand-maintained lists of the same thing in
  two repositories is how `/api/v1/channels` came to report 7 of 11 channels in the first place.
  The list now arrives on that endpoint and `channelLabel`, `channelMaturity`, `configuredRows`
  and `channelsVerdict` all take it as an argument. The fallback the old comment described is
  kept and now covers both directions of version skew: a key the catalog does not carry renders
  as the key, and a gateway too old to send a catalog at all leaves the rows rendering by key
  rather than blanking.

### Added

- **A channel's maturity is visible where channels are listed.** A grid of equal-looking rows
  says all sixteen channels are equally ready; they are not. An `under_development` channel now
  carries an "Under development" badge — the existing `warning` badge variant, whose contrast
  was already checked, not a new chip — and a `supported` one carries none. The section says in
  one sentence what the label means before an operator commits credentials: these build and have
  tests, nobody has watched a message arrive, `channel doctor` does not probe them, and
  connecting one is fine as long as you expect to debug it yourself.
- **This file.** The console had no changelog, so console changes were only ever described in
  the runtime's. Each console PR now writes its own entry here.
