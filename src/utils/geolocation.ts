// src/utils/geoLocation.ts
import axios from "axios";
import { logger } from "./logger";

export interface GeoLocationData {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
}

/**
 * Get geolocation data from an IP address using the free ipapi.co service
 */
export const getLocationFromIp = async (
  ip: string
): Promise<GeoLocationData | null> => {
  try {
    // Remove IPv6 prefix if present (for localhost testing)
    const cleanIp = ip.replace(/^::ffff:/, "");

    // Skip API call for localhost/private IPs
    if (
      cleanIp === "127.0.0.1" ||
      cleanIp === "localhost" ||
      cleanIp.startsWith("192.168.") ||
      cleanIp.startsWith("10.")
    ) {
      logger.debug(`Skipping geolocation for private IP: ${cleanIp}`);
      return null;
    }

    const response = await axios.get(`https://ipapi.co/${cleanIp}/json/`);

    if (response.data && !response.data.error) {
      return {
        ip: response.data.ip,
        country: response.data.country_name,
        countryCode: response.data.country_code,
        region: response.data.region_code,
        regionName: response.data.region,
        city: response.data.city,
        zip: response.data.postal,
        latitude: response.data.latitude,
        longitude: response.data.longitude,
        timezone: response.data.timezone,
        isp: response.data.org,
        org: response.data.org,
        as: response.data.asn,
      };
    } else {
      logger.warn(
        `Geolocation API error: ${response.data.error || "Unknown error"}`
      );
      return null;
    }
  } catch (error) {
    logger.error("Error fetching geolocation data:", error);
    return null;
  }
};

/**
 * Rate limiting utility to prevent exceeding the free tier limits
 * ipapi.co allows 1,000 requests per day for free tier
 */
let requestCount = 0;
let lastResetTime = Date.now();
const MAX_REQUESTS_PER_DAY = 1000;

export const throttledGetLocationFromIp = async (
  ip: string
): Promise<GeoLocationData | null> => {
  // Reset counter if a day has passed
  const now = Date.now();
  if (now - lastResetTime > 24 * 60 * 60 * 1000) {
    // 24 hours in milliseconds
    requestCount = 0;
    lastResetTime = now;
  }

  // Check if we've exceeded the rate limit
  if (requestCount >= MAX_REQUESTS_PER_DAY) {
    logger.warn("Rate limit exceeded for IP geolocation API");
    return null;
  }

  requestCount++;
  return getLocationFromIp(ip);
};
