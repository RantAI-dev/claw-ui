#!/usr/bin/env node
/**
 * One-command setup to point rantaiclaw-ui at YOUR real RantaiClaw gateway
 * (e.g. the minimax-test profile) with working chat.
 *
 * What it does (all local, loopback-only):
 *   1. Finds your active profile config (~/.rantaiclaw/profiles/<active>/config.toml).
 *   2. Generates a strong bearer token and registers it in that profile's
 *      [gateway] paired_tokens (additive — your existing tokens are preserved;
 *      require_pairing stays ON). The gateway hashes plaintext tokens on load.
 *   3. Writes .env.local so the UI proxy authenticates with that token.
 *
 * Then restart your gateway and the UI:
 *   ./target/release/rantaiclaw gateway --host 127.0.0.1 -p 3000
 *   bun run dev
 *
 * This intentionally modifies YOUR gateway config, so it is a script YOU run —
 * the build agent deliberately did NOT touch your config automatically.
 *
 * Usage:  node scripts/setup-minimax.mjs [--port 3000] [--profile <name>]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const port = getArg("port", "3000");
const RC = join(homedir(), ".rantaiclaw");

let profile = getArg("profile", null);
if (!profile) {
  const ap = join(RC, "active_profile");
  profile = existsSync(ap) ? readFileSync(ap, "utf8").trim() : "default";
}
const cfgPath = join(RC, "profiles", profile, "config.toml");
if (!existsSync(cfgPath)) {
  console.error(`✖ Config not found: ${cfgPath}\n  Pass --profile <name> or run \`rantaiclaw onboard\` first.`);
  process.exit(1);
}

const token = "zcui_" + randomBytes(32).toString("hex");
let cfg = readFileSync(cfgPath, "utf8");
copyFileSync(cfgPath, cfgPath + ".bak-rantaiclaw-ui");

const m = cfg.match(/(paired_tokens\s*=\s*\[)([\s\S]*?)(\])/);
if (m) {
  const existing = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
  const inner = [...existing, token].map((t) => `"${t}"`).join(", ");
  cfg = cfg.slice(0, m.index) + `${m[1]}${inner}${m[3]}` + cfg.slice(m.index + m[0].length);
} else if (/\[gateway\]/.test(cfg)) {
  cfg = cfg.replace(/\[gateway\]/, `[gateway]\nparied_tokens = ["${token}"]`.replace("paried", "paired"));
} else {
  cfg += `\n[gateway]\npaired_tokens = ["${token}"]\n`;
}
writeFileSync(cfgPath, cfg);
try { chmodSync(cfgPath, 0o600); } catch {}

const envPath = join(process.cwd(), ".env.local");
writeFileSync(envPath, `RANTAICLAW_GATEWAY_URL=http://127.0.0.1:${port}\nRANTAICLAW_TOKEN=${token}\n`);

console.log(`✔ Registered a UI token in profile "${profile}" (backup: ${cfgPath}.bak-rantaiclaw-ui)`);
console.log(`✔ Wrote .env.local -> http://127.0.0.1:${port}`);
console.log(`\nNext:`);
console.log(`  1) (re)start your gateway:  ./target/release/rantaiclaw gateway --host 127.0.0.1 -p ${port}`);
console.log(`  2) (re)start the UI:        bun run dev   # http://127.0.0.1:3939`);
console.log(`\nTo undo: restore ${cfgPath}.bak-rantaiclaw-ui`);
