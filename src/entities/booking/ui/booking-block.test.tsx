import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingBlock, COMPACT_WIDTH_PCT } from "./booking-block";

const booking = {
  id: "b1",
  status: "confirmed" as const,
  start: "2026-10-13T14:00:00Z",
  end: "2026-10-13T16:00:00Z",
  holdExpiresAt: null,
};

describe("BookingBlock", () => {
  it("shows the full range when there is room for it", () => {
    render(<BookingBlock booking={booking} timeZone="UTC" leftPct={10} widthPct={COMPACT_WIDTH_PCT + 1} />);
    expect(screen.getByText("14:00–16:00")).toBeInTheDocument();
  });

  it("shows only the start time in narrow blocks, keeping the full range accessible", () => {
    render(<BookingBlock booking={booking} timeZone="UTC" leftPct={10} widthPct={4} />);
    const block = screen.getByRole("listitem", { name: "Confirmed 14:00–16:00" });
    expect(block).toHaveAttribute("title", "Confirmed 14:00–16:00");
    expect(block).toHaveTextContent(/^14:00$/);
  });

  it("renders times in the hotel's zone", () => {
    render(<BookingBlock booking={booking} timeZone="America/Bogota" leftPct={0} widthPct={20} />);
    expect(screen.getByRole("listitem", { name: "Confirmed 09:00–11:00" })).toBeInTheDocument();
  });

  it("places itself with percentages", () => {
    render(<BookingBlock booking={booking} timeZone="UTC" leftPct={25} widthPct={12.5} />);
    expect(screen.getByRole("listitem")).toHaveStyle({ left: "25%", width: "12.5%" });
  });
});
