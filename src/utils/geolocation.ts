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
 * Get geolocation data from an IP address using the free ip-api.com service
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

    const response = await axios.get(
      `http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`
    );

    if (response.data.status === "success") {
      return {
        ip: response.data.query,
        country: response.data.country,
        countryCode: response.data.countryCode,
        region: response.data.region,
        regionName: response.data.regionName,
        city: response.data.city,
        zip: response.data.zip,
        latitude: response.data.lat,
        longitude: response.data.lon,
        timezone: response.data.timezone,
        isp: response.data.isp,
        org: response.data.org,
        as: response.data.as,
      };
    } else {
      logger.warn(`Geolocation API error: ${response.data.message}`);
      return null;
    }
  } catch (error) {
    logger.error("Error fetching geolocation data:", error);
    return null;
  }
};

/**
 * Rate limiting utility to prevent exceeding the free tier limits
 * ip-api.com allows 45 requests per minute
 */
let requestCount = 0;
let lastResetTime = Date.now();
const MAX_REQUESTS_PER_MINUTE = 45;

export const throttledGetLocationFromIp = async (
  ip: string
): Promise<GeoLocationData | null> => {
  // Reset counter if a minute has passed
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    requestCount = 0;
    lastResetTime = now;
  }

  // Check if we've exceeded the rate limit
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    logger.warn("Rate limit exceeded for IP geolocation API");
    return null;
  }

  requestCount++;
  return getLocationFromIp(ip);
};
