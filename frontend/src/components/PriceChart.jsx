import React, { useState, useRef, useEffect } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Customized } from 'recharts'
import { X } from 'lucide-react'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, slopeChannelEnabled = false, slopeChannelVolumeWeighted = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, findAllChannelEnabled = false, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
  const chartContainerRef = useRef(null)
  const [controlsVisible, setControlsVisible] = useState(false)

  // Store ABSOLUTE optimized parameters (not percentages) so they persist across period changes
  const [optimizedLookbackCount, setOptimizedLookbackCount] = useState(null)
  const [optimizedStdevMult, setOptimizedStdevMult] = useState(null)

  // Store all found channels
  const [allChannels, setAllChannels] = useState([])
  const [allChannelsVisibility, setAllChannelsVisibility] = useState({})

  // Track main trend channel visibility
  const [trendChannelVisible, setTrendChannelVisible] = useState(true)

  // Note: Zoom reset is handled by parent (StockAnalyzer) when time period changes
  // No need to reset here to avoid infinite loop

  // Reset optimized parameters when volume weighted mode changes
  useEffect(() => {
    setOptimizedLookbackCount(null)
    setOptimizedStdevMult(null)
  }, [slopeChannelVolumeWeighted])

  // Calculate SMA for a given period
  const calculateSMA = (data, period) => {
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

  // Pre-calculate all SMAs
  const smaCache = {}
  smaPeriods.forEach(period => {
    smaCache[period] = calculateSMA(prices, period)
  })

  // Calculate Slope Channel using linear regression
  // If useStoredParams is true and we have stored params, use them; otherwise optimize
  const calculateSlopeChannel = (data, useStoredParams = true, volumeWeighted = false) => {
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
      const trendBreakThreshold = 1.0 // Break if >100% of new data is outside

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

  // Find all channels in the data
  const findAllChannels = (data) => {
    if (!data || data.length < 20) return []

    const channels = []
    const maxChannels = 5
    let currentStartIndex = 0
    const minLookback = 20

    while (channels.length < maxChannels && currentStartIndex < data.length - minLookback) {
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

          dataSegment.forEach((point, index) => {
            const predictedY = slope * index + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth

            const distanceToUpper = Math.abs(point.close - upperBound)
            const distanceToLower = Math.abs(point.close - lowerBound)
            const boundRange = channelWidth * 2

            if (distanceToUpper <= boundRange * touchTolerance) {
              touchCount++
              hasUpperTouch = true
            }
            if (distanceToLower <= boundRange * touchTolerance) {
              touchCount++
              hasLowerTouch = true
            }
          })

          // Must have at least one touch on upper or lower bound
          if ((hasUpperTouch || hasLowerTouch) && touchCount > bestTouchCount) {
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
          const globalIndex = previous90Percent + index
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

  // Effect to calculate all channels when findAllChannelEnabled changes
  useEffect(() => {
    if (findAllChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const foundChannels = findAllChannels(displayPrices)
      setAllChannels(foundChannels)

      // Initialize visibility for all channels (all visible by default)
      const visibility = {}
      foundChannels.forEach((_, index) => {
        visibility[index] = true
      })
      setAllChannelsVisibility(visibility)
    } else {
      setAllChannels([])
      setAllChannelsVisibility({})
    }
  }, [findAllChannelEnabled, prices, indicators])

  // Calculate volume-weighted zone colors
  const calculateZoneColors = (data, channelInfo, numZones) => {
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

  // Combine data - ensure we use the minimum length to stay in sync with indicators
  const dataLength = Math.min(prices.length, indicators.length)

  // Calculate slope channel ONLY on the data that will be displayed
  // This prevents mismatch when period changes and indicators haven't updated yet
  const displayPrices = prices.slice(0, dataLength)
  const slopeChannelInfo = slopeChannelEnabled ? calculateSlopeChannel(displayPrices, true, slopeChannelVolumeWeighted) : null
  const zoneColors = slopeChannelEnabled && slopeChannelInfo
    ? calculateZoneColors(displayPrices, slopeChannelInfo, slopeChannelZones)
    : []

  const chartData = displayPrices.map((price, index) => {
    const indicator = indicators[index] || {}
    const dataPoint = {
      date: price.date,
      close: price.close,
    }

    // Add SMA data for each period
    smaPeriods.forEach(period => {
      const smaKey = `sma${period}`
      // Try backend data first, fall back to frontend calculation
      dataPoint[smaKey] = indicator[smaKey] || smaCache[period][index]
    })

    // Add slope channel data if enabled
    if (slopeChannelInfo && slopeChannelInfo.channelData[index]) {
      const channel = slopeChannelInfo.channelData[index]
      dataPoint.channelUpper = channel.upper
      dataPoint.channelMid = channel.mid
      dataPoint.channelLower = channel.lower
    }

    // Add all channels data if enabled
    if (findAllChannelEnabled && allChannels.length > 0) {
      allChannels.forEach((channel, channelIndex) => {
        // Check if this index is within this channel's range
        if (index >= channel.startIndex && index < channel.endIndex) {
          const localIndex = index - channel.startIndex
          const midValue = channel.slope * localIndex + channel.intercept
          dataPoint[`allChannel${channelIndex}Upper`] = midValue + channel.channelWidth
          dataPoint[`allChannel${channelIndex}Mid`] = midValue
          dataPoint[`allChannel${channelIndex}Lower`] = midValue - channel.channelWidth
        }
      })
    }

    return dataPoint
  }).reverse() // Show oldest to newest

  // Apply zoom range to chart data
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // Handle mouse wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault()
    if (!onZoomChange) return

    const delta = e.deltaY
    const zoomFactor = 0.1 // 10% zoom per scroll
    const currentRange = endIndex - zoomRange.start
    const zoomAmount = Math.max(1, Math.floor(currentRange * zoomFactor))

    if (delta < 0) {
      // Scroll up - Zoom in (show less data)
      const newRange = Math.max(10, currentRange - zoomAmount)
      const reduction = currentRange - newRange
      const newStart = Math.min(chartData.length - newRange, zoomRange.start + Math.floor(reduction / 2))
      const newEnd = Math.min(chartData.length, newStart + newRange)
      onZoomChange({ start: newStart, end: newEnd })
    } else {
      // Scroll down - Zoom out (show more data)
      // Check if already at full zoom with a small tolerance
      const isAtStart = zoomRange.start === 0
      const isAtEnd = zoomRange.end === null || Math.abs(zoomRange.end - chartData.length) <= 1
      const isFullyZoomedOut = isAtStart && isAtEnd && currentRange >= chartData.length - 2

      if (isFullyZoomedOut && onExtendPeriod) {
        // Only extend if we're truly showing all available data
        onExtendPeriod()
      } else {
        const newRange = Math.min(chartData.length, currentRange + zoomAmount)
        const expansion = newRange - currentRange
        const newStart = Math.max(0, zoomRange.start - Math.floor(expansion / 2))
        const newEnd = Math.min(chartData.length, newStart + newRange)

        // If we've reached full view, set end to null
        if (newStart === 0 && newEnd === chartData.length) {
          onZoomChange({ start: 0, end: null })
        } else {
          onZoomChange({ start: newStart, end: newEnd })
        }
      }
    }
  }

  // Add wheel event listener
  useEffect(() => {
    const chartElement = chartContainerRef.current
    if (chartElement) {
      chartElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        chartElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [zoomRange, chartData.length])

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-slate-800 p-3 border border-slate-600 rounded shadow-lg">
          <p className="font-semibold text-slate-100">{data.date}</p>
          <p className="text-sm text-slate-300">Close: ${data.close?.toFixed(2)}</p>
          {smaPeriods.map(period => {
            const smaKey = `sma${period}`
            const smaValue = data[smaKey]
            if (smaValue && smaVisibility[period]) {
              return (
                <p key={period} className="text-sm" style={{ color: getSmaColor(period) }}>
                  SMA{period}: ${smaValue.toFixed(2)}
                </p>
              )
            }
            return null
          })}
        </div>
      )
    }
    return null
  }

  const getSmaColor = (period) => {
    const colors = ['#3b82f6', '#f97316', '#10b981', '#f59e0b', '#ec4899']
    const index = smaPeriods.indexOf(period) % colors.length
    return colors[index]
  }

  const handleMouseMove = (e) => {
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
  }

  // Pre-calculate which dates represent month/year transitions
  const getTransitionDates = () => {
    const isLongPeriod = parseInt(days) >= 1095 // 3Y or more
    const transitions = new Set()

    for (let i = 1; i < visibleChartData.length; i++) {
      const current = new Date(visibleChartData[i].date)
      const previous = new Date(visibleChartData[i - 1].date)

      if (isLongPeriod) {
        // Mark year transitions
        if (current.getFullYear() !== previous.getFullYear()) {
          transitions.add(visibleChartData[i].date)
        }
      } else {
        // Mark month transitions
        if (current.getMonth() !== previous.getMonth() || current.getFullYear() !== previous.getFullYear()) {
          transitions.add(visibleChartData[i].date)
        }
      }
    }

    return transitions
  }

  const transitionDates = getTransitionDates()
  const isLongPeriod = parseInt(days) >= 1095

  const CustomXAxisTick = ({ x, y, payload }) => {
    const currentDate = payload.value
    let color = '#94a3b8' // Default color

    if (transitionDates.has(currentDate)) {
      color = isLongPeriod ? '#3b82f6' : '#10b981' // Blue for year, green for month
    }

    return (
      <text
        x={x}
        y={y}
        dy={16}
        textAnchor="middle"
        fill={color}
        fontSize={12}
      >
        {currentDate}
      </text>
    )
  }

  const CustomLegend = ({ payload }) => {
    return (
      <div className="flex justify-center gap-4 mt-2 flex-wrap">
        {payload.map((entry, index) => {
          const isSma = entry.dataKey.startsWith('sma')
          const period = isSma ? parseInt(entry.dataKey.replace('sma', '')) : null

          // Check if this is an all channel line
          const isAllChannel = entry.dataKey.startsWith('allChannel') && entry.dataKey.endsWith('Mid')
          const channelIndex = isAllChannel ? parseInt(entry.dataKey.replace('allChannel', '').replace('Mid', '')) : null

          // Check if this is the main trend channel
          const isTrendLine = entry.dataKey === 'channelMid'
          const isTrendChannelPart = entry.dataKey === 'channelMid' || entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower'

          // Skip rendering upper/lower bounds in legend (already hidden via legendType="none", but double check)
          if (entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower') {
            return null
          }

          const isVisible = isSma ? smaVisibility[period] : (isAllChannel ? allChannelsVisibility[channelIndex] : (isTrendLine ? trendChannelVisible : true))
          const isClickable = isSma || isAllChannel || isTrendLine

          return (
            <div
              key={`item-${index}`}
              className="flex items-center gap-2 px-2 py-1 rounded transition-all"
            >
              <button
                onClick={() => {
                  if (isSma && onToggleSma) {
                    onToggleSma(period)
                  } else if (isAllChannel) {
                    setAllChannelsVisibility(prev => ({
                      ...prev,
                      [channelIndex]: !prev[channelIndex]
                    }))
                  } else if (isTrendLine) {
                    setTrendChannelVisible(!trendChannelVisible)
                  }
                }}
                className={`flex items-center gap-2 ${
                  isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
                disabled={!isClickable}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: entry.color,
                    borderRadius: '50%',
                    opacity: isVisible ? 1 : 0.3
                  }}
                />
                <span className={`text-sm text-slate-300 ${!isVisible ? 'line-through opacity-50' : ''}`}>
                  {entry.value}
                </span>
              </button>
              {isSma && onDeleteSma && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSma(period)
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Delete SMA line"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {isAllChannel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Remove this channel from allChannels array
                    setAllChannels(prev => prev.filter((_, idx) => idx !== channelIndex))
                    // Remove from visibility tracking
                    setAllChannelsVisibility(prev => {
                      const newVis = { ...prev }
                      delete newVis[channelIndex]
                      // Re-index remaining channels
                      const reindexed = {}
                      Object.keys(newVis).forEach(key => {
                        const idx = parseInt(key)
                        if (idx > channelIndex) {
                          reindexed[idx - 1] = newVis[key]
                        } else {
                          reindexed[idx] = newVis[key]
                        }
                      })
                      return reindexed
                    })
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Remove channel"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {isTrendLine && slopeChannelEnabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Disable slope channel by calling parent handler
                    if (onSlopeChannelParamsChange) {
                      // Signal to parent to disable slope channel
                      onSlopeChannelParamsChange({ slopeChannelEnabled: false })
                    }
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Remove trend channel"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* Show controls button next to Trend legend */}
              {isTrendLine && slopeChannelEnabled && onSlopeChannelParamsChange && (
                <button
                  onClick={() => setControlsVisible(!controlsVisible)}
                  className="ml-2 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                  title={controlsVisible ? "Hide controls" : "Show controls"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  {controlsVisible ? 'Hide' : 'Controls'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Add zone boundaries to chart data
  const chartDataWithZones = visibleChartData.map((point) => {
    if (!slopeChannelEnabled || !point.channelUpper || !point.channelLower) {
      return point
    }

    const channelRange = point.channelUpper - point.channelLower
    const zoneData = {}

    zoneColors.forEach((zone, index) => {
      const lower = point.channelLower + channelRange * zone.zoneStart
      const upper = point.channelLower + channelRange * zone.zoneEnd
      zoneData[`zone${index}Lower`] = lower
      zoneData[`zone${index}Upper`] = upper
    })

    return { ...point, ...zoneData }
  })

  // Custom component to render zone lines with labels
  const CustomZoneLines = (props) => {
    if (!slopeChannelEnabled || zoneColors.length === 0) return null

    const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Generate distinct colors for each zone with depth based on volume weight
    const getZoneColor = (index, total, volumeWeight) => {
      const hue = (index / total) * 300 // 0 to 300 degrees (red to blue, avoiding green)

      // Saturation and lightness vary with volume weight
      // Higher volume = higher saturation (deeper color)
      // Lower volume = lower saturation (lighter color)
      const minSaturation = 30
      const maxSaturation = 90
      const saturation = minSaturation + (volumeWeight * (maxSaturation - minSaturation))

      // Lightness: higher volume = darker, lower volume = lighter
      const minLightness = 35
      const maxLightness = 65
      const lightness = maxLightness - (volumeWeight * (maxLightness - minLightness))

      return `hsl(${hue}, ${saturation}%, ${lightness}%)`
    }

    return (
      <g>
        {zoneColors.map((zone, zoneIndex) => {
          const points = chartDataWithZones.map((point) => {
            const upper = point[`zone${zoneIndex}Upper`]
            if (upper === undefined) return null

            const x = xAxis.scale(point.date)
            const y = yAxis.scale(upper)
            return { x, y }
          }).filter(p => p !== null)

          if (points.length < 2) return null

          // Create path for the zone boundary line
          let pathData = `M ${points[0].x} ${points[0].y}`
          for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`
          }

          const color = getZoneColor(zoneIndex, zoneColors.length, zone.volumeWeight)
          const lastPoint = points[points.length - 1]

          // Opacity varies with volume weight: higher volume = more opaque
          const minOpacity = 0.4
          const maxOpacity = 0.95
          const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

          return (
            <g key={`zone-line-${zoneIndex}`}>
              {/* Zone boundary line */}
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="2 2"
                opacity={opacity}
              />

              {/* Volume percentage label at the end of the line */}
              <text
                x={lastPoint.x + 5}
                y={lastPoint.y}
                fill={color}
                fontSize="11"
                fontWeight="600"
                textAnchor="start"
                dominantBaseline="middle"
              >
                {(zone.volumeWeight * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight, position: 'relative' }}>
      {/* Slope Channel Controls Panel */}
      {slopeChannelEnabled && slopeChannelInfo && onSlopeChannelParamsChange && controlsVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgb(71, 85, 105)',
            borderRadius: '8px',
            padding: '12px',
            zIndex: 10,
            minWidth: '280px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgb(226, 232, 240)' }}>
              Channel Controls
            </div>
            <button
              onClick={() => setControlsVisible(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'rgb(148, 163, 184)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)'
                e.currentTarget.style.color = 'rgb(226, 232, 240)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'rgb(148, 163, 184)'
              }}
              title="Hide controls"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Manual Parameter Controls */}
          <div style={{ marginBottom: '12px' }}>
            {/* Lookback Slider */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                  Lookback Period
                </label>
                <span style={{ fontSize: '11px', color: 'rgb(139, 92, 246)', fontFamily: 'monospace', fontWeight: '600' }}>
                  {slopeChannelInfo.recentDataCount} pts
                </span>
              </div>
              <input
                type="range"
                min="100"
                max={dataLength}
                step="1"
                value={slopeChannelInfo.recentDataCount}
                onChange={(e) => {
                  const newCount = parseInt(e.target.value)
                  setOptimizedLookbackCount(newCount)
                }}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${((slopeChannelInfo.recentDataCount - 100) / (dataLength - 100)) * 100}%, rgb(71, 85, 105) ${((slopeChannelInfo.recentDataCount - 100) / (dataLength - 100)) * 100}%, rgb(71, 85, 105) 100%)`,
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* StdDev Width Slider */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                  Channel Width
                </label>
                <span style={{ fontSize: '11px', color: 'rgb(139, 92, 246)', fontFamily: 'monospace', fontWeight: '600' }}>
                  {slopeChannelInfo.optimalStdevMult.toFixed(2)}σ
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                value={slopeChannelInfo.optimalStdevMult}
                onChange={(e) => {
                  const newMult = parseFloat(e.target.value)
                  setOptimizedStdevMult(newMult)
                }}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${((slopeChannelInfo.optimalStdevMult - 1) / 3) * 100}%, rgb(71, 85, 105) ${((slopeChannelInfo.optimalStdevMult - 1) / 3) * 100}%, rgb(71, 85, 105) 100%)`,
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Find Best Fit Button */}
            <button
              onClick={() => {
                // Trigger re-optimization by clearing stored params
                setOptimizedLookbackCount(null)
                setOptimizedStdevMult(null)
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgb(139, 92, 246)',
                border: 'none',
                borderRadius: '6px',
                color: 'rgb(226, 232, 240)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgb(124, 58, 237)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgb(139, 92, 246)'
              }}
            >
              Find Best Fit
            </button>
          </div>

          {/* Channel Statistics */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgb(71, 85, 105)' }}>
            <div style={{ fontSize: '10px', color: 'rgb(148, 163, 184)', lineHeight: '1.4' }}>
              <div>Touches: {slopeChannelInfo.touchCount} ({((slopeChannelInfo.touchCount / slopeChannelInfo.recentDataCount) * 100).toFixed(1)}%)</div>
              <div>Outside: {slopeChannelInfo.percentOutside}% (target: ≤5%)</div>
              <div>R²: {(slopeChannelInfo.rSquared * 100).toFixed(1)}%</div>
              {slopeChannelVolumeWeighted && (
                <div style={{ color: 'rgb(139, 92, 246)', fontWeight: '600' }}>Volume Weighted (bottom 20% ignored)</div>
              )}
            </div>
          </div>
        </div>
      )}

      <ResponsiveContainer>
        <ComposedChart
          data={chartDataWithZones}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {slopeChannelEnabled && zoneColors.map((zone, index) => (
              <linearGradient key={`gradient-${index}`} id={`zoneGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={zone.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={zone.color} stopOpacity={0.2} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="date"
            tick={<CustomXAxisTick />}
            interval={Math.floor(chartDataWithZones.length / 10)}
            stroke="#475569"
          />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8' }} stroke="#475569" />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          {syncedMouseDate && (
            <ReferenceLine
              x={syncedMouseDate}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Slope Channel Zones as Parallel Lines */}
          <Customized component={CustomZoneLines} />

          {/* Slope Channel Lines */}
          {slopeChannelEnabled && slopeChannelInfo && (
            <>
              <Line
                type="monotone"
                dataKey="channelUpper"
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
                name={`Upper (+${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ)`}
                strokeDasharray="3 3"
                legendType="none"
                hide={!trendChannelVisible}
              />
              <Line
                type="monotone"
                dataKey="channelMid"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                name={`Trend${slopeChannelVolumeWeighted ? ' (Vol-Weighted)' : ''} (${slopeChannelInfo.recentDataCount}pts, ${slopeChannelInfo.touchCount} touches, R²=${(slopeChannelInfo.rSquared * 100).toFixed(1)}%)`}
                strokeDasharray="3 3"
                hide={!trendChannelVisible}
              />
              <Line
                type="monotone"
                dataKey="channelLower"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
                name={`Lower (-${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ)`}
                strokeDasharray="3 3"
                legendType="none"
                hide={!trendChannelVisible}
              />
            </>
          )}

          {/* All Channels Lines */}
          {findAllChannelEnabled && allChannels.length > 0 && allChannels.map((channel, index) => {
            // Define distinct colors for each channel
            const channelColors = [
              { upper: '#10b981', mid: '#3b82f6', lower: '#ef4444' },  // Green, Blue, Red
              { upper: '#f59e0b', mid: '#8b5cf6', lower: '#ec4899' },  // Amber, Purple, Pink
              { upper: '#14b8a6', mid: '#6366f1', lower: '#f97316' },  // Teal, Indigo, Orange
              { upper: '#84cc16', mid: '#06b6d4', lower: '#f43f5e' },  // Lime, Cyan, Rose
              { upper: '#a3e635', mid: '#0ea5e9', lower: '#e11d48' },  // Lime-light, Sky, Rose-dark
            ]
            const colors = channelColors[index % channelColors.length]
            const isVisible = allChannelsVisibility[index] !== false

            return (
              <React.Fragment key={`channel-${index}`}>
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Upper`}
                  stroke={colors.upper}
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                  strokeDasharray="5 5"
                  opacity={0.8}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Mid`}
                  stroke={colors.mid}
                  strokeWidth={2}
                  dot={false}
                  name={`Ch${index + 1} (${channel.lookbackCount}pts, R²=${(channel.rSquared * 100).toFixed(1)}%)`}
                  strokeDasharray="5 5"
                  opacity={0.8}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Lower`}
                  stroke={colors.lower}
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                  strokeDasharray="5 5"
                  opacity={0.8}
                  hide={!isVisible}
                />
              </React.Fragment>
            )
          })}

          <Line
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="Close Price"
          />
          {smaPeriods.map((period, index) => {
            const smaKey = `sma${period}`
            const isVisible = smaVisibility[period]

            return (
              <Line
                key={smaKey}
                type="monotone"
                dataKey={smaKey}
                stroke={getSmaColor(period)}
                strokeWidth={1.5}
                dot={false}
                name={`SMA ${period}`}
                strokeDasharray="5 5"
                hide={!isVisible}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default PriceChart
