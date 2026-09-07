#!/usr/bin/env node
// Assert package.json's version has not fallen behind the newest release tag.
//
// Usage: node scripts/check-version.mjs [--self-test]
//
// Why this exists
// ---------------
// `package.json` said `0.2.0` while the shipped tag was `v0.3.27` — eleven minor
// versions behind, for long enough that nobody noticed. Anything that reads the
// package version got the wrong answer: a bug report, a build artefact, a
// support question about which console someone is running.
//
// The rule is "not behind", not "equal", so a release PR may bump the version
// before the tag exists. Falling behind is the failure that actually happened.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Compare dotted numeric versions. Returns -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function latestTag() {
  const out = execSync("git tag --list 'v*'", { encoding: "utf8" });
  const versions = out
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => t.slice(1))
    .sort(compareVersions);
  return versions.at(-1) ?? null;
}

function selfTest() {
  const cases = [
    ["0.3.27", "0.3.27", 0],
    ["0.2.0", "0.3.27", -1],
    ["0.3.28", "0.3.27", 1],
    ["0.10.0", "0.9.9", 1],
    ["1.0.0", "0.99.99", 1],
  ];
  let failures = 0;
  for (const [a, b, want] of cases) {
    const got = compareVersions(a, b);
    if (got !== want) {
      console.error(`FAIL: compareVersions(${a}, ${b}) = ${got}, expected ${want}`);
      failures++;
    } else {
      console.log(`ok: compareVersions(${a}, ${b}) = ${got}`);
    }
  }
  if (failures) {
    console.error(`check-version self-test: ${failures} case(s) failed`);
    process.exit(1);
  }
  console.log("check-version self-test: all cases passed");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = latestTag();

if (!tag) {
  console.log("No v* tags found — nothing to compare against.");
  process.exit(0);
}

if (compareVersions(pkg.version, tag) < 0) {
  console.error(
    `::error file=package.json::package.json version ${pkg.version} is behind the newest release tag v${tag}.`,
  );
  console.error(
    "         Anything reading the package version reports the wrong console. Bump it.",
  );
  process.exit(1);
}

console.log(`package.json ${pkg.version} is not behind the newest tag v${tag}.`);
