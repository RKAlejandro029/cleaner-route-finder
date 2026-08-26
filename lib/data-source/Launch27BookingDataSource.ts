import { Booking } from "@/types/booking";
import { BookingDataSource } from "./BookingDataSource";

/**
 * Runs in the BROWSER. Never talks to Launch27 directly — only calls our
 * own /api/launch27/bookings endpoint, which holds the staff credentials
 * server-side. This replaces CsvBookingDataSource as the app's primary
 * data source.
 */
export class Launch27BookingDataSource implements BookingDataSource {
  constructor(private range: { from: string; to: string }) {}

  async loadBookings(): Promise<Booking[]> {
    const params = new URLSearchParams({ from: this.range.from, to: this.range.to });
    const res = await fetch(`/api/launch27/bookings?${params.toString()}`);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ?? "Unable to load the Launch27 schedule. Try again."
      );
    }

    const data = await res.json();
    return data.bookings as Booking[];
  }
}
