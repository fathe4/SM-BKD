// src/services/ipLocationService.ts
import { UserService } from "./userService";
import { LocationSource } from "../types/models";
import { logger } from "../utils/logger";
import { throttledGetLocationFromIp } from "../utils/geolocation";

export class IpLocationService {
  /**
   * Track user location based on IP address
   */
  static async trackUserIpLocation(
    userId: string,
    ipAddress: string,
    deviceId: string
  ): Promise<void> {
    try {
      // Get geolocation data from IP
      const geoData = await throttledGetLocationFromIp(ipAddress);

      if (!geoData) {
        logger.info(`Skipping location tracking for IP: ${ipAddress}`);
        return;
      }

      // Store location in database
      await UserService.trackUserLocation({
        user_id: userId,
        device_id: deviceId,
        coordinates: [geoData.longitude, geoData.latitude], // Note: PostGIS uses [long, lat]
        city: geoData.city,
        country: geoData.country,
        ip_address: ipAddress,
        is_active: true,
        location_source: LocationSource.IP,
        additional_metadata: {
          region: geoData.regionName,
          postal_code: geoData.zip,
          timezone: geoData.timezone,
          isp: geoData.isp,
          organization: geoData.org,
        },
        updated_at: "",
      });

      logger.info(
        `Successfully tracked location for user ${userId} from IP ${ipAddress}`
      );
    } catch (error) {
      // Don't let location tracking failure break the authentication flow
      logger.error(`Error tracking location for user ${userId}:`, error);
    }
  }

  /**
   * Handle user login location tracking
   * This method should be called during login
   */
  static async trackLoginLocation(
    userId: string,
    ipAddress: string,
    deviceToken: string,
    deviceType: string
  ): Promise<void> {
    try {
      // Register or update the device first
      const device = await UserService.registerUserDevice({
        user_id: userId,
        device_token: deviceToken,
        device_type: deviceType,
        ip_address: ipAddress,
        last_active: new Date().toISOString(),
        updated_at: "",
      });

      // Then track the location
      await this.trackUserIpLocation(userId, ipAddress, device.id);
    } catch (error) {
      logger.error(`Error tracking login location for user ${userId}:`, error);
    }
  }
}
