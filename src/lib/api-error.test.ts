import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, describeApiError } from "./api";
import { candidatesFromError } from "./clawhub";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rc checks res.ok before parsing the body", () => {
  it("carries the status on a non-JSON error body instead of throwing a SyntaxError", async () => {
    // A proxy 502 often returns an HTML page. Parsing before checking res.ok
    // threw a SyntaxError with no status, so describeApiError could not tell a
    // restart from anything else.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "<html><body>502 Bad Gateway</body></html>",
      }),
    );
    const error = await api.status().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(describeApiError(error)).toMatch(/unreachable|restart/i);
  });
});

describe("installSkill error handling", () => {
  const ambiguousBody = {
    error: "ambiguous_skill_slug",
    detail: "`weather` is published by 4 owners on ClawHub.",
    matches: [
      {
        owner: "steipete",
        reference: "@steipete/weather",
        url: "https://clawhub.ai/steipete/skills/weather",
        downloads: 165212,
        official: true,
      },
      {
        owner: "lfengwa2",
        reference: "@lfengwa2/weather",
        url: "",
        downloads: 57,
        official: false,
      },
    ],
  };

  it("carries the 409 body through to the publisher candidates", async () => {
    // This is the wiring the panel depends on: the gateway's candidate list
    // has to survive `rc`'s error path. It used to be flattened to a message
    // string, which left the console with nothing to render.
    stubFetch(409, ambiguousBody);

    const error = await api.installSkill("weather").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);

    const candidates = candidatesFromError(error);
    expect(candidates).toHaveLength(2);
    expect(candidates?.[0].reference).toBe("@steipete/weather");

    // The publisher signals have to survive the hop too, or the picker is
    // back to asking the user to choose between bare references.
    expect(candidates?.[0].downloads).toBe(165212);
    expect(candidates?.[0].official).toBe(true);
    expect(candidates?.[1].downloads).toBe(57);
  });

  it("keeps the message unchanged for existing catch sites", async () => {
    // Callers that only read `.message` must behave exactly as before.
    stubFetch(500, { error: "internal_error", detail: "boom" });
    const error = await api.installSkill("weather").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");
    expect(candidatesFromError(error)).toBeNull();
  });

  it("sends the reference verbatim as `slug`", async () => {
    const fetchMock = stubFetch(200, { slug: "@steipete/weather", installed: true });
    await api.installSkill("@steipete/weather");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      slug: "@steipete/weather",
    });
  });
});

describe("describeApiError", () => {
  it("does not restate the proxy's outage wording in the parenthetical", () => {
    // The refresh-failure strip read "The gateway is unreachable; it may be
    // restarting. (The console could not reach the RantaiClaw gateway.)".
    const e = new ApiError("The console could not reach the RantaiClaw gateway.", 502, null);
    expect(describeApiError(e)).toBe("The gateway is unreachable; it may be restarting.");
  });

  it("distinguishes a session expiry from a restarting gateway from a bad request", () => {
    // All three used to render identically, because every caller flattened the
    // error to `.message`.
    const auth = describeApiError(new ApiError("token expired", 401, null));
    const down = describeApiError(new ApiError("bad gateway", 502, null));
    const bad = describeApiError(new ApiError("model is required", 400, null));

    expect(auth).toContain("sign in again");
    expect(down).toContain("may be restarting");
    expect(bad).toBe("model is required");

    expect(new Set([auth, down, bad]).size).toBe(3);
  });

  it("does not repeat the outage sentence when the upstream message is the same fact", () => {
    // The proxy's 502 body carries "the gateway is unreachable"; the page used
    // to read "…may be restarting. (the gateway is unreachable)".
    expect(describeApiError(new ApiError("the gateway is unreachable", 502, null))).toBe(
      "The gateway is unreachable; it may be restarting.",
    );
    expect(describeApiError(new ApiError("", 503, null))).toBe(
      "The gateway is unreachable; it may be restarting.",
    );
    // A distinct upstream message is still worth showing.
    expect(describeApiError(new ApiError("upstream timeout", 504, null))).toBe(
      "The gateway is unreachable; it may be restarting. (upstream timeout)",
    );
  });

  it("names a rejected provider key on a 502 instead of calling it an outage", () => {
    const detail = "provider custom:http://h/v1 rejected the credential (HTTP 401)";
    const e = new ApiError(detail, 502, { error: "provider_auth_failed", detail });
    const text = describeApiError(e);
    expect(text).toBe(
      `The provider rejected its API key; update the key in Providers. (${detail})`,
    );
    expect(text).not.toMatch(/unreachable|restarting/);
  });

  it("lets the provider code win over the status for a 503", () => {
    const detail = "provider custom:http://h/v1 rejected the credential (HTTP 401)";
    const e = new ApiError(detail, 503, { error: "provider_auth_failed", detail });
    expect(describeApiError(e)).toBe(
      `The provider rejected its API key; update the key in Providers. (${detail})`,
    );
  });

  it("gives the key sentence alone when the provider code has no detail", () => {
    const e = new ApiError("", 502, { error: "provider_auth_failed" });
    expect(describeApiError(e)).toBe("The provider rejected its API key; update the key in Providers.");
  });

  it("gives the key sentence alone when rc() takes the error code as the message", async () => {
    // rc() sets the message to `detail || error || statusText`, so a body with
    // no detail arrives here with the code itself as the message.
    stubFetch(502, { error: "provider_auth_failed" });
    const e = await api.status().catch((err) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).message).toBe("provider_auth_failed");
    expect(describeApiError(e)).toBe("The provider rejected its API key; update the key in Providers.");
  });

  it("keeps the outage sentence for a proxy 502 with a different error code", () => {
    const e = new ApiError("the gateway is unreachable", 502, {
      error: "gateway_unreachable",
      detail: "the gateway is unreachable",
    });
    expect(describeApiError(e)).toBe("The gateway is unreachable; it may be restarting.");
  });

  it("keeps the outage sentence for a non-JSON 502 body", () => {
    const e = new ApiError("Bad Gateway", 502, null);
    expect(describeApiError(e)).toBe(
      "The gateway is unreachable; it may be restarting. (Bad Gateway)",
    );
  });

  it("ignores the provider code when it is not a field of an object body", () => {
    const e = new ApiError("upstream timeout", 502, "provider_auth_failed");
    expect(describeApiError(e)).toBe(
      "The gateway is unreachable; it may be restarting. (upstream timeout)",
    );
  });

  it("passes a non-ApiError through unchanged", () => {
    expect(describeApiError(new Error("boom"))).toBe("boom");
    expect(describeApiError("plain string")).toBe("plain string");
  });
});
