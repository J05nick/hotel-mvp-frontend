import { describe, expect, it } from "vitest";

import { getServerEnv } from "./server-env";

describe("getServerEnv", () => {
  it("provides development defaults", () => {
    expect(getServerEnv({})).toEqual({
      API_BASE_URL: "http://localhost:8000",
      WS_URL: "ws://localhost:8000/ws/events",
      HOTEL_TIMEZONE: "UTC",
    });
  });

  it("reads overrides and strips trailing slashes from the API url", () => {
    const env = getServerEnv({
      API_BASE_URL: "http://api:8000//",
      WS_URL: "wss://hotel.example/ws/events",
      HOTEL_TIMEZONE: "America/Bogota",
    });
    expect(env).toEqual({
      API_BASE_URL: "http://api:8000",
      WS_URL: "wss://hotel.example/ws/events",
      HOTEL_TIMEZONE: "America/Bogota",
    });
  });

  it.each([
    [{ HOTEL_TIMEZONE: "Mars/Olympus" }, "HOTEL_TIMEZONE"],
    [{ WS_URL: "http://api/ws" }, "WS_URL"],
    [{ API_BASE_URL: "not a url" }, "API_BASE_URL"],
  ])("fails fast naming the bad variable: %j", (source, variable) => {
    expect(() => getServerEnv(source)).toThrow(variable);
  });
});
