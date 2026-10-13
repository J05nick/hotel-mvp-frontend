/**
 * Liveness probe for the container orchestrator. It deliberately does NOT call the
 * backend: if the API is down the page shows an error state, but restarting this
 * container would not help, so it must not be reported unhealthy.
 */
export function GET() {
  return Response.json({ status: "ok" });
}
