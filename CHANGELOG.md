# Changelog

All notable changes to the RantaiClaw web console are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Console releases are cut alongside the runtime; the runtime's `CHANGELOG.md`
carries the paired entry and the release notes.

## [Unreleased]

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
