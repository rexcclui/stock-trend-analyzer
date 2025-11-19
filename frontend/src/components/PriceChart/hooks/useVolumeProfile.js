import { useMemo } from 'react'

/**
 * Calculate single volume profile
 * @param {Array} dataToAnalyze - Data to analyze
 * @param {number} yAxisMax - Maximum Y-axis value
 * @param {Object} dateRange - Optional date range
 * @param {boolean} isManualMode - Whether in manual mode
 * @returns {Object|null} Volume profile data
 */
const calculateSingleVolumeProfile = (dataToAnalyze, yAxisMax, dateRange = null, isManualMode = false) => {
  if (dataToAnalyze.length === 0) return null

  const totalVolume = dataToAnalyze.reduce((sum, price) => sum + (price.volume || 0), 0)
  if (totalVolume === 0) return null

  const prices = dataToAnalyze.map(p => p.close)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice

  if (priceRange === 0) return null

  // Calculate number of zones
  const ratio = priceRange / yAxisMax
  const baseMultiplier = isManualMode ? 48 : 40
  const numZones = Math.max(1, Math.round(ratio * baseMultiplier))
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

    let zoneIndex = Math.floor((priceValue - minPrice) / zoneHeight)
    if (zoneIndex >= numZones) zoneIndex = numZones - 1
    if (zoneIndex < 0) zoneIndex = 0

    volumeZones[zoneIndex].volume += volume
  })

  // Calculate percentages and find max volume
  let maxZoneVolume = 0
  volumeZones.forEach(zone => {
    zone.volumePercent = (zone.volume / totalVolume) * 100
    if (zone.volume > maxZoneVolume) {
      maxZoneVolume = zone.volume
    }
  })

  return {
    zones: volumeZones,
    totalVolume,
    maxZoneVolume,
    dateRange
  }
}

/**
 * Custom hook for volume profile calculations
 * @param {boolean} enabled - Whether volume profile is enabled
 * @param {string} mode - Volume profile mode ('auto' or 'manual')
 * @param {Array} data - Price data
 * @param {Array} manualRanges - Manual date ranges
 * @param {Object} zoomRange - Current zoom range
 * @returns {Array} Volume profiles
 */
export const useVolumeProfile = (
  enabled,
  mode,
  data,
  manualRanges,
  zoomRange
) => {
  return useMemo(() => {
    if (!enabled || !data || data.length === 0) return []

    // Reverse data for proper ordering
    const reversedData = [...data].reverse()

    // Get visible data based on zoom
    const endIndex = zoomRange.end === null ? reversedData.length : zoomRange.end
    const visibleData = reversedData.slice(zoomRange.start, endIndex)

    if (visibleData.length === 0) return []

    // Calculate y-axis max from visible data
    const visiblePrices = visibleData.map(p => p.close)
    const yAxisMax = Math.max(...visiblePrices)

    if (mode === 'auto') {
      const profile = calculateSingleVolumeProfile(visibleData, yAxisMax, null, false)
      return profile ? [profile] : []
    } else {
      // Manual mode
      if (manualRanges.length === 0) return []

      const profiles = []
      manualRanges.forEach(range => {
        const { startDate, endDate } = range
        const dataToAnalyze = reversedData.filter(price => {
          const priceDate = price.date
          return priceDate >= startDate && priceDate <= endDate
        })

        const profile = calculateSingleVolumeProfile(dataToAnalyze, yAxisMax, range, true)
        if (profile) profiles.push(profile)
      })

      return profiles
    }
  }, [enabled, mode, data, manualRanges, zoomRange])
}
