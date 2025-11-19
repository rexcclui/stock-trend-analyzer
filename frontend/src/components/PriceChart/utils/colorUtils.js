/**
 * Color utility functions for PriceChart component
 */

/**
 * Get color for SMA line based on period
 * @param {number} period - SMA period
 * @param {Array<number>} smaPeriods - Array of all SMA periods
 * @returns {string} Hex color code
 */
export const getSmaColor = (period, smaPeriods) => {
  const colors = ['#3b82f6', '#f97316', '#10b981', '#f59e0b', '#ec4899']
  const index = smaPeriods.indexOf(period) % colors.length
  return colors[index]
}

/**
 * Color palette for channels
 */
export const CHANNEL_COLORS = [
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#3b82f6', // Blue
]

/**
 * Get zone color based on index and volume weight
 * @param {number} index - Zone index (0-based)
 * @param {number} total - Total number of zones
 * @param {number} volumeWeight - Volume weight (0-1)
 * @returns {string} RGBA color string
 */
export const getZoneColor = (index, total, volumeWeight) => {
  // Calculate base intensity (middle zones are lightest)
  const middleIndex = (total - 1) / 2
  const distanceFromMiddle = Math.abs(index - middleIndex)
  const maxDistance = Math.ceil((total - 1) / 2)

  // Base opacity: 0.03 (farthest from middle) to 0.01 (at middle)
  const baseOpacity = 0.01 + (distanceFromMiddle / maxDistance) * 0.02

  // Volume weight increases opacity (higher volume = more opaque)
  const opacity = baseOpacity * (1 + volumeWeight)

  // Use blue color for zones
  return `rgba(59, 130, 246, ${opacity})`
}

/**
 * Get color for volume weight indicator
 * @param {number} weight - Volume weight (0-1)
 * @returns {string} RGBA color string
 */
export const getVolumeWeightColor = (weight) => {
  // Map weight (0-1) to opacity (0.1-0.6)
  const opacity = 0.1 + weight * 0.5
  return `rgba(59, 130, 246, ${opacity})`
}

/**
 * Performance comparison colors
 */
export const PERFORMANCE_COLORS = {
  positive: '#3b82f6', // Blue
  negative: '#ef4444', // Red
  top: {
    light: '#a7f3d0', // Light green
    dark: '#059669',  // Dark green
  },
  bottom: {
    light: '#fecaca', // Light red
    dark: '#dc2626',  // Dark red
  },
}

/**
 * Stock comparison color pairs (light for below, dark for above)
 */
export const COMPARISON_STOCK_COLORS = [
  { light: '#93c5fd', dark: '#1e40af' }, // Blue
  { light: '#86efac', dark: '#15803d' }, // Green
  { light: '#fde047', dark: '#a16207' }, // Yellow
  { light: '#c4b5fd', dark: '#6d28d9' }, // Purple
  { light: '#f9a8d4', dark: '#be185d' }, // Pink
  { light: '#5eead4', dark: '#0f766e' }, // Teal
]
