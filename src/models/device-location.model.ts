import { UUID } from "crypto";
import { GeoCoordinates } from "./profile.model";

export interface UserDevice {
  id: UUID;
  user_id: UUID;
  device_token: string;
  device_type: string;
  ip_address: string;
  last_active: Date;
  created_at: Date;
}

export interface UserDeviceCreate
  extends Omit<UserDevice, "id" | "created_at" | "last_active"> {
  last_active?: Date;
}

export interface UserDeviceUpdate
  extends Partial<Omit<UserDevice, "id" | "user_id" | "created_at">> {}

export enum LocationSource {
  GPS = "gps",
  IP = "ip",
  MANUAL = "manual",
}

export interface UserLocation {
  id: UUID;
  user_id: UUID;
  device_id: UUID;
  coordinates: GeoCoordinates;
  city?: string;
  country?: string;
  ip_address?: string;
  accuracy?: number;
  created_at: Date;
  is_active: boolean;
  location_source: LocationSource;
  additional_metadata?: Record<string, any>;
}

export interface UserLocationCreate
  extends Omit<UserLocation, "id" | "created_at" | "is_active"> {
  is_active?: boolean;
}

export interface UserLocationUpdate
  extends Partial<
    Omit<UserLocation, "id" | "user_id" | "device_id" | "created_at">
  > {}
