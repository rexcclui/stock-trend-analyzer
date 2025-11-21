import React, { useState, useRef, useEffect } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Customized } from 'recharts'
import { X, ArrowLeftRight, Hand } from 'lucide-react'
import { findBestChannels, filterOverlappingChannels } from './PriceChart/utils/bestChannelFinder'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, volumeColorEnabled = false, volumeColorMode = 'absolute', volumeProfileEnabled = false, volumeProfileMode = 'auto', volumeProfileManualRanges = [], onVolumeProfileManualRangeChange, onVolumeProfileRangeRemove, spyData = null, performanceComparisonEnabled = false, performanceComparisonBenchmark = 'SPY', performanceComparisonDays = 30, comparisonMode = 'line', comparisonStocks = [], slopeChannelEnabled = false, slopeChannelVolumeWeighted = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, revAllChannelEnabled = false, revAllChannelEndIndex = null, onRevAllChannelEndChange, revAllChannelRefreshTrigger = 0, revAllChannelVolumeFilterEnabled = false, manualChannelEnabled = false, manualChannelDragMode = false, bestChannelEnabled = false, bestChannelVolumeFilterEnabled = false, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
  const chartContainerRef = useRef(null)
  const [controlsVisible, setControlsVisible] = useState(false)

  // Store ABSOLUTE optimized parameters (not percentages) so they persist across period changes
  const [optimizedLookbackCount, setOptimizedLookbackCount] = useState(null)
  const [optimizedStdevMult, setOptimizedStdevMult] = useState(null)

  // Store reversed all channels
  const [revAllChannels, setRevAllChannels] = useState([])
  const [revAllChannelsVisibility, setRevAllChannelsVisibility] = useState({})
  // Store the full calculated channels (with fixed slope/stdev) before slider adjustment
  const [revAllChannelsFull, setRevAllChannelsFull] = useState([])

  // Store best channels
  const [bestChannels, setBestChannels] = useState([])
  const [bestChannelsVisibility, setBestChannelsVisibility] = useState({})

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

  // Calculate Last Channel using linear regression
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
      const trendBreakThreshold = 0.1 // Break if >10% of the newest data is outside

      // Start with minimum lookback and try to extend
      let currentCount = minPoints
      let currentStdevMult = 2.5
      let currentTouchCount = 0
      let channelBroken = false

      // Helper function to find optimal stdev for a given dataset
      const findOptimalStdev = (includedPoints, slope, intercept, stdDev) => {
        // Extract turning points from included points
        const dataPoints = includedPoints.map(ip => ip.point)
        const turningPoints = []
        const windowSize = 3

        for (let i = windowSize; i < dataPoints.length - windowSize; i++) {
          const current = dataPoints[i].close
          let isLocalMax = true
          let isLocalMin = true

          for (let j = -windowSize; j <= windowSize; j++) {
            if (j === 0) continue
            const compare = dataPoints[i + j].close
            if (compare >= current) isLocalMax = false
            if (compare <= current) isLocalMin = false
          }

          if (isLocalMax) {
            turningPoints.push({ index: includedPoints[i].originalIndex, type: 'max', value: current })
          } else if (isLocalMin) {
            turningPoints.push({ index: includedPoints[i].originalIndex, type: 'min', value: current })
          }
        }

        for (const stdevMult of stdevMultipliers) {
          const channelWidth = stdDev * stdevMult
          let outsideCount = 0
          let touchCount = 0
          const touchTolerance = 0.025
          const n = includedPoints.length
          const boundRange = channelWidth * 2

          includedPoints.forEach(({ point, originalIndex }) => {
            const predictedY = slope * originalIndex + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth

            if (point.close > upperBound || point.close < lowerBound) {
              outsideCount++
            }
          })

          // Count touches only from turning points with correct type
          turningPoints.forEach(tp => {
            const predictedY = slope * tp.index + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth
            const distanceToUpper = Math.abs(tp.value - upperBound)
            const distanceToLower = Math.abs(tp.value - lowerBound)

            // Upper bound: only count local peaks (max) that are above midline
            // Lower bound: only count local dips (min) that are below midline
            if (tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance && tp.value >= predictedY) {
              touchCount++
            } else if (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance && tp.value <= predictedY) {
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
        const previous80Percent = Math.floor(previousCount * 0.8)

        // Get extended data
        testData = data.slice(0, count)
        includedPoints = testData
          .map((point, index) => ({ point, originalIndex: index }))
          .filter(({ point }) => shouldIncludePoint(point))

        if (includedPoints.length < 10) continue

        // Check if new 20% of data (older historical data) fits within current channel
        const newDataPoints = includedPoints.filter(({ originalIndex }) => originalIndex >= previous80Percent)
        const channelWidth = stdDev * currentStdevMult
        const boundRange = channelWidth * 2
        const outsideTolerance = boundRange * 0.05

        let pointsOutside = 0
        newDataPoints.forEach(({ point, originalIndex }) => {
          const predictedY = slope * originalIndex + intercept
          const upperBound = predictedY + channelWidth
          const lowerBound = predictedY - channelWidth

          if (point.close > upperBound + outsideTolerance || point.close < lowerBound - outsideTolerance) {
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
      const boundRange = channelWidth * 2

      // Find turning points in recent data
      const turningPoints = []
      const windowSize = 3
      for (let i = windowSize; i < recentData.length - windowSize; i++) {
        const current = recentData[i].close
        let isLocalMax = true
        let isLocalMin = true

        for (let j = -windowSize; j <= windowSize; j++) {
          if (j === 0) continue
          const compare = recentData[i + j].close
          if (compare >= current) isLocalMax = false
          if (compare <= current) isLocalMin = false
        }

        if (isLocalMax) {
          turningPoints.push({ index: i, type: 'max', value: current })
        } else if (isLocalMin) {
          turningPoints.push({ index: i, type: 'min', value: current })
        }
      }

      // Count touches only from turning points with correct type
      turningPoints.forEach(tp => {
        const predictedY = slope * tp.index + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const distanceToUpper = Math.abs(tp.value - upperBound)
        const distanceToLower = Math.abs(tp.value - lowerBound)

        // Upper bound: only count local peaks (max) that are above midline
        // Lower bound: only count local dips (min) that are below midline
        if (tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance && tp.value >= predictedY) {
          touchCount++
        } else if (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance && tp.value <= predictedY) {
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

  // Helper function to determine initial lookback window size based on time period
  const getInitialLookbackForPeriod = (daysStr) => {
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

  // Find all channels in the data (REVERSED) by starting at the left edge of the visible window
  // and extending channels forward in time (to the right).
  const findAllChannelsReversed = (data, volumeFilterEnabled = false) => {
    const minLookback = getInitialLookbackForPeriod(days)
    if (!data || data.length < minLookback) return []

    // Filter data by volume if enabled
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
        if (validIndices.size < minLookback) {
          validIndices = new Set(data.map((_, idx) => idx))
        }
      }
    }

    const findTurningPointsForData = (series) => {
      const turningPoints = []
      const windowSize = 3

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

    const allTurningPoints = findTurningPointsForData(data)

    // Filter turning points to only include valid indices (high-volume)
    const turningPoints = volumeFilterEnabled
      ? allTurningPoints.filter(tp => validIndices.has(tp.index))
      : allTurningPoints

    const channels = []
    let currentStartIndex = 0

    while (currentStartIndex <= data.length - minLookback) {
      const remainingLength = data.length - currentStartIndex
      if (remainingLength < minLookback) break

      let lookbackCount = minLookback
      let optimalStdevMult = 2.5
      let channelBroken = false
      let breakIndex = currentStartIndex + lookbackCount

      const findOptimalStdev = (dataSegment) => {
        const stdevMultipliers = []
        for (let mult = 1.0; mult <= 4.0; mult += 0.25) {
          stdevMultipliers.push(mult)
        }

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        let n = 0

        dataSegment.forEach((point, index) => {
          const absoluteIndex = currentStartIndex + index
          // Skip points filtered out by volume if enabled
          if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
            return
          }
          n++
          sumX += index
          sumY += point.close
          sumXY += index * point.close
          sumX2 += index * index
        })

        if (n < 2) return null

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n

        const distances = []
        dataSegment.forEach((point, index) => {
          const absoluteIndex = currentStartIndex + index
          // Skip points filtered out by volume if enabled
          if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
            return
          }
          const predictedY = slope * index + intercept
          distances.push(point.close - predictedY)
        })

        if (distances.length === 0) return null

        const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
        const stdDev = Math.sqrt(variance)

        let bestTouchCount = 0
        let bestStdevMult = 2.5
        let bestCoverage = 0
        let bestCoverageStdevMult = 2.5
        const turningPointsInSegment = turningPoints.filter(tp => tp.index >= currentStartIndex && tp.index < currentStartIndex + dataSegment.length)

        for (const stdevMult of stdevMultipliers) {
          const channelWidth = stdDev * stdevMult
          let touchCount = 0
          const touchTolerance = 0.05
          let pointsWithinBounds = 0
          let pointsConsidered = 0

          dataSegment.forEach((point, index) => {
            const absoluteIndex = currentStartIndex + index
            // Skip points filtered out by volume if enabled
            if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
              return
            }

            pointsConsidered++
            const predictedY = slope * index + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth

            const distanceToUpper = Math.abs(point.close - upperBound)
            const distanceToLower = Math.abs(point.close - lowerBound)

            if (point.close >= lowerBound && point.close <= upperBound) {
              pointsWithinBounds++
            }
          })

          const boundRange = channelWidth * 2
          turningPointsInSegment.forEach(tp => {
            const localIndex = tp.index - currentStartIndex
            const predictedY = slope * localIndex + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth
            const distanceToUpper = Math.abs(tp.value - upperBound)
            const distanceToLower = Math.abs(tp.value - lowerBound)

            const touchesUpper = distanceToUpper <= boundRange * touchTolerance && tp.type === 'max'
            const touchesLower = distanceToLower <= boundRange * touchTolerance && tp.type === 'min'

            if (touchesUpper || touchesLower) {
              touchCount++
            }
          })

          const percentWithinBounds = pointsConsidered > 0
            ? pointsWithinBounds / (volumeFilterEnabled ? pointsConsidered : dataSegment.length)
            : 0

          if (percentWithinBounds > bestCoverage) {
            bestCoverage = percentWithinBounds
            bestCoverageStdevMult = stdevMult
          }

          if (touchCount > 0 &&
              percentWithinBounds >= 0.8 &&
              touchCount > bestTouchCount) {
            bestTouchCount = touchCount
            bestStdevMult = stdevMult
          }
        }

        if (bestTouchCount > 0) {
          return { slope, intercept, stdDev, optimalStdevMult: bestStdevMult }
        }

        if (turningPointsInSegment.length > 0) {
          let minMultForTurningPoint = bestStdevMult
          turningPointsInSegment.forEach(tp => {
            const localIndex = tp.index - currentStartIndex
            const predictedY = slope * localIndex + intercept
            const residual = Math.abs(tp.value - predictedY)
            const requiredMult = stdDev > 0 ? residual / stdDev : 0
            if (requiredMult >= 1) {
              minMultForTurningPoint = Math.max(Math.min(requiredMult, 4), minMultForTurningPoint)
            }
          })

          return { slope, intercept, stdDev, optimalStdevMult: minMultForTurningPoint }
        }

        if (bestCoverage >= 0.8) {
          return { slope, intercept, stdDev, optimalStdevMult: bestCoverageStdevMult }
        }

        const absoluteDistances = distances.map(d => Math.abs(d)).sort((a, b) => a - b)
        const targetIndex = Math.max(Math.floor(absoluteDistances.length * 0.8) - 1, 0)
        const targetDistance = absoluteDistances[targetIndex]
        const coverageMultiplier = stdDev > 0 ? targetDistance / stdDev : 0
        const enforcedStdevMult = Math.max(coverageMultiplier, bestCoverageStdevMult, 1)

        return { slope, intercept, stdDev, optimalStdevMult: enforcedStdevMult }
      }

      let currentSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)
      let channelParams = findOptimalStdev(currentSegment)
      let { slope, intercept, stdDev, optimalStdevMult: currentStdevMult } = channelParams
      optimalStdevMult = currentStdevMult

      while (currentStartIndex + lookbackCount < data.length) {
        const previousLookback = lookbackCount
        const previous90Percent = Math.floor(previousLookback * 0.9)

        lookbackCount++
        const extendedSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)

        const channelWidth = stdDev * optimalStdevMult
        const boundRange = channelWidth * 2
        const outsideTolerance = boundRange * 0.05
        // Use the channel bounds from the previous 90% (before refitting) to test the new 10%
        const newPoints = extendedSegment.slice(previous90Percent)
        let pointsOutside = 0

        newPoints.forEach((point, index) => {
          const globalIndex = previous90Percent + index
          const predictedY = slope * globalIndex + intercept
          const upperBound = predictedY + channelWidth
          const lowerBound = predictedY - channelWidth

          if (point.close > upperBound + outsideTolerance || point.close < lowerBound - outsideTolerance) {
            pointsOutside++
          }
        })

        if (newPoints.length > 0 && pointsOutside / newPoints.length >= 0.08) {
          channelBroken = true
          breakIndex = currentStartIndex + previousLookback
          lookbackCount = previousLookback
          break
        }

        channelParams = findOptimalStdev(extendedSegment)
        slope = channelParams.slope
        intercept = channelParams.intercept
        stdDev = channelParams.stdDev
        optimalStdevMult = channelParams.optimalStdevMult
        currentSegment = extendedSegment
      }

      const channelSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)
      const channelWidth = stdDev * optimalStdevMult
      const channelTurningPoints = turningPoints.filter(tp => tp.index >= currentStartIndex && tp.index < currentStartIndex + lookbackCount)

      const meanY = channelSegment.reduce((sum, p) => sum + p.close, 0) / channelSegment.length
      let ssTotal = 0
      let ssResidual = 0

      channelSegment.forEach((point, index) => {
        const predictedY = slope * index + intercept
        ssTotal += Math.pow(point.close - meanY, 2)
        ssResidual += Math.pow(point.close - predictedY, 2)
      })

      const rSquared = 1 - (ssResidual / ssTotal)

      let touchCount = 0
      const touchTolerance = 0.05

      const boundRange = channelWidth * 2
      channelTurningPoints.forEach(tp => {
        const localIndex = tp.index - currentStartIndex
        const predictedY = slope * localIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const distanceToUpper = Math.abs(tp.value - upperBound)
        const distanceToLower = Math.abs(tp.value - lowerBound)

        if ((tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance) ||
            (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance)) {
          touchCount++
        }
      })

      channels.push({
        startIndex: currentStartIndex,
        endIndex: currentStartIndex + lookbackCount - 1,
        slope,
        intercept,
        channelWidth,
        stdDev,
        optimalStdevMult,
        lookbackCount,
        rSquared,
        touchCount
      })

      if (channelBroken) {
        currentStartIndex = breakIndex
      } else {
        currentStartIndex = currentStartIndex + lookbackCount
      }
    }

    return channels
  }

  // Recalculate a single channel with new data range
  const recalculateChannelWithNewRange = (originalChannel, newStartIndex, newEndIndex) => {
    const dataLength = Math.min(prices.length, indicators.length)
    const displayPrices = prices.slice(0, dataLength)

    // Extract data for new range
    const dataSegment = displayPrices.slice(newStartIndex, newEndIndex + 1)
    if (dataSegment.length < 10) return originalChannel // Minimum length check

    // Calculate linear regression
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

    // Find turning points in the new range
    const findTurningPoints = (series) => {
      const turningPoints = []
      const windowSize = 3

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

    const turningPoints = findTurningPoints(dataSegment)

    // Find optimal stdev multiplier
    const stdevMultipliers = []
    for (let mult = 1.0; mult <= 4.0; mult += 0.25) {
      stdevMultipliers.push(mult)
    }

    let bestTouchCount = 0
    let bestStdevMult = 2.5
    let bestCoverage = 0
    let bestCoverageStdevMult = 2.5

    for (const stdevMult of stdevMultipliers) {
      const channelWidth = stdDev * stdevMult
      let touchCount = 0
      const touchTolerance = 0.05
      let pointsWithinBounds = 0

      dataSegment.forEach((point, index) => {
        const predictedY = slope * index + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        if (point.close >= lowerBound && point.close <= upperBound) {
          pointsWithinBounds++
        }
      })

      const boundRange = channelWidth * 2
      turningPoints.forEach(tp => {
        const predictedY = slope * tp.index + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const distanceToUpper = Math.abs(tp.value - upperBound)
        const distanceToLower = Math.abs(tp.value - lowerBound)

        const touchesUpper = distanceToUpper <= boundRange * touchTolerance && tp.type === 'max'
        const touchesLower = distanceToLower <= boundRange * touchTolerance && tp.type === 'min'

        if (touchesUpper || touchesLower) {
          touchCount++
        }
      })

      const percentWithinBounds = pointsWithinBounds / dataSegment.length

      if (percentWithinBounds > bestCoverage) {
        bestCoverage = percentWithinBounds
        bestCoverageStdevMult = stdevMult
      }

      if (touchCount > 0 && percentWithinBounds >= 0.8 && touchCount > bestTouchCount) {
        bestTouchCount = touchCount
        bestStdevMult = stdevMult
      }
    }

    // Use best coverage if no good touches found
    const optimalStdevMult = bestTouchCount > 0 ? bestStdevMult : (bestCoverage >= 0.8 ? bestCoverageStdevMult : 2.5)
    const channelWidth = stdDev * optimalStdevMult
    const touchCount = bestTouchCount

    // Return updated channel with new parameters
    return {
      ...originalChannel,
      startIndex: newStartIndex,
      endIndex: newEndIndex,
      slope,
      intercept,
      stdDev,
      channelWidth,
      optimalStdevMult,
      touchCount
    }
  }

  // Effect to calculate reversed all channels ONCE on full data (not affected by slider)
  useEffect(() => {
    if (revAllChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const totalLength = displayPrices.length

      if (totalLength === 0) {
        setRevAllChannelsFull([])
        return
      }

      const visibleStart = zoomRange?.start ?? 0
      const visibleEnd = zoomRange?.end === null ? totalLength : Math.min(totalLength, zoomRange.end)

      const startDisplayIndex = Math.max(0, totalLength - visibleEnd)
      const endDisplayIndex = Math.min(totalLength - 1, totalLength - 1 - visibleStart)

      const visibleSlice = displayPrices.slice(startDisplayIndex, endDisplayIndex + 1)
      const visibleOldestToNewest = visibleSlice.slice().reverse()

      if (visibleOldestToNewest.length < 2) {
        setRevAllChannelsFull([])
        return
      }

      // Calculate channels on the FULL visible data (not limited by slider)
      const foundChannelsLocal = findAllChannelsReversed(visibleOldestToNewest, revAllChannelVolumeFilterEnabled)

      const adjustIndexToDisplay = (localIndex) => startDisplayIndex + (visibleOldestToNewest.length - 1 - localIndex)

      const adjustedChannels = foundChannelsLocal.map(channel => {
        const mappedStart = adjustIndexToDisplay(channel.startIndex)
        const mappedEnd = adjustIndexToDisplay(channel.endIndex)

        // Display indices run newest-first, so preserve the chronological orientation (oldest→newest)
        // while also storing a normalized range for rendering checks.
        const chronologicalStartIndex = mappedStart // Oldest point in the segment (highest display index)
        const chronologicalEndIndex = mappedEnd     // Newest point in the segment (lowest display index)
        const renderStartIndex = Math.min(mappedStart, mappedEnd)
        const renderEndIndex = Math.max(mappedStart, mappedEnd)

        return {
          ...channel,
          startIndex: renderStartIndex,
          endIndex: renderEndIndex,
          chronologicalStartIndex,
          chronologicalEndIndex
        }
      })

      setRevAllChannelsFull(adjustedChannels)
    } else {
      setRevAllChannelsFull([])
    }
  }, [revAllChannelEnabled, prices, indicators, revAllChannelRefreshTrigger, revAllChannelVolumeFilterEnabled, zoomRange?.start, zoomRange?.end])

  // Effect to apply slider-based filtering to channels (does NOT recalculate slope/stdev)
  useEffect(() => {
    if (revAllChannelEnabled && revAllChannelsFull.length > 0) {
      // Simply pass through the full channels without modification
      // The slider will be handled by filtering data points during chart rendering
      setRevAllChannels(revAllChannelsFull)
      setRevAllChannelsVisibility(prev => {
        const visibility = {}
        revAllChannelsFull.forEach((_, index) => {
          visibility[index] = prev[index] !== false
        })
        return visibility
      })
    } else if (!revAllChannelEnabled) {
      setRevAllChannels([])
      setRevAllChannelsVisibility({})
    }
  }, [revAllChannelEnabled, revAllChannelsFull])

  // Effect to calculate best channels when bestChannelEnabled changes
  useEffect(() => {
    if (bestChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const totalLength = displayPrices.length

      if (totalLength < 20) {
        setBestChannels([])
        setBestChannelsVisibility({})
        return
      }

      // Calculate visible range based on zoomRange
      const visibleStart = zoomRange?.start ?? 0
      const visibleEnd = zoomRange?.end === null ? totalLength : Math.min(totalLength, zoomRange.end)

      const startDisplayIndex = Math.max(0, totalLength - visibleEnd)
      const endDisplayIndex = Math.min(totalLength - 1, totalLength - 1 - visibleStart)

      const visibleSlice = displayPrices.slice(startDisplayIndex, endDisplayIndex + 1)

      if (visibleSlice.length < 20) {
        setBestChannels([])
        setBestChannelsVisibility({})
        return
      }

      // Determine simulation parameters based on visible data length
      const dataLen = visibleSlice.length
      const minLength = Math.max(20, Math.floor(dataLen * 0.1))
      const maxLength = Math.floor(dataLen * 0.8)
      const startStep = Math.max(1, Math.floor(dataLen * 0.02))
      const lengthStep = Math.max(1, Math.floor(dataLen * 0.02))

      // Find best channels in the visible range
      const foundChannels = findBestChannels(visibleSlice, {
        minStartIndex: 0,
        maxStartIndex: Math.max(0, dataLen - minLength),
        minLength,
        maxLength,
        startStep,
        lengthStep,
        stdevMultipliers: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
        touchTolerance: 0.05,
        similarityThreshold: 0.9,
        volumeFilterEnabled: bestChannelVolumeFilterEnabled
      })

      // Adjust indices and intercept to global display indices
      // The regression was calculated with x-coordinates starting at channel.startIndex (local to visibleSlice)
      // When rendering, we use localIndex = globalIndex - channel.startIndex, which starts at 0
      // So we need to adjust intercept to account for this x-axis shift
      const adjustedChannels = foundChannels.map(channel => {
        const localStartIdx = channel.startIndex  // Save the local start index before adjusting

        // Calculate percentage of points inside channel bounds
        // Points within 5% of channel width from bounds are still considered "inside"
        const channelSegment = visibleSlice.slice(channel.startIndex, channel.endIndex + 1)
        const tolerance = channel.channelWidth * 0.05  // 5% of channel width
        let pointsInside = 0

        channelSegment.forEach((point, index) => {
          const x = channel.startIndex + index
          const predictedY = channel.slope * x + channel.intercept
          const actualY = point.close

          // Calculate channel bounds
          const upperBound = predictedY + channel.channelWidth
          const lowerBound = predictedY - channel.channelWidth

          // Point is inside if within bounds plus tolerance
          const isInside = actualY >= (lowerBound - tolerance) && actualY <= (upperBound + tolerance)

          if (isInside) {
            pointsInside++
          }
        })

        const percentInside = (pointsInside / channelSegment.length) * 100

        return {
          ...channel,
          startIndex: localStartIdx + startDisplayIndex,
          endIndex: channel.endIndex + startDisplayIndex,
          // Adjust intercept: at x=0 in new coords, we want y-value that was at x=localStartIdx
          // Original: y = slope * localStartIdx + intercept_old
          // New: y = slope * 0 + intercept_new
          // Therefore: intercept_new = intercept_old + slope * localStartIdx
          intercept: channel.intercept + channel.slope * localStartIdx,
          percentInside: percentInside  // Percentage of points inside channel bounds (with 5% tolerance)
        }
      })

      // Filter overlapping channels: skip channels with >30% overlap, keep looking for non-overlapping ones
      const filteredChannels = filterOverlappingChannels(adjustedChannels, 0.3)

      // Limit to top 5 channels
      const topChannels = filteredChannels.slice(0, 5)

      setBestChannels(topChannels)
      setBestChannelsVisibility(prev => {
        const visibility = {}
        topChannels.forEach((_, index) => {
          visibility[index] = prev[index] !== false
        })
        return visibility
      })
    } else {
      setBestChannels([])
      setBestChannelsVisibility({})
    }
  }, [bestChannelEnabled, bestChannelVolumeFilterEnabled, prices, indicators, days, zoomRange?.start, zoomRange?.end])

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

  // Calculate volume-weighted zones for all channels (dynamic zones based on period)
  const calculateAllChannelZones = (data, allChannels, numZones = 5) => {
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
          const rangeStart = Math.min(channel.startIndex, channel.endIndex)
          const rangeEnd = Math.max(channel.startIndex, channel.endIndex)
          if (globalIndex < rangeStart || globalIndex >= rangeEnd) return

          const chronologicalStart = channel.chronologicalStartIndex ?? channel.startIndex
          const localIndex = Math.abs(chronologicalStart - globalIndex)
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

  // Calculate last channel ONLY on the data that will be displayed
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

  const slopeChannelInfo = slopeChannelEnabled ? calculateSlopeChannel(displayPrices, true, slopeChannelVolumeWeighted) : null
  const zoneColors = slopeChannelEnabled && slopeChannelInfo
    ? calculateZoneColors(displayPrices, slopeChannelInfo, slopeChannelZones)
    : []

  // Determine number of zones based on period
  // Less than 1 year (365 days): 3 zones for simpler view
  // 1 year or more: 5 zones for detailed analysis
  const daysNum = parseInt(days) || 365
  const numZonesForChannels = daysNum < 365 ? 3 : 5

  // Calculate zones for reversed all channels
  const revAllChannelZones = revAllChannelEnabled && revAllChannels.length > 0
    ? calculateAllChannelZones(displayPrices, revAllChannels, numZonesForChannels)
    : {}

  // Calculate zones for best channels
  const bestChannelZones = bestChannelEnabled && bestChannels.length > 0
    ? calculateAllChannelZones(displayPrices, bestChannels, numZonesForChannels)
    : {}

  // Calculate zones for all manual channels
  const allManualChannelZones = manualChannelEnabled && manualChannels.length > 0
    ? manualChannels.map(channel => calculateManualChannelZones(displayPrices, channel))
    : []

  // Calculate the slider cutoff index for revAllChannel
  let revAllChannelCutoffIndex = null
  if (revAllChannelEnabled && revAllChannelEndIndex !== null) {
    const dataLength = displayPrices.length
    const visibleStart = zoomRange?.start ?? 0
    const visibleEnd = zoomRange?.end === null ? dataLength : Math.min(dataLength, zoomRange.end)
    const startDisplayIndex = Math.max(0, dataLength - visibleEnd)
    const endDisplayIndex = Math.min(dataLength - 1, dataLength - 1 - visibleStart)
    const visibleLength = endDisplayIndex - startDisplayIndex + 1
    const clampedEndIndex = Math.min(Math.max(revAllChannelEndIndex, 0), visibleLength - 1)
    // Convert from oldest-to-newest index to display index (newest-first)
    revAllChannelCutoffIndex = startDisplayIndex + (visibleLength - 1 - clampedEndIndex)
  }

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

    // Add last channel data if enabled
    if (slopeChannelInfo && slopeChannelInfo.channelData[index]) {
      const channel = slopeChannelInfo.channelData[index]
      dataPoint.channelUpper = channel.upper
      dataPoint.channelMid = channel.mid
      dataPoint.channelLower = channel.lower

      // Add zone boundaries for last channel
      if (zoneColors.length > 0) {
        const channelRange = channel.upper - channel.lower
        zoneColors.forEach((zone, zoneIndex) => {
          const zoneLower = channel.lower + channelRange * zone.zoneStart
          const zoneUpper = channel.lower + channelRange * zone.zoneEnd
          dataPoint[`zone${zoneIndex}Lower`] = zoneLower
          dataPoint[`zone${zoneIndex}Upper`] = zoneUpper
        })
      }
    }

    // Add reversed all channels data if enabled
    if (revAllChannelEnabled && revAllChannels.length > 0) {
      // Check if this data point should have channel data based on slider position
      // In newest-first order: slider controls oldest end, so we show channels on indices <= cutoff
      const shouldIncludeChannelData = revAllChannelCutoffIndex === null || index <= revAllChannelCutoffIndex

      if (shouldIncludeChannelData) {
        revAllChannels.forEach((channel, channelIndex) => {
          // Check if this index is within this channel's range
          if (index >= channel.startIndex && index < channel.endIndex) {
            const chronologicalStart = channel.chronologicalStartIndex ?? channel.startIndex
            const localIndex = Math.abs(chronologicalStart - index)
            const midValue = channel.slope * localIndex + channel.intercept
            const upperBound = midValue + channel.channelWidth
            const lowerBound = midValue - channel.channelWidth

            dataPoint[`revAllChannel${channelIndex}Upper`] = upperBound
            dataPoint[`revAllChannel${channelIndex}Mid`] = midValue
            dataPoint[`revAllChannel${channelIndex}Lower`] = lowerBound

            // Add zone boundaries for this channel
            if (revAllChannelZones[channelIndex]) {
              const channelRange = upperBound - lowerBound
              revAllChannelZones[channelIndex].forEach((zone, zoneIndex) => {
                const zoneLower = lowerBound + channelRange * zone.zoneStart
                const zoneUpper = lowerBound + channelRange * zone.zoneEnd
                dataPoint[`revAllChannel${channelIndex}Zone${zoneIndex}Lower`] = zoneLower
                dataPoint[`revAllChannel${channelIndex}Zone${zoneIndex}Upper`] = zoneUpper
              })
            }
          }
        })
      }
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

    // Add best channels data
    if (bestChannelEnabled && bestChannels.length > 0) {
      bestChannels.forEach((channel, channelIndex) => {
        if (index >= channel.startIndex && index <= channel.endIndex) {
          const localIndex = index - channel.startIndex
          const midValue = channel.slope * localIndex + channel.intercept
          const upperBound = midValue + channel.channelWidth
          const lowerBound = midValue - channel.channelWidth

          dataPoint[`bestChannel${channelIndex}Upper`] = upperBound
          dataPoint[`bestChannel${channelIndex}Mid`] = midValue
          dataPoint[`bestChannel${channelIndex}Lower`] = lowerBound

          // Add zone boundaries for this best channel
          if (bestChannelZones[channelIndex]) {
            const channelRange = upperBound - lowerBound
            bestChannelZones[channelIndex].forEach((zone, zoneIndex) => {
              const zoneLower = lowerBound + channelRange * zone.zoneStart
              const zoneUpper = lowerBound + channelRange * zone.zoneEnd
              dataPoint[`bestChannel${channelIndex}Zone${zoneIndex}Lower`] = zoneLower
              dataPoint[`bestChannel${channelIndex}Zone${zoneIndex}Upper`] = zoneUpper
            })
          }
        }
      })
    }

    return dataPoint
  }).reverse() // Show oldest to newest

  // Apply zoom range to chart data FIRST
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  let visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // NOW calculate and inject comparison lines based on the ACTUAL visible data
  // This ensures the baseline is ALWAYS the first VISIBLE point
  if (comparisonMode === 'line' && comparisonStocks && comparisonStocks.length > 0 && visibleChartData.length > 0) {
    // Get the FIRST VISIBLE data point as baseline
    const firstVisiblePoint = visibleChartData[0]
    const firstVisibleDate = firstVisiblePoint.date
    const selectedFirstPrice = firstVisiblePoint.close

    if (selectedFirstPrice) {
      comparisonStocks.forEach((compStock) => {
        // Build a map of comparison stock prices by date
        const compPriceByDate = {}
        if (compStock.data && compStock.data.prices) {
          compStock.data.prices.forEach(p => {
            compPriceByDate[p.date] = p.close
          })
        }

        // Get baseline comparison price at the SAME date
        const compFirstPrice = compPriceByDate[firstVisibleDate]
        if (!compFirstPrice) {
          return
        }

        // Inject comparison data into each visible point
        visibleChartData = visibleChartData.map((point, index) => {
          const compCurrentPrice = compPriceByDate[point.date]

          if (!compCurrentPrice || !point.close) {
            return point
          }

          // Historical % change from baseline (first visible point)
          const selectedHistPctChg = (point.close - selectedFirstPrice) / selectedFirstPrice
          const compHistPctChg = (compCurrentPrice - compFirstPrice) / compFirstPrice

          // Performance difference
          const perfDiffPct = compHistPctChg - selectedHistPctChg

          // Comparison line value
          const lineValue = (perfDiffPct + 1) * point.close

          // Add comparison data to this point
          const compPriceKey = `compPrice_${compStock.symbol}`
          const compPerfKey = `compPerf_${compStock.symbol}`
          const compPositiveKey = `compPos_${compStock.symbol}` // Blue: above
          const compNegativeKey = `compNeg_${compStock.symbol}` // Red: below

          // Determine if line is above or below
          const isAbove = lineValue > point.close

          // Check if this is a crossover point by looking at previous point
          let isCrossover = false
          if (index > 0) {
            const prevPoint = visibleChartData[index - 1]
            const prevCompPrice = compPriceByDate[prevPoint.date]

            if (prevCompPrice && prevPoint.close) {
              const prevSelectedHistPctChg = (prevPoint.close - selectedFirstPrice) / selectedFirstPrice
              const prevCompHistPctChg = (prevCompPrice - compFirstPrice) / compFirstPrice
              const prevPerfDiffPct = prevCompHistPctChg - prevSelectedHistPctChg
              const prevLineValue = (prevPerfDiffPct + 1) * prevPoint.close
              const prevIsAbove = prevLineValue > prevPoint.close

              // Crossover detected if direction changed
              isCrossover = isAbove !== prevIsAbove
            }
          }

          // At crossover points, set BOTH values to ensure continuity
          // Otherwise, set only one value
          return {
            ...point,
            [compPriceKey]: compCurrentPrice,
            [compPerfKey]: perfDiffPct * 100,
            [compPositiveKey]: (isAbove || isCrossover) ? lineValue : null,
            [compNegativeKey]: (!isAbove || isCrossover) ? lineValue : null
          }
        })
      })
    }
  }

  const revAllVisibleLength = visibleChartData.length
  const maxRevAllChannelEndIndex = revAllVisibleLength > 0 ? revAllVisibleLength - 1 : 0
  const effectiveRevAllChannelEndIndex = Math.min(
    Math.max(revAllChannelEndIndex ?? maxRevAllChannelEndIndex, 0),
    maxRevAllChannelEndIndex
  )
  const revAllChannelEndDate = revAllVisibleLength > 0
    ? visibleChartData[effectiveRevAllChannelEndIndex]?.date
    : null

  // Handle mouse wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault()
    if (!onZoomChange) return

    const delta = e.deltaY
    const zoomFactor = 0.1 // 10% zoom per scroll
    const currentRange = endIndex - zoomRange.start
    const zoomAmount = Math.max(1, Math.floor(currentRange * zoomFactor))

    // Calculate cursor position for cursor-anchored zoom
    let cursorRatio = 0.5 // Default to center if we can't determine cursor position
    const chartElement = chartContainerRef.current
    if (chartElement) {
      const rect = chartElement.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const chartWidth = rect.width
      if (chartWidth > 0) {
        // Calculate cursor position as ratio (0.0 = left edge, 1.0 = right edge)
        cursorRatio = Math.max(0, Math.min(1, mouseX / chartWidth))
      }
    }

    if (delta < 0) {
      // Scroll up - Zoom in (show less data)
      const newRange = Math.max(10, currentRange - zoomAmount)

      // Calculate the data index under cursor before zoom
      const cursorDataIndex = zoomRange.start + (cursorRatio * currentRange)

      // Calculate new start so cursor stays at same position
      let newStart = Math.round(cursorDataIndex - (cursorRatio * newRange))
      newStart = Math.max(0, Math.min(chartData.length - newRange, newStart))

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

        // Calculate the data index under cursor before zoom
        const cursorDataIndex = zoomRange.start + (cursorRatio * currentRange)

        // Calculate new start so cursor stays at same position
        let newStart = Math.round(cursorDataIndex - (cursorRatio * newRange))
        newStart = Math.max(0, newStart)

        let newEnd = Math.min(chartData.length, newStart + newRange)

        // Adjust if we hit the right boundary
        if (newEnd === chartData.length && newRange < chartData.length) {
          newStart = chartData.length - newRange
        }

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
      const boundRange = channelWidth * 2

      // Only count touches from turning points with correct type
      turningPoints.forEach(tp => {
        const localIndex = tp.index - minIndex
        const predictedY = slope * localIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        const distanceToUpper = Math.abs(tp.value - upperBound)
        const distanceToLower = Math.abs(tp.value - lowerBound)

        // Upper bound: only count local peaks (max) that are above midline
        if (tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance && tp.value >= predictedY) {
          touchCount++
          hasUpperTouch = true
          hasTurningPointTouch = true
        }
        // Lower bound: only count local dips (min) that are below midline
        else if (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance && tp.value <= predictedY) {
          touchCount++
          hasLowerTouch = true
          hasTurningPointTouch = true
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

    const boundRange = channelWidth * 2
    const outsideTolerance = boundRange * 0.05
    const trendBreakThreshold = 0.1 // If >10% of new points are outside, break

    // Step 1: Extend forward (from endIndex to end of data) point by point
    let forwardExtended = false
    const maxEndIndex = displayPrices.length - 1

    while (endIndex < maxEndIndex) {
      // Try extending by one more point
      const testEndIndex = endIndex + 1

      // Calculate the total extended range
      const totalExtendedLength = testEndIndex - startIndex + 1

      // Get the LAST 20% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.2))
      const windowStartIdx = testEndIndex - windowSize + 1
      const last20PercentPoints = displayPrices.slice(windowStartIdx, testEndIndex + 1)

      // Check how many of the LAST 20% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < last20PercentPoints.length; i++) {
        const globalIndex = windowStartIdx + i
        const localIndex = globalIndex - startIndex
        const predictedY = slope * localIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = last20PercentPoints[i].close

        if (actualY > upperBound + outsideTolerance || actualY < lowerBound - outsideTolerance) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / last20PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the last 20% points are outside, stop extending forward
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

      // Get the FIRST 20% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.2))
      const windowEndIdx = testStartIndex + windowSize - 1
      const first20PercentPoints = displayPrices.slice(testStartIndex, windowEndIdx + 1)

      // Check how many of the FIRST 20% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < first20PercentPoints.length; i++) {
        const globalIndex = testStartIndex + i
        const localIndex = globalIndex - testStartIndex
        const predictedY = slope * localIndex + newIntercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = first20PercentPoints[i].close

        if (actualY > upperBound + outsideTolerance || actualY < lowerBound - outsideTolerance) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / first20PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the first 20% points are outside, stop extending backward
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

    // Find turning points in extended segment
    const turningPointsInSegment = findTurningPoints(displayPrices, startIndex, endIndex)
    const finalBoundRange = finalChannelWidth * 2
    const touchToleranceCalc = 0.05

    // Count touches only from turning points with correct type
    turningPointsInSegment.forEach(tp => {
      const localIndex = tp.index - startIndex
      const predictedY = slope * localIndex + intercept
      const upperBound = predictedY + finalChannelWidth
      const lowerBound = predictedY - finalChannelWidth

      const distanceToUpper = Math.abs(tp.value - upperBound)
      const distanceToLower = Math.abs(tp.value - lowerBound)

      // Upper bound: only count local peaks (max) that are above midline
      if (tp.type === 'max' && distanceToUpper <= finalBoundRange * touchToleranceCalc && tp.value >= predictedY) {
        touchCount++
      }
      // Lower bound: only count local dips (min) that are below midline
      else if (tp.type === 'min' && distanceToLower <= finalBoundRange * touchToleranceCalc && tp.value <= predictedY) {
        touchCount++
      }
    })

    extendedSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
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

          // Check if this is a reversed all channel line
          const isRevAllChannel = entry.dataKey.startsWith('revAllChannel') && entry.dataKey.endsWith('Mid')
          const revChannelIndex = isRevAllChannel ? parseInt(entry.dataKey.replace('revAllChannel', '').replace('Mid', '')) : null

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

          // Skip rendering revAllChannel upper/lower bounds in legend
          if (entry.dataKey && (entry.dataKey.includes('revAllChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
            return null
          }

          // Skip rendering manual channel upper/lower bounds in legend
          if (entry.dataKey && (entry.dataKey.includes('manualChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
            return null
          }

          // Skip rendering best channel upper/lower bounds in legend
          if (entry.dataKey && (entry.dataKey.includes('bestChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
            return null
          }

          const isVisible = isSma ? smaVisibility[period] : (isAllChannel ? allChannelsVisibility[channelIndex] : (isRevAllChannel ? revAllChannelsVisibility[revChannelIndex] : (isTrendLine ? trendChannelVisible : true)))
          const isClickable = isSma || isAllChannel || isRevAllChannel || isTrendLine

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
                  } else if (isRevAllChannel) {
                    setRevAllChannelsVisibility(prev => ({
                      ...prev,
                      [revChannelIndex]: !prev[revChannelIndex]
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
                <>
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
                </>
              )}
              {isRevAllChannel && revAllChannels[revChannelIndex] && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Decrease range by 5% on each side and recalculate
                      setRevAllChannels(prev => prev.map((channel, idx) => {
                        if (idx !== revChannelIndex) return channel
                        const currentLength = channel.endIndex - channel.startIndex + 1
                        const shrinkAmount = Math.max(1, Math.floor(currentLength * 0.05))
                        const newStartIndex = channel.startIndex + shrinkAmount
                        const newEndIndex = channel.endIndex - shrinkAmount
                        // Ensure minimum length of 10 points
                        if (newEndIndex - newStartIndex + 1 < 10) return channel
                        // Recalculate channel with new range
                        return recalculateChannelWithNewRange(channel, newStartIndex, newEndIndex)
                      }))
                    }}
                    className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                    title="Shrink channel range by 5% on each side (recalculates slope & stdev)"
                  >
                    −
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Increase range by 5% on each side and recalculate
                      setRevAllChannels(prev => prev.map((channel, idx) => {
                        if (idx !== revChannelIndex) return channel
                        const currentLength = channel.endIndex - channel.startIndex + 1
                        const expandAmount = Math.max(1, Math.floor(currentLength * 0.05))
                        const newStartIndex = Math.max(0, channel.startIndex - expandAmount)
                        const dataLength = Math.min(prices.length, indicators.length)
                        const newEndIndex = Math.min(dataLength - 1, channel.endIndex + expandAmount)
                        // Recalculate channel with new range
                        return recalculateChannelWithNewRange(channel, newStartIndex, newEndIndex)
                      }))
                    }}
                    className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                    title="Expand channel range by 5% on each side (recalculates slope & stdev)"
                  >
                    +
                  </button>
                </>
              )}
              {isTrendLine && slopeChannelEnabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Disable last channel by calling parent handler
                    if (onSlopeChannelParamsChange) {
                      // Signal to parent to disable last channel
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
    if (!slopeChannelEnabled || zoneColors.length === 0) {
      return null
    }

    const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) {
      return null
    }

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

          if (points.length < 2) {
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

  // Custom component to render stdev label in middle of lower bound for last channel
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

  // Custom component to render zone lines for reversed all channels
  const CustomRevAllChannelZoneLines = (props) => {
    if (!revAllChannelEnabled || revAllChannels.length === 0 || Object.keys(revAllChannelZones).length === 0) return null

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
        {revAllChannels.map((channel, channelIndex) => {
          const isVisible = revAllChannelsVisibility[channelIndex] !== false
          if (!isVisible) return null

          const channelColor = channelColors[channelIndex % channelColors.length]
          const zones = revAllChannelZones[channelIndex]
          if (!zones) return null

          return zones.map((zone, zoneIndex) => {
            const points = chartDataWithZones.map((point) => {
              const upper = point[`revAllChannel${channelIndex}Zone${zoneIndex}Upper`]
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
              <g key={`rev-channel-${channelIndex}-zone-${zoneIndex}`}>
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
                <g>
                  {/* Background rectangle for better readability */}
                  <rect
                    x={lastPoint.x - 30}
                    y={lastPoint.y - 8}
                    width={25}
                    height={16}
                    fill="rgba(15, 23, 42, 0.85)"
                    stroke={color}
                    strokeWidth={0.5}
                    rx={2}
                  />
                  <text
                    x={lastPoint.x - 5}
                    y={lastPoint.y}
                    fill={`hsl(${hue}, 70%, ${Math.max(20, lightness - (zone.volumeWeight * 30))}%)`}
                    fontSize="11"
                    fontWeight={zone.volumeWeight > 0.3 ? "800" : "700"}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {(zone.volumeWeight * 100).toFixed(1)}%
                  </text>
                </g>
              </g>
            )
          })
        })}
      </g>
    )
  }

  // Custom component to render stdev labels at midpoint of All Channel lower bounds
  const CustomRevAllChannelStdevLabels = (props) => {
    if (!revAllChannelEnabled || revAllChannels.length === 0) return null

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
        {revAllChannels.map((channel, channelIndex) => {
          const isVisible = revAllChannelsVisibility[channelIndex] !== false
          if (!isVisible) return null

          const channelColor = channelColors[channelIndex % channelColors.length]

          // Find all points in chartDataWithZones that have this channel's data
          const pointsWithChannel = chartDataWithZones
            .map((point, idx) => ({ point, idx }))
            .filter(({ point }) => point[`revAllChannel${channelIndex}Lower`] !== undefined)

          if (pointsWithChannel.length === 0) return null

          // Find the midpoint among those points
          const midIndex = Math.floor(pointsWithChannel.length / 2)
          const { point: midPoint } = pointsWithChannel[midIndex]

          const x = xAxis.scale(midPoint.date)
          const y = yAxis.scale(midPoint[`revAllChannel${channelIndex}Lower`])

          if (x === undefined || y === undefined) {
            return null
          }

          const stdevText = `${channel.optimalStdevMult.toFixed(2)}σ`

          return (
            <g key={`rev-all-channel-stdev-${channelIndex}`}>
              {/* Background rectangle for better readability */}
              <rect
                x={x - 20}
                y={y + 2}
                width={40}
                height={16}
                fill="rgba(15, 23, 42, 0.9)"
                stroke={channelColor}
                strokeWidth={1}
                rx={3}
              />
              {/* Stdev label */}
              <text
                x={x}
                y={y + 10}
                fill={channelColor}
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
                <g>
                  {/* Background rectangle for better readability */}
                  <rect
                    x={lastPoint.x - 30}
                    y={lastPoint.y - 8}
                    width={25}
                    height={16}
                    fill="rgba(15, 23, 42, 0.85)"
                    stroke={(() => {
                      const weight = zone.volumeWeight
                      if (weight >= 0.25) return '#22c55e'
                      if (weight >= 0.20) return '#84cc16'
                      if (weight >= 0.15) return '#eab308'
                      if (weight >= 0.10) return '#f97316'
                      return '#ef4444'
                    })()}
                    strokeWidth={0.5}
                    rx={2}
                  />
                  <text
                    x={lastPoint.x - 5}
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
                    fontWeight="700"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {(zone.volumeWeight * 100).toFixed(1)}%
                  </text>
                </g>
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

  // Custom component to render zone lines for best channels
  const CustomBestChannelZoneLines = (props) => {
    if (!bestChannelEnabled || bestChannels.length === 0 || Object.keys(bestChannelZones).length === 0) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Color palette for best channels (warm colors - amber/orange/yellow tones)
    const channelColors = [
      '#f59e0b',  // Amber
      '#f97316',  // Orange
      '#eab308',  // Yellow
      '#fb923c',  // Light Orange
      '#fbbf24',  // Light Amber
    ]

    return (
      <g>
        {bestChannels.map((channel, channelIndex) => {
          const isVisible = bestChannelsVisibility[channelIndex] !== false
          if (!isVisible) return null

          const channelColor = channelColors[channelIndex % channelColors.length]
          const zones = bestChannelZones[channelIndex]
          if (!zones) return null

          return zones.map((zone, zoneIndex) => {
            const points = chartDataWithZones.map((point) => {
              const upper = point[`bestChannel${channelIndex}Zone${zoneIndex}Upper`]
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

            // Color based on volume weight: cool to warm gradient
            // Low volume (0-20%): Blue/Cyan
            // Medium-Low (20-40%): Green/Yellow-Green
            // Medium (40-60%): Yellow
            // Medium-High (60-80%): Orange
            // High (80-100%): Red/Deep Orange
            let hue, saturation, lightness

            if (zone.volumeWeight < 0.2) {
              // Low volume - Blue/Cyan
              hue = 200 - (zone.volumeWeight / 0.2) * 20  // 200 to 180
              saturation = 70
              lightness = 55
            } else if (zone.volumeWeight < 0.4) {
              // Medium-low - Cyan to Green
              const t = (zone.volumeWeight - 0.2) / 0.2
              hue = 180 - t * 60  // 180 to 120 (green)
              saturation = 65
              lightness = 50
            } else if (zone.volumeWeight < 0.6) {
              // Medium - Green to Yellow
              const t = (zone.volumeWeight - 0.4) / 0.2
              hue = 120 - t * 60  // 120 to 60 (yellow)
              saturation = 75
              lightness = 50
            } else if (zone.volumeWeight < 0.8) {
              // Medium-high - Yellow to Orange
              const t = (zone.volumeWeight - 0.6) / 0.2
              hue = 60 - t * 25  // 60 to 35 (orange)
              saturation = 85
              lightness = 52
            } else {
              // High volume - Orange to Red
              const t = (zone.volumeWeight - 0.8) / 0.2
              hue = 35 - t * 25  // 35 to 10 (red)
              saturation = 90
              lightness = 50
            }

            const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
            const opacity = 0.4 + (zone.volumeWeight * 0.5) // 0.4 to 0.9

            return (
              <g key={`best-channel-${channelIndex}-zone-${zoneIndex}`}>
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
                <g>
                  {/* Background rectangle for better readability */}
                  <rect
                    x={lastPoint.x - 30}
                    y={lastPoint.y - 8}
                    width={25}
                    height={16}
                    fill="rgba(15, 23, 42, 0.85)"
                    stroke={color}
                    strokeWidth={0.5}
                    rx={2}
                  />
                  <text
                    x={lastPoint.x - 5}
                    y={lastPoint.y}
                    fill={color}
                    fontSize="11"
                    fontWeight={zone.volumeWeight > 0.5 ? "800" : "700"}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {(zone.volumeWeight * 100).toFixed(1)}%
                  </text>
                </g>
              </g>
            )
          })
        })}
      </g>
    )
  }

  // Custom component to render stdev labels at midpoint of Best Channel lower bounds
  const CustomBestChannelStdevLabels = (props) => {
    if (!bestChannelEnabled || bestChannels.length === 0) return null

    const { xAxisMap, yAxisMap } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Color palette matching best channels
    const channelColors = [
      '#f59e0b',  // Amber
      '#f97316',  // Orange
      '#eab308',  // Yellow
      '#fb923c',  // Light Orange
      '#fbbf24',  // Light Amber
    ]

    return (
      <g>
        {bestChannels.map((channel, channelIndex) => {
          const isVisible = bestChannelsVisibility[channelIndex] !== false
          if (!isVisible) return null

          // Find all points in chartDataWithZones that have this channel's data
          const pointsWithChannel = chartDataWithZones
            .map((point, idx) => ({ point, idx }))
            .filter(({ point }) => point[`bestChannel${channelIndex}Lower`] !== undefined)

          if (pointsWithChannel.length === 0) return null

          // Find the midpoint among visible points with this channel
          const midIndex = Math.floor(pointsWithChannel.length / 2)
          const { point: midPoint } = pointsWithChannel[midIndex]

          const x = xAxis.scale(midPoint.date)
          const y = yAxis.scale(midPoint[`bestChannel${channelIndex}Lower`])

          if (x === undefined || y === undefined) return null

          const color = channelColors[channelIndex % channelColors.length]
          const stdevText = `${channel.stdevMultiplier.toFixed(2)}σ`
          const percentText = channel.percentInside !== undefined
            ? `${channel.percentInside.toFixed(0)}%`
            : ''

          return (
            <g key={`best-channel-label-${channelIndex}`}>
              {/* Background rectangle for label - positioned under bottom slope */}
              <rect
                x={x - 30}
                y={y + 8}
                width={60}
                height={16}
                fill="rgba(15, 23, 42, 0.9)"
                stroke={color}
                strokeWidth={1}
                rx={3}
              />
              {/* Stdev and percentage label under bottom slope midpoint */}
              <text
                x={x}
                y={y + 18}
                fill={color}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {stdevText} {percentText}
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
      {/* Last Channel Controls Panel */}
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

      {revAllChannelEnabled && revAllVisibleLength > 1 && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: 0,
            right: 0,
            padding: '0 16px',
            zIndex: 7,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              background: 'rgba(30, 41, 59, 0.75)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '8px',
              padding: '6px 10px',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
              pointerEvents: 'auto'
            }}
          >
            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Rev End</span>
            <input
              type="range"
              min={0}
              max={maxRevAllChannelEndIndex}
              value={effectiveRevAllChannelEndIndex}
              onChange={(e) => onRevAllChannelEndChange && onRevAllChannelEndChange(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                height: '6px',
                accentColor: '#6366f1',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600, minWidth: '80px', textAlign: 'right' }}>
              {revAllChannelEndDate || '...'}
            </span>
          </div>
        </div>
      )}

      <div style={{
        width: '100%',
        height: '100%',
        paddingTop: revAllChannelEnabled && revAllVisibleLength > 1 ? '42px' : '0'
      }}>
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

          {/* Last Channel Zones as Parallel Lines */}
          <Customized component={CustomZoneLines} />

          {/* Last Channel Stdev Label */}
          <Customized component={CustomSlopeChannelLabel} />

          {/* All Channels Zones as Parallel Lines */}
          <Customized component={CustomRevAllChannelZoneLines} />

          {/* All Channels Stdev Labels at Lower Bound Midpoint */}
          <Customized component={CustomRevAllChannelStdevLabels} />

          {/* Manual Channel Zones as Parallel Lines */}
          <Customized component={CustomManualChannelZoneLines} />

          {/* Manual Channel Stdev Labels */}
          <Customized component={CustomManualChannelLabels} />

          {/* Best Channel Zones as Parallel Lines */}
          <Customized component={CustomBestChannelZoneLines} />

          {/* Best Channel Stdev Labels */}
          <Customized component={CustomBestChannelStdevLabels} />

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

          {/* Last Channel Lines */}
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
          {revAllChannelEnabled && revAllChannels.length > 0 && revAllChannels.map((channel, index) => {
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
            const isVisible = revAllChannelsVisibility[index] !== false

            return (
              <React.Fragment key={`rev-channel-${index}`}>
                <Line
                  type="monotone"
                  dataKey={`revAllChannel${index}Upper`}
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
                  dataKey={`revAllChannel${index}Mid`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  name={`Rev${index + 1}`}
                  strokeDasharray="5 5"
                  opacity={1.0}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`revAllChannel${index}Lower`}
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

          {/* Best Channel Lines */}
          {bestChannelEnabled && bestChannels.length > 0 && bestChannels.map((channel, index) => {
            // Color palette for best channels (warm colors - orange/yellow tones)
            const channelColors = [
              '#f59e0b',  // Amber
              '#f97316',  // Orange
              '#eab308',  // Yellow
              '#fb923c',  // Light Orange
              '#fbbf24',  // Light Amber
            ]
            const channelColor = channelColors[index % channelColors.length]
            const isVisible = bestChannelsVisibility[index] !== false

            return (
              <React.Fragment key={`best-channel-${index}`}>
                <Line
                  type="monotone"
                  dataKey={`bestChannel${index}Upper`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  legendType="none"
                  strokeDasharray="3 3"
                  opacity={0.7}
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`bestChannel${index}Mid`}
                  stroke={channelColor}
                  strokeWidth={2.5}
                  dot={false}
                  name={`Best${index + 1} (${channel.endIndex - channel.startIndex + 1}pts, ${channel.touchCount} touches)`}
                  strokeDasharray="3 3"
                  hide={!isVisible}
                />
                <Line
                  type="monotone"
                  dataKey={`bestChannel${index}Lower`}
                  stroke={channelColor}
                  strokeWidth={2}
                  dot={false}
                  legendType="none"
                  strokeDasharray="3 3"
                  opacity={0.7}
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

            // Base colors for each comparison stock
            const baseColors = [
              { light: '#93c5fd', dark: '#1e40af' }, // Blue
              { light: '#86efac', dark: '#15803d' }, // Green
              { light: '#fde047', dark: '#a16207' }, // Yellow
              { light: '#c4b5fd', dark: '#6d28d9' }, // Purple
              { light: '#f9a8d4', dark: '#be185d' }, // Pink
              { light: '#5eead4', dark: '#0f766e' }, // Teal
            ]

            const colorPair = baseColors[index % baseColors.length]

            return (
              <React.Fragment key={compStock.symbol}>
                {/* Deeper/darker color when ABOVE selected stock (outperforming) */}
                <Line
                  type="monotone"
                  dataKey={compPositiveKey}
                  stroke={colorPair.dark}
                  strokeWidth={2.5}
                  dot={false}
                  name={`${compStock.symbol} (Above)`}
                  connectNulls={false}
                />
                {/* Lighter color when BELOW selected stock (underperforming) */}
                <Line
                  type="monotone"
                  dataKey={compNegativeKey}
                  stroke={colorPair.light}
                  strokeWidth={2.5}
                  dot={false}
                  name={`${compStock.symbol} (Below)`}
                  connectNulls={false}
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

    </div>
  )
}

export default PriceChart
