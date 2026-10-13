import { z } from "zod";

export const roomStatusSchema = z.enum(["available", "occupied", "cleaning", "maintenance"]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  cleaning: "Cleaning",
  maintenance: "Maintenance",
};

export type Room = {
  id: string;
  number: string;
  name: string;
  capacity: number;
  pricePerBlockCents: number;
  status: RoomStatus;
};
