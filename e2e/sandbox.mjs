// The E2E sandbox: a real RantaiClaw gateway, a stub model, and the console.
//
// "Real gateway" is the point. The console's security boundary — the login
// gate, the cross-site write rejection, the Host allowlist — lives in
// `src/proxy.ts`, a Next middleware. A unit test can assert that file's logic;
// only an end-to-end run can assert that the framework actually runs it before
// serving `/api/rc/*`. Mocking the gateway would re-test the unit tests.
//
// The model is stubbed on purpose. It is the one component whose answers must
// be deterministic for a test to assert anything, and stubbing it costs no
// coverage: every layer this suite is about sits between the browser and the
// gateway.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import net from "node:net";

/** Fixture credential. The password is `hunter2hunter2` and it guards nothing:
 *  the whole sandbox is a throwaway HOME deleted when the run ends. The hash is
 *  checked in because generating one needs argon2, and adding a native module to
 *  the console's dependencies to log a test in is a worse trade. */
export const LOGIN = {
  username: "operator",
  password: "hunter2hunter2",
  hash: "$argon2id$v=19$m=19456,t=2,p=1$XJMNykJ0LGdRUc3yfaKidg$YQ7Ewdz+r8p30MrUmhU1KlFXHHywvzQ4wRA7fViByTg",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A port the OS says is free right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Poll `url` until it answers or `timeoutMs` elapses. */
async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await wait(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

/** A stub speaking the sliver of Ollama's API the runtime uses.
 *
 *  `toolCall`, when given, is emitted on the FIRST completion only; every later
 *  one is a plain answer. That is enough to drive one tool call to completion
 *  without the test depending on a model choosing to make it. */
function startStubModel(port, toolCall) {
  let turns = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/api/tags")) {
        res.end(JSON.stringify({ models: [{ name: "stub:latest", model: "stub:latest" }] }));
        return;
      }
      turns += 1;
      if (toolCall && turns === 1) {
        res.end(
          JSON.stringify({
            message: {
              content: "",
              tool_calls: [
                { id: "e2e-call-1", function: { name: toolCall.name, arguments: toolCall.args } },
              ],
            },
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          message: { content: "The sandbox model answered.", tool_calls: [] },
        }),
      );
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/**
 * Start everything the suite needs and return a handle that stops it again.
 *
 * `login` chooses whether the gateway reports console login as required, which
 * is what the console follows — the UI does not decide this for itself.
 *
 * @param {{ login?: boolean, toolCall?: { name: string, args: Record<string, unknown> } | null }} [opts]
 */
export async function startSandbox(opts = {}) {
  const { login = true, toolCall = null } = opts;
  const binary =
    process.env.RANTAICLAW_BINARY ??
    join(process.cwd(), "..", "RantAIClaw", "target", "debug", "rantaiclaw");
  const home = mkdtempSync(join(tmpdir(), "claw-ui-e2e-"));
  mkdirSync(join(home, ".rantaiclaw"), { recursive: true });

  // Ports from the OS, not from `Math.random()`. Random ports in a fixed range
  // collide often enough across five sandboxes in one run to make the suite
  // order-dependent, and an order-dependent E2E is worse than none: it fails on
  // a different scenario each run and teaches everyone to re-run it.
  const [modelPort, gatewayPort, consolePort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
  ]);

  const loginBlock = login
    ? `\n[gateway.login]\nusername = "${LOGIN.username}"\npassword_hash = "${LOGIN.hash}"\nidle_timeout_secs = 0\n`
    : "";

  writeFileSync(
    join(home, ".rantaiclaw", "config.toml"),
    `schema_version = 31
default_provider = "ollama"
default_model = "stub:latest"
api_url = "http://127.0.0.1:${modelPort}"

[channels_config]
cli = true

[channels_config.irc]
server = "irc.example.com"
port = 6697
nickname = "rantaiclaw_bot"
channels = ["#rantaiclaw"]
allowed_users = ["*"]

# Supported and never driven, which is the third state the panel has to show.
# Nothing here dials Discord; the token is a placeholder and the listener is
# never started by these tests.
[channels_config.discord]
bot_token = "placeholder-not-a-real-token"
allowed_users = ["*"]

[gateway]
enabled = true
host = "127.0.0.1"
port = ${gatewayPort}
require_pairing = false
${loginBlock}`,
    { mode: 0o600 },
  );

  const model = await startStubModel(modelPort, toolCall);

  const gateway = spawn(binary, ["gateway"], {
    env: { ...process.env, HOME: home, RUST_LOG: "warn" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gatewayLog = [];
  gateway.stdout.on("data", (d) => gatewayLog.push(String(d)));
  gateway.stderr.on("data", (d) => gatewayLog.push(String(d)));
  await waitForHttp(`http://127.0.0.1:${gatewayPort}/health`).catch((e) => {
    throw new Error(`${e.message}\ngateway output:\n${gatewayLog.join("")}`);
  });

  // `next` directly and in its own process group, not through `npx`. Killing
  // the `npx` wrapper leaves the real server alive holding the port, and the
  // next sandbox then picks a port already in use — so a spec configured with
  // login ON silently talks to the previous spec's login-OFF console and its
  // assertions pass or fail for reasons that have nothing to do with the code.
  const console_ = spawn(join("node_modules", ".bin", "next"), ["start", "-p", String(consolePort)], {
    env: {
      ...process.env,
      RANTAICLAW_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`,
      RANTAICLAW_UI_SECRET: "e2e-sandbox-cookie-signing-key-not-a-secret",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const consoleLog = [];
  console_.stdout.on("data", (d) => consoleLog.push(String(d)));
  console_.stderr.on("data", (d) => consoleLog.push(String(d)));
  // `localhost`, not `127.0.0.1`: Next's dev-origin handling treats the IP
  // literal as an unexpected host and the panels never resolve.
  await waitForHttp(`http://localhost:${consolePort}/api/health`).catch((e) => {
    throw new Error(`${e.message}\nconsole output:\n${consoleLog.join("")}`);
  });

  return {
    baseURL: `http://localhost:${consolePort}`,
    gatewayURL: `http://127.0.0.1:${gatewayPort}`,
    home,
    gatewayOutput: () => gatewayLog.join(""),
    consoleOutput: () => consoleLog.join(""),
    /** Kill the gateway and wait until it has actually stopped answering.
     *
     *  By pid, not by `pkill -f <home>`: the gateway's HOME is an environment
     *  variable and never appears in its argv, so a pattern kill matches
     *  nothing and the test then asserts against a gateway that is still up. */
    async killGateway() {
      gateway.kill("SIGKILL");
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const alive = await new Promise((resolve) => {
          const req = http.get(`http://127.0.0.1:${gatewayPort}/health`, (res) => {
            res.resume();
            resolve(true);
          });
          req.on("error", () => resolve(false));
          req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
          });
        });
        if (!alive) return;
        await wait(200);
      }
      throw new Error("the gateway was still answering 10s after SIGKILL");
    },
    async stop() {
      // Kill the process GROUP: `next start` forks, and killing only the
      // parent leaves the server holding its port for the next sandbox to
      // collide with.
      try {
        process.kill(-console_.pid, "SIGKILL");
      } catch {
        console_.kill("SIGKILL");
      }
      gateway.kill("SIGKILL");
      model.close();
      // Wait until the port is actually free. Returning while the old console
      // still answers is what made the suite order-dependent.
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const alive = await new Promise((resolve) => {
          const req = http.get(`http://localhost:${consolePort}/api/health`, (res) => {
            res.resume();
            resolve(true);
          });
          req.on("error", () => resolve(false));
          req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
          });
        });
        if (!alive) break;
        await wait(200);
      }
      rmSync(home, { recursive: true, force: true });
    },
  };
}
