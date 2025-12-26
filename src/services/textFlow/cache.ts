/**
 * Measurement cache for text flow engine
 */

// Cache for font measurements
export const measurementCache = new Map<string, number>();

/**
 * Clear the measurement cache - call this when fonts change
 */
export function clearMeasurementCache(): void {
  measurementCache.clear();
}
