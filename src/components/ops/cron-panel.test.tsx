// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CronJob, CronList, CronRun } from "@/lib/types";
import { PAST_ONE_OFF, toLocalInput } from "@/lib/cron";

const cron = vi.fn();
const createCron = vi.fn();
const updateCron = vi.fn();
const deleteCron = vi.fn();
const runCron =
  vi.fn<(id: string, approved?: boolean) => Promise<{ id: string; success: boolean; output: string }>>();
const cronRuns = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastMessage = vi.fn();
const toastLoading = vi.fn((..._a: unknown[]) => "t1");
const toastDismiss = vi.fn();

// Keep the real `ApiError` / `describeApiError` (useAsync and the handlers map
// every failure through them); only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    cron: () => cron(),
    createCron: (body: unknown) => createCron(body),
    updateCron: (id: string, body: unknown) => updateCron(id, body),
    deleteCron: (id: string) => deleteCron(id),
    runCron: (id: string, approved?: boolean) => runCron(id, approved),
    cronRuns: (id: string) => cronRuns(id),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    message: (...a: unknown[]) => toastMessage(...a),
    loading: (...a: unknown[]) => toastLoading(...a),
    dismiss: (...a: unknown[]) => toastDismiss(...a),
  },
}));

import { ApiError } from "@/lib/api";
import { CronPanel } from "./cron-panel";

const NOW = Date.now();
const iso = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();

function job(over: Partial<CronJob> = {}): CronJob {
  return {
    id: "j1",
    name: "Morning hello",
    expression: "0 9 * * *",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: null },
    job_type: "agent",
    command: "",
    prompt: "Say hello",
    session_target: "isolated",
    model: null,
    enabled: true,
    delete_after_run: false,
    created_at: iso(-3_600_000),
    delivery: { mode: "none", channel: null, to: null, best_effort: true },
    next_run: iso(3_600_000),
    last_run: null,
    last_status: null,
    last_output: null,
    ...over,
  };
}

function list(jobs: CronJob[], flags: Partial<CronList> = {}): CronList {
  return { jobs, count: jobs.length, cron_enabled: true, scheduler_enabled: true, ...flags };
}

beforeEach(() => {
  cron.mockImplementation(() => Promise.resolve(list([job()])));
  createCron.mockImplementation((body: { name?: string }) =>
    Promise.resolve(job({ id: "new", name: body.name ?? null })),
  );
  updateCron.mockImplementation(() => Promise.resolve(job()));
  deleteCron.mockImplementation(() => Promise.resolve({ id: "j1", deleted: true }));
  runCron.mockImplementation(() => Promise.resolve({ id: "j1", success: true, output: "ok" }));
  cronRuns.mockImplementation(() => Promise.resolve({ runs: [], count: 0 }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("CronPanel feature switches", () => {
  it("shows the scheduler-off notice over the rows", async () => {
    cron.mockImplementation(() => Promise.resolve(list([job()], { scheduler_enabled: false })));
    render(<CronPanel />);
    expect(await screen.findByText(/scheduler loop is off/)).toBeTruthy();
    expect(screen.getByText("Morning hello")).toBeTruthy();
    expect(screen.queryByText(/Cron is off/)).toBeNull();
  });

  it("makes the page read-only when cron is off", async () => {
    cron.mockImplementation(() => Promise.resolve(list([job()], { cron_enabled: false })));
    render(<CronPanel />);
    expect(await screen.findByText(/Cron is off \(cron\.enabled=false\)/)).toBeTruthy();
    expect(button("Create").disabled).toBe(true);
    expect(button("Create").title).toMatch(/Cron is off/);
    expect(button("Disable job").disabled).toBe(true);
    expect(button("Run job now").disabled).toBe(true);
    expect(button(/^Delete job/).disabled).toBe(true);
    // Reads stay open.
    expect(button(/^Run history/).disabled).toBe(false);
  });

  it("treats a gateway without the flags as unknown, not off", async () => {
    cron.mockImplementation(() => Promise.resolve({ jobs: [job()], count: 1 }));
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    expect(screen.queryByRole("status")).toBeNull();
    expect(button("Create").title).toBe("");
  });
});

describe("CronPanel row state", () => {
  it("calls an enabled job whose time went by overdue", async () => {
    cron.mockImplementation(() => Promise.resolve(list([job({ next_run: iso(-10 * 60_000) })])));
    render(<CronPanel />);
    expect(await screen.findByText("overdue")).toBeTruthy();
    expect(screen.getByText(/due since/)).toBeTruthy();
    expect(screen.queryByText(/· next /)).toBeNull();
  });

  it("shows no next time on a paused job", async () => {
    cron.mockImplementation(() => Promise.resolve(list([job({ enabled: false })])));
    render(<CronPanel />);
    expect(await screen.findByText("paused")).toBeTruthy();
    expect(screen.queryByText(/next /)).toBeNull();
    expect(button("Enable job").disabled).toBe(false);
  });

  it("reads a past one-off as ran once and blocks Resume with the reason", async () => {
    const at = iso(-5 * 60_000);
    cron.mockImplementation(() =>
      Promise.resolve(
        list([
          job({
            enabled: false,
            schedule: { kind: "at", at },
            next_run: at,
            last_run: at,
            last_status: "ok",
          }),
        ]),
      ),
    );
    render(<CronPanel />);
    expect(await screen.findByText("ran once")).toBeTruthy();
    expect(screen.getByText(/ran once at/)).toBeTruthy();
    const resume = button("Enable job");
    expect(resume.disabled).toBe(true);
    expect(resume.title).toBe(PAST_ONE_OFF);
  });

  it("says failed for a last_status of error", async () => {
    cron.mockImplementation(() =>
      Promise.resolve(list([job({ last_status: "error", last_run: iso(-60_000) })])),
    );
    render(<CronPanel />);
    expect(await screen.findByText(/last failed/)).toBeTruthy();
    expect(screen.queryByText(/last error/)).toBeNull();
  });
});

describe("CronPanel refresh failure", () => {
  it("keeps the rows and shows the strip when a refresh fails", async () => {
    cron
      .mockImplementationOnce(() => Promise.resolve(list([job()])))
      .mockImplementationOnce(() => Promise.reject(new ApiError("upstream", 502, null)));
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Refresh"));
    expect(
      await screen.findByText(/The gateway is unreachable; it may be restarting/),
    ).toBeTruthy();
    expect(screen.getByText("Morning hello")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this panel")).toBeNull();
  });
});

describe("CronPanel run now", () => {
  it("reports a policy refusal as blocked, with no approval to offer", async () => {
    runCron.mockImplementation(() =>
      Promise.resolve({
        id: "j1",
        success: false,
        output: "blocked by security policy: forbidden path argument: /etc/x",
      }),
    );
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Run job now"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The id alone: the panel never asks for an approval the gateway ignores.
    expect(runCron.mock.calls[0]).toEqual(["j1", undefined]);
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("Blocked by policy");
    expect(opts.description).toMatch(/forbidden path argument: \/etc\/x/);
    expect(opts.description).toMatch(/will not run on its schedule either/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/needs approval/)).toBeNull();
  });

  it("reports the handler's 400 as refused with the policy sentence", async () => {
    runCron.mockImplementation(() =>
      Promise.reject(
        new ApiError(
          "Command requires explicit approval (approved=true): medium-risk operation",
          400,
          null,
        ),
      ),
    );
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Run job now"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("Run refused");
    expect(opts.description).toMatch(/medium-risk operation/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports an outage as a failed request, not a refusal", async () => {
    runCron.mockImplementation(() => Promise.reject(new ApiError("upstream", 502, null)));
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Run job now"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("Run failed");
    expect(opts.description).toMatch(/gateway is unreachable/);
  });
});

describe("CronPanel create", () => {
  it("shows the warning's reason without the force-run advice", async () => {
    createCron.mockImplementation(() =>
      Promise.resolve({
        ...job({ id: "new", name: "git push" }),
        warning:
          "created, but will not run on its schedule (Command requires explicit approval (approved=true): medium-risk operation); force-run it with an approval, or use an allowlisted low-risk command",
      }),
    );
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.change(screen.getByPlaceholderText(/Prompt the agent/), { target: { value: "hi" } });
    fireEvent.click(button("Create"));
    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    const [title, opts] = toastWarning.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("Created, but it will not run on its schedule");
    expect(opts.description).toMatch(/medium-risk operation/);
    expect(opts.description).not.toMatch(/force-run/);
  });

  it("prefills the zone with the browser's and says UTC when it is blank", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "Asia/Jakarta" }) }) as unknown as Intl.DateTimeFormat,
    );
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    const zone = screen.getByLabelText("Timezone (IANA)") as HTMLInputElement;
    expect(zone.value).toBe("Asia/Jakarta");
    expect(screen.getByText(/Runs at 09:00, every day · Asia\/Jakarta/)).toBeTruthy();
    fireEvent.change(zone, { target: { value: "" } });
    expect(screen.getByText(/Runs at 09:00, every day · UTC/)).toBeTruthy();
    expect(screen.queryByText(/server time zone/)).toBeNull();
  });
});

describe("CronPanel run history", () => {
  it("uses one status vocabulary and names retried attempts", async () => {
    const runs: CronRun[] = [
      { id: 1, job_id: "j1", started_at: iso(-60_000), finished_at: iso(-59_000), status: "error", output: "boom", duration_ms: 12, attempt: 1 },
      { id: 2, job_id: "j1", started_at: iso(-50_000), finished_at: iso(-49_000), status: "refused", output: "blocked by security policy: x", duration_ms: 0, attempt: 2 },
    ];
    cronRuns.mockImplementation(() => Promise.resolve({ runs, count: 2 }));
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button(/^Run history/));
    expect(await screen.findByText("failed")).toBeTruthy();
    expect(screen.getByText("refused")).toBeTruthy();
    expect(screen.getByText("attempt 2")).toBeTruthy();
    expect(screen.queryByText("error")).toBeNull();
  });
});

const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(
    typeof label === "string" ? screen.getByLabelText(label) : screen.getByPlaceholderText(label),
    { target: { value } },
  );

describe("CronPanel draft validation", () => {
  it("applies one rule to the interval kind and never rounds", async () => {
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    type(/Prompt the agent/, "hi");
    select("Schedule type", "every");
    type("Interval in minutes", "1.5");
    expect(screen.getByText("Whole minutes only")).toBeTruthy();
    expect(button("Create").disabled).toBe(true);
    type("Interval in minutes", "0");
    expect(screen.getByText("At least 1 minute")).toBeTruthy();
    expect(button("Create").disabled).toBe(true);
    type("Interval in minutes", "5");
    expect(screen.getByText("Runs every 5 minutes")).toBeTruthy();
    expect(button("Create").disabled).toBe(false);
    fireEvent.click(button("Create"));
    await waitFor(() => expect(createCron).toHaveBeenCalled());
    expect(createCron.mock.calls[0][0]).toMatchObject({
      schedule: { kind: "every", every_ms: 300_000 },
      job_type: "agent",
      prompt: "hi",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Job created"));
  });

  it("asks for a future time on the one-off kind", async () => {
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    type(/Prompt the agent/, "hi");
    select("Schedule type", "at");
    expect(screen.getByText("Pick a date and time")).toBeTruthy();
    expect(button("Create").disabled).toBe(true);
    type("Run once at", "2020-01-01T00:00");
    expect(screen.getByText("Pick a time in the future")).toBeTruthy();
    expect(button("Create").disabled).toBe(true);
    type("Run once at", toLocalInput(NOW + 3_600_000));
    expect(screen.getByText(/then the job is removed/)).toBeTruthy();
    expect(button("Create").disabled).toBe(false);
  });
});

describe("CronPanel rows show the API's hidden fields", () => {
  it("names a self-removing one-off, the main session and a delivery", async () => {
    cron.mockImplementation(() =>
      Promise.resolve(
        list([
          job({
            id: "one",
            name: "one-off",
            schedule: { kind: "at", at: iso(3_600_000) },
            delete_after_run: true,
            session_target: "main",
            delivery: { mode: "announce", channel: "telegram", to: "ops", best_effort: true },
          }),
        ]),
      ),
    );
    render(<CronPanel />);
    expect(await screen.findByText(/then removed/)).toBeTruthy();
    expect(screen.getByText(/main session/)).toBeTruthy();
    expect(screen.getByText(/announces to telegram ops/)).toBeTruthy();
  });
});

describe("CronPanel edit", () => {
  it("edits an interval job's interval and sends only the schedule", async () => {
    cron.mockImplementation(() =>
      Promise.resolve(list([job({ id: "e1", name: "every-30s", schedule: { kind: "every", every_ms: 30_000 } })])),
    );
    render(<CronPanel />);
    await screen.findByText("every-30s");
    fireEvent.click(button("Edit job every-30s"));
    const interval = (await screen.findByLabelText("Interval in minutes")) as HTMLInputElement;
    expect(interval.value).toBe("0.5");
    expect(screen.queryByText("Whole minutes only")).toBeNull(); // untouched: not re-validated
    fireEvent.change(interval, { target: { value: "1.5" } });
    expect(screen.getByText("Whole minutes only")).toBeTruthy();
    expect(button("Save").disabled).toBe(true);
    fireEvent.change(interval, { target: { value: "1" } });
    expect(screen.getByText("Runs every minute")).toBeTruthy();
    fireEvent.click(button("Save"));
    await waitFor(() => expect(updateCron).toHaveBeenCalledWith("e1", { schedule: { kind: "every", every_ms: 60_000 } }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Job updated"));
  });

  it("sends no schedule when only the name changed", async () => {
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Edit job Morning hello"));
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Evening hello" } });
    fireEvent.click(button("Save"));
    await waitFor(() => expect(updateCron).toHaveBeenCalledWith("j1", { name: "Evening hello" }));
  });

  it("edits a one-off's time and explains a past one", async () => {
    const past = iso(-5 * 60_000);
    cron.mockImplementation(() =>
      Promise.resolve(
        list([job({ id: "p1", name: "past", enabled: false, schedule: { kind: "at", at: past }, next_run: past })]),
      ),
    );
    render(<CronPanel />);
    await screen.findByText("past");
    fireEvent.click(button("Edit job past"));
    expect(await screen.findByText(/time has passed\. Give it a new time/)).toBeTruthy();
    expect(button("Save").disabled).toBe(false); // a rename is still allowed
    const when = screen.getByLabelText("Run once at") as HTMLInputElement;
    expect(when.value).toBe(toLocalInput(past));
    fireEvent.change(when, { target: { value: toLocalInput(NOW + 7_200_000) } });
    fireEvent.click(button("Save"));
    await waitFor(() => expect(updateCron).toHaveBeenCalled());
    const [, body] = updateCron.mock.calls[0] as [string, { schedule?: { kind: string; at: string } }];
    expect(body.schedule?.kind).toBe("at");
    expect(Math.abs(Date.parse(body.schedule!.at) - (NOW + 7_200_000))).toBeLessThan(60_000);
  });
});

describe("CronPanel copy, empty state and feedback", () => {
  it("names the command in a shell job's delete confirm", async () => {
    cron.mockImplementation(() =>
      Promise.resolve(list([job({ id: "s1", name: "sh", job_type: "shell", command: "echo hi", prompt: null })])),
    );
    render(<CronPanel />);
    await screen.findByText("sh");
    fireEvent.click(button("Delete job sh"));
    expect(await screen.findByText(/and its command will be removed/)).toBeTruthy();
  });

  it("says what an empty list means and keeps the form", async () => {
    cron.mockImplementation(() => Promise.resolve(list([])));
    render(<CronPanel />);
    expect(await screen.findByText("No scheduled jobs yet.")).toBeTruthy();
    expect(screen.getByText(/Jobs fire from the RantaiClaw daemon while it is running/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.queryByText("Nothing here yet.")).toBeNull();
  });

  it("toasts a pause and maps an outage on the toggle", async () => {
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Disable job"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Paused Morning hello"));
    updateCron.mockImplementation(() => Promise.reject(new ApiError("upstream", 502, null)));
    fireEvent.click(button("Disable job"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/gateway is unreachable/);
  });

  it("receipts a run with one plain line", async () => {
    runCron.mockImplementation(() =>
      Promise.resolve({ id: "j1", success: true, output: "You said: **hi**\n\n## Stub reply" }),
    );
    render(<CronPanel />);
    await screen.findByText("Morning hello");
    fireEvent.click(button("Run job now"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("Ran Morning hello", { id: "t1", description: "You said: hi" });
  });
});
