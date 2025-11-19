/**
 * Channel-related utilities for slope channel calculations
 */

/**
 * Find optimal stdev multiplier for channel width
 * @param {Array} includedPoints - Points to analyze
 * @param {number} slope - Channel slope
 * @param {number} intercept - Channel intercept
 * @param {number} stdDev - Standard deviation
 * @param {Object} options - Configuration options
 * @returns {Object} Optimal stdev multiplier and touch count
 */
export const findOptimalStdev = (includedPoints, slope, intercept, stdDev, options = {}) => {
  const {
    minMultiplier = 1.0,
    maxMultiplier = 4.0,
    step = 0.1,
    maxOutsidePercent = 0.05,
    touchTolerance = 0.05
  } = options

  const stdevMultipliers = []
  for (let mult = minMultiplier; mult <= maxMultiplier; mult += step) {
    stdevMultipliers.push(mult)
  }

  for (const stdevMult of stdevMultipliers) {
    const channelWidth = stdDev * stdevMult
    let outsideCount = 0
    let touchCount = 0
    const n = includedPoints.length

    includedPoints.forEach(({ point, originalIndex }) => {
      const predictedY = slope * originalIndex + intercept
      const upperBound = predictedY + channelWidth
      const lowerBound = predictedY - channelWidth

      if (point.close > upperBound || point.close < lowerBound) {
        outsideCount++
      }

      const distanceToUpper = Math.abs(point.close - upperBound)
      const distanceToLower = Math.abs(point.close - lowerBound)
      const boundRange = channelWidth * 2

      if (distanceToUpper <= boundRange * touchTolerance ||
          distanceToLower <= boundRange * touchTolerance) {
        touchCount++
      }
    })

    const outsidePercent = outsideCount / n

    if (outsidePercent <= maxOutsidePercent) {
      return { stdevMult, touchCount, valid: true }
    }
  }

  return { stdevMult: 2.5, touchCount: 0, valid: false }
}

/**
 * Calculate channel distribution statistics
 * @param {Array} data - Data points
 * @param {number} slope - Channel slope
 * @param {number} intercept - Channel intercept
 * @param {number} channelWidth - Width of channel
 * @returns {Object} Distribution statistics
 */
export const calculateChannelDistribution = (data, slope, intercept, channelWidth) => {
  let countAbove = 0
  let countBelow = 0
  let countOutside = 0

  data.forEach((point, index) => {
    const predictedY = slope * index + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth

    if (point.close > predictedY) countAbove++
    else if (point.close < predictedY) countBelow++

    if (point.close > upperBound || point.close < lowerBound) {
      countOutside++
    }
  })

  const n = data.length

  return {
    percentAbove: (countAbove / n * 100).toFixed(1),
    percentBelow: (countBelow / n * 100).toFixed(1),
    percentOutside: (countOutside / n * 100).toFixed(1)
  }
}

/**
 * Generate channel data for visualization
 * @param {Array} data - Full dataset
 * @param {number} recentDataCount - Number of recent points to include
 * @param {number} slope - Channel slope
 * @param {number} intercept - Channel intercept
 * @param {number} channelWidth - Width of channel
 * @returns {Array} Channel data with upper, mid, and lower bounds
 */
export const generateChannelData = (data, recentDataCount, slope, intercept, channelWidth) => {
  return data.map((point, globalIndex) => {
    if (globalIndex >= recentDataCount) {
      return null
    }

    const midValue = slope * globalIndex + intercept
    return {
      upper: midValue + channelWidth,
      mid: midValue,
      lower: midValue - channelWidth
    }
  })
}

/**
 * Check if new data breaks the trend
 * @param {Array} newDataPoints - New data points to check
 * @param {number} slope - Current channel slope
 * @param {number} intercept - Current channel intercept
 * @param {number} channelWidth - Current channel width
 * @param {number} threshold - Percentage threshold for breaking (default 0.5)
 * @returns {boolean} True if trend is broken
 */
export const checkTrendBreak = (newDataPoints, slope, intercept, channelWidth, threshold = 0.5) => {
  if (newDataPoints.length === 0) return false

  let pointsOutside = 0
  newDataPoints.forEach(({ point, originalIndex }) => {
    const predictedY = slope * originalIndex + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth

    if (point.close > upperBound || point.close < lowerBound) {
      pointsOutside++
    }
  })

  return pointsOutside / newDataPoints.length > threshold
}

/**
 * Calculate zones for channel visualization
 * @param {Array} data - Data points
 * @param {Object} channel - Channel object with upper, mid, lower
 * @param {Array} zoneColors - Zone color configuration
 * @returns {Object} Data points with zone information added
 */
export const calculateChannelZones = (data, channel, zoneColors) => {
  if (!channel || zoneColors.length === 0) return {}

  const channelRange = channel.upper - channel.lower
  const zoneData = {}

  zoneColors.forEach((zone, zoneIndex) => {
    const zoneLower = channel.lower + channelRange * zone.zoneStart
    const zoneUpper = channel.lower + channelRange * zone.zoneEnd
    zoneData[`zone${zoneIndex}Lower`] = zoneLower
    zoneData[`zone${zoneIndex}Upper`] = zoneUpper
  })

  return zoneData
}
