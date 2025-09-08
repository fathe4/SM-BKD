// src/services/ipLocationService.ts
import { UserService } from "./userService";
import { LocationSource } from "../types/models";
import { logger } from "../utils/logger";
// import { throttledGetLocationFromIp } from "../utils/geolocation";

export class IpLocationService {
  /**
   * Handle user login location tracking
   * This method should be called during login
   */
  static async trackLoginLocation(
    userId: string,
    ipAddress: string,
    deviceToken: string,
    deviceType: string,
    locationData: any,
  ): Promise<void> {
    try {
      // Register or update the device first
      const device = await UserService.registerUserDevice({
        user_id: userId,
        device_token: deviceToken,
        device_type: deviceType,
        ip_address: ipAddress,
        last_active: new Date().toISOString(),
      });

      if (locationData.coordinates) {
        await UserService.trackUserLocation({
          user_id: userId,
          device_id: device.id,
          coordinates: [
            locationData.coordinates.lng,
            locationData.coordinates.lat,
          ], // Note: PostGIS uses [long, lat]
          city: locationData.city || undefined,
          country: locationData.country || undefined,
          ip_address: locationData.ip_address || undefined,
          is_active: true,
          location_source: LocationSource.IP,
          additional_metadata: {
            source: locationData.location_source,
            client_provided: true,
          },
        });

        logger.info(
          `Successfully tracked client-provided location for user ${userId} from ${locationData.location_source}`,
        );
      }
    } catch (error) {
      logger.error(`Error tracking login location for user ${userId}:`, error);
    }
  }

  /**
   * Handle user login location tracking with client-provided location data
   * This method should be called during login when client sends location data
   */
  //   static async trackLoginLocationWithData(
  //     userId: string,
  //     locationData: LocationData,
  //     deviceToken?: string,
  //     deviceType?: string
  //   ): Promise<void> {
  //     console.log(locationData, "locationData");

  //     try {
  //       // Register or update the device first if device info is available
  //       //   let deviceId: string;
  //       //   if (deviceToken) {
  //       //     const device = await UserService.registerUserDevice({
  //       //       user_id: userId,
  //       //       device_token: deviceToken,
  //       //       device_type: deviceType || "unknown",
  //       //       ip_address: locationData.ip_address || "unknown",
  //       //       last_active: new Date().toISOString(),
  //       //     });
  //       //     deviceId = device.id;
  //       //   } else {
  //       //     // Create a default device if no device token is provided
  //       //     const device = await UserService.registerUserDevice({
  //       //       user_id: userId,
  //       //       device_token: `default-${Date.now()}`,
  //       //       device_type: "unknown",
  //       //       ip_address: locationData.ip_address || "unknown",
  //       //       last_active: new Date().toISOString(),
  //       //     });
  //       //     deviceId = device.id;
  //       //   }

  //       // Store location data directly from client
  //       if (locationData.coordinates) {
  //         // await UserService.trackUserLocation({
  //         //   user_id: userId,
  //         //   //   device_id: deviceId,
  //         //   coordinates: [
  //         //     locationData.coordinates.lng,
  //         //     locationData.coordinates.lat,
  //         //   ], // Note: PostGIS uses [long, lat]
  //         //   city: locationData.city || undefined,
  //         //   country: locationData.country || undefined,
  //         //   ip_address: locationData.ip_address || undefined,
  //         //   is_active: true,
  //         //   location_source: locationData.location_source as LocationSource,
  //         //   additional_metadata: {
  //         //     source: locationData.location_source,
  //         //     client_provided: true,
  //         //   },
  //         // });

  //         logger.info(
  //           `Successfully tracked client-provided location for user ${userId} from ${locationData.location_source}`
  //         );
  //       } else {
  //         logger.info(
  //           `No coordinates provided for user ${userId}, skipping location tracking`
  //         );
  //       }
  //     } catch (error) {
  //       logger.error(
  //         `Error tracking client-provided location for user ${userId}:`,
  //         error
  //       );
  //     }
  //   }
}
