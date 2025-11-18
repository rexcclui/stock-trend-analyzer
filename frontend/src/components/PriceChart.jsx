import React, { useState, useRef, useEffect } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Customized } from 'recharts'
import { X, ArrowLeftRight, Hand } from 'lucide-react'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, volumeColorEnabled = false, volumeColorMode = 'absolute', volumeProfileEnabled = false, volumeProfileMode = 'auto', volumeProfileManualRanges = [], onVolumeProfileManualRangeChange, onVolumeProfileRangeRemove, spyData = null, performanceComparisonEnabled = false, performanceComparisonBenchmark = 'SPY', performanceComparisonDays = 30, comparisonMode = 'line', comparisonStocks = [], slopeChannelEnabled = false, slopeChannelVolumeWeighted = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, findAllChannelEnabled = false, manualChannelEnabled = false, manualChannelDragMode = false, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
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

  // Manual channel selection state
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [manualChannels, setManualChannels] = useState([]) // Array to store multiple channels
  const chartRef = useRef(null)

  // Volume profile manual selection state
  const [isSelectingVolumeProfile, setIsSelectingVolumeProfile] = useState(false)
  const [volumeProfileSelectionStart, setVolumeProfileSelectionStart] = useState(null)
  const [volumeProfileSelectionEnd, setVolumeProfileSelectionEnd] = useState(null)

  // Chart panning state
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(null)
  const [panStartZoom, setPanStartZoom] = useState(null)

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

  // Calculate volume-weighted zones for all channels (3 zones per channel)
  const calculateAllChannelZones = (data, allChannels) => {
    if (!allChannels || allChannels.length === 0 || !data) return {}

    const allZones = {}

    allChannels.forEach((channel, channelIndex) => {
      const zoneColors = []
      const numZones = 3 // Fixed at 3 zones for all channels

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

  // Calculate volume-weighted zones for manual channel (3 zones)
  const calculateManualChannelZones = (data, channel) => {
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

  // Combine data - ensure we use the minimum length to stay in sync with indicators
  const dataLength = Math.min(prices.length, indicators.length)

  // Calculate slope channel ONLY on the data that will be displayed
  // This prevents mismatch when period changes and indicators haven't updated yet
  const displayPrices = prices.slice(0, dataLength)

  // Build a map of SPY volumes by date for quick lookup
  const spyVolumeByDate = (() => {
    if (!volumeColorEnabled || volumeColorMode !== 'relative-spy' || !spyData) return {}
    const map = {}
    spyData.prices.forEach(p => {
      map[p.date] = p.volume || 0
    })
    return map
  })()

  // Calculate volume ratios (stock/SPY) for each date
  const volumeRatios = (() => {
    if (!volumeColorEnabled || volumeColorMode !== 'relative-spy' || !spyData) return []
    return displayPrices.map(price => {
      const spyVolume = spyVolumeByDate[price.date]
      if (!spyVolume || spyVolume === 0) return 0
      return (price.volume || 0) / spyVolume
    })
  })()

  // Determine rolling lookback window based on time period
  const getVolumeLookbackWindow = () => {
    const daysNum = parseInt(days)
    if (daysNum >= 1825) return 180      // 5Y: 6 months
    if (daysNum >= 1095) return 90       // 3Y: 3 months
    if (daysNum >= 365) return 60        // 1Y: 2 months
    if (daysNum >= 180) return 28        // 6M: 4 weeks
    if (daysNum >= 90) return 21         // 3M: 3 weeks
    if (daysNum >= 30) return 7          // 1M: 1 week
    return 1                             // 7D: 1 day
  }

  const volumeLookbackWindow = getVolumeLookbackWindow()

  // Calculate rolling volume thresholds for each data point
  const calculateRollingThresholds = () => {
    if (!volumeColorEnabled) return { thresholds80: [], thresholds20: [] }

    const thresholds80 = []
    const thresholds20 = []

    for (let i = 0; i < displayPrices.length; i++) {
      // Define the lookback window (from i-lookback to i-1, not including current point)
      const startIdx = Math.max(0, i - volumeLookbackWindow)
      const endIdx = i // Include current point for comparison

      let values = []

      if (volumeColorMode === 'relative-spy' && spyData) {
        // Use volume ratios from the lookback window
        values = volumeRatios.slice(startIdx, endIdx).filter(r => r > 0)
      } else {
        // Use absolute volumes from the lookback window
        values = displayPrices.slice(startIdx, endIdx)
          .map(d => d.volume || 0)
          .filter(v => v > 0)
      }

      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b)
        const idx80 = Math.floor(sorted.length * 0.8)
        const idx20 = Math.floor(sorted.length * 0.2)
        thresholds80[i] = sorted[idx80]
        thresholds20[i] = sorted[idx20]
      } else {
        thresholds80[i] = null
        thresholds20[i] = null
      }
    }

    return { thresholds80, thresholds20 }
  }

  const { thresholds80: rollingThresholds80, thresholds20: rollingThresholds20 } = calculateRollingThresholds()

  // Helper function to calculate volume profile for a specific dataset and date range
  const calculateSingleVolumeProfile = (dataToAnalyze, yAxisMax, dateRange = null, isManualMode = false) => {
    if (dataToAnalyze.length === 0) return null

    // Calculate total volume
    const totalVolume = dataToAnalyze.reduce((sum, price) => sum + (price.volume || 0), 0)
    if (totalVolume === 0) return null

    // Find min and max price from the filtered data
    const prices = dataToAnalyze.map(p => p.close)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice

    if (priceRange === 0) return null

    // Calculate number of zones based on ratio of price range to y-axis max
    // Manual mode: 20% more zones than auto mode for finer granularity
    // Auto mode: Each 0.025 ratio = 1 zone → ratio * 40
    // Manual mode: ratio * 40 * 1.2 = ratio * 48
    const ratio = priceRange / yAxisMax
    const baseMultiplier = isManualMode ? 48 : 40 // 20% increase for manual mode
    const numZones = Math.max(1, Math.round(ratio * baseMultiplier)) // Minimum 1 zone
    const zoneHeight = priceRange / numZones
    const volumeZones = []

    // Initialize zones
    for (let i = 0; i < numZones; i++) {
      volumeZones.push({
        minPrice: minPrice + (i * zoneHeight),
        maxPrice: minPrice + ((i + 1) * zoneHeight),
        volume: 0,
        volumePercent: 0
      })
    }

    // Accumulate volume for each zone
    dataToAnalyze.forEach(price => {
      const priceValue = price.close
      const volume = price.volume || 0

      // Find which zone this price falls into
      let zoneIndex = Math.floor((priceValue - minPrice) / zoneHeight)
      // Handle edge case where price equals maxPrice
      if (zoneIndex >= numZones) zoneIndex = numZones - 1
      if (zoneIndex < 0) zoneIndex = 0

      volumeZones[zoneIndex].volume += volume
    })

    // Calculate percentages and find max volume
    let maxZoneVolume = 0
    volumeZones.forEach(zone => {
      zone.volumePercent = (zone.volume / totalVolume) * 100
      if (zone.volume > maxZoneVolume) maxZoneVolume = zone.volume
    })

    return { zones: volumeZones, maxVolume: maxZoneVolume, totalVolume, dateRange, numZones }
  }

  // Calculate volume profiles - returns array of profiles
  const calculateVolumeProfiles = () => {
    if (!volumeProfileEnabled || displayPrices.length === 0) return []

    // Important: chartData is reversed, so we need to use reversed displayPrices for correct slicing
    const reversedDisplayPrices = [...displayPrices].reverse()

    if (volumeProfileMode === 'auto') {
      // Auto mode: single profile for visible (zoomed) data
      // Use reversed prices to match chartData order
      const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

      // Calculate y-axis max from VISIBLE data only for proper scaling
      const visiblePrices = visibleData.map(p => p.close)
      const yAxisMax = visiblePrices.length > 0 ? Math.max(...visiblePrices) : 0

      const profile = calculateSingleVolumeProfile(visibleData, yAxisMax, null, false)
      return profile ? [profile] : []
    } else {
      // Manual mode: one profile for each selected range (20% more zones than auto)
      if (volumeProfileManualRanges.length === 0) return []

      // Calculate y-axis max from visible (zoomed) data for proper scaling
      const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)
      const visiblePrices = visibleData.map(p => p.close)
      const yAxisMax = visiblePrices.length > 0 ? Math.max(...visiblePrices) : 0

      const profiles = []
      volumeProfileManualRanges.forEach(range => {
        const { startDate, endDate } = range
        const dataToAnalyze = reversedDisplayPrices.filter(price => {
          const priceDate = price.date
          return priceDate >= startDate && priceDate <= endDate
        })

        const profile = calculateSingleVolumeProfile(dataToAnalyze, yAxisMax, range, true)
        if (profile) profiles.push(profile)
      })

      return profiles
    }
  }

  const volumeProfiles = calculateVolumeProfiles()

  // Calculate performance variance for each point (configurable rolling period)
  const performanceVariances = (() => {
    if (!performanceComparisonEnabled || !spyData || comparisonMode !== 'color') return []

    const variances = []
    const lookbackPeriod = performanceComparisonDays // Configurable rolling performance

    // Build a map of benchmark prices by date
    const benchmarkPriceByDate = {}
    spyData.prices.forEach(p => {
      benchmarkPriceByDate[p.date] = p.close
    })

    for (let i = 0; i < displayPrices.length; i++) {
      const currentPrice = displayPrices[i]
      const currentBenchmarkPrice = benchmarkPriceByDate[currentPrice.date]

      // Look back the specified number of days
      const startIdx = Math.max(0, i - lookbackPeriod)
      const startPrice = displayPrices[startIdx]
      const startBenchmarkPrice = benchmarkPriceByDate[startPrice.date]

      if (currentBenchmarkPrice && startBenchmarkPrice && startPrice.close && startBenchmarkPrice !== 0 && startPrice.close !== 0) {
        // Calculate performance (percentage change)
        const stockPerformance = ((currentPrice.close - startPrice.close) / startPrice.close) * 100
        const benchmarkPerformance = ((currentBenchmarkPrice - startBenchmarkPrice) / startBenchmarkPrice) * 100

        // Calculate variance (stock performance - benchmark performance)
        const variance = stockPerformance - benchmarkPerformance
        variances[i] = variance
      } else {
        variances[i] = null
      }
    }

    return variances
  })()

  // Calculate thresholds for performance variance (top 20% and bottom 20%)
  const performanceVarianceThresholds = (() => {
    if (!performanceComparisonEnabled || performanceVariances.length === 0 || comparisonMode !== 'color') return { top20: null, bottom20: null }

    const validVariances = performanceVariances.filter(v => v !== null)
    if (validVariances.length === 0) return { top20: null, bottom20: null }

    const sorted = [...validVariances].sort((a, b) => a - b)
    const idx80 = Math.floor(sorted.length * 0.8)
    const idx20 = Math.floor(sorted.length * 0.2)

    return {
      top20: sorted[idx80],      // Top 20% (highest positive variance)
      bottom20: sorted[idx20]    // Bottom 20% (most negative variance)
    }
  })()

  // Calculate comparison lines for 'line' mode
  // Each line value = (Perf Difference % + 1) × current data point of selected stock
  // Perf Difference % = (historical % chg of compare stock - historical % chg of selected stock)
  const comparisonLines = (() => {
    if (comparisonMode !== 'line' || !comparisonStocks || comparisonStocks.length === 0) {
      return {}
    }

    const result = {}

    // Get first date and price of selected stock (for calculating historical % change)
    if (displayPrices.length === 0) return result
    const firstDisplayDate = displayPrices[0].date
    const selectedFirstPrice = displayPrices[0].close
    if (!selectedFirstPrice) return result

    comparisonStocks.forEach((compStock) => {
      const lineData = []

      // Build a map of comparison stock prices by date
      const compPriceByDate = {}
      if (compStock.data && compStock.data.prices) {
        compStock.data.prices.forEach(p => {
          compPriceByDate[p.date] = p.close
        })
      }

      // Get first price of comparison stock ON THE SAME DATE as the first displayed price
      const compFirstPrice = compPriceByDate[firstDisplayDate]
      if (!compFirstPrice) {
        console.warn(`[Comparison] No data for ${compStock.symbol} on start date ${firstDisplayDate}`)
        result[compStock.symbol] = []
        return
      }

      console.log(`[Comparison] First date: ${firstDisplayDate}, Selected: ${selectedFirstPrice}, ${compStock.symbol}: ${compFirstPrice}`)

      // Calculate line values for each data point
      for (let i = 0; i < displayPrices.length; i++) {
        const currentPrice = displayPrices[i]
        const compCurrentPrice = compPriceByDate[currentPrice.date]

        if (compCurrentPrice && currentPrice.close && selectedFirstPrice !== 0 && compFirstPrice !== 0) {
          // Historical % change of selected stock (from first displayed date)
          const selectedHistPctChg = (currentPrice.close - selectedFirstPrice) / selectedFirstPrice

          // Historical % change of comparison stock (from first displayed date)
          const compHistPctChg = (compCurrentPrice - compFirstPrice) / compFirstPrice

          // Perf Difference %
          const perfDiffPct = compHistPctChg - selectedHistPctChg

          // Plot value = (Perf Difference % + 1) × current data point of selected stock
          const plotValue = (perfDiffPct + 1) * currentPrice.close

          lineData[i] = plotValue
        } else {
          lineData[i] = null
        }
      }

      result[compStock.symbol] = lineData
    })

    return result
  })()

  const slopeChannelInfo = slopeChannelEnabled ? calculateSlopeChannel(displayPrices, true, slopeChannelVolumeWeighted) : null
  const zoneColors = slopeChannelEnabled && slopeChannelInfo
    ? calculateZoneColors(displayPrices, slopeChannelInfo, slopeChannelZones)
    : []

  // Calculate zones for all channels
  const allChannelZones = findAllChannelEnabled && allChannels.length > 0
    ? calculateAllChannelZones(displayPrices, allChannels)
    : {}

  // Calculate zones for all manual channels
  const allManualChannelZones = manualChannelEnabled && manualChannels.length > 0
    ? manualChannels.map(channel => calculateManualChannelZones(displayPrices, channel))
    : []

  const chartData = displayPrices.map((price, index) => {
    const indicator = indicators[index] || {}

    // Determine high/low volume based on mode using rolling thresholds
    let isHighVolume = false
    let isLowVolume = false

    if (volumeColorEnabled && rollingThresholds80[index] && rollingThresholds20[index]) {
      if (volumeColorMode === 'relative-spy' && spyData) {
        // Compare volume ratio to rolling thresholds
        const ratio = volumeRatios[index]
        isHighVolume = ratio >= rollingThresholds80[index]
        isLowVolume = ratio <= rollingThresholds20[index] && ratio > 0
      } else {
        // Compare absolute volume to rolling thresholds
        isHighVolume = (price.volume || 0) >= rollingThresholds80[index]
        isLowVolume = (price.volume || 0) <= rollingThresholds20[index]
      }
    }

    // Determine performance variance extremes
    let isTopPerformance = false
    let isBottomPerformance = false

    if (performanceComparisonEnabled && performanceVariances[index] !== null && performanceVarianceThresholds.top20 !== null) {
      const variance = performanceVariances[index]
      isTopPerformance = variance >= performanceVarianceThresholds.top20
      isBottomPerformance = variance <= performanceVarianceThresholds.bottom20
    }

    const dataPoint = {
      date: price.date,
      close: price.close,
      highVolumeClose: isHighVolume ? price.close : null, // Only set close value for high volume points
      lowVolumeClose: isLowVolume ? price.close : null, // Only set close value for low volume points
      topPerformanceClose: isTopPerformance ? price.close : null, // Top 20% performance variance
      bottomPerformanceClose: isBottomPerformance ? price.close : null, // Bottom 20% performance variance
    }

    // Add SMA data for each period
    smaPeriods.forEach(period => {
      const smaKey = `sma${period}`
      // Try backend data first, fall back to frontend calculation
      dataPoint[smaKey] = indicator[smaKey] || smaCache[period][index]
    })

    // Add comparison line data for 'line' mode
    if (comparisonMode === 'line' && Object.keys(comparisonLines).length > 0) {
      Object.keys(comparisonLines).forEach(symbol => {
        const compLineKey = `comp_${symbol}`
        const compPriceKey = `compPrice_${symbol}` // Actual price of comparison stock
        const compPerfKey = `compPerf_${symbol}` // Performance difference %
        const compPositiveKey = `compPos_${symbol}` // Line value when outperforming (blue)
        const compNegativeKey = `compNeg_${symbol}` // Line value when underperforming (red)

        const lineValue = comparisonLines[symbol][index]
        dataPoint[compLineKey] = lineValue

        // Store the actual comparison stock price and performance % for tooltip
        const compStock = comparisonStocks.find(cs => cs.symbol === symbol)
        if (compStock && compStock.data && compStock.data.prices) {
          const compPriceByDate = {}
          compStock.data.prices.forEach(p => {
            compPriceByDate[p.date] = p.close
          })
          const compPrice = compPriceByDate[price.date]
          dataPoint[compPriceKey] = compPrice || null

          // Calculate performance difference %
          if (lineValue && price.close) {
            const perfDiff = ((lineValue / price.close) - 1) * 100
            dataPoint[compPerfKey] = perfDiff

            // Split into positive (blue, outperforming) and negative (red, underperforming)
            if (perfDiff > 0) {
              dataPoint[compPositiveKey] = lineValue
              dataPoint[compNegativeKey] = null
            } else {
              dataPoint[compPositiveKey] = null
              dataPoint[compNegativeKey] = lineValue
            }
          } else {
            dataPoint[compPerfKey] = null
            dataPoint[compPositiveKey] = null
            dataPoint[compNegativeKey] = null
          }
        }
      })
    }

    // Add slope channel data if enabled
    if (slopeChannelInfo && slopeChannelInfo.channelData[index]) {
      const channel = slopeChannelInfo.channelData[index]
      dataPoint.channelUpper = channel.upper
      dataPoint.channelMid = channel.mid
      dataPoint.channelLower = channel.lower

      // Add zone boundaries for slope channel
      if (zoneColors.length > 0) {
        const channelRange = channel.upper - channel.lower
        zoneColors.forEach((zone, zoneIndex) => {
          const zoneLower = channel.lower + channelRange * zone.zoneStart
          const zoneUpper = channel.lower + channelRange * zone.zoneEnd
          dataPoint[`zone${zoneIndex}Lower`] = zoneLower
          dataPoint[`zone${zoneIndex}Upper`] = zoneUpper
        })
        // Debug: Log first point's zone data
        if (index === 0) {
          console.log('First data point zone data:', {
            index,
            channelRange,
            zoneCount: zoneColors.length,
            zone0Upper: dataPoint[`zone0Upper`],
            zone0Lower: dataPoint[`zone0Lower`]
          })
        }
      }
    }

    // Add all channels data if enabled
    if (findAllChannelEnabled && allChannels.length > 0) {
      allChannels.forEach((channel, channelIndex) => {
        // Check if this index is within this channel's range
        if (index >= channel.startIndex && index < channel.endIndex) {
          const localIndex = index - channel.startIndex
          const midValue = channel.slope * localIndex + channel.intercept
          const upperBound = midValue + channel.channelWidth
          const lowerBound = midValue - channel.channelWidth

          dataPoint[`allChannel${channelIndex}Upper`] = upperBound
          dataPoint[`allChannel${channelIndex}Mid`] = midValue
          dataPoint[`allChannel${channelIndex}Lower`] = lowerBound

          // Add zone boundaries for this channel
          if (allChannelZones[channelIndex]) {
            const channelRange = upperBound - lowerBound
            allChannelZones[channelIndex].forEach((zone, zoneIndex) => {
              const zoneLower = lowerBound + channelRange * zone.zoneStart
              const zoneUpper = lowerBound + channelRange * zone.zoneEnd
              dataPoint[`allChannel${channelIndex}Zone${zoneIndex}Lower`] = zoneLower
              dataPoint[`allChannel${channelIndex}Zone${zoneIndex}Upper`] = zoneUpper
            })
          }
        }
      })
    }

    // Add all manual channels data
    if (manualChannelEnabled && manualChannels.length > 0) {
      manualChannels.forEach((channel, channelIndex) => {
        if (index >= channel.startIndex && index <= channel.endIndex) {
          const localIndex = index - channel.startIndex
          const midValue = channel.slope * localIndex + channel.intercept
          const upperBound = midValue + channel.channelWidth
          const lowerBound = midValue - channel.channelWidth

          dataPoint[`manualChannel${channelIndex}Upper`] = upperBound
          dataPoint[`manualChannel${channelIndex}Mid`] = midValue
          dataPoint[`manualChannel${channelIndex}Lower`] = lowerBound

          // Add zone boundaries for this manual channel
          if (allManualChannelZones[channelIndex] && allManualChannelZones[channelIndex].length > 0) {
            const channelRange = upperBound - lowerBound
            allManualChannelZones[channelIndex].forEach((zone, zoneIndex) => {
              const zoneLower = lowerBound + channelRange * zone.zoneStart
              const zoneUpper = lowerBound + channelRange * zone.zoneEnd
              dataPoint[`manualChannel${channelIndex}Zone${zoneIndex}Lower`] = zoneLower
              dataPoint[`manualChannel${channelIndex}Zone${zoneIndex}Upper`] = zoneUpper
            })
          }
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

          {/* Show comparison stock prices and performance */}
          {comparisonMode === 'line' && comparisonStocks && comparisonStocks.map(compStock => {
            const compPriceKey = `compPrice_${compStock.symbol}`
            const compPerfKey = `compPerf_${compStock.symbol}`
            const compPrice = data[compPriceKey]
            const compPerf = data[compPerfKey]

            if (compPrice !== null && compPrice !== undefined) {
              const perfColor = compPerf > 0 ? '#3b82f6' : '#ef4444' // Blue for positive, red for negative
              return (
                <div key={compStock.symbol} className="text-sm mt-1">
                  <p style={{ color: perfColor }}>
                    {compStock.symbol}: ${compPrice.toFixed(2)}
                    {compPerf !== null && ` (${compPerf >= 0 ? '+' : ''}${compPerf.toFixed(2)}%)`}
                  </p>
                </div>
              )
            }
            return null
          })}

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

    // Handle chart panning - only when NOT in manual channel drag mode
    if (isPanning && !manualChannelDragMode && e && e.chartX !== undefined && panStartX !== null && panStartZoom !== null) {
      const deltaX = e.chartX - panStartX
      const chartWidth = chartContainerRef.current?.offsetWidth || 800
      const totalDataLength = chartData.length

      // Calculate pan delta as a percentage of visible range
      const panPercent = -(deltaX / chartWidth) // Negative because we pan opposite to drag direction
      const currentRange = (panStartZoom.end || totalDataLength) - panStartZoom.start
      const panAmount = Math.floor(panPercent * currentRange)

      // Apply pan with bounds checking
      let newStart = panStartZoom.start + panAmount
      let newEnd = (panStartZoom.end || totalDataLength) + panAmount

      // Ensure we don't pan beyond data bounds
      if (newStart < 0) {
        newEnd -= newStart
        newStart = 0
      }
      if (newEnd > totalDataLength) {
        newStart -= (newEnd - totalDataLength)
        newEnd = totalDataLength
      }
      if (newStart < 0) newStart = 0

      onZoomChange({ start: newStart, end: newEnd === totalDataLength ? null : newEnd })
      return
    }

    // Handle volume profile manual selection
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && e && e.activeLabel) {
      setVolumeProfileSelectionEnd(e.activeLabel)
      return
    }

    // Handle manual channel selection
    if (manualChannelEnabled && manualChannelDragMode && isSelecting && e && e.activeLabel) {
      setSelectionEnd(e.activeLabel)
      return
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
    // End panning when mouse leaves chart
    if (isPanning) {
      setIsPanning(false)
      setPanStartX(null)
      setPanStartZoom(null)
    }
  }

  const handleMouseDown = (e) => {
    // Volume profile manual selection - highest priority
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && e && e.activeLabel) {
      setIsSelectingVolumeProfile(true)
      setVolumeProfileSelectionStart(e.activeLabel)
      setVolumeProfileSelectionEnd(e.activeLabel)
      return
    }

    // Manual channel selection - second priority
    if (manualChannelEnabled && manualChannelDragMode && e && e.activeLabel) {
      setIsSelecting(true)
      setSelectionStart(e.activeLabel)
      setSelectionEnd(e.activeLabel)
      return
    }

    // Panning - only when neither manual mode is active
    if (e && e.chartX !== undefined) {
      setIsPanning(true)
      setPanStartX(e.chartX)
      setPanStartZoom({ ...zoomRange })
      return
    }
  }

  const handleMouseUp = (e) => {
    // End panning
    if (isPanning) {
      setIsPanning(false)
      setPanStartX(null)
      setPanStartZoom(null)
      return
    }

    // Only process selection when drag mode is enabled
    if (manualChannelEnabled && manualChannelDragMode && isSelecting && selectionStart && selectionEnd) {
      // Calculate manual channel for selected range
      fitManualChannel(selectionStart, selectionEnd)
      setIsSelecting(false)
    }
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && volumeProfileSelectionStart && volumeProfileSelectionEnd) {
      // Set the manual range for volume profile
      const startDate = volumeProfileSelectionStart
      const endDate = volumeProfileSelectionEnd
      // Ensure correct order
      const dates = [startDate, endDate].sort()
      onVolumeProfileManualRangeChange({ startDate: dates[0], endDate: dates[1] })
      setIsSelectingVolumeProfile(false)
    }
  }

  // Fit a channel to the manually selected data range
  const fitManualChannel = (startDate, endDate) => {
    if (!startDate || !endDate) return

    // Find the indices of the selected date range
    const startIndex = displayPrices.findIndex(p => p.date === startDate)
    const endIndex = displayPrices.findIndex(p => p.date === endDate)

    if (startIndex === -1 || endIndex === -1) return

    // Ensure we have the correct order (start should be earlier)
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)

    // Get the data segment for the selected range
    const dataSegment = displayPrices.slice(minIndex, maxIndex + 1)

    if (dataSegment.length < 5) {
      return
    }

    // Calculate linear regression for the selected segment
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
    const distances = dataSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })

    const distancesArray = dataSegment.map((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })

    const meanDistance = distancesArray.reduce((a, b) => a + b, 0) / distancesArray.length
    const variance = distancesArray.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distancesArray.length
    const stdDev = Math.sqrt(variance)

    // Find turning points in the selected range
    const turningPoints = findTurningPoints(displayPrices, minIndex, maxIndex)

    // Find optimal stddev multiplier - extend to cover more data but ensure at least one bound touches a turning point
    const stdevMultipliers = []
    for (let mult = 1.0; mult <= 4.0; mult += 0.1) {
      stdevMultipliers.push(mult)
    }

    let bestTouchCount = 0
    let bestStdevMult = 2.5
    let bestTurningPointTouch = false

    for (const stdevMult of stdevMultipliers) {
      const channelWidth = stdDev * stdevMult
      let touchCount = 0
      const touchTolerance = 0.05
      let hasUpperTouch = false
      let hasLowerTouch = false
      let hasTurningPointTouch = false

      dataSegment.forEach((point, index) => {
        const globalIndex = minIndex + index
        const predictedY = slope * index + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        const distanceToUpper = Math.abs(point.close - upperBound)
        const distanceToLower = Math.abs(point.close - lowerBound)
        const boundRange = channelWidth * 2

        // Check if this is a turning point
        const isTurningPoint = turningPoints.some(tp => tp.index === globalIndex)

        if (distanceToUpper <= boundRange * touchTolerance) {
          touchCount++
          hasUpperTouch = true
          if (isTurningPoint) hasTurningPointTouch = true
        }
        if (distanceToLower <= boundRange * touchTolerance) {
          touchCount++
          hasLowerTouch = true
          if (isTurningPoint) hasTurningPointTouch = true
        }
      })

      // Prioritize: (1) has turning point touch, (2) has upper OR lower touch, (3) more total touches
      const currentScore = (hasTurningPointTouch ? 10000 : 0) + touchCount
      const bestScore = (bestTurningPointTouch ? 10000 : 0) + bestTouchCount

      if ((hasUpperTouch || hasLowerTouch) && currentScore > bestScore) {
        bestTouchCount = touchCount
        bestStdevMult = stdevMult
        bestTurningPointTouch = hasTurningPointTouch
      }
    }

    // If no turning point touch found, extend the stdev to ensure at least one bound touches a turning point
    if (!bestTurningPointTouch && turningPoints.length > 0) {
      // Find the minimum stdev multiplier needed to touch at least one turning point
      let minMultForTurningPoint = bestStdevMult
      for (const tp of turningPoints) {
        const localIndex = tp.index - minIndex
        const predictedY = slope * localIndex + intercept
        const residual = Math.abs(tp.value - predictedY)
        const requiredMult = residual / stdDev
        // Use the smallest multiplier that touches any turning point
        if (requiredMult >= bestStdevMult) {
          minMultForTurningPoint = Math.max(minMultForTurningPoint, requiredMult)
        }
      }
      // Don't go beyond 4.0
      bestStdevMult = Math.min(minMultForTurningPoint, 4.0)
    }

    const channelWidth = stdDev * bestStdevMult

    // Calculate R-squared
    const meanY = sumY / n
    let totalSS = 0
    let residualSS = 0

    dataSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      totalSS += Math.pow(point.close - meanY, 2)
      residualSS += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = totalSS > 0 ? 1 - (residualSS / totalSS) : 0

    // Add the new manual channel to the array
    const newChannel = {
      startIndex: minIndex,
      endIndex: maxIndex,
      slope,
      intercept,
      channelWidth,
      stdDev,
      optimalStdevMult: bestStdevMult,
      touchCount: bestTouchCount,
      rSquared
    }
    setManualChannels(prevChannels => [...prevChannels, newChannel])
  }

  // Helper function to detect turning points (local maxima and minima)
  const findTurningPoints = (data, startIdx, endIdx) => {
    const turningPoints = []
    const windowSize = 3 // Look at 3 points to determine local max/min

    for (let i = startIdx + windowSize; i <= endIdx - windowSize; i++) {
      const current = data[i].close
      let isLocalMax = true
      let isLocalMin = true

      // Check if it's a local maximum or minimum
      for (let j = -windowSize; j <= windowSize; j++) {
        if (j === 0) continue
        const compareIdx = i + j
        if (compareIdx < startIdx || compareIdx > endIdx) continue

        const compareValue = data[compareIdx].close
        if (compareValue >= current) isLocalMax = false
        if (compareValue <= current) isLocalMin = false
      }

      if (isLocalMax) {
        turningPoints.push({ index: i, type: 'max', value: current })
      } else if (isLocalMin) {
        turningPoints.push({ index: i, type: 'min', value: current })
      }
    }

    return turningPoints
  }

  // Extend the most recent manual channel point-by-point while maintaining original slope
  const extendManualChannel = () => {
    if (manualChannels.length === 0) return

    const lastChannelIndex = manualChannels.length - 1
    const manualChannel = manualChannels[lastChannelIndex]

    // Keep original slope and stddev - these define the trend
    const { slope, stdDev, optimalStdevMult, channelWidth } = manualChannel
    let { startIndex, endIndex, intercept } = manualChannel

    const trendBreakThreshold = 0.1 // If >10% of new points are outside, break

    // Step 1: Extend forward (from endIndex to end of data) point by point
    let forwardExtended = false
    const maxEndIndex = displayPrices.length - 1

    while (endIndex < maxEndIndex) {
      // Try extending by one more point
      const testEndIndex = endIndex + 1

      // Calculate the total extended range
      const totalExtendedLength = testEndIndex - startIndex + 1

      // Get the LAST 10% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.1))
      const windowStartIdx = testEndIndex - windowSize + 1
      const last10PercentPoints = displayPrices.slice(windowStartIdx, testEndIndex + 1)

      // Check how many of the LAST 10% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < last10PercentPoints.length; i++) {
        const globalIndex = windowStartIdx + i
        const localIndex = globalIndex - startIndex
        const predictedY = slope * localIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = last10PercentPoints[i].close

        if (actualY > upperBound || actualY < lowerBound) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / last10PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the last 10% points are outside, stop extending forward
        break
      }

      // Continue extending - the extended range becomes the new "original range"
      endIndex = testEndIndex
      forwardExtended = true
    }

    // Step 2: Extend backward (from startIndex to beginning) point by point
    let backwardExtended = false
    const minStartIndex = 0

    // Save original intercept before adjusting
    const originalStartIndex = manualChannel.startIndex
    const originalIntercept = manualChannel.intercept

    while (startIndex > minStartIndex) {
      // Try extending by one more point backward
      const testStartIndex = startIndex - 1

      // Adjust intercept for the new start position
      const newIntercept = originalIntercept - slope * (originalStartIndex - testStartIndex)

      // Calculate the total extended range
      const totalExtendedLength = endIndex - testStartIndex + 1

      // Get the FIRST 10% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.1))
      const windowEndIdx = testStartIndex + windowSize - 1
      const first10PercentPoints = displayPrices.slice(testStartIndex, windowEndIdx + 1)

      // Check how many of the FIRST 10% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < first10PercentPoints.length; i++) {
        const globalIndex = testStartIndex + i
        const localIndex = globalIndex - testStartIndex
        const predictedY = slope * localIndex + newIntercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = first10PercentPoints[i].close

        if (actualY > upperBound || actualY < lowerBound) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / first10PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the first 10% points are outside, stop extending backward
        break
      }

      // Continue extending - the extended range becomes the new "original range"
      startIndex = testStartIndex
      intercept = newIntercept
      backwardExtended = true
    }

    // Step 3: Recalculate statistics for the extended channel
    const extendedSegment = displayPrices.slice(startIndex, endIndex + 1)

    // Find turning points and ensure at least one touches
    const turningPoints = findTurningPoints(displayPrices, startIndex, endIndex)

    // Calculate what stdev multiplier would cover all points
    const residuals = extendedSegment.map((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })
    const maxAbsResidual = Math.max(...residuals.map(r => Math.abs(r)))
    const minStdevMultForAll = maxAbsResidual / stdDev

    // Check if any turning point touches with current multiplier
    let finalStdevMult = optimalStdevMult
    let hasTurningPointTouch = false

    for (const tp of turningPoints) {
      const localIndex = tp.index - startIndex
      const predictedY = slope * localIndex + intercept
      const testChannelWidth = stdDev * finalStdevMult
      const upperBound = predictedY + testChannelWidth
      const lowerBound = predictedY - testChannelWidth
      const actualY = tp.value
      const touchTolerance = 0.02

      const distToUpper = Math.abs(actualY - upperBound) / (upperBound - lowerBound)
      const distToLower = Math.abs(actualY - lowerBound) / (upperBound - lowerBound)

      if ((tp.type === 'max' && distToUpper <= touchTolerance) ||
          (tp.type === 'min' && distToLower <= touchTolerance)) {
        hasTurningPointTouch = true
        break
      }
    }

    // If no turning point touches, adjust to make closest one touch
    if (!hasTurningPointTouch && turningPoints.length > 0) {
      let closestTp = null
      let minAdjustment = Infinity

      for (const tp of turningPoints) {
        const localIndex = tp.index - startIndex
        const predictedY = slope * localIndex + intercept
        const actualY = tp.value
        const residual = Math.abs(actualY - predictedY)
        const requiredMult = residual / stdDev
        const adjustment = Math.abs(requiredMult - finalStdevMult)

        if (adjustment < minAdjustment) {
          minAdjustment = adjustment
          closestTp = { ...tp, requiredMult }
        }
      }

      if (closestTp) {
        finalStdevMult = Math.max(closestTp.requiredMult, finalStdevMult, minStdevMultForAll)
      }
    }

    // Ensure we cover all points
    finalStdevMult = Math.max(finalStdevMult, minStdevMultForAll)

    const finalChannelWidth = stdDev * finalStdevMult

    // Calculate statistics
    let touchCount = 0
    let totalSS = 0
    let residualSS = 0
    const meanY = extendedSegment.reduce((sum, p) => sum + p.close, 0) / extendedSegment.length

    extendedSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      const upperBound = predictedY + finalChannelWidth
      const lowerBound = predictedY - finalChannelWidth

      const distanceToUpper = Math.abs(point.close - upperBound)
      const distanceToLower = Math.abs(point.close - lowerBound)
      const boundRange = finalChannelWidth * 2
      const touchToleranceCalc = 0.05

      if (distanceToUpper <= boundRange * touchToleranceCalc) {
        touchCount++
      }
      if (distanceToLower <= boundRange * touchToleranceCalc) {
        touchCount++
      }

      totalSS += Math.pow(point.close - meanY, 2)
      residualSS += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = totalSS > 0 ? 1 - (residualSS / totalSS) : 0

    // Update the manual channel with extended range
    if (forwardExtended || backwardExtended) {
      const updatedChannel = {
        startIndex,
        endIndex,
        slope,
        intercept,
        channelWidth: finalChannelWidth,
        stdDev,
        optimalStdevMult: finalStdevMult,
        touchCount,
        rSquared
      }
      setManualChannels(prevChannels => {
        const newChannels = [...prevChannels]
        newChannels[lastChannelIndex] = updatedChannel
        return newChannels
      })
    }
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

          // Check if this is a manual channel line
          const isManualChannel = entry.dataKey.startsWith('manualChannel') && entry.dataKey.endsWith('Mid')
          const manualChannelIndex = isManualChannel ? parseInt(entry.dataKey.replace('manualChannel', '').replace('Mid', '')) : null

          // Check if this is the main trend channel
          const isTrendLine = entry.dataKey === 'channelMid'
          const isTrendChannelPart = entry.dataKey === 'channelMid' || entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower'

          // Skip rendering upper/lower bounds in legend (already hidden via legendType="none", but double check)
          if (entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower') {
            return null
          }

          // Skip rendering allChannel upper/lower bounds in legend
          if (entry.dataKey && (entry.dataKey.includes('allChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
            return null
          }

          // Skip rendering manual channel upper/lower bounds in legend
          if (entry.dataKey && (entry.dataKey.includes('manualChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
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
              {/* Manual channel controls */}
              {isManualChannel && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Extend this specific channel if it's the last one
                      if (manualChannelIndex === manualChannels.length - 1) {
                        extendManualChannel()
                      }
                    }}
                    className="ml-1 p-0.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors"
                    title="Extend channel"
                    disabled={manualChannelIndex !== manualChannels.length - 1}
                    style={{ opacity: manualChannelIndex === manualChannels.length - 1 ? 1 : 0.3 }}
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Remove this channel from manualChannels array
                      setManualChannels(prev => prev.filter((_, idx) => idx !== manualChannelIndex))
                    }}
                    className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                    title="Remove channel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {/* Show "Clear All" button only on the last manual channel */}
                  {manualChannelIndex === manualChannels.length - 1 && manualChannels.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setManualChannels([])
                      }}
                      className="ml-2 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-red-600 hover:text-white transition-colors"
                      title="Clear all manual channels"
                    >
                      Clear All
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Use visible chart data directly (zones are now added during chartData creation)
  const chartDataWithZones = visibleChartData

  // Custom component to render zone lines with labels
  const CustomZoneLines = (props) => {
    console.log('CustomZoneLines render:', {
      slopeChannelEnabled,
      zoneColorsLength: zoneColors.length,
      zoneColors,
      slopeChannelInfo: slopeChannelInfo ? 'exists' : 'null'
    })

    if (!slopeChannelEnabled || zoneColors.length === 0) {
      console.log('CustomZoneLines: Not rendering - slopeChannelEnabled:', slopeChannelEnabled, 'zoneColors.length:', zoneColors.length)
      return null
    }

    const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) {
      console.log('CustomZoneLines: No xAxis or yAxis')
      return null
    }

    console.log('CustomZoneLines: Rendering zones, checking chartDataWithZones:', chartDataWithZones.length, 'points')

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

          console.log(`Zone ${zoneIndex}:`, {
            totalDataPoints: chartDataWithZones.length,
            validPoints: points.length,
            volumeWeight: zone.volumeWeight,
            firstPoint: points[0],
            lastPoint: points[points.length - 1]
          })

          if (points.length < 2) {
            console.log(`Zone ${zoneIndex}: Not enough points (${points.length})`)
            return null
          }

          // Create path for the zone boundary line
          let pathData = `M ${points[0].x} ${points[0].y}`
          for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`
          }

          const color = getZoneColor(zoneIndex, zoneColors.length, zone.volumeWeight)
          const lastPoint = points[points.length - 1]

          // Position label at the right side of the chart (last point)
          const labelX = lastPoint.x - 5
          const labelY = lastPoint.y

          // Opacity varies with volume weight: higher volume = more opaque
          const minOpacity = 0.4
          const maxOpacity = 0.95
          const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

          // Get conditional color for volume weight text
          const getVolumeWeightColor = (weight) => {
            if (weight >= 0.25) return '#22c55e' // Green - high volume
            if (weight >= 0.20) return '#84cc16' // Lime - above average
            if (weight >= 0.15) return '#eab308' // Yellow - average
            if (weight >= 0.10) return '#f97316' // Orange - below average
            return '#ef4444' // Red - low volume
          }

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

              {/* Volume percentage label with background for visibility */}
              <g>
                {/* Background rectangle for better readability */}
                <rect
                  x={labelX - 25}
                  y={labelY - 8}
                  width={50}
                  height={16}
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke={getVolumeWeightColor(zone.volumeWeight)}
                  strokeWidth={0.5}
                  rx={2}
                />
                {/* Volume percentage text */}
                <text
                  x={labelX}
                  y={labelY}
                  fill={getVolumeWeightColor(zone.volumeWeight)}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {(zone.volumeWeight * 100).toFixed(1)}%
                </text>
              </g>
            </g>
          )
        })}
      </g>
    )
  }

  // Custom component to render stdev label in middle of lower bound for slope channel
  const CustomSlopeChannelLabel = (props) => {
    if (!slopeChannelEnabled || !slopeChannelInfo) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Find the middle point of the lower bound line
    const totalDataLength = chartDataWithZones.length
    const midIndex = Math.floor(totalDataLength / 2)

    // Check if the midpoint is within the visible range
    if (midIndex < 0 || midIndex >= chartDataWithZones.length) {
      return null
    }

    // Get the data point at the middle
    const midPoint = chartDataWithZones[midIndex]
    if (!midPoint || midPoint.channelLower === undefined) {
      return null
    }

    const x = xAxis.scale(midPoint.date)
    const y = yAxis.scale(midPoint.channelLower)

    if (x === undefined || y === undefined) {
      return null
    }

    const stdevText = `${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ`

    return (
      <g>
        {/* Background rectangle for better readability */}
        <rect
          x={x - 20}
          y={y - 8}
          width={40}
          height={16}
          fill="rgba(15, 23, 42, 0.9)"
          stroke="#8b5cf6"
          strokeWidth={1}
          rx={3}
        />
        {/* Stdev label */}
        <text
          x={x}
          y={y}
          fill="#8b5cf6"
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {stdevText}
        </text>
      </g>
    )
  }

  // Custom component to render zone lines for all channels
  const CustomAllChannelZoneLines = (props) => {
    if (!findAllChannelEnabled || allChannels.length === 0 || Object.keys(allChannelZones).length === 0) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Define color palette for channels (same as channel lines)
    const channelColors = [
      '#3b82f6',  // Blue
      '#8b5cf6',  // Purple
      '#f59e0b',  // Amber
      '#10b981',  // Green
      '#06b6d4',  // Cyan
      '#f97316',  // Orange
      '#ec4899',  // Pink
      '#84cc16',  // Lime
    ]

    return (
      <g>
        {allChannels.map((channel, channelIndex) => {
          const isVisible = allChannelsVisibility[channelIndex] !== false
          if (!isVisible) return null

          const channelColor = channelColors[channelIndex % channelColors.length]
          const zones = allChannelZones[channelIndex]
          if (!zones) return null

          return zones.map((zone, zoneIndex) => {
            const points = chartDataWithZones.map((point) => {
              const upper = point[`allChannel${channelIndex}Zone${zoneIndex}Upper`]
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

            const lastPoint = points[points.length - 1]

            // Opacity and color intensity based on volume weight: higher volume = more intense
            const minOpacity = 0.3
            const maxOpacity = 0.9
            const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

            // Parse the channel color and adjust lightness based on volume weight
            // Higher volume = deeper/darker color
            const colorMap = {
              '#3b82f6': 217, // Blue
              '#8b5cf6': 266, // Purple
              '#f59e0b': 38,  // Amber
              '#10b981': 160, // Green
              '#06b6d4': 188, // Cyan
              '#f97316': 25,  // Orange
              '#ec4899': 330, // Pink
              '#84cc16': 75,  // Lime
            }
            const hue = colorMap[channelColor] || 217
            const minLightness = 35 // Darker
            const maxLightness = 65 // Lighter
            const lightness = maxLightness - (zone.volumeWeight * (maxLightness - minLightness))
            const color = `hsl(${hue}, 70%, ${lightness}%)`

            return (
              <g key={`channel-${channelIndex}-zone-${zoneIndex}`}>
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
                  opacity={0.95}
                >
                  {(zone.volumeWeight * 100).toFixed(1)}%
                </text>
              </g>
            )
          })
        })}
      </g>
    )
  }

  // Custom component to render zone lines for all manual channels
  const CustomManualChannelZoneLines = (props) => {
    if (!manualChannelEnabled || manualChannels.length === 0 || allManualChannelZones.length === 0) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Color palette for manual channels (various green shades)
    const channelColors = [
      142, // Green
      160, // Teal-green
      175, // Sea green
      125, // Lime green
      150, // Jade
    ]

    return (
      <g>
        {manualChannels.map((channel, channelIndex) => {
          const zones = allManualChannelZones[channelIndex]
          if (!zones) return null

          const hue = channelColors[channelIndex % channelColors.length]

          return zones.map((zone, zoneIndex) => {
            const points = chartDataWithZones.map((point) => {
              const upper = point[`manualChannel${channelIndex}Zone${zoneIndex}Upper`]
              if (upper === undefined) return null

              const x = xAxis.scale(point.date)
              const y = yAxis.scale(upper)

              if (x === undefined || y === undefined) return null

              return { x, y }
            }).filter(p => p !== null)

            if (points.length < 2) return null

            // Create path for the zone boundary line
            let pathData = `M ${points[0].x} ${points[0].y}`
            for (let i = 1; i < points.length; i++) {
              pathData += ` L ${points[i].x} ${points[i].y}`
            }

            const lastPoint = points[points.length - 1]

            // Opacity and color intensity varies with volume weight: higher volume = more intense
            const minOpacity = 0.3
            const maxOpacity = 0.9
            const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

            // Create color with varying intensity based on volume weight
            // Higher volume = deeper/darker color
            const minLightness = 35 // Darker
            const maxLightness = 65 // Lighter
            const lightness = maxLightness - (zone.volumeWeight * (maxLightness - minLightness))
            const color = `hsl(${hue}, 70%, ${lightness}%)`

            return (
              <g key={`manual-channel-${channelIndex}-zone-${zoneIndex}`}>
                {/* Zone boundary line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  opacity={opacity}
                />

                {/* Volume percentage label at the end of the line with gradient color based on weight */}
                <text
                  x={lastPoint.x + 5}
                  y={lastPoint.y}
                  fill={(() => {
                    // Conditional formatting: higher weight = warmer/brighter colors
                    const weight = zone.volumeWeight
                    if (weight >= 0.25) return '#22c55e' // Green - high volume
                    if (weight >= 0.20) return '#84cc16' // Lime - above average
                    if (weight >= 0.15) return '#eab308' // Yellow - average
                    if (weight >= 0.10) return '#f97316' // Orange - below average
                    return '#ef4444' // Red - low volume
                  })()}
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="start"
                  dominantBaseline="middle"
                  opacity={0.95}
                >
                  {(zone.volumeWeight * 100).toFixed(1)}%
                </text>
              </g>
            )
          })
        })}
      </g>
    )
  }

  // Custom component to render stdev labels beneath middle of lower bound slope for manual channels
  const CustomManualChannelLabels = (props) => {
    if (!manualChannelEnabled || manualChannels.length === 0) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) {
      return null
    }

    const channelColors = [
      '#22c55e', // Green
      '#14b8a6', // Teal
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#10b981', // Emerald
    ]

    return (
      <g>
        {manualChannels.map((channel, channelIndex) => {
          // Find the middle point of the lower bound line
          const midIndex = Math.floor((channel.startIndex + channel.endIndex) / 2)

          // IMPORTANT: channel indices are in displayPrices space (oldest to newest)
          // But chartData is REVERSED (newest to oldest), so we need to convert
          const totalDataLength = displayPrices.length
          const midIndexReversed = totalDataLength - 1 - midIndex

          // Now adjust for zoom offset - chartDataWithZones is sliced from zoomRange.start
          const adjustedIndex = midIndexReversed - zoomRange.start

          // Check if the midpoint is within the visible range
          if (adjustedIndex < 0 || adjustedIndex >= chartDataWithZones.length) {
            return null
          }

          // Get the data point at the middle
          const midPoint = chartDataWithZones[adjustedIndex]
          if (!midPoint) {
            return null
          }

          const lowerValue = midPoint[`manualChannel${channelIndex}Lower`]
          if (lowerValue === undefined) {
            return null
          }

          const x = xAxis.scale(midPoint.date)
          const y = yAxis.scale(lowerValue)

          if (x === undefined || y === undefined) {
            return null
          }

          const color = channelColors[channelIndex % channelColors.length]
          const stdevText = `${channel.optimalStdevMult.toFixed(2)}σ`

          return (
            <g key={`manual-channel-label-${channelIndex}`}>
              {/* Background rectangle for better readability */}
              <rect
                x={x - 20}
                y={y + 5}
                width={40}
                height={16}
                fill="rgba(15, 23, 42, 0.9)"
                stroke={color}
                strokeWidth={1}
                rx={3}
              />
              {/* Stdev label */}
              <text
                x={x}
                y={y + 15}
                fill={color}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {stdevText}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  // Custom component to render volume profile horizontal bars (supports multiple profiles)
  const CustomVolumeProfile = (props) => {
    if (!volumeProfileEnabled || volumeProfiles.length === 0) return null

    const { xAxisMap, yAxisMap, offset } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) {
      return null
    }

    return (
      <g>
        {volumeProfiles.map((volumeProfile, profileIndex) => {
          // Determine bar x position and width based on mode
          let barX = offset.left
          let barWidth = offset.width

          // In manual mode, only span the selected date range
          if (volumeProfileMode === 'manual' && volumeProfile.dateRange) {
            const { startDate, endDate } = volumeProfile.dateRange
            const startX = xAxis.scale(startDate)
            const endX = xAxis.scale(endDate)

            if (startX !== undefined && endX !== undefined) {
              barX = Math.min(startX, endX)
              barWidth = Math.abs(endX - startX)
            }
          }

          // Determine if price is upward slope (for X button positioning)
          let isUpwardSlope = false
          if (volumeProfileMode === 'manual' && volumeProfile.dateRange) {
            const { startDate, endDate } = volumeProfile.dateRange
            const startPrice = displayPrices.find(p => p.date === startDate)
            const endPrice = displayPrices.find(p => p.date === endDate)
            if (startPrice && endPrice) {
              isUpwardSlope = endPrice.close > startPrice.close
            }
          }

          // Position X button at bottom-right for upward slope, top-right for downward
          const topZone = volumeProfile.zones[volumeProfile.zones.length - 1]
          const bottomZone = volumeProfile.zones[0]
          const xButtonY = isUpwardSlope
            ? (bottomZone ? yAxis.scale(bottomZone.minPrice) - 10 : offset.top + offset.height - 10)
            : (topZone ? yAxis.scale(topZone.maxPrice) + 10 : offset.top + 10)

          return (
            <g key={`volume-profile-${profileIndex}`}>
              {volumeProfile.zones.map((zone, i) => {
                // Calculate y positions based on price range (even heights)
                const yTop = yAxis.scale(zone.maxPrice)
                const yBottom = yAxis.scale(zone.minPrice)
                const height = Math.abs(yBottom - yTop)

                // Calculate color depth based on volume weight
                // Higher volume = deeper/darker color
                const volumeWeight = zone.volume / volumeProfile.maxVolume // 0 to 1

                // Use blue/cyan hue with varying lightness
                const hue = 200 // Blue/cyan
                const saturation = 75
                // Map volume weight to lightness: high volume = darker (30%), low volume = lighter (75%)
                const lightness = 75 - (volumeWeight * 45) // Range from 75% (light) to 30% (dark)

                // Opacity based on volume weight too
                const opacity = 0.3 + (volumeWeight * 0.5) // Range from 0.3 to 0.8

                return (
                  <g key={`volume-profile-${profileIndex}-zone-${i}`}>
                    {/* Horizontal bar spanning selected range or full chart */}
                    <rect
                      x={barX}
                      y={yTop}
                      width={barWidth}
                      height={height}
                      fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                      stroke="rgba(59, 130, 246, 0.4)"
                      strokeWidth={0.5}
                      opacity={opacity}
                    />

                    {/* Volume percentage label in the center with gradient color */}
                    <text
                      x={barX + barWidth / 2}
                      y={yTop + height / 2}
                      fill={volumeWeight > 0.7
                        ? `hsl(45, 100%, ${85 - (volumeWeight * 25)}%)` // High volume: bright yellow to orange
                        : volumeWeight > 0.4
                        ? `hsl(0, 0%, ${95 - (volumeWeight * 20)}%)` // Medium volume: white to light gray
                        : `hsl(200, 30%, ${70 + (volumeWeight * 20)}%)` // Low volume: light blue-gray
                      }
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      opacity={0.95}
                      style={{
                        textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 5px rgba(0,0,0,0.5)'
                      }}
                    >
                      {zone.volumePercent.toFixed(1)}%
                    </text>
                  </g>
                )
              })}

              {/* X button to remove this volume profile (only in manual mode) */}
              {volumeProfileMode === 'manual' && onVolumeProfileRangeRemove && (
                <g
                  style={{ cursor: 'pointer', pointerEvents: 'all' }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    onVolumeProfileRangeRemove(profileIndex)
                  }}
                >
                  {/* Transparent clickable area */}
                  <circle
                    cx={barX + barWidth - 10}
                    cy={xButtonY}
                    r="10"
                    fill="transparent"
                    stroke="none"
                  />
                  {/* X icon with shadow for visibility */}
                  <text
                    x={barX + barWidth - 10}
                    y={xButtonY}
                    fill="#ef4444"
                    fontSize="16"
                    fontWeight="900"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))',
                      pointerEvents: 'none'
                    }}
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  // Determine cursor style based on state
  const getCursorStyle = () => {
    if (manualChannelDragMode) return 'crosshair'
    if (isPanning) return 'grabbing'
    return 'grab'
  }

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight, position: 'relative', cursor: getCursorStyle(), userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
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
          margin={{ top: 5, right: 0, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
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

          {/* Slope Channel Stdev Label */}
          <Customized component={CustomSlopeChannelLabel} />

          {/* All Channels Zones as Parallel Lines */}
          <Customized component={CustomAllChannelZoneLines} />

          {/* Manual Channel Zones as Parallel Lines */}
          <Customized component={CustomManualChannelZoneLines} />

          {/* Manual Channel Stdev Labels */}
          <Customized component={CustomManualChannelLabels} />

          {/* Volume Profile Horizontal Bars */}
          <Customized component={CustomVolumeProfile} />

          {/* Manual Channel Selection Rectangle */}
          {manualChannelEnabled && manualChannelDragMode && isSelecting && selectionStart && selectionEnd && (
            <Customized component={(props) => {
              const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
              if (!xAxisMap || !yAxisMap) return null

              const xAxis = xAxisMap[0]
              const yAxis = yAxisMap[0]

              if (!xAxis || !yAxis) return null

              const startX = xAxis.scale(selectionStart)
              const endX = xAxis.scale(selectionEnd)

              if (startX === undefined || endX === undefined) return null

              const x = Math.min(startX, endX)
              const width = Math.abs(endX - startX)
              const y = offset.top
              const height = offset.height

              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="rgba(34, 197, 94, 0.2)"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              )
            }} />
          )}

          {/* Volume Profile Manual Selection Rectangle */}
          {volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && volumeProfileSelectionStart && volumeProfileSelectionEnd && (
            <Customized component={(props) => {
              const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
              if (!xAxisMap || !yAxisMap) return null

              const xAxis = xAxisMap[0]
              const yAxis = yAxisMap[0]

              if (!xAxis || !yAxis) return null

              const startX = xAxis.scale(volumeProfileSelectionStart)
              const endX = xAxis.scale(volumeProfileSelectionEnd)

              if (startX === undefined || endX === undefined) return null

              const x = Math.min(startX, endX)
              const width = Math.abs(endX - startX)
              const y = offset.top
              const height = offset.height

              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="rgba(147, 51, 234, 0.2)"
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              )
            }} />
          )}

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
            // Define distinct colors for each channel - using single color per channel for consistency
            const channelColors = [
              '#3b82f6',  // Blue
              '#8b5cf6',  // Purple
              '#f59e0b',  // Amber
              '#10b981',  // Green
              '#06b6d4',  // Cyan
              '#f97316',  // Orange
              '#ec4899',  // Pink
              '#84cc16',  // Lime
            ]
            const channelColor = channelColors[index % channelColors.length]
            const isVisible = allChannelsVisibility[index] !== false

            return (
              <React.Fragment key={`channel-${index}`}>
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Upper`}
                  stroke={channelColor}
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                  strokeDasharray="5 5"
                  opacity={0.6}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Mid`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  name={`Ch${index + 1} (${channel.lookbackCount}pts, R²=${(channel.rSquared * 100).toFixed(1)}%)`}
                  strokeDasharray="5 5"
                  opacity={1.0}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`allChannel${index}Lower`}
                  stroke={channelColor}
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                  strokeDasharray="5 5"
                  opacity={0.6}
                  hide={!isVisible}
                />
              </React.Fragment>
            )
          })}

          {/* Manual Channel Lines */}
          {manualChannelEnabled && manualChannels.length > 0 && manualChannels.map((channel, index) => {
            // Color palette for manual channels (various green shades)
            const channelColors = [
              '#22c55e',  // Green
              '#10b981',  // Emerald
              '#14b8a6',  // Teal
              '#84cc16',  // Lime
              '#059669',  // Deep green
            ]
            const channelColor = channelColors[index % channelColors.length]

            return (
              <React.Fragment key={`manual-channel-${index}`}>
                <Line
                  type="monotone"
                  dataKey={`manualChannel${index}Upper`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  name={`Manual ${index + 1} Upper (+${channel.optimalStdevMult.toFixed(2)}σ)`}
                  strokeDasharray="5 5"
                  opacity={0.7}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey={`manualChannel${index}Mid`}
                  stroke={channelColor}
                  strokeWidth={2.5}
                  dot={false}
                  name={`Manual Channel ${index + 1} (${channel.endIndex - channel.startIndex + 1}pts, ${channel.touchCount} touches, R²=${(channel.rSquared * 100).toFixed(1)}%)`}
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey={`manualChannel${index}Lower`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  name={`Manual ${index + 1} Lower (-${channel.optimalStdevMult.toFixed(2)}σ)`}
                  strokeDasharray="5 5"
                  opacity={0.7}
                  legendType="none"
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
          {volumeColorEnabled && (
            <>
              <Line
                type="monotone"
                dataKey="highVolumeClose"
                stroke="#ea580c"
                strokeWidth={3}
                dot={false}
                name={volumeColorMode === 'relative-spy' ? "High Volume vs SPY (Top 20%)" : "High Volume (Top 20%)"}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="lowVolumeClose"
                stroke="#06b6d4"
                strokeWidth={3}
                dot={false}
                name={volumeColorMode === 'relative-spy' ? "Low Volume vs SPY (Bottom 20%)" : "Low Volume (Bottom 20%)"}
                connectNulls={false}
              />
            </>
          )}
          {performanceComparisonEnabled && comparisonMode === 'color' && (
            <>
              <Line
                type="monotone"
                dataKey="topPerformanceClose"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
                name={`Top Performance vs ${performanceComparisonBenchmark} (Top 20%)`}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="bottomPerformanceClose"
                stroke="#ef4444"
                strokeWidth={3}
                dot={false}
                name={`Bottom Performance vs ${performanceComparisonBenchmark} (Bottom 20%)`}
                connectNulls={false}
              />
            </>
          )}
          {comparisonMode === 'line' && comparisonStocks && comparisonStocks.map((compStock, index) => {
            const compPositiveKey = `compPos_${compStock.symbol}`
            const compNegativeKey = `compNeg_${compStock.symbol}`

            return (
              <React.Fragment key={compStock.symbol}>
                {/* Blue line when outperforming (line above selected stock) */}
                <Line
                  type="monotone"
                  dataKey={compPositiveKey}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name={`${compStock.symbol} (Outperforming)`}
                  connectNulls={true}
                />
                {/* Red line when underperforming (line below selected stock) */}
                <Line
                  type="monotone"
                  dataKey={compNegativeKey}
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name={`${compStock.symbol} (Underperforming)`}
                  connectNulls={true}
                />
              </React.Fragment>
            )
          })}
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
