/**
 * Volume-related utilities for volume profile and coloring
 */

/**
 * Calculate volume profile for a price range
 * @param {Array} dataToAnalyze - Data points to analyze
 * @param {number} yAxisMax - Maximum Y-axis value for price
 * @param {Object} options - Configuration options
 * @returns {Array} Volume profile bins
 */
export const calculateVolumeProfile = (dataToAnalyze, yAxisMax, options = {}) => {
  const {
    numBins = 50,
    dateRange = null,
    isManualMode = false
  } = options

  if (!dataToAnalyze || dataToAnalyze.length === 0) return []

  const minPrice = Math.min(...dataToAnalyze.map(d => d.low || d.close))
  const maxPrice = Math.max(...dataToAnalyze.map(d => d.high || d.close))
  const priceRange = maxPrice - minPrice
  const binSize = priceRange / numBins

  const bins = Array(numBins).fill(0).map((_, i) => ({
    priceLevel: minPrice + (i * binSize),
    volume: 0
  }))

  dataToAnalyze.forEach(point => {
    const price = point.close
    const binIndex = Math.min(Math.floor((price - minPrice) / binSize), numBins - 1)
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].volume += point.volume || 0
    }
  })

  const maxVolume = Math.max(...bins.map(b => b.volume))

  return bins.map(bin => ({
    ...bin,
    normalizedWidth: maxVolume > 0 ? (bin.volume / maxVolume) : 0
  }))
}

/**
 * Calculate zone colors based on volume weights
 * @param {Array} data - Price data
 * @param {Object} channelInfo - Channel information
 * @param {number} numZones - Number of zones to create
 * @returns {Array} Zone color configurations
 */
export const calculateZoneColors = (data, channelInfo, numZones) => {
  if (!channelInfo || !data || data.length === 0) return []

  const { channelData, recentDataCount } = channelInfo
  const recentData = data.slice(0, recentDataCount)

  const zoneHeight = 1.0 / numZones
  const zones = []

  for (let i = 0; i < numZones; i++) {
    const zoneStart = i * zoneHeight
    const zoneEnd = (i + 1) * zoneHeight
    zones.push({ zoneStart, zoneEnd, volume: 0, count: 0 })
  }

  recentData.forEach((point, index) => {
    const channel = channelData[index]
    if (!channel) return

    const channelRange = channel.upper - channel.lower
    const relativePosition = (point.close - channel.lower) / channelRange

    const zoneIndex = Math.floor(relativePosition * numZones)
    if (zoneIndex >= 0 && zoneIndex < numZones) {
      zones[zoneIndex].volume += point.volume || 0
      zones[zoneIndex].count++
    }
  })

  const totalVolume = zones.reduce((sum, z) => sum + z.volume, 0)

  return zones.map(zone => ({
    ...zone,
    volumeWeight: totalVolume > 0 ? zone.volume / totalVolume : 0,
    avgVolume: zone.count > 0 ? zone.volume / zone.count : 0
  }))
}

/**
 * Build SPY volume map by date
 * @param {Array} spyData - SPY data array
 * @returns {Object} Map of date to volume
 */
export const buildSpyVolumeMap = (spyData) => {
  if (!spyData || !spyData.prices) return {}

  const map = {}
  spyData.prices.forEach(p => {
    map[p.date] = p.volume || 0
  })
  return map
}

/**
 * Calculate volume ratios (stock/SPY)
 * @param {Array} data - Stock price data
 * @param {Object} spyVolumeByDate - SPY volume map
 * @returns {Array} Volume ratios
 */
export const calculateVolumeRatios = (data, spyVolumeByDate) => {
  return data.map(point => {
    const spyVolume = spyVolumeByDate[point.date]
    if (!spyVolume || spyVolume === 0) return null
    return (point.volume || 0) / spyVolume
  })
}

/**
 * Get volume color based on ratio and thresholds
 * @param {number} ratio - Volume ratio
 * @param {number} threshold80 - 80th percentile threshold
 * @param {number} threshold20 - 20th percentile threshold
 * @param {string} mode - Color mode ('absolute' or 'relative')
 * @returns {string} Color hex code
 */
export const getVolumeColor = (ratio, threshold80, threshold20, mode = 'absolute') => {
  if (mode === 'absolute') {
    if (ratio > threshold80) return '#22c55e'
    if (ratio < threshold20) return '#ef4444'
    return '#64748b'
  }

  if (ratio > threshold80) return '#22c55e'
  if (ratio < threshold20) return '#ef4444'
  return '#94a3b8'
}

/**
 * Calculate number of zones based on time period
 * @param {string} days - Number of days as string
 * @returns {number} Number of zones
 */
export const calculateNumZones = (days) => {
  const daysNum = parseInt(days) || 365
  return daysNum < 365 ? 3 : 5
}
