// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const providerModels = vi.fn();
const refreshProviderModels = vi.fn();

// Keep the real `describeApiError`; only the two requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    providerModels: (id: string) => providerModels(id),
    refreshProviderModels: (id: string) => refreshProviderModels(id),
  },
}));

import { ModelPicker } from "./model-picker";

function catalog(extra: Record<string, unknown> = {}) {
  return {
    provider: "openai",
    models: ["m1", "m2"],
    default: "m1",
    source: "curated",
    age_secs: null,
    count: 2,
    ...extra,
  };
}

beforeEach(() => {
  providerModels.mockReset();
  refreshProviderModels.mockReset();
  providerModels.mockResolvedValue(catalog());
});
afterEach(cleanup);

describe("ModelPicker", () => {
  it("hands the loaded catalog to onCatalog and counts it in the footer", async () => {
    const onCatalog = vi.fn();
    render(<ModelPicker provider="openai" value="" onChange={() => {}} onCatalog={onCatalog} />);
    await waitFor(() => expect(onCatalog).toHaveBeenCalledWith(expect.objectContaining({ default: "m1" })));
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByText("2 suggested")).toBeTruthy();
  });

  it("says when the live refresh did not happen", async () => {
    refreshProviderModels.mockResolvedValue(catalog({ refreshed: false, detail: "failed" }));
    render(<ModelPicker provider="openai" value="" onChange={() => {}} />);
    await waitFor(() => expect(providerModels).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /refresh/i }));
    expect(await screen.findByText(/Live list unavailable/)).toBeTruthy();
  });

  it("tells a failed load apart from an empty list", async () => {
    providerModels.mockRejectedValue(new Error("boom"));
    render(<ModelPicker provider="openai" value="" onChange={() => {}} />);
    await waitFor(() => expect(providerModels).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
    expect(await screen.findByText("List not loaded")).toBeTruthy();
  });
});
