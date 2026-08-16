// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "./chat-pane";

/**
 * The offline banner used to render every failure as "Gateway unreachable.
 * Start the agent gateway" — including the BFF's own expected-Host 403, where
 * the gateway is fine and restarting it fixes nothing. These pin the three
 * variants apart.
 */
describe("ConnectionBanner", () => {
  it("labels the BFF host rejection as a host problem, not a gateway outage", () => {
    render(<ConnectionBanner needsAuth={false} error="unexpected_host" />);
    expect(screen.getByText(/unlisted host/)).toBeTruthy();
    expect(screen.getByText(/RANTAICLAW_UI_ALLOWED_HOSTS/)).toBeTruthy();
    expect(screen.queryByText(/Start the agent gateway/)).toBeNull();
  });

  it("keeps the outage wording for a real connection failure", () => {
    render(<ConnectionBanner needsAuth={false} error="fetch failed" />);
    expect(screen.getByText(/Gateway unreachable/)).toBeTruthy();
  });

  it("keeps the pairing wording when auth is the problem", () => {
    render(<ConnectionBanner needsAuth={true} error="401" />);
    expect(screen.getByText(/requires pairing/)).toBeTruthy();
  });
});
