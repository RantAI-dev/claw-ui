#!/usr/bin/env bash
# Assemble the Next.js standalone tree into a single portable tarball.
# Usage: scripts/package-standalone.sh <version-tag>
set -euo pipefail

VERSION="${1:?usage: package-standalone.sh <version-tag>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STANDALONE="$ROOT/.next/standalone"
OUT_DIR="$ROOT/dist"
ARCHIVE="claw-ui-${VERSION}.tar.gz"

[ -d "$STANDALONE" ] || { echo "error: $STANDALONE missing — run 'next build' first" >&2; exit 1; }

# Next does not copy static assets or public/ into standalone automatically.
cp -r "$ROOT/.next/static" "$STANDALONE/.next/static"
[ -d "$ROOT/public" ] && cp -r "$ROOT/public" "$STANDALONE/public"

# Next's standalone server binds 0.0.0.0 unless HOSTNAME is set, so the
# published tarball served an unauthenticated console — holding the gateway
# bearer token — on every interface the moment someone ran `node server.js`.
# Login is off unless the gateway enables it, so there was nothing else in the
# way. Default the binary itself to loopback; an explicit HOSTNAME still wins,
# which is how the Dockerfile keeps its deliberate 0.0.0.0.
SERVER_JS="$STANDALONE/server.js"
[ -f "$SERVER_JS" ] || { echo "error: $SERVER_JS missing — standalone build incomplete" >&2; exit 1; }
LOOPBACK_DEFAULT='process.env.HOSTNAME ||= "127.0.0.1"; // claw-ui: loopback unless the operator says otherwise'
if ! grep -qF 'claw-ui: loopback unless' "$SERVER_JS"; then
  printf '%s\n' "$LOOPBACK_DEFAULT" | cat - "$SERVER_JS" > "$SERVER_JS.tmp"
  mv "$SERVER_JS.tmp" "$SERVER_JS"
fi
grep -qF 'claw-ui: loopback unless' "$SERVER_JS" || { echo "error: failed to set the loopback default in server.js" >&2; exit 1; }

mkdir -p "$OUT_DIR"
# Tar the CONTENTS of standalone so server.js is at the archive root.
tar czf "$OUT_DIR/$ARCHIVE" -C "$STANDALONE" .
( cd "$OUT_DIR" && sha256sum "$ARCHIVE" > SHA256SUMS )

echo "packaged: $OUT_DIR/$ARCHIVE"
echo "checksums: $OUT_DIR/SHA256SUMS"
