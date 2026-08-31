import { describe, expect, it } from "vitest";
import {
  doctorSummary,
  emptyValue,
  formatUptime,
  pairingLabel,
  parseRuntimeHealth,
  skippedSentence,
  sortBySeverity,
} from "./status";
import type { DoctorResult } from "./types";

const wire = {
  components: {
    gateway: {
      last_error: null,
      last_ok: "2026-08-31T07:23:57.736199935+00:00",
      restart_count: 0,
      status: "ok",
      updated_at: "2026-08-31T07:23:57.736182840+00:00",
    },
  },
  pid: 4122820,
  updated_at: "2026-08-31T07:24:29.969720918+00:00",
  uptime_seconds: 32,
};

const check = (severity: string, name = severity.toLowerCase()): DoctorResult => ({
  name,
  category: "config",
  severity,
  message: "",
  hint: null,
  duration_ms: 0,
});

describe("parseRuntimeHealth", () => {
  it("reads the gateway snapshot shape", () => {
    const h = parseRuntimeHealth(wire);
    expect(h).not.toBeNull();
    expect(h!.pid).toBe(4122820);
    expect(h!.uptimeSeconds).toBe(32);
    expect(h!.components).toEqual([
      {
        name: "gateway",
        status: "ok",
        lastOk: wire.components.gateway.last_ok,
        lastError: null,
        restartCount: 0,
      },
    ]);
  });

  it("returns null for the serialize-error fallback and for an absent field", () => {
    expect(parseRuntimeHealth({ status: "error", message: "failed" })).toBeNull();
    expect(parseRuntimeHealth(undefined)).toBeNull();
    expect(parseRuntimeHealth("nope")).toBeNull();
  });

  it("tolerates a component with missing fields", () => {
    const h = parseRuntimeHealth({ components: { telegram: { status: "degraded", last_error: "401" } } });
    expect(h!.components[0]).toEqual({
      name: "telegram",
      status: "degraded",
      lastOk: null,
      lastError: "401",
      restartCount: 0,
    });
    expect(h!.uptimeSeconds).toBeNull();
  });
});

describe("formatUptime", () => {
  it("picks the two largest units", () => {
    expect(formatUptime(32)).toBe("32s");
    expect(formatUptime(3720)).toBe("1h 2m");
    expect(formatUptime(200000)).toBe("2d 7h");
    expect(formatUptime(90)).toBe("1m");
  });
});

describe("pairingLabel", () => {
  it("never reads an unpaired console as a warning", () => {
    expect(pairingLabel(false)).toBe("not required");
    expect(pairingLabel(true)).toBe("paired");
  });
});

describe("sortBySeverity", () => {
  it("leads with what needs action and keeps wire order within a severity", () => {
    const rows = [check("Ok", "a"), check("Fail"), check("Warn"), check("Info"), check("Ok", "b")];
    expect(sortBySeverity(rows).map((r) => r.name)).toEqual(["fail", "warn", "info", "a", "b"]);
  });
});

describe("doctorSummary", () => {
  it("counts each bucket and drops the empty ones", () => {
    expect(doctorSummary([check("Fail"), check("Warn"), check("Warn"), check("Info"), check("Ok")])).toBe(
      "1 failed · 2 warnings · 1 info · 1 ok.",
    );
    expect(doctorSummary([check("Ok"), check("Ok")])).toBe("2 ok.");
    expect(doctorSummary([])).toBe("No checks reported.");
  });
});

describe("skippedSentence", () => {
  it("names the checks the brief run skipped", () => {
    expect(skippedSentence(["provider.ping", "channels.auth", "mcp.startup"])).toBe(
      "Three live checks were not run here (provider.ping, channels.auth, mcp.startup).",
    );
    expect(skippedSentence(["provider.ping"])).toBe("One live check was not run here (provider.ping).");
    expect(skippedSentence([])).toBeNull();
    expect(skippedSentence(undefined)).toBeNull();
  });
});

describe("emptyValue", () => {
  it("replaces an empty value with a word, never a dash", () => {
    expect(emptyValue("")).toBe("not set");
    expect(emptyValue("  ")).toBe("not set");
    expect(emptyValue(undefined, "unknown")).toBe("unknown");
    expect(emptyValue("ollama")).toBe("ollama");
  });
});
