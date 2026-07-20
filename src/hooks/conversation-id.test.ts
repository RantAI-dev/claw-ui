import { describe, it, expect } from "vitest";
import { newConversationId } from "./use-chat";

// The gateway (RantAIClaw `record_api_turn`) only adopts a caller-supplied
// session id when it is UUID-shaped; anything else is discarded and a different
// id is minted. That mismatch is the whole reason attachments went missing, so
// the shape is load-bearing rather than cosmetic.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("conversation id", () => {
  it("is UUID-shaped so the gateway adopts it as the session id", () => {
    expect(newConversationId()).toMatch(UUID);
  });

  it("is distinct per conversation", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newConversationId()));
    expect(ids.size).toBe(200);
  });

  it("still yields a UUID shape without crypto.randomUUID", () => {
    // Plain-http LAN binds are not a secure context, so randomUUID may be absent.
    const original = globalThis.crypto?.randomUUID;
    try {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, "randomUUID", {
          value: undefined,
          configurable: true,
        });
      }
      expect(newConversationId()).toMatch(UUID);
    } finally {
      if (globalThis.crypto && original) {
        Object.defineProperty(globalThis.crypto, "randomUUID", {
          value: original,
          configurable: true,
        });
      }
    }
  });
});
