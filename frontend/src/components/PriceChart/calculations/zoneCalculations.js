/**
 * Zone calculation utilities for volume-weighted channel zones
 */

/**
 * Calculate volume-weighted zone colors for a channel
 *
 * @param {Array} data - Array of price data points with volume information
 * @param {Object} channelInfo - Channel information containing channelData array
 * @param {number} numZones - Number of zones to divide the channel into
 * @returns {Array} Array of zone objects with color, volumeWeight, and zone boundaries
 */
export const calculateZoneColors = (data, channelInfo, numZones) => {
  if (!channelInfo || !data) return []

  const { channelData } = channelInfo
  const zoneColors = []

  // Create zones from lower to upper
  for (let i = 0; i < numZones; i++) {
    const zoneStart = i / numZones
    const zoneEnd = (i + 1) / numZones

    let volumeInZone = 0
    let totalVolume = 0

    data.forEach((point, index) => {
      const channel = channelData[index]
      if (!channel) return

      const channelRange = channel.upper - channel.lower
      const zoneLower = channel.lower + channelRange * zoneStart
      const zoneUpper = channel.lower + channelRange * zoneEnd

      const volume = point.volume || 1 // Default volume if not available

      totalVolume += volume

      // Check if price falls in this zone
      if (point.close >= zoneLower && point.close < zoneUpper) {
        volumeInZone += volume
      }
    })

    const volumeWeight = totalVolume > 0 ? volumeInZone / totalVolume : 0

    // Color based on volume weight: higher volume = more intense color
    // Use a gradient from low (blue/green) to high (red/orange)
    const intensity = Math.min(255, Math.floor(volumeWeight * 255 * 3))

    let color
    if (volumeWeight < 0.1) {
      // Very low volume - light blue
      color = `rgba(100, 150, 255, 0.15)`
    } else if (volumeWeight < 0.2) {
      // Low volume - blue/green
      color = `rgba(100, 200, 150, 0.2)`
    } else if (volumeWeight < 0.3) {
      // Medium-low volume - green
      color = `rgba(150, 220, 100, 0.25)`
    } else if (volumeWeight < 0.5) {
      // Medium volume - yellow
      color = `rgba(255, 220, 100, 0.3)`
    } else {
      // High volume - orange/red
      const red = Math.min(255, 200 + intensity)
      color = `rgba(${red}, 150, 100, 0.35)`
    }

    zoneColors.push({
      zoneIndex: i,
      color,
      volumeWeight,
      zoneStart,
      zoneEnd
    })
  }

  return zoneColors
}

/**
 * Calculate volume-weighted zones for all channels with dynamic zones based on period
 *
 * @param {Array} data - Array of price data points with volume information
 * @param {Array} allChannels - Array of channel objects with startIndex, endIndex, slope, intercept, channelWidth
 * @param {number} [numZones=5] - Number of zones to divide each channel into
 * @returns {Object} Object mapping channel index to array of zone objects
 */
export const calculateAllChannelZones = (data, allChannels, numZones = 5) => {
  if (!allChannels || allChannels.length === 0 || !data) return {}

  const allZones = {}

  allChannels.forEach((channel, channelIndex) => {
    const zoneColors = []

    // Create zones from lower to upper
    for (let i = 0; i < numZones; i++) {
      const zoneStart = i / numZones
      const zoneEnd = (i + 1) / numZones

      let volumeInZone = 0
      let totalVolume = 0

      // Only process data within this channel's range
      data.forEach((point, globalIndex) => {
        if (globalIndex < channel.startIndex || globalIndex >= channel.endIndex) return

        const localIndex = globalIndex - channel.startIndex
        const midValue = channel.slope * localIndex + channel.intercept
        const upperBound = midValue + channel.channelWidth
        const lowerBound = midValue - channel.channelWidth

        const channelRange = upperBound - lowerBound
        const zoneLower = lowerBound + channelRange * zoneStart
        const zoneUpper = lowerBound + channelRange * zoneEnd

        const volume = point.volume || 1

        totalVolume += volume

        // Check if price falls in this zone
        if (point.close >= zoneLower && point.close < zoneUpper) {
          volumeInZone += volume
        }
      })

      const volumeWeight = totalVolume > 0 ? volumeInZone / totalVolume : 0

      zoneColors.push({
        zoneIndex: i,
        volumeWeight,
        zoneStart,
        zoneEnd
      })
    }

    allZones[channelIndex] = zoneColors
  })

  return allZones
}

/**
 * Calculate volume-weighted zones for a manual channel (fixed at 5 zones)
 *
 * @param {Array} data - Array of price data points with volume information
 * @param {Object} channel - Channel object with startIndex, endIndex, slope, intercept, channelWidth
 * @returns {Array} Array of zone objects with volumeWeight and zone boundaries
 */
export const calculateManualChannelZones = (data, channel) => {
  if (!channel || !data) return []

  const zoneColors = []
  const numZones = 5 // Fixed at 5 zones

  // Create zones from lower to upper
  for (let i = 0; i < numZones; i++) {
    const zoneStart = i / numZones
    const zoneEnd = (i + 1) / numZones

    let volumeInZone = 0
    let totalVolume = 0

    // Only process data within this channel's range
    data.forEach((point, globalIndex) => {
      if (globalIndex < channel.startIndex || globalIndex > channel.endIndex) return

      const localIndex = globalIndex - channel.startIndex
      const midValue = channel.slope * localIndex + channel.intercept
      const upperBound = midValue + channel.channelWidth
      const lowerBound = midValue - channel.channelWidth

      const channelRange = upperBound - lowerBound
      const zoneLower = lowerBound + channelRange * zoneStart
      const zoneUpper = lowerBound + channelRange * zoneEnd

      const volume = point.volume || 1

      totalVolume += volume

      // Check if price falls in this zone
      if (point.close >= zoneLower && point.close < zoneUpper) {
        volumeInZone += volume
      }
    })

    const volumeWeight = totalVolume > 0 ? volumeInZone / totalVolume : 0

    zoneColors.push({
      zoneIndex: i,
      volumeWeight,
      zoneStart,
      zoneEnd
    })
  }

  return zoneColors
}
