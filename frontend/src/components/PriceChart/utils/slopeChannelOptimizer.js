/**
 * Slope channel optimization algorithms
 */

import { calculateVolumeThreshold } from './calculations'
import { findOptimalStdev, checkTrendBreak } from './channelUtils'

/**
 * Find best channel parameters with trend-breaking logic
 * @param {Array} data - Price data
 * @param {Function} shouldIncludePoint - Filter function for volume weighting
 * @param {number} startingLookback - Optional starting lookback count
 * @returns {Object} Best channel parameters (count, stdevMultiplier, touches)
 */
export const findBestChannel = (data, shouldIncludePoint, startingLookback = null) => {
  // If user manually set a lookback, use it as starting point; otherwise use 100
  const defaultMinPoints = Math.min(100, data.length)
  const minPoints = startingLookback ? Math.min(startingLookback, data.length) : defaultMinPoints
  const maxPoints = data.length

  const maxOutsidePercent = 0.05
  const trendBreakThreshold = 0.5

  let currentCount = minPoints
  let currentStdevMult = 2.5
  let currentTouchCount = 0

  // Start with minimum lookback period
  let testData = data.slice(0, currentCount)
  let includedPoints = testData
    .map((point, index) => ({ point, originalIndex: index }))
    .filter(({ point }) => shouldIncludePoint(point))

  if (includedPoints.length < 10) {
    return { count: minPoints, stdevMultiplier: 2.5, touches: 0 }
  }

  // Calculate initial channel parameters
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  let n = includedPoints.length

  includedPoints.forEach(({ point, originalIndex }) => {
    sumX += originalIndex
    sumY += point.close
    sumXY += originalIndex * point.close
    sumX2 += originalIndex * originalIndex
  })

  let slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  let intercept = (sumY - slope * sumX) / n

  let distances = includedPoints.map(({ point, originalIndex }) => {
    const predictedY = slope * originalIndex + intercept
    return point.close - predictedY
  })

  let meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  let variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  let stdDev = Math.sqrt(variance)

  // Find optimal stdev for initial period
  const initialResult = findOptimalStdev(includedPoints, slope, intercept, stdDev, {
    maxOutsidePercent
  })

  if (!initialResult.valid) {
    return { count: minPoints, stdevMultiplier: 2.5, touches: 0 }
  }

  currentStdevMult = initialResult.stdevMult
  currentTouchCount = initialResult.touchCount

  // Try to extend the lookback period
  for (let count = currentCount + 1; count <= maxPoints; count++) {
    const previousCount = count - 1
    const previous90Percent = Math.floor(previousCount * 0.9)

    // Get extended data
    testData = data.slice(0, count)
    includedPoints = testData
      .map((point, index) => ({ point, originalIndex: index }))
      .filter(({ point }) => shouldIncludePoint(point))

    if (includedPoints.length < 10) continue

    // Check if new 10% of data (older historical data) fits within current channel
    const newDataPoints = includedPoints.filter(({ originalIndex }) => originalIndex >= previous90Percent)
    const channelWidth = stdDev * currentStdevMult

    if (checkTrendBreak(newDataPoints, slope, intercept, channelWidth, trendBreakThreshold)) {
      break
    }

    // Recalculate channel with extended data
    sumX = 0
    sumY = 0
    sumXY = 0
    sumX2 = 0
    n = includedPoints.length

    includedPoints.forEach(({ point, originalIndex }) => {
      sumX += originalIndex
      sumY += point.close
      sumXY += originalIndex * point.close
      sumX2 += originalIndex * originalIndex
    })

    slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    intercept = (sumY - slope * sumX) / n

    distances = includedPoints.map(({ point, originalIndex }) => {
      const predictedY = slope * originalIndex + intercept
      return point.close - predictedY
    })

    meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
    variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
    stdDev = Math.sqrt(variance)

    // Find optimal stdev for extended period
    const extendedResult = findOptimalStdev(includedPoints, slope, intercept, stdDev, {
      maxOutsidePercent
    })

    if (!extendedResult.valid) {
      break
    }

    // Update current best parameters
    currentCount = count
    currentStdevMult = extendedResult.stdevMult
    currentTouchCount = extendedResult.touchCount
  }

  return { count: currentCount, stdevMultiplier: currentStdevMult, touches: currentTouchCount }
}

/**
 * Calculate slope channel with optimization
 * @param {Array} data - Price data
 * @param {Object} storedParams - Stored optimization parameters
 * @param {Function} setStoredParams - Function to update stored parameters
 * @param {boolean} useStoredParams - Whether to use stored parameters
 * @param {boolean} volumeWeighted - Whether to use volume weighting
 * @returns {Object|null} Channel information
 */
export const calculateSlopeChannel = (data, storedParams, setStoredParams, useStoredParams = true, volumeWeighted = false) => {
  if (!data || data.length < 10) return null

  // Calculate volume threshold if volume weighting is enabled
  let volumeThreshold = 0
  if (volumeWeighted) {
    volumeThreshold = calculateVolumeThreshold(data, 0.2)
  }

  // Helper function to check if a point should be included based on volume
  const shouldIncludePoint = (point) => {
    if (!volumeWeighted) return true
    return (point.volume || 0) > volumeThreshold
  }

  let recentDataCount, optimalStdevMult, touchCount

  const { optimizedLookbackCount, optimizedStdevMult } = storedParams

  // Use stored parameters if available and requested, otherwise optimize
  if (useStoredParams && optimizedLookbackCount !== null && optimizedStdevMult !== null) {
    recentDataCount = Math.min(optimizedLookbackCount, data.length)
    optimalStdevMult = optimizedStdevMult
  } else {
    // Run optimization
    const bestChannelParams = findBestChannel(data, shouldIncludePoint, optimizedLookbackCount)
    recentDataCount = bestChannelParams.count
    optimalStdevMult = bestChannelParams.stdevMultiplier
    touchCount = bestChannelParams.touches

    // Store the optimized parameters
    setStoredParams({
      optimizedLookbackCount: recentDataCount,
      optimizedStdevMult: optimalStdevMult
    })
  }

  // Use first N data points (data is NEWEST-FIRST)
  const recentData = data.slice(0, recentDataCount)

  // Calculate linear regression
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  const n = recentData.length

  recentData.forEach((point, index) => {
    const x = index
    const y = point.close
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate distances from regression line
  const distances = recentData.map((point, index) => {
    const predictedY = slope * index + intercept
    return point.close - predictedY
  })

  // Calculate standard deviation
  const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  const stdDev = Math.sqrt(variance)

  const channelWidth = stdDev * optimalStdevMult

  // Calculate channel lines
  const channelData = data.map((point, globalIndex) => {
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

  // Calculate final distribution
  let finalCountAbove = 0
  let finalCountBelow = 0
  let finalCountOutside = 0

  recentData.forEach((point, index) => {
    const predictedY = slope * index + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth

    if (point.close > predictedY) finalCountAbove++
    else if (point.close < predictedY) finalCountBelow++

    if (point.close > upperBound || point.close < lowerBound) {
      finalCountOutside++
    }
  })

  // Calculate R²
  const meanY = recentData.reduce((sum, p) => sum + p.close, 0) / n
  let ssTotal = 0
  let ssResidual = 0

  recentData.forEach((point, index) => {
    const predictedY = slope * index + intercept
    ssTotal += Math.pow(point.close - meanY, 2)
    ssResidual += Math.pow(point.close - predictedY, 2)
  })

  const rSquared = 1 - (ssResidual / ssTotal)

  // Calculate touch count if not already set
  if (touchCount === undefined) {
    touchCount = 0
    const touchTolerance = 0.05

    recentData.forEach((point, index) => {
      const predictedY = slope * index + intercept
      const upperBound = predictedY + channelWidth
      const lowerBound = predictedY - channelWidth
      const distanceToUpper = Math.abs(point.close - upperBound)
      const distanceToLower = Math.abs(point.close - lowerBound)
      const boundRange = channelWidth * 2

      if (distanceToUpper <= boundRange * touchTolerance ||
          distanceToLower <= boundRange * touchTolerance) {
        touchCount++
      }
    })
  }

  return {
    channelData,
    slope,
    intercept,
    channelWidth,
    stdDev,
    recentDataCount,
    percentAbove: (finalCountAbove / n * 100).toFixed(1),
    percentBelow: (finalCountBelow / n * 100).toFixed(1),
    percentOutside: (finalCountOutside / n * 100).toFixed(1),
    optimalStdevMult,
    touchCount,
    rSquared
  }
}
