// Minimal typings for the parts of the Launch27/Automaid API we actually
// use. The real API returns many more fields (pricing, customer notes,
// etc.) that this app has no use for — deliberately left untyped/ignored.

export type Launch27LoginResponse = {
  id: number;
  email: string;
  type: string; // e.g. "Tenant::Admin", "Tenant::Customer"
  first_name: string | null;
  last_name: string | null;
  bearer: string;
};

export type Launch27Settings = {
  timezone: string; // IANA timezone, e.g. "America/Phoenix"
};

export type Launch27StaffTeam = {
  id: number;
  title: string;
};

export type Launch27StaffAddress = {
  full_address: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
};

export type Launch27StaffBooking = {
  id: number;
  service_date: string; // ISO 8601 UTC
  duration: number; // minutes
  address: Launch27StaffAddress | null;
  teams: Launch27StaffTeam[] | null;
  active: boolean;
  completed: boolean;
  booking_status: "new" | "unassigned" | "assigned" | "confirmed" | "completed";
};
