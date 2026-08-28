import { GeoPoint } from "./booking";

export type LessenTask = {
  taskTypeId: number;
  taskTypeName: string;
  woId: string;
  taskId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  clientName: string;
  serviceCodeName: string;
  scheduleStartTime: string;
  scheduleEndTime: string;
  technicianName: string;
  overDueTime: string;
  location: GeoPoint | null; // null until geocoded
};
