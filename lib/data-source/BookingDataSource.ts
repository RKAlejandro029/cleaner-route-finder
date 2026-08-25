import { Booking } from "@/types/booking";

/**
 * Abstraction over "where bookings come from". V1 only ever uses the CSV
 * implementation, but keeping this interface means a future
 * Launch27BookingDataSource can be dropped in without touching any
 * route-analysis code.
 */
export interface BookingDataSource {
  loadBookings(): Promise<Booking[]>;
}
