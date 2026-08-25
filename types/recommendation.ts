import { GeoPoint } from "./booking";

/** Result of testing one insertion position for one cleaner/team */
export type InsertionCandidate = {
  teamKey: string;
  teamLabel: string;
  color: string;
  /** Index to insert after; -1 means "insert at the very start" */
  insertAfterIndex: number;
  additionalDistanceMeters: number;
  additionalDurationSeconds: number;
  /** Human-readable description of the insertion, e.g. "B → NEW → C" */
  insertionLabel: string;
  /** Full route geometry including the new property, for map preview */
  previewGeometry: GeoPoint[];
  excluded?: false;
};

/** A cleaner/team that could not be evaluated */
export type ExcludedCandidate = {
  teamKey: string;
  teamLabel: string;
  color: string;
  excluded: true;
  reason: string;
};

export type RankedCandidate = InsertionCandidate | ExcludedCandidate;

export type Recommendation = {
  newPropertyAddress: string;
  ranked: RankedCandidate[]; // best first; excluded candidates sorted to the end
};
