import { describe, it, expect } from "vitest";
import { resolveGatewayUrl } from "./gateway-path";
import { isCrossSiteWrite, isStateChanging } from "./request-origin";

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
  // arrives here as the single string "../../pair".
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

  it("cannot be redirected to another host", () => {
    // A protocol-relative segment would otherwise re-point the authority.
    expect(resolveGatewayUrl(["//evil.example"], "", GW)).toBeNull();
    expect(resolveGatewayUrl(["http://evil.example/x"], "", GW)).toBeNull();
  });

  it("passes through a segment that merely contains dots", () => {
    // `..` is only dangerous as a path element; a filename is fine.
    expect(resolveGatewayUrl(["kb", "notes..txt"], "", GW)).toBe(
      `${GW}/api/v1/kb/notes..txt`,
    );
  });
});

describe("cross-site write rejection", () => {
  const SELF = "http://127.0.0.1:3939";

  it("treats reads as always allowed", () => {
    expect(isStateChanging("GET")).toBe(false);
    expect(isCrossSiteWrite("GET", { secFetchSite: "cross-site", origin: "http://evil" }, SELF)).toBe(
      false,
    );
  });

  it("allows the console's own writes", () => {
    expect(
      isCrossSiteWrite("POST", { secFetchSite: "same-origin", origin: SELF }, SELF),
    ).toBe(false);
  });

  it("blocks a write from another site", () => {
    expect(
      isCrossSiteWrite("POST", { secFetchSite: "cross-site", origin: "http://evil.example" }, SELF),
    ).toBe(true);
  });

  it("blocks a same-site sibling on another port", () => {
    // Ports are not part of a "site", so SameSite cookies would not stop this.
    expect(
      isCrossSiteWrite("POST", { secFetchSite: "same-site", origin: "http://127.0.0.1:9999" }, SELF),
    ).toBe(true);
  });

  it("falls back to Origin when Sec-Fetch-Site is absent", () => {
    expect(isCrossSiteWrite("POST", { secFetchSite: null, origin: "http://evil" }, SELF)).toBe(true);
    expect(isCrossSiteWrite("POST", { secFetchSite: null, origin: SELF }, SELF)).toBe(false);
  });

  it("allows a non-browser caller that sends neither header", () => {
    // curl and the CLI carry no ambient credentials, so CSRF does not apply;
    // keeping them out is the auth gate's job, not this check's.
    expect(isCrossSiteWrite("POST", { secFetchSite: null, origin: null }, SELF)).toBe(false);
  });

  it("covers every state-changing method, not just POST", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isCrossSiteWrite(m, { secFetchSite: "cross-site", origin: null }, SELF)).toBe(true);
    }
  });
});
