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

mkdir -p "$OUT_DIR"
# Tar the CONTENTS of standalone so server.js is at the archive root.
tar czf "$OUT_DIR/$ARCHIVE" -C "$STANDALONE" .
( cd "$OUT_DIR" && sha256sum "$ARCHIVE" > SHA256SUMS )

echo "packaged: $OUT_DIR/$ARCHIVE"
echo "checksums: $OUT_DIR/SHA256SUMS"
