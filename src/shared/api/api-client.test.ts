import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, fetchJson } from "./api-client";

const schema = z.object({ n: z.number() });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchJson", () => {
  it("returns the validated payload and never caches", async () => {
    const fetchMock = stubFetch(json({ n: 3 }));
    await expect(fetchJson("http://api/x", schema)).resolves.toEqual({ n: 3 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/x");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("applies schema transforms", async () => {
    stubFetch(json({ n: 2 }));
    const doubled = z.object({ n: z.number() }).transform((v) => v.n * 2);
    await expect(fetchJson("http://api/x", doubled)).resolves.toBe(4);
  });

  it("maps the backend error contract onto ApiError", async () => {
    stubFetch(json({ error: "invalid_window", detail: "the window cannot exceed 14 days" }, 422));
    const error = await fetchJson("http://api/x", schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "invalid_window",
      message: "the window cannot exceed 14 days",
    });
  });

  it("falls back to a generic error for non-contract failures", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(fetchJson("http://api/x", schema)).rejects.toMatchObject({
      status: 502,
      code: "http_error",
    });
  });

  it("reports network failures with status 0", async () => {
    stubFetch(new TypeError("fetch failed"));
    await expect(fetchJson("http://api/x", schema)).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });

  it("rejects a payload that breaks the contract", async () => {
    stubFetch(json({ n: "three" }));
    await expect(fetchJson("http://api/x", schema)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects a body that is not JSON", async () => {
    stubFetch(new Response("nope", { status: 200 }));
    await expect(fetchJson("http://api/x", schema)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
