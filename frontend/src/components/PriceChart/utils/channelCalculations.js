/**
 * Channel calculation utilities
 * Contains large calculation functions extracted from PriceChart.jsx
 */

/**
 * Get initial lookback period based on days string
 */
export const getInitialLookbackForPeriod = (daysStr) => {
  const daysNum = parseInt(daysStr) || 365

  // 5Y or more = 100
  if (daysNum >= 1825) return 100
  // 3Y = 80
  if (daysNum >= 1095) return 80
  // 1Y = 40
  if (daysNum >= 365) return 40
  // Shorter ranges = 20
  return 20
}

/**
 * Find turning points in data series
 */
export const findTurningPointsForData = (series, windowSize = 3) => {
  const turningPoints = []

  for (let i = windowSize; i < series.length - windowSize; i++) {
    const current = series[i].close
    let isLocalMax = true
    let isLocalMin = true

    for (let j = -windowSize; j <= windowSize; j++) {
      if (j === 0) continue
      const compare = series[i + j].close
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
 */
export const calculateLinearRegression = (segment, startIndex = 0, volumeFilterEnabled = false, validIndices = null) => {
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, n = 0

  segment.forEach((point, index) => {
    const absoluteIndex = startIndex + index
    if (volumeFilterEnabled && validIndices && !validIndices.has(absoluteIndex)) {
      return
    }
    n++
    sumX += index
    sumY += point.close
    sumXY += index * point.close
    sumX2 += index * index
  })

  if (n < 2) {
    return null
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept, n }
}

/**
 * Calculate standard deviation of distances from regression line
 */
export const calculateStdDev = (segment, slope, intercept, startIndex = 0, volumeFilterEnabled = false, validIndices = null) => {
  const distances = []

  segment.forEach((point, index) => {
    const absoluteIndex = startIndex + index
    if (volumeFilterEnabled && validIndices && !validIndices.has(absoluteIndex)) {
      return
    }
    const predictedY = slope * index + intercept
    distances.push(point.close - predictedY)
  })

  if (distances.length === 0) {
    return 0
  }

  const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
  return Math.sqrt(variance)
}

/**
 * Calculate R-squared value for a channel
 */
export const calculateRSquared = (segment, slope, intercept) => {
  if (segment.length === 0) return 0

  const meanY = segment.reduce((sum, p) => sum + p.close, 0) / segment.length
  let ssTotal = 0
  let ssResidual = 0

  segment.forEach((point, index) => {
    const predictedY = slope * index + intercept
    ssTotal += Math.pow(point.close - meanY, 2)
    ssResidual += Math.pow(point.close - predictedY, 2)
  })

  if (ssTotal === 0) return 0
  return 1 - (ssResidual / ssTotal)
}

/**
 * Count touches to turning points for a channel
 */
export const countChannelTouches = (turningPoints, channelStartIndex, slope, intercept, channelWidth, touchTolerance = 0.05) => {
  let touchCount = 0
  const boundRange = channelWidth * 2

  turningPoints.forEach(tp => {
    const localIndex = tp.index - channelStartIndex
    const predictedY = slope * localIndex + intercept
    const upperBound = predictedY + channelWidth
    const lowerBound = predictedY - channelWidth
    const distanceToUpper = Math.abs(tp.value - upperBound)
    const distanceToLower = Math.abs(tp.value - lowerBound)

    // Upper bound: only count local peaks that are above midline
    if (tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance && tp.value >= predictedY) {
      touchCount++
    }
    // Lower bound: only count local dips that are below midline
    else if (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance && tp.value <= predictedY) {
      touchCount++
    }
  })

  return touchCount
}

/**
 * Filter valid indices based on volume threshold
 */
export const getValidVolumeIndices = (data, volumeFilterEnabled, percentile = 0.1) => {
  let validIndices = new Set(data.map((_, idx) => idx))

  if (volumeFilterEnabled) {
    const volumes = data.map(d => d.volume || 0).filter(v => v > 0)
    if (volumes.length > 0) {
      const sortedVolumes = [...volumes].sort((a, b) => a - b)
      const percentileIndex = Math.floor(sortedVolumes.length * percentile)
      const volumeThreshold = sortedVolumes[percentileIndex]

      validIndices = new Set()
      data.forEach((point, idx) => {
        if ((point.volume || 0) > volumeThreshold) {
          validIndices.add(idx)
        }
      })

      // If too many points filtered out, disable filtering
      const minLookback = 20
      if (validIndices.size < minLookback) {
        validIndices = new Set(data.map((_, idx) => idx))
      }
    }
  }

  return validIndices
}
