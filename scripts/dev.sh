#!/usr/bin/env bash
# Zero-config local dev: starts a throwaway project-local RantaiClaw gateway
# (loopback, pairing disabled, NO provider key) plus the Next.js UI, and points
# the UI at it. Great for working on the UI without touching your real config.
#
# For real chat against your MiniMax/OpenRouter agent, use scripts/setup-minimax.mjs
# instead (and start your own gateway).
#
# Usage: ./scripts/dev.sh [gateway_port]   (default 3017; UI always on 3939)
set -euo pipefail

UI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GW_PORT="${1:-3017}"
DEVDIR="$UI_DIR/.devgateway"
# Find the rantaiclaw binary (sibling Rust repo).
BIN=""
for cand in "$UI_DIR/../rantaiclaw/target/release/rantaiclaw" "$UI_DIR/../rantaiclaw/target/debug/rantaiclaw" "$(command -v rantaiclaw || true)"; do
  [ -x "$cand" ] && BIN="$cand" && break
done
[ -n "$BIN" ] || { echo "✖ rantaiclaw binary not found. Build it: (cd ../rantaiclaw && cargo build --release)"; exit 1; }

mkdir -p "$DEVDIR"
if [ ! -f "$DEVDIR/config.toml" ]; then
  cat > "$DEVDIR/config.toml" <<EOF
schema_version = 2
default_provider = "openrouter"
default_model = "anthropic/claude-haiku-4.5"
default_temperature = 0.7

[gateway]
host = "127.0.0.1"
port = $GW_PORT
require_pairing = false
allow_public_bind = false
EOF
  chmod 600 "$DEVDIR/config.toml"
fi

# Stop any prior dev gateway we started.
[ -f "$DEVDIR/dev-gateway.pid" ] && kill "$(cat "$DEVDIR/dev-gateway.pid")" 2>/dev/null || true
sleep 1

echo "▶ dev gateway: $BIN gateway -p $GW_PORT (config: $DEVDIR)"
RANTAICLAW_CONFIG_DIR="$DEVDIR" nohup "$BIN" gateway --host 127.0.0.1 -p "$GW_PORT" \
  > "$DEVDIR/dev-gateway.log" 2>&1 &
echo $! > "$DEVDIR/dev-gateway.pid"
sleep 3

printf 'RANTAICLAW_GATEWAY_URL=http://127.0.0.1:%s\nRANTAICLAW_TOKEN=\n' "$GW_PORT" > "$UI_DIR/.env.local"
echo "▶ .env.local -> http://127.0.0.1:$GW_PORT (no token; pairing disabled)"

echo "▶ UI: bun run dev  ->  http://127.0.0.1:3939"
cd "$UI_DIR"
exec bun run dev
