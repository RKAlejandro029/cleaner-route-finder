/**
 * Normalized representation of a single Launch27 booking row.
 * This is the ONLY shape the rest of the app should ever touch —
 * raw CSV rows are converted into this immediately after parsing.
 */
export type Booking = {
  bookingId: string;
  date: string; // normalized to YYYY-MM-DD
  time?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  /** Raw "Teams Assigned" cell, e.g. "1054: Gabriel Baldonado, 1536: Payton Limon" */
  teamsAssignedRaw: string;
  /** Stable key derived from teamsAssignedRaw used to group bookings into one route */
  teamKey: string;
  /** Human-readable label for display, e.g. "Gabriel Baldonado & Payton Limon" */
  teamLabel: string;
  duration?: number; // minutes
  status: string;
  /** Full single-line address used for geocoding */
  fullAddress: string;
  /**
   * If the data source already knows the coordinates (e.g. Launch27's API
   * returns lat/lng directly), set this to skip the geocode API call
   * entirely for this booking. CSV-sourced bookings leave this undefined.
   */
  presetLocation?: GeoPoint;
};

export type GeoPoint = {
  lat: number;
  lng: number;
};

/** A booking plus its resolved coordinates, once geocoded */
export type GeocodedBooking = Booking & {
  location: GeoPoint;
};
