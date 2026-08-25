import { GeoPoint, GeocodedBooking } from "./booking";

/** A single stop in a cleaner/team's route. Can be a real booking or the temp new property. */
export type RouteStop =
  | {
      kind: "booking";
      booking: GeocodedBooking;
    }
  | {
      kind: "temporary";
      temporaryId: string;
      label: string;
      location: GeoPoint;
      address: string;
    };

/** A cleaner/team's ordered set of stops for the selected date */
export type CleanerRoute = {
  teamKey: string;
  teamLabel: string;
  color: string;
  stops: RouteStop[];
  /** Road-network geometry for the full ordered route, if available */
  geometry?: GeoPoint[];
  /** True if route order came from reliable CSV/order data vs. derived */
  orderSource: "csv" | "derived";
};

/** New, currently-unassigned cleaning property entered by the user */
export type NewProperty = {
  address: string; // original typed/selected address
  location: GeoPoint; // current (possibly dragged) coordinates
  adjusted: boolean; // true if the user dragged the marker
};

/** A temporarily-added property, kept only in browser memory */
export type TemporaryProperty = {
  id: string;
  teamKey: string;
  label: string;
  address: string;
  location: GeoPoint;
  insertAfterIndex: number; // index in the route's stops array to insert after
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoPoint[];
};
