/**
 * Channel calculation functions for price trend analysis.
 * These functions implement linear regression-based channel detection with automatic
 * optimization of channel parameters.
 */

/**
 * Calculates a slope-based channel for price data using linear regression.
 * The function automatically optimizes lookback period and standard deviation multiplier
 * to find the best-fitting channel, or uses stored parameters if provided.
 *
 * @param {Array} data - Array of price data points (newest-first order), each with { close, volume } properties
 * @param {boolean} useStoredParams - If true, uses stored optimized parameters instead of recalculating
 * @param {boolean} volumeWeighted - If true, filters out low-volume data points (below 20th percentile)
 * @param {number|null} optimizedLookbackCount - Stored lookback count from previous optimization
 * @param {number|null} optimizedStdevMult - Stored standard deviation multiplier from previous optimization
 * @param {Function} setOptimizedLookbackCount - Setter function to persist optimized lookback count
 * @param {Function} setOptimizedStdevMult - Setter function to persist optimized stdev multiplier
 * @returns {Object|null} Channel data including channelData array, slope, intercept, statistics, or null if insufficient data
 */
export const calculateSlopeChannel = (
  data,
  useStoredParams = true,
  volumeWeighted = false,
  optimizedLookbackCount = null,
  optimizedStdevMult = null,
  setOptimizedLookbackCount = () => {},
  setOptimizedStdevMult = () => {}
) => {
  if (!data || data.length < 10) return null

  // Calculate volume threshold (20th percentile) if volume weighting is enabled
  let volumeThreshold = 0
  if (volumeWeighted) {
    const volumes = data.map(d => d.volume || 0).filter(v => v > 0).sort((a, b) => a - b)
    if (volumes.length > 0) {
      const percentileIndex = Math.floor(volumes.length * 0.2)
      volumeThreshold = volumes[percentileIndex]
    }
  }

  // Helper function to check if a point should be included based on volume
  const shouldIncludePoint = (point) => {
    if (!volumeWeighted) return true
    return (point.volume || 0) > volumeThreshold
  }

  let recentDataCount, optimalStdevMult, touchCount

  // Use stored parameters if available and requested, otherwise optimize
  if (useStoredParams && optimizedLookbackCount !== null && optimizedStdevMult !== null) {
    // Use stored absolute values (keeps channel same across period changes)
    recentDataCount = Math.min(optimizedLookbackCount, data.length)
    optimalStdevMult = optimizedStdevMult
    // touchCount will be calculated after regression
  } else {
    // Run optimization to find best parameters with trend-breaking logic
    const findBestChannel = (startingLookback = null) => {
    // If user manually set a lookback, use it as starting point; otherwise use 100
    const defaultMinPoints = Math.min(100, data.length)
    const minPoints = startingLookback ? Math.min(startingLookback, data.length) : defaultMinPoints
    const maxPoints = data.length // Always test up to 100% of available data

    // Test stdev multipliers from 1 to 4 with 0.1 increments for finer control
    const stdevMultipliers = []
    for (let mult = 1.0; mult <= 4.0; mult += 0.1) {
      stdevMultipliers.push(mult)
    }

    const maxOutsidePercent = 0.05 // 5% maximum outside threshold
    const trendBreakThreshold = 0.5 // Break if >50% of new data is outside

    // Start with minimum lookback and try to extend
    let currentCount = minPoints
    let currentStdevMult = 2.5
    let currentTouchCount = 0
    let channelBroken = false

    // Helper function to find optimal stdev for a given dataset
    const findOptimalStdev = (includedPoints, slope, intercept, stdDev) => {
      for (const stdevMult of stdevMultipliers) {
        const channelWidth = stdDev * stdevMult
        let outsideCount = 0
        let touchCount = 0
        const touchTolerance = 0.05
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

        // If this meets criteria, return it (first valid one = minimum stdev)
        if (outsidePercent <= maxOutsidePercent) {
          return { stdevMult, touchCount, valid: true }
        }
      }

      return { stdevMult: 2.5, touchCount: 0, valid: false }
    }

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
    const initialResult = findOptimalStdev(includedPoints, slope, intercept, stdDev)
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

      let pointsOutside = 0
      newDataPoints.forEach(({ point, originalIndex }) => {
        const predictedY = slope * originalIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        if (point.close > upperBound || point.close < lowerBound) {
          pointsOutside++
        }
      })

      // If most of the new data is outside, break the trend
      if (newDataPoints.length > 0 && pointsOutside / newDataPoints.length > trendBreakThreshold) {
        channelBroken = true
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
      const extendedResult = findOptimalStdev(includedPoints, slope, intercept, stdDev)
      if (!extendedResult.valid) {
        // Can't find valid channel with extended data, stop here
        channelBroken = true
        break
      }

      // Update current best parameters
      currentCount = count
      currentStdevMult = extendedResult.stdevMult
      currentTouchCount = extendedResult.touchCount
    }

    return { count: currentCount, stdevMultiplier: currentStdevMult, touches: currentTouchCount }
    }

    // Find best channel parameters (lookback count and stdev multiplier)
    // Use current lookback as starting point if user manually adjusted it
    const bestChannelParams = findBestChannel(optimizedLookbackCount)
    recentDataCount = bestChannelParams.count
    optimalStdevMult = bestChannelParams.stdevMultiplier
    touchCount = bestChannelParams.touches

    // Store the optimized parameters for future use (persist across period changes)
    setOptimizedLookbackCount(recentDataCount)
    setOptimizedStdevMult(optimalStdevMult)
  }

  // Use first N data points (data is NEWEST-FIRST, so first N = most recent N)
  const recentData = data.slice(0, recentDataCount)

  // Calculate linear regression (best fit line) for the selected lookback period
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
  let intercept = (sumY - slope * sumX) / n

  // Calculate distances from regression line to find channel bounds
  const distances = recentData.map((point, index) => {
    const predictedY = slope * index + intercept
    return point.close - predictedY
  })

  // Use standard deviation to determine channel width
  const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  const stdDev = Math.sqrt(variance)

  // Use the optimal stdev multiplier found by the best-fit algorithm
  let channelWidth = stdDev * optimalStdevMult

  // Calculate channel lines ONLY for the recent data period (lookback window)
  // Data is NEWEST-FIRST, so first N indices are most recent
  const channelData = data.map((point, globalIndex) => {
    // Only calculate channel for the recent lookback period (first N points)
    if (globalIndex >= recentDataCount) {
      return null // No channel for older historical data
    }

    // globalIndex already represents position in recent data (0 = most recent)
    const midValue = slope * globalIndex + intercept
    return {
      upper: midValue + channelWidth,
      mid: midValue,
      lower: midValue - channelWidth
    }
  })

  // Calculate final distribution for display
  let finalCountAbove = 0
  let finalCountBelow = 0
  let finalCountOutside = 0
  recentData.forEach((point, index) => {
    const predictedY = slope * index + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth

    if (point.close > predictedY) finalCountAbove++
    else if (point.close < predictedY) finalCountBelow++

    // Count points outside the channel
    if (point.close > upperBound || point.close < lowerBound) {
      finalCountOutside++
    }
  })

  // Calculate R² for the final channel
  const meanY = recentData.reduce((sum, p) => sum + p.close, 0) / n
  let ssTotal = 0
  let ssResidual = 0

  recentData.forEach((point, index) => {
    const predictedY = slope * index + intercept
    ssTotal += Math.pow(point.close - meanY, 2)
    ssResidual += Math.pow(point.close - predictedY, 2)
  })

  const rSquared = 1 - (ssResidual / ssTotal)

  // Calculate touch count if not already set (happens when using stored params)
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

/**
 * Finds all distinct channels in the price data by segmenting the data into
 * consecutive trend periods. Starts from the most recent data and extends backward,
 * breaking when a trend changes significantly.
 *
 * @param {Array} data - Array of price data points (newest-first order), each with { close } property
 * @returns {Array} Array of channel objects, each containing:
 *   - startIndex: Starting index in the data array
 *   - endIndex: Ending index in the data array
 *   - slope: Linear regression slope
 *   - intercept: Linear regression intercept
 *   - channelWidth: Width of the channel (stdev * multiplier)
 *   - stdDev: Standard deviation of prices from regression line
 *   - optimalStdevMult: Optimal standard deviation multiplier used
 *   - lookbackCount: Number of data points in this channel
 *   - rSquared: R² value indicating fit quality
 *   - touchCount: Number of points touching channel boundaries
 */
export const findAllChannels = (data) => {
  if (!data || data.length < 20) return []

  const channels = []
  let currentStartIndex = 0
  const minLookback = 20

  while (currentStartIndex < data.length - minLookback) {
    // Find optimal channel starting from currentStartIndex
    const remainingData = data.slice(currentStartIndex)

    if (remainingData.length < minLookback) break

    // Start with minimum lookback and try to extend
    let lookbackCount = minLookback
    let optimalStdevMult = 2.5
    let channelBroken = false
    let breakIndex = currentStartIndex + lookbackCount

    // First, find the optimal stddev for the initial lookback period
    const findOptimalStdev = (dataSegment) => {
      const stdevMultipliers = []
      for (let mult = 1.0; mult <= 4.0; mult += 0.25) {
        stdevMultipliers.push(mult)
      }

      // Calculate regression
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
      const n = dataSegment.length

      dataSegment.forEach((point, index) => {
        sumX += index
        sumY += point.close
        sumXY += index * point.close
        sumX2 += index * index
      })

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const intercept = (sumY - slope * sumX) / n

      // Calculate standard deviation
      const distances = dataSegment.map((point, index) => {
        const predictedY = slope * index + intercept
        return point.close - predictedY
      })

      const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
      const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
      const stdDev = Math.sqrt(variance)

      // Find best stdev multiplier based on boundary touches
      let bestTouchCount = 0
      let bestStdevMult = 2.5

      for (const stdevMult of stdevMultipliers) {
        const channelWidth = stdDev * stdevMult
        let touchCount = 0
        const touchTolerance = 0.05
        let hasUpperTouch = false
        let hasLowerTouch = false
        let pointsWithinBounds = 0

        dataSegment.forEach((point, index) => {
          const predictedY = slope * index + intercept
          const upperBound = predictedY + channelWidth
          const lowerBound = predictedY - channelWidth

          const distanceToUpper = Math.abs(point.close - upperBound)
          const distanceToLower = Math.abs(point.close - lowerBound)

          // Touch tolerance: 5% of the boundary value itself (looser definition)
          const upperTolerance = Math.abs(upperBound * touchTolerance)
          const lowerTolerance = Math.abs(lowerBound * touchTolerance)

          // Check if point is within bounds
          if (point.close >= lowerBound && point.close <= upperBound) {
            pointsWithinBounds++
          }

          // Check for boundary touches - within 5% of boundary value
          if (distanceToUpper <= upperTolerance) {
            touchCount++
            hasUpperTouch = true
          }
          if (distanceToLower <= lowerTolerance) {
            touchCount++
            hasLowerTouch = true
          }
        })

        // Calculate percentage of points within bounds
        const percentWithinBounds = pointsWithinBounds / dataSegment.length

        // Must meet ALL criteria:
        // 1. At least one touch on upper or lower bound
        // 2. At least 80% of data points within the channel
        // 3. More touches than previous best (for tie-breaking)
        if ((hasUpperTouch || hasLowerTouch) &&
            percentWithinBounds >= 0.8 &&
            touchCount > bestTouchCount) {
          bestTouchCount = touchCount
          bestStdevMult = stdevMult
        }
      }

      return { slope, intercept, stdDev, optimalStdevMult: bestStdevMult }
    }

    // Optimize initial channel
    let initialSegment = remainingData.slice(0, lookbackCount)
    let channelParams = findOptimalStdev(initialSegment)
    let { slope, intercept, stdDev, optimalStdevMult: currentStdevMult } = channelParams

    optimalStdevMult = currentStdevMult

    // Try to extend the lookback period
    while (lookbackCount < remainingData.length) {
      const previousLookback = lookbackCount
      const previous80Percent = Math.floor(previousLookback * 0.8)
      const first20Percent = previousLookback - previous80Percent

      // Try to extend by adding more data
      lookbackCount++
      const extendedSegment = remainingData.slice(0, lookbackCount)

      // Check if the newly added first 20% of data (going backward) stays within the channel
      // defined by the previous 80%
      const newPoints = extendedSegment.slice(previous80Percent, lookbackCount)

      // Use previous channel parameters to check
      const channelWidth = stdDev * optimalStdevMult
      let pointsOutside = 0

      newPoints.forEach((point, index) => {
        const globalIndex = previous80Percent + index
        const predictedY = slope * globalIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        if (point.close > upperBound || point.close < lowerBound) {
          pointsOutside++
        }
      })

      // If most of the new 20% points are outside, break the trend
      if (newPoints.length > 0 && pointsOutside / newPoints.length > 0.5) {
        channelBroken = true
        breakIndex = currentStartIndex + previousLookback
        lookbackCount = previousLookback
        break
      }

      // Update channel parameters with extended data
      channelParams = findOptimalStdev(extendedSegment)
      slope = channelParams.slope
      intercept = channelParams.intercept
      stdDev = channelParams.stdDev
      optimalStdevMult = channelParams.optimalStdevMult
    }

    // Store this channel
    const channelSegment = remainingData.slice(0, lookbackCount)
    const channelWidth = stdDev * optimalStdevMult

    // Calculate R²
    const meanY = channelSegment.reduce((sum, p) => sum + p.close, 0) / channelSegment.length
    let ssTotal = 0
    let ssResidual = 0

    channelSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      ssTotal += Math.pow(point.close - meanY, 2)
      ssResidual += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = 1 - (ssResidual / ssTotal)

    // Count touches
    let touchCount = 0
    const touchTolerance = 0.05

    channelSegment.forEach((point, index) => {
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

    channels.push({
      startIndex: currentStartIndex,
      endIndex: currentStartIndex + lookbackCount,
      slope,
      intercept,
      channelWidth,
      stdDev,
      optimalStdevMult,
      lookbackCount,
      rSquared,
      touchCount
    })

    // Move to next segment: start from the break point
    if (channelBroken) {
      // Next channel starts where this one broke
      currentStartIndex = breakIndex
    } else {
      // Channel extended to the end of data, stop
      break
    }
  }

  return channels
}

/**
 * Finds all distinct channels in the price data starting from the oldest data
 * and extending forward (reversed direction). This provides an alternative
 * segmentation useful for comparing with forward-looking channels.
 *
 * @param {Array} data - Array of price data points (newest-first order), each with { close } property
 * @returns {Array} Array of channel objects, each containing:
 *   - startIndex: Starting index in the data array
 *   - endIndex: Ending index in the data array
 *   - slope: Linear regression slope
 *   - intercept: Linear regression intercept
 *   - channelWidth: Width of the channel (stdev * multiplier)
 *   - stdDev: Standard deviation of prices from regression line
 *   - optimalStdevMult: Optimal standard deviation multiplier used
 *   - lookbackCount: Number of data points in this channel
 *   - rSquared: R² value indicating fit quality
 *   - touchCount: Number of points touching channel boundaries
 */
export const findAllChannelsReversed = (data) => {
  if (!data || data.length < 20) return []

  const channels = []
  let currentEndIndex = data.length - 1 // Start from the most recent point (rightmost)
  const minLookback = 20

  while (currentEndIndex >= minLookback - 1) {
    // Find optimal channel ending at currentEndIndex
    const currentStartIndex = Math.max(0, currentEndIndex - data.length + 1)
    const remainingData = data.slice(currentStartIndex, currentEndIndex + 1)

    if (remainingData.length < minLookback) break

    // Start with minimum lookback and try to extend backward
    let lookbackCount = minLookback
    let optimalStdevMult = 2.5
    let channelBroken = false
    let breakIndex = currentEndIndex - lookbackCount

    // First, find the optimal stddev for the initial lookback period
    const findOptimalStdev = (dataSegment) => {
      const stdevMultipliers = []
      for (let mult = 1.0; mult <= 4.0; mult += 0.25) {
        stdevMultipliers.push(mult)
      }

      // Calculate regression
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
      const n = dataSegment.length

      dataSegment.forEach((point, index) => {
        sumX += index
        sumY += point.close
        sumXY += index * point.close
        sumX2 += index * index
      })

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const intercept = (sumY - slope * sumX) / n

      // Calculate standard deviation
      const distances = dataSegment.map((point, index) => {
        const predictedY = slope * index + intercept
        return point.close - predictedY
      })

      const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
      const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
      const stdDev = Math.sqrt(variance)

      // Find best stdev multiplier based on boundary touches
      let bestTouchCount = 0
      let bestStdevMult = 2.5

      for (const stdevMult of stdevMultipliers) {
        const channelWidth = stdDev * stdevMult
        let touchCount = 0
        const touchTolerance = 0.05
        let hasUpperTouch = false
        let hasLowerTouch = false
        let pointsWithinBounds = 0

        dataSegment.forEach((point, index) => {
          const predictedY = slope * index + intercept
          const upperBound = predictedY + channelWidth
          const lowerBound = predictedY - channelWidth

          const distanceToUpper = Math.abs(point.close - upperBound)
          const distanceToLower = Math.abs(point.close - lowerBound)

          // Touch tolerance: 5% of the boundary value itself (looser definition)
          const upperTolerance = Math.abs(upperBound * touchTolerance)
          const lowerTolerance = Math.abs(lowerBound * touchTolerance)

          // Check if point is within bounds
          if (point.close >= lowerBound && point.close <= upperBound) {
            pointsWithinBounds++
          }

          // Check for boundary touches - within 5% of boundary value
          if (distanceToUpper <= upperTolerance) {
            touchCount++
            hasUpperTouch = true
          }
          if (distanceToLower <= lowerTolerance) {
            touchCount++
            hasLowerTouch = true
          }
        })

        // Calculate percentage of points within bounds
        const percentWithinBounds = pointsWithinBounds / dataSegment.length

        // Must meet ALL criteria:
        // 1. At least one touch on upper or lower bound
        // 2. At least 80% of data points within the channel
        // 3. More touches than previous best (for tie-breaking)
        if ((hasUpperTouch || hasLowerTouch) &&
            percentWithinBounds >= 0.8 &&
            touchCount > bestTouchCount) {
          bestTouchCount = touchCount
          bestStdevMult = stdevMult
        }
      }

      return { slope, intercept, stdDev, optimalStdevMult: bestStdevMult }
    }

    // Optimize initial channel (most recent points)
    let initialSegment = remainingData.slice(-lookbackCount)
    let channelParams = findOptimalStdev(initialSegment)
    let { slope, intercept, stdDev, optimalStdevMult: currentStdevMult } = channelParams

    optimalStdevMult = currentStdevMult

    // Try to extend the lookback period backward
    while (lookbackCount < remainingData.length) {
      const previousLookback = lookbackCount
      const previous80Percent = Math.floor(previousLookback * 0.8)
      const first20Percent = previousLookback - previous80Percent

      // Try to extend by adding more data backward
      lookbackCount++
      const extendedSegment = remainingData.slice(-lookbackCount)

      // Check if the newly added first 20% of data (going backward) stays within the channel
      const newPointsStartIdx = remainingData.length - lookbackCount
      const newPointsEndIdx = newPointsStartIdx + (lookbackCount - previous80Percent)
      const newPoints = remainingData.slice(newPointsStartIdx, newPointsEndIdx)

      // Use previous channel parameters to check
      const channelWidth = stdDev * optimalStdevMult
      let pointsOutside = 0

      newPoints.forEach((point, index) => {
        const globalIndex = index
        const predictedY = slope * globalIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        if (point.close > upperBound || point.close < lowerBound) {
          pointsOutside++
        }
      })

      // If most of the new 20% points are outside, break the trend
      if (newPoints.length > 0 && pointsOutside / newPoints.length > 0.5) {
        channelBroken = true
        breakIndex = currentEndIndex - previousLookback
        lookbackCount = previousLookback
        break
      }

      // Update channel parameters with extended data
      channelParams = findOptimalStdev(extendedSegment)
      slope = channelParams.slope
      intercept = channelParams.intercept
      stdDev = channelParams.stdDev
      optimalStdevMult = channelParams.optimalStdevMult
    }

    // Store this channel
    const channelSegment = remainingData.slice(-lookbackCount)
    const channelWidth = stdDev * optimalStdevMult

    // Calculate R²
    const meanY = channelSegment.reduce((sum, p) => sum + p.close, 0) / channelSegment.length
    let ssTotal = 0
    let ssResidual = 0

    channelSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      ssTotal += Math.pow(point.close - meanY, 2)
      ssResidual += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = 1 - (ssResidual / ssTotal)

    // Count touches
    let touchCount = 0
    const touchTolerance = 0.05

    channelSegment.forEach((point, index) => {
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

    const actualStartIndex = currentEndIndex - lookbackCount + 1

    channels.push({
      startIndex: actualStartIndex,
      endIndex: currentEndIndex + 1,
      slope,
      intercept,
      channelWidth,
      stdDev,
      optimalStdevMult,
      lookbackCount,
      rSquared,
      touchCount
    })

    // Move to next segment: start from the break point
    if (channelBroken) {
      // Next channel ends where this one broke
      currentEndIndex = breakIndex - 1
    } else {
      // Channel extended to the start of data, stop
      break
    }
  }

  return channels
}
