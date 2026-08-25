import { Booking } from "@/types/booking";
import { BookingDataSource } from "./BookingDataSource";
import { parseBookingsCsv } from "@/lib/csv/parseBookings";

export class CsvBookingDataSource implements BookingDataSource {
  private bookings: Booking[];

  constructor(csvText: string) {
    const result = parseBookingsCsv(csvText);
    if (!result.success) {
      throw new Error(result.message);
    }
    this.bookings = result.bookings;
  }

  async loadBookings(): Promise<Booking[]> {
    return this.bookings;
  }
}

// NOTE for future work:
// export class Launch27BookingDataSource implements BookingDataSource {
//   async loadBookings(): Promise<Booking[]> {
//     // fetch from Launch27 API, map to Booking[]
//   }
// }
