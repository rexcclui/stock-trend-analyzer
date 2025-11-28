/**
 * Volume-based color utilities for chart rendering
 */

/**
 * Get color based on volume percentage
 * Color scheme: Red (low volume) > Yellow > Green > Blue (high volume)
 *
 * @param {number} volumePercent - Volume percentage (0-100)
 * @returns {string} Hex color code
 */
export const getVolumeColor = (volumePercent) => {
  if (volumePercent >= 50) return '#3b82f6'  // Blue - very high (50%+)
  if (volumePercent >= 40) return '#60a5fa'  // Light blue - high (40-50%)
  if (volumePercent >= 30) return '#22c55e'  // Green - medium-high (30-40%)
  if (volumePercent >= 25) return '#84cc16'  // Lime - medium (25-30%)
  if (volumePercent >= 20) return '#a3e635'  // Light lime (20-25%)
  if (volumePercent >= 16) return '#eab308'  // Yellow (16-20%)
  if (volumePercent >= 12) return '#f97316'  // Orange (12-16%)
  if (volumePercent >= 8) return '#fb923c'   // Light orange (8-12%)
  if (volumePercent >= 5) return '#fbbf24'   // Amber (5-8%)
  return '#ef4444' // Red - minimal (<5%)
}
