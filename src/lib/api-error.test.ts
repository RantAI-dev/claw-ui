import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api";
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
