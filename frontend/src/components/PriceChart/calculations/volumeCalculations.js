/**
 * Volume calculation utilities for volume profiles and rolling thresholds
 */

/**
 * Determine the rolling lookback window based on the number of days displayed
 *
 * @param {number} days - Number of days displayed in the chart
 * @returns {number} Number of days to use for the rolling lookback window
 */
export const getVolumeLookbackWindow = (days) => {
  const daysNum = parseInt(days)
  if (daysNum >= 1825) return 180      // 5Y: 6 months
  if (daysNum >= 1095) return 90       // 3Y: 3 months
  if (daysNum >= 365) return 60        // 1Y: 2 months
  if (daysNum >= 180) return 28        // 6M: 4 weeks
  if (daysNum >= 90) return 21         // 3M: 3 weeks
  if (daysNum >= 30) return 7          // 1M: 1 week
  return 1                             // 7D: 1 day
}

/**
 * Calculate rolling volume thresholds for each data point (80th and 20th percentiles)
 *
 * @param {Object} params - Parameters object
 * @param {boolean} params.volumeColorEnabled - Whether volume coloring is enabled
 * @param {Array} params.displayPrices - Array of price data points to analyze
 * @param {number} params.volumeLookbackWindow - Number of days to look back for rolling calculation
 * @param {string} params.volumeColorMode - Mode for volume coloring ('relative-spy' or other)
 * @param {Array} params.spyData - SPY comparison data (required if volumeColorMode is 'relative-spy')
 * @param {Array} params.volumeRatios - Array of volume ratios (required if volumeColorMode is 'relative-spy')
 * @returns {Object} Object with thresholds80 and thresholds20 arrays
 */
export const calculateRollingThresholds = ({
  volumeColorEnabled,
  displayPrices,
  volumeLookbackWindow,
  volumeColorMode,
  spyData,
  volumeRatios
}) => {
  if (!volumeColorEnabled) return { thresholds80: [], thresholds20: [] }

  const thresholds80 = []
  const thresholds20 = []

  for (let i = 0; i < displayPrices.length; i++) {
    // Define the lookback window (from i-lookback to i-1, not including current point)
    const startIdx = Math.max(0, i - volumeLookbackWindow)
    const endIdx = i // Include current point for comparison

    let values = []

    if (volumeColorMode === 'relative-spy' && spyData) {
      // Use volume ratios from the lookback window
      values = volumeRatios.slice(startIdx, endIdx).filter(r => r > 0)
    } else {
      // Use absolute volumes from the lookback window
      values = displayPrices.slice(startIdx, endIdx)
        .map(d => d.volume || 0)
        .filter(v => v > 0)
    }

    if (values.length > 0) {
      const sorted = [...values].sort((a, b) => a - b)
      const idx80 = Math.floor(sorted.length * 0.8)
      const idx20 = Math.floor(sorted.length * 0.2)
      thresholds80[i] = sorted[idx80]
      thresholds20[i] = sorted[idx20]
    } else {
      thresholds80[i] = null
      thresholds20[i] = null
    }
  }

  return { thresholds80, thresholds20 }
}

/**
 * Calculate volume profile for a specific dataset and date range
 *
 * @param {Array} dataToAnalyze - Array of price data points to analyze
 * @param {number} yAxisMax - Maximum price value on the y-axis for proper scaling
 * @param {Object|null} dateRange - Optional date range object with startDate and endDate
 * @param {boolean} [isManualMode=false] - Whether this is for manual mode (uses 20% more zones)
 * @returns {Object|null} Volume profile object with zones, maxVolume, totalVolume, dateRange, and numZones
 */
export const calculateSingleVolumeProfile = (dataToAnalyze, yAxisMax, dateRange = null, isManualMode = false) => {
  if (dataToAnalyze.length === 0) return null

  // Calculate total volume
  const totalVolume = dataToAnalyze.reduce((sum, price) => sum + (price.volume || 0), 0)
  if (totalVolume === 0) return null

  // Find min and max price from the filtered data
  const prices = dataToAnalyze.map(p => p.close)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice

  if (priceRange === 0) return null

  // Calculate number of zones based on ratio of price range to y-axis max
  // Manual mode: 20% more zones than auto mode for finer granularity
  // Auto mode: Each 0.025 ratio = 1 zone → ratio * 40
  // Manual mode: ratio * 40 * 1.2 = ratio * 48
  const ratio = priceRange / yAxisMax
  const baseMultiplier = isManualMode ? 48 : 40 // 20% increase for manual mode
  const numZones = Math.max(1, Math.round(ratio * baseMultiplier)) // Minimum 1 zone
  const zoneHeight = priceRange / numZones
  const volumeZones = []

  // Initialize zones
  for (let i = 0; i < numZones; i++) {
    volumeZones.push({
      minPrice: minPrice + (i * zoneHeight),
      maxPrice: minPrice + ((i + 1) * zoneHeight),
      volume: 0,
      volumePercent: 0
    })
  }

  // Accumulate volume for each zone
  dataToAnalyze.forEach(price => {
    const priceValue = price.close
    const volume = price.volume || 0

    // Find which zone this price falls into
    let zoneIndex = Math.floor((priceValue - minPrice) / zoneHeight)
    // Handle edge case where price equals maxPrice
    if (zoneIndex >= numZones) zoneIndex = numZones - 1
    if (zoneIndex < 0) zoneIndex = 0

    volumeZones[zoneIndex].volume += volume
  })

  // Calculate percentages and find max volume
  let maxZoneVolume = 0
  volumeZones.forEach(zone => {
    zone.volumePercent = (zone.volume / totalVolume) * 100
    if (zone.volume > maxZoneVolume) maxZoneVolume = zone.volume
  })

  return { zones: volumeZones, maxVolume: maxZoneVolume, totalVolume, dateRange, numZones }
}

/**
 * Calculate all volume profiles based on mode (auto or manual)
 *
 * @param {Object} params - Parameters object
 * @param {boolean} params.volumeProfileEnabled - Whether volume profile is enabled
 * @param {Array} params.displayPrices - Array of price data points
 * @param {string} params.volumeProfileMode - Profile mode ('auto' or 'manual')
 * @param {Object} params.zoomRange - Zoom range object with start and end indices
 * @param {Array} params.volumeProfileManualRanges - Array of manual date ranges (required if mode is 'manual')
 * @returns {Array} Array of volume profile objects
 */
export const calculateVolumeProfiles = ({
  volumeProfileEnabled,
  displayPrices,
  volumeProfileMode,
  zoomRange,
  volumeProfileManualRanges
}) => {
  if (!volumeProfileEnabled || displayPrices.length === 0) return []

  // Important: chartData is reversed, so we need to use reversed displayPrices for correct slicing
  const reversedDisplayPrices = [...displayPrices].reverse()

  if (volumeProfileMode === 'auto') {
    // Auto mode: single profile for visible (zoomed) data
    // Use reversed prices to match chartData order
    const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

    // Calculate y-axis max from VISIBLE data only for proper scaling
    const visiblePrices = visibleData.map(p => p.close)
    const yAxisMax = visiblePrices.length > 0 ? Math.max(...visiblePrices) : 0

    const profile = calculateSingleVolumeProfile(visibleData, yAxisMax, null, false)
    return profile ? [profile] : []
  } else {
    // Manual mode: one profile for each selected range (20% more zones than auto)
    if (volumeProfileManualRanges.length === 0) return []

    // Calculate y-axis max from visible (zoomed) data for proper scaling
    const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)
    const visiblePrices = visibleData.map(p => p.close)
    const yAxisMax = visiblePrices.length > 0 ? Math.max(...visiblePrices) : 0

    const profiles = []
    volumeProfileManualRanges.forEach(range => {
      const { startDate, endDate } = range
      const dataToAnalyze = reversedDisplayPrices.filter(price => {
        const priceDate = price.date
        return priceDate >= startDate && priceDate <= endDate
      })

      const profile = calculateSingleVolumeProfile(dataToAnalyze, yAxisMax, range, true)
      if (profile) profiles.push(profile)
    })

    return profiles
  }
}
