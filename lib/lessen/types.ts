export type LessenUserInfo = {
  userId: string;
  userName: string;
  affiliateId: string;
};

export type LessenRawTask = {
  TaskTypeId: number;
  WOId: string;
  TaskId: string;
  Address: string;
  City: string;
  State: string;
  ZipCode: string;
  ClientName: string;
  ServiceCodeName: string;
  ScheduleStartTime: string | null;
  ScheduleEndTime: string | null;
  TechnicianName: string | null;
  OverDueTime: string | null;
};
