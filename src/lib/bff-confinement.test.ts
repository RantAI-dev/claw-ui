import { describe, it, expect } from "vitest";
import { resolveGatewayUrl } from "./gateway-path";
import {
  expectedHosts,
  isCrossSiteWrite,
  isStateChanging,
  isUnexpectedHost,
} from "./request-origin";

const GW = "http://127.0.0.1:9393";

describe("gateway path confinement", () => {
  it("resolves an ordinary path", () => {
    expect(resolveGatewayUrl(["status"], "", GW)).toBe(`${GW}/api/v1/status`);
  });

  it("keeps the query string", () => {
    expect(resolveGatewayUrl(["sessions"], "?limit=100", GW)).toBe(
      `${GW}/api/v1/sessions?limit=100`,
    );
  });

  it("resolves a multi-segment path", () => {
    expect(resolveGatewayUrl(["sessions", "abc-123", "title"], "", GW)).toBe(
      `${GW}/api/v1/sessions/abc-123/title`,
    );
  });

  // These are the exact payloads that reached the gateway before the fix. Next
  // hands the route already-decoded segments, so `..%2f..%2fpair` on the wire
  // arrives here as the single string "../../pair". Re-encoded it would stay one
  // segment, but an intermediary that decodes `%2F` would turn it back into a
  // traversal, so a dot component inside a segment is refused outright.
  it.each([
    ["../../pair"],
    ["../../webhook"],
    ["../../metrics"],
    ["../../webhook.svg"],
    ["../../../login"],
  ])("refuses to escape /api/v1 via %s", (seg) => {
    expect(resolveGatewayUrl([seg], "", GW)).toBeNull();
  });

  it("refuses traversal split across segments", () => {
    expect(resolveGatewayUrl(["..", "..", "pair"], "", GW)).toBeNull();
  });

  it("refuses a backslash-separated escape", () => {
    expect(resolveGatewayUrl(["..\\..\\pair"], "", GW)).toBeNull();
  });

  it("refuses a lone traversal element", () => {
    expect(resolveGatewayUrl([".."], "", GW)).toBeNull();
    expect(resolveGatewayUrl(["."], "", GW)).toBeNull();
    expect(resolveGatewayUrl(["providers", "..", "models"], "", GW)).toBeNull();
  });

  it.each([
    [["providers", "a/../b", "models"]],
    [["x/./y"]],
    [["..\\x"]],
    [["a\\..\\b"]],
    [["a/.."]],
    [["./a"]],
  ])("refuses a dot component inside a segment: %j", (segs) => {
    expect(resolveGatewayUrl(segs, "", GW)).toBeNull();
  });

  it("refuses an empty segment", () => {
    expect(resolveGatewayUrl([""], "", GW)).toBeNull();
    expect(resolveGatewayUrl(["providers", "", "models"], "", GW)).toBeNull();
  });

  it("cannot be redirected to another host", () => {
    // These have no dot component, so they are allowed, but they are encoded
    // into one path segment: the origin and the /api/v1/ prefix are unchanged,
    // and they stay there even if an intermediary decodes `%2F`.
    for (const [seg, encoded] of [
      ["//evil.example", "%2F%2Fevil.example"],
      ["http://evil.example/x", "http%3A%2F%2Fevil.example%2Fx"],
    ]) {
      const url = resolveGatewayUrl([seg], "", GW);
      expect(url).toBe(`${GW}/api/v1/${encoded}`);
      expect(new URL(url as string).origin).toBe(GW);
    }
  });

  // The console encodes an id with encodeURIComponent, Next decodes it, and the
  // proxy encodes it again. The gateway decodes one `{id}` segment, so a custom
  // provider id that is a URL has to reach it as one segment.
  it("forwards a provider id that contains slashes as one encoded segment", () => {
    const id = "custom:https://host/v1";
    expect(resolveGatewayUrl(["providers", id, "models"], "", GW)).toBe(
      `${GW}/api/v1/providers/custom%3Ahttps%3A%2F%2Fhost%2Fv1/models`,
    );
    expect(resolveGatewayUrl(["providers", id, "models", "refresh"], "", GW)).toBe(
      `${GW}/api/v1/providers/custom%3Ahttps%3A%2F%2Fhost%2Fv1/models/refresh`,
    );
  });

  it("forwards a memory key and a document id that contain slashes as one segment", () => {
    expect(resolveGatewayUrl(["memory", "notes/2026/plan"], "", GW)).toBe(
      `${GW}/api/v1/memory/notes%2F2026%2Fplan`,
    );
    expect(resolveGatewayUrl(["memory", "a/b.c/d"], "", GW)).toBe(
      `${GW}/api/v1/memory/a%2Fb.c%2Fd`,
    );
    expect(resolveGatewayUrl(["memory", "notes..txt"], "", GW)).toBe(
      `${GW}/api/v1/memory/notes..txt`,
    );
    expect(resolveGatewayUrl(["kb", "documents", "docs/guide.md"], "", GW)).toBe(
      `${GW}/api/v1/kb/documents/docs%2Fguide.md`,
    );
    expect(
      resolveGatewayUrl(["kb", "groups", "g1", "documents", "docs\\guide.md"], "", GW),
    ).toBe(`${GW}/api/v1/kb/groups/g1/documents/docs%5Cguide.md`);
  });

  it("passes through a segment that merely contains dots", () => {
    // `..` is only dangerous as a path element; a filename is fine.
    expect(resolveGatewayUrl(["kb", "notes..txt"], "", GW)).toBe(
      `${GW}/api/v1/kb/notes..txt`,
    );
  });
});

describe("cross-site write rejection", () => {
  const HOST = "192.168.18.170:3939";

  it("treats reads as always allowed", () => {
    expect(isStateChanging("GET")).toBe(false);
    expect(
      isCrossSiteWrite("GET", { secFetchSite: "cross-site", origin: "http://evil", host: HOST }),
    ).toBe(false);
  });

  it("allows the console's own writes (Sec-Fetch-Site path)", () => {
    expect(
      isCrossSiteWrite("POST", {
        secFetchSite: "same-origin",
        origin: `http://${HOST}`,
        host: HOST,
      }),
    ).toBe(false);
  });

  it("blocks a write from another site", () => {
    expect(
      isCrossSiteWrite("POST", {
        secFetchSite: "cross-site",
        origin: "http://evil.example",
        host: HOST,
      }),
    ).toBe(true);
  });

  it("blocks a same-site sibling on another port", () => {
    expect(
      isCrossSiteWrite("POST", {
        secFetchSite: "same-site",
        origin: "http://192.168.18.170:9999",
        host: HOST,
      }),
    ).toBe(true);
  });

  // Regression: the Origin fallback used to compare against `req.nextUrl.origin`
  // — the BIND address `0.0.0.0:3939` in the standalone server — so a genuine
  // same-origin login reached by LAN IP was rejected whenever the browser
  // omitted Sec-Fetch-Site (shipped broken in claw-ui v0.3.5). It must compare
  // against the Host header instead.
  it("allows a same-origin write via the Origin fallback, matched against Host", () => {
    expect(
      isCrossSiteWrite("POST", {
        secFetchSite: null,
        origin: `http://${HOST}`,
        host: HOST,
      }),
    ).toBe(false);
  });

  it("does not depend on the server's bind address", () => {
    // Same request, but pretend nextUrl.origin were 0.0.0.0 — irrelevant now,
    // because we compare Origin's host to the Host header, not a bind string.
    for (const host of ["192.168.18.170:3939", "127.0.0.1:3939", "localhost:3939"]) {
      expect(
        isCrossSiteWrite("POST", {
          secFetchSite: null,
          origin: `http://${host}`,
          host,
        }),
      ).toBe(false);
    }
  });

  it("blocks a cross-origin write on the fallback path", () => {
    expect(
      isCrossSiteWrite("POST", { secFetchSite: null, origin: "http://evil.example", host: HOST }),
    ).toBe(true);
  });

  it("fails closed on a malformed Origin or a missing Host", () => {
    expect(
      isCrossSiteWrite("POST", { secFetchSite: null, origin: "not a url", host: HOST }),
    ).toBe(true);
    expect(
      isCrossSiteWrite("POST", { secFetchSite: null, origin: `http://${HOST}`, host: null }),
    ).toBe(true);
  });

  it("allows a non-browser caller that sends neither header", () => {
    // curl and the CLI carry no ambient credentials, so CSRF does not apply;
    // keeping them out is the auth gate's job, not this check's.
    expect(isCrossSiteWrite("POST", { secFetchSite: null, origin: null, host: HOST })).toBe(false);
  });

  it("covers every state-changing method, not just POST", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        isCrossSiteWrite(m, { secFetchSite: "cross-site", origin: null, host: HOST }),
      ).toBe(true);
    }
  });
});

describe("expected-Host allowlist", () => {
  const loopback = expectedHosts({});

  it("rejects a rebound DNS name that satisfies the same-origin check", () => {
    // `evil.test` resolves to 127.0.0.1, so Origin and Host agree and the
    // cross-site check passes — the page's script then reads the full config
    // and issues writes, all signed with the gateway token.
    expect(
      isCrossSiteWrite("POST", {
        secFetchSite: null,
        origin: "http://evil.test:3939",
        host: "evil.test:3939",
      }),
    ).toBe(false);
    expect(isUnexpectedHost("evil.test:3939", loopback)).toBe(true);
  });

  it("serves loopback by default, with or without a port", () => {
    for (const host of ["localhost:3939", "127.0.0.1:3939", "localhost", "127.0.0.1"]) {
      expect(isUnexpectedHost(host, loopback)).toBe(false);
    }
  });

  it("serves any IP-literal Host without configuration — rebinding needs a name", () => {
    // DNS rebinding works by pointing a *name* at the console's address; the
    // browser then sends that name as Host. An IP literal in Host means the
    // browser was pointed at the address itself — not a rebinding vector.
    for (const host of [
      "192.168.1.20:3939",
      "10.0.0.5",
      "[::1]:3939",
      "[fe80::1]:3939",
    ]) {
      expect(isUnexpectedHost(host, loopback)).toBe(false);
    }
  });

  it("does not mistake a name containing an IP for an IP literal", () => {
    expect(isUnexpectedHost("127.0.0.1.evil.test:3939", loopback)).toBe(true);
    expect(isUnexpectedHost("999.1.1.1", loopback)).toBe(true);
  });

  it("honours the operator's configured hosts, bare or as an origin", () => {
    const allowed = expectedHosts({
      devOrigins: "http://console.dev.lan:3939",
      allowedHosts: "console.lan",
    });
    expect(isUnexpectedHost("console.dev.lan:3939", allowed)).toBe(false);
    expect(isUnexpectedHost("console.lan:3939", allowed)).toBe(false);
    // Still not anything else.
    expect(isUnexpectedHost("evil.test", allowed)).toBe(true);
  });

  it("refuses a request with no Host at all", () => {
    expect(isUnexpectedHost(null, loopback)).toBe(true);
  });
});
