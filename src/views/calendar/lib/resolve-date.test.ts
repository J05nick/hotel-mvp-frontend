import { describe, expect, it } from "vitest";

import { resolveDateKey } from "./resolve-date";

const NOW = new Date("2026-10-13T03:30:00Z");

describe("resolveDateKey", () => {
  it("uses a valid ?date", () => {
    expect(resolveDateKey("2026-12-25", NOW, "UTC")).toBe("2026-12-25");
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(resolveDateKey(["2026-12-25", "2027-01-01"], NOW, "UTC")).toBe("2026-12-25");
  });

  it("defaults to today in the hotel's zone", () => {
    expect(resolveDateKey(undefined, NOW, "UTC")).toBe("2026-10-13");
    expect(resolveDateKey(undefined, NOW, "America/Bogota")).toBe("2026-10-12");
  });

  it.each(["2026-02-30", "tomorrow", "", "2026-10-13T10:00", "' OR 1=1 --", []])(
    "falls back to today for %j",
    (bad) => {
      expect(resolveDateKey(bad as string, NOW, "UTC")).toBe("2026-10-13");
    },
  );
});
