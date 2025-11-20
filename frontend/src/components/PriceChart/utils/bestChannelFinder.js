/**
 * Best Channel Finder - Simulates different channel parameters to find optimal channels
 * based on touching points (turning points within 5% of channel bounds)
 */

/**
 * Find turning points in the data (local maxima and minima)
 * @param {Array} data - Price data array
 * @param {number} windowSize - Window size for local extrema detection (default 3)
 * @returns {Array} Array of turning points with index, type, and value
 */
export const findTurningPoints = (data, windowSize = 3) => {
  const turningPoints = []

  for (let i = windowSize; i < data.length - windowSize; i++) {
    const current = data[i].close
    let isLocalMax = true
    let isLocalMin = true

    for (let j = -windowSize; j <= windowSize; j++) {
      if (j === 0) continue
      const compare = data[i + j].close
      if (compare >= current) isLocalMax = false
      if (compare <= current) isLocalMin = false
    }

    if (isLocalMax) {
      turningPoints.push({ index: i, type: 'max', value: current })
    } else if (isLocalMin) {
      turningPoints.push({ index: i, type: 'min', value: current })
    }
  }

  return turningPoints
}

/**
 * Calculate linear regression for a data segment
 * @param {Array} data - Data segment
 * @param {number} startIndex - Start index in original data
 * @returns {Object} Regression parameters (slope, intercept, stdDev)
 */
const calculateRegression = (data, startIndex = 0) => {
  if (data.length < 2) return null

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  const n = data.length

  data.forEach((point, index) => {
    const x = startIndex + index
    sumX += x
    sumY += point.close
    sumXY += x * point.close
    sumX2 += x * x
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate standard deviation
  const distances = data.map((point, index) => {
    const x = startIndex + index
    const predictedY = slope * x + intercept
    return point.close - predictedY
  })

  const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  const stdDev = Math.sqrt(variance)

  return { slope, intercept, stdDev }
}

/**
 * Count touching points for a channel
 * @param {Array} turningPoints - Array of turning points
 * @param {number} slope - Channel slope
 * @param {number} intercept - Channel intercept
 * @param {number} channelWidth - Width of channel (stdDev * multiplier)
 * @param {number} tolerance - Touch tolerance (default 0.05 = 5%)
 * @returns {number} Number of touching points
 */
const countTouchingPoints = (turningPoints, slope, intercept, channelWidth, tolerance = 0.05) => {
  let touchCount = 0
  const boundRange = channelWidth * 2

  turningPoints.forEach(tp => {
    const predictedY = slope * tp.index + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth
    const distanceToUpper = Math.abs(tp.value - upperBound)
    const distanceToLower = Math.abs(tp.value - lowerBound)

    // Count touches: maxima touch upper bound, minima touch lower bound
    const touchesUpper = distanceToUpper <= boundRange * tolerance && tp.type === 'max'
    const touchesLower = distanceToLower <= boundRange * tolerance && tp.type === 'min'

    if (touchesUpper || touchesLower) {
      touchCount++
    }
  })

  return touchCount
}

/**
 * Find the best channel(s) by simulating different parameters
 * @param {Array} data - Full price data array
 * @param {Object} options - Simulation options
 * @param {number} options.minStartIndex - Minimum start index
 * @param {number} options.maxStartIndex - Maximum start index
 * @param {number} options.minLength - Minimum channel length
 * @param {number} options.maxLength - Maximum channel length (null = to end of data)
 * @param {number} options.startStep - Step size for start index iteration
 * @param {number} options.lengthStep - Step size for length iteration
 * @param {Array} options.stdevMultipliers - Array of stdev multipliers to try
 * @param {number} options.touchTolerance - Touch tolerance (default 0.05)
 * @param {number} options.similarityThreshold - Threshold for similar touch counts (default 0.9)
 * @returns {Array} Array of best channel configurations
 */
export const findBestChannels = (data, options = {}) => {
  const {
    minStartIndex = 0,
    maxStartIndex = Math.max(0, data.length - 20),
    minLength = 20,
    maxLength = null,
    startStep = 5,
    lengthStep = 5,
    stdevMultipliers = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
    touchTolerance = 0.05,
    similarityThreshold = 0.9
  } = options

  if (!data || data.length < minLength) {
    return []
  }

  // Find all turning points once
  const allTurningPoints = findTurningPoints(data)

  const candidates = []
  let maxTouchCount = 0

  // Simulate different start points
  for (let startIdx = minStartIndex; startIdx <= maxStartIndex; startIdx += startStep) {
    const remainingLength = data.length - startIdx
    if (remainingLength < minLength) continue

    const actualMaxLength = maxLength ? Math.min(maxLength, remainingLength) : remainingLength

    // Simulate different end points (channel lengths)
    for (let length = minLength; length <= actualMaxLength; length += lengthStep) {
      const endIdx = startIdx + length - 1
      if (endIdx >= data.length) continue

      const dataSegment = data.slice(startIdx, endIdx + 1)
      const regression = calculateRegression(dataSegment, startIdx)

      if (!regression) continue

      const { slope, intercept, stdDev } = regression

      // Get turning points within this segment
      const segmentTurningPoints = allTurningPoints.filter(
        tp => tp.index >= startIdx && tp.index <= endIdx
      )

      if (segmentTurningPoints.length === 0) continue

      // Try different stdev multipliers
      for (const stdevMult of stdevMultipliers) {
        const channelWidth = stdDev * stdevMult

        // Count touching points
        const touchCount = countTouchingPoints(
          segmentTurningPoints,
          slope,
          intercept,
          channelWidth,
          touchTolerance
        )

        if (touchCount > 0) {
          candidates.push({
            startIndex: startIdx,
            endIndex: endIdx,
            slope,
            intercept,
            channelWidth,
            stdDev,
            stdevMultiplier: stdevMult,
            touchCount,
            turningPointsCount: segmentTurningPoints.length,
            length
          })

          maxTouchCount = Math.max(maxTouchCount, touchCount)
        }
      }
    }
  }

  if (candidates.length === 0) {
    return []
  }

  // Find channels with touch counts close to the maximum
  const threshold = Math.floor(maxTouchCount * similarityThreshold)
  const bestChannels = candidates.filter(c => c.touchCount >= threshold)

  // Sort by touch count (descending), then by length (descending)
  bestChannels.sort((a, b) => {
    if (b.touchCount !== a.touchCount) {
      return b.touchCount - a.touchCount
    }
    return b.length - a.length
  })

  return bestChannels
}

/**
 * Filter overlapping channels to show only the most distinct ones
 * @param {Array} channels - Array of channel configurations
 * @param {number} overlapThreshold - Max allowed overlap ratio (default 0.5)
 * @returns {Array} Filtered array of non-overlapping channels
 */
export const filterOverlappingChannels = (channels, overlapThreshold = 0.5) => {
  if (channels.length <= 1) return channels

  const filtered = [channels[0]] // Always include the best one

  for (let i = 1; i < channels.length; i++) {
    const candidate = channels[i]
    let hasSignificantOverlap = false

    for (const existing of filtered) {
      // Calculate overlap
      const overlapStart = Math.max(candidate.startIndex, existing.startIndex)
      const overlapEnd = Math.min(candidate.endIndex, existing.endIndex)
      const overlap = Math.max(0, overlapEnd - overlapStart + 1)

      const candidateLength = candidate.endIndex - candidate.startIndex + 1
      const overlapRatio = overlap / candidateLength

      if (overlapRatio > overlapThreshold) {
        hasSignificantOverlap = true
        break
      }
    }

    if (!hasSignificantOverlap) {
      filtered.push(candidate)
    }
  }

  return filtered
}
