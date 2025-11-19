/**
 * Calculation utilities for PriceChart component
 */

/**
 * Calculate Simple Moving Average (SMA) for a given period
 * @param {Array} data - Price data array
 * @param {number} period - SMA period
 * @returns {Array} SMA values with nulls for initial values
 */
export const calculateSMA = (data, period) => {
  const smaData = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      smaData.push(null)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close
      }
      smaData.push(sum / period)
    }
  }
  return smaData
}

/**
 * Calculate linear regression for a dataset
 * @param {Array} data - Array of data points
 * @param {Function} shouldIncludePoint - Optional filter function
 * @returns {Object} Regression parameters (slope, intercept, stdDev)
 */
export const calculateLinearRegression = (data, shouldIncludePoint = () => true) => {
  const includedPoints = data
    .map((point, index) => ({ point, originalIndex: index }))
    .filter(({ point }) => shouldIncludePoint(point))

  if (includedPoints.length < 2) {
    return null
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  const n = includedPoints.length

  includedPoints.forEach(({ point, originalIndex }) => {
    sumX += originalIndex
    sumY += point.close
    sumXY += originalIndex * point.close
    sumX2 += originalIndex * originalIndex
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate standard deviation
  const distances = includedPoints.map(({ point, originalIndex }) => {
    const predictedY = slope * originalIndex + intercept
    return point.close - predictedY
  })

  const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  const stdDev = Math.sqrt(variance)

  return {
    slope,
    intercept,
    stdDev,
    includedPoints,
    distances,
    meanDistance
  }
}

/**
 * Calculate R-squared value for regression fit
 * @param {Array} data - Data points
 * @param {number} slope - Regression slope
 * @param {number} intercept - Regression intercept
 * @returns {number} R-squared value
 */
export const calculateRSquared = (data, slope, intercept) => {
  const n = data.length
  const meanY = data.reduce((sum, p) => sum + p.close, 0) / n
  let ssTotal = 0
  let ssResidual = 0

  data.forEach((point, index) => {
    const predictedY = slope * index + intercept
    ssTotal += Math.pow(point.close - meanY, 2)
    ssResidual += Math.pow(point.close - predictedY, 2)
  })

  return 1 - (ssResidual / ssTotal)
}

/**
 * Calculate volume threshold at given percentile
 * @param {Array} data - Price data with volume
 * @param {number} percentile - Percentile value (0-1)
 * @returns {number} Volume threshold
 */
export const calculateVolumeThreshold = (data, percentile = 0.2) => {
  const volumes = data.map(d => d.volume || 0).filter(v => v > 0).sort((a, b) => a - b)

  if (volumes.length === 0) {
    return 0
  }

  const percentileIndex = Math.floor(volumes.length * percentile)
  return volumes[percentileIndex]
}

/**
 * Calculate rolling thresholds for volume data
 * @param {Array} data - Price data
 * @param {Array} volumeRatios - Volume ratio data
 * @param {number} lookbackWindow - Rolling window size
 * @param {number} percentile80 - Upper percentile (default 0.8)
 * @param {number} percentile20 - Lower percentile (default 0.2)
 * @returns {Object} Object containing threshold80 and threshold20 arrays
 */
export const calculateRollingThresholds = (data, volumeRatios, lookbackWindow, percentile80 = 0.8, percentile20 = 0.2) => {
  const thresholds80 = []
  const thresholds20 = []

  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - lookbackWindow + 1)
    const windowRatios = volumeRatios.slice(windowStart, i + 1).filter(r => r !== null)

    if (windowRatios.length > 0) {
      const sortedRatios = [...windowRatios].sort((a, b) => a - b)
      const idx80 = Math.floor(sortedRatios.length * percentile80)
      const idx20 = Math.floor(sortedRatios.length * percentile20)
      thresholds80.push(sortedRatios[idx80])
      thresholds20.push(sortedRatios[idx20])
    } else {
      thresholds80.push(null)
      thresholds20.push(null)
    }
  }

  return { thresholds80, thresholds20 }
}

/**
 * Calculate touch count for channel boundaries
 * @param {Array} data - Data points
 * @param {number} slope - Channel slope
 * @param {number} intercept - Channel intercept
 * @param {number} channelWidth - Width of channel
 * @param {number} tolerance - Touch tolerance (default 0.05)
 * @returns {number} Number of boundary touches
 */
export const calculateTouchCount = (data, slope, intercept, channelWidth, tolerance = 0.05) => {
  let touchCount = 0

  data.forEach((point, index) => {
    const predictedY = slope * index + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth
    const distanceToUpper = Math.abs(point.close - upperBound)
    const distanceToLower = Math.abs(point.close - lowerBound)
    const boundRange = channelWidth * 2

    if (distanceToUpper <= boundRange * tolerance ||
        distanceToLower <= boundRange * tolerance) {
      touchCount++
    }
  })

  return touchCount
}

/**
 * Get volume lookback window based on time period
 * @param {string} days - Number of days as string
 * @returns {number} Lookback window size
 */
export const getVolumeLookbackWindow = (days) => {
  const daysNum = parseInt(days) || 365
  if (daysNum <= 30) return 10
  if (daysNum <= 90) return 30
  if (daysNum <= 180) return 60
  return 90
}

/**
 * Calculate SMA color based on period
 * @param {number} period - SMA period
 * @returns {string} Color hex code
 */
export const getSmaColor = (period) => {
  const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1']
  const index = [20, 50, 100, 150, 200].indexOf(period)
  return index >= 0 ? colors[index] : colors[colors.length - 1]
}
