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
 * @param {Set} validIndices - Optional set of valid indices to include (for volume filtering)
 * @returns {Object} Regression parameters (slope, intercept, stdDev)
 */
const calculateRegression = (data, startIndex = 0, validIndices = null) => {
  if (data.length < 2) return null

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  let n = 0

  data.forEach((point, index) => {
    const x = startIndex + index
    // Skip points filtered out by volume if validIndices is provided
    if (validIndices && !validIndices.has(x)) {
      return
    }
    n++
    sumX += x
    sumY += point.close
    sumXY += x * point.close
    sumX2 += x * x
  })

  if (n < 2) return null

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate standard deviation (only for valid points)
  const distances = []
  data.forEach((point, index) => {
    const x = startIndex + index
    // Skip points filtered out by volume if validIndices is provided
    if (validIndices && !validIndices.has(x)) {
      return
    }
    const predictedY = slope * x + intercept
    distances.push(point.close - predictedY)
  })

  if (distances.length === 0) return null

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

    // Count touches: maxima touch upper bound (and must be above midline)
    // minima touch lower bound (and must be below midline)
    const touchesUpper = distanceToUpper <= boundRange * tolerance && tp.type === 'max' && tp.value >= predictedY
    const touchesLower = distanceToLower <= boundRange * tolerance && tp.type === 'min' && tp.value <= predictedY

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
 * @param {boolean} options.volumeFilterEnabled - If true, ignore data points with bottom 10% volume
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
    similarityThreshold = 0.9,
    volumeFilterEnabled = false
  } = options

  if (!data || data.length < minLength) {
    return []
  }

  // Filter data by volume if enabled
  let filteredData = data
  let validIndices = new Set(data.map((_, idx) => idx)) // Track which indices are valid

  if (volumeFilterEnabled) {
    // Calculate the 10th percentile volume threshold
    const volumes = data.map(d => d.volume || 0).filter(v => v > 0)
    if (volumes.length > 0) {
      const sortedVolumes = [...volumes].sort((a, b) => a - b)
      const percentile10Index = Math.floor(sortedVolumes.length * 0.1)
      const volumeThreshold = sortedVolumes[percentile10Index]

      // Create a set of valid indices (those with volume above threshold)
      validIndices = new Set()
      data.forEach((point, idx) => {
        if ((point.volume || 0) > volumeThreshold) {
          validIndices.add(idx)
        }
      })

      // If too many points filtered out, disable filtering
      if (validIndices.size < minLength) {
        validIndices = new Set(data.map((_, idx) => idx))
      }
    }
  }

  // Find all turning points once (using all data, but we'll filter later)
  const allTurningPoints = findTurningPoints(data)

  // Filter turning points to only include valid indices
  const filteredTurningPoints = volumeFilterEnabled
    ? allTurningPoints.filter(tp => validIndices.has(tp.index))
    : allTurningPoints

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
      const regression = calculateRegression(
        dataSegment,
        startIdx,
        volumeFilterEnabled ? validIndices : null
      )

      if (!regression) continue

      const { slope, intercept, stdDev } = regression

      // Get turning points within this segment (filtered by volume if enabled)
      const segmentTurningPoints = filteredTurningPoints.filter(
        tp => tp.index >= startIdx && tp.index <= endIdx
      )

      if (segmentTurningPoints.length === 0) continue

      // Try different stdev multipliers
      for (const stdevMult of stdevMultipliers) {
        const channelWidth = stdDev * stdevMult
        const boundRange = channelWidth * 2
        const outsideTolerance = boundRange * touchTolerance

        // Check if at most 10% of points are outside bounds (allowing 90% inside)
        // Points within 5% tolerance of bounds are considered inside
        // When volume filter is enabled, only count points with valid volume
        let pointsOutside = 0
        let pointsConsidered = 0
        dataSegment.forEach((point, index) => {
          const x = startIdx + index

          // Skip points filtered out by volume if enabled
          if (volumeFilterEnabled && !validIndices.has(x)) {
            return
          }

          pointsConsidered++
          const predictedY = slope * x + intercept
          const upperBound = predictedY + channelWidth
          const lowerBound = predictedY - channelWidth

          // Point is outside if it's beyond the bounds AND beyond the 5% tolerance
          const isOutsideUpper = point.close > upperBound && (point.close - upperBound) > outsideTolerance
          const isOutsideLower = point.close < lowerBound && (lowerBound - point.close) > outsideTolerance

          if (isOutsideUpper || isOutsideLower) {
            pointsOutside++
          }
        })

        // Skip if no points were considered
        if (pointsConsidered === 0) continue

        const percentOutside = pointsOutside / (volumeFilterEnabled ? pointsConsidered : dataSegment.length)

        // Only consider channels where at most 10% of data is outside bounds
        if (percentOutside > 0.1) continue

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
            percentWithinBounds: 1 - percentOutside,
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
