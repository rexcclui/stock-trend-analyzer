import { useMemo } from 'react'
import { calculateAllSMAs } from '../calculations/smaCalculations'
import { calculateSlopeChannel } from '../calculations/channelCalculations'
import { calculateZoneColors, calculateAllChannelZones, calculateManualChannelZones } from '../calculations/zoneCalculations'
import { getVolumeLookbackWindow, calculateRollingThresholds } from '../calculations/volumeCalculations'

/**
 * Custom hook to handle the complete data transformation pipeline for the price chart.
 * This includes SMA calculation, channel data integration, volume analysis, performance
 * comparison, and zoom handling with comparison lines.
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.prices - Array of price data points (newest-first order)
 * @param {Array} params.indicators - Array of indicator data points
 * @param {Array} params.smaPeriods - Array of SMA periods to calculate
 * @param {boolean} params.volumeColorEnabled - Whether volume coloring is enabled
 * @param {string} params.volumeColorMode - Volume color mode ('absolute' or 'relative-spy')
 * @param {Object|null} params.spyData - SPY comparison data with prices array
 * @param {string} params.days - Number of days displayed as string
 * @param {boolean} params.slopeChannelEnabled - Whether slope channel is enabled
 * @param {boolean} params.slopeChannelVolumeWeighted - Whether slope channel uses volume weighting
 * @param {number} params.slopeChannelZones - Number of zones for slope channel
 * @param {number|null} params.optimizedLookbackCount - Optimized lookback count for slope channel
 * @param {number|null} params.optimizedStdevMult - Optimized stdev multiplier for slope channel
 * @param {Function} params.setOptimizedLookbackCount - Setter for optimized lookback count
 * @param {Function} params.setOptimizedStdevMult - Setter for optimized stdev multiplier
 * @param {boolean} params.findAllChannelEnabled - Whether "find all channels" feature is enabled
 * @param {Array} params.allChannels - Array of all detected channels (forward direction)
 * @param {boolean} params.revAllChannelEnabled - Whether "reversed all channels" feature is enabled
 * @param {Array} params.revAllChannels - Array of all detected channels (reversed direction)
 * @param {boolean} params.manualChannelEnabled - Whether manual channels are enabled
 * @param {Array} params.manualChannels - Array of manually selected channels
 * @param {boolean} params.performanceComparisonEnabled - Whether performance comparison is enabled
 * @param {number} params.performanceComparisonDays - Number of days for rolling performance comparison
 * @param {string} params.comparisonMode - Comparison mode ('line' or 'color')
 * @param {Array} params.comparisonStocks - Array of comparison stock objects
 * @param {Object} params.zoomRange - Zoom range object with start and end indices
 *
 * @returns {Object} Object containing transformed chart data:
 *   - chartData: Complete chart data array with all indicators and channels (oldest to newest)
 *   - visibleChartData: Chart data visible in the current zoom range with comparison lines
 *   - smaCache: Object mapping SMA periods to their calculated values
 *   - displayPrices: Processed price data synchronized with indicators
 *   - allChannelZones: Zone data for all detected channels (forward direction)
 *   - revAllChannelZones: Zone data for all detected channels (reversed direction)
 *   - allManualChannelZones: Zone data for all manual channels
 */
export const useChartDataTransform = ({
  prices,
  indicators,
  smaPeriods = [],
  volumeColorEnabled = false,
  volumeColorMode = 'absolute',
  spyData = null,
  days = '365',
  slopeChannelEnabled = false,
  slopeChannelVolumeWeighted = false,
  slopeChannelZones = 8,
  optimizedLookbackCount = null,
  optimizedStdevMult = null,
  setOptimizedLookbackCount = () => {},
  setOptimizedStdevMult = () => {},
  findAllChannelEnabled = false,
  allChannels = [],
  revAllChannelEnabled = false,
  revAllChannels = [],
  manualChannelEnabled = false,
  manualChannels = [],
  performanceComparisonEnabled = false,
  performanceComparisonDays = 30,
  comparisonMode = 'line',
  comparisonStocks = [],
  zoomRange = { start: 0, end: null }
}) => {
  return useMemo(() => {
    // Combine data - ensure we use the minimum length to stay in sync with indicators
    const dataLength = Math.min(prices.length, indicators.length)
    const displayPrices = prices.slice(0, dataLength)

    // Pre-calculate all SMAs
    const smaCache = calculateAllSMAs(displayPrices, smaPeriods)

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
    const volumeLookbackWindow = getVolumeLookbackWindow(days)

    // Calculate rolling volume thresholds for each data point
    const { thresholds80: rollingThresholds80, thresholds20: rollingThresholds20 } = calculateRollingThresholds({
      volumeColorEnabled,
      displayPrices,
      volumeLookbackWindow,
      volumeColorMode,
      spyData,
      volumeRatios
    })

    // Calculate performance variance for each point (configurable rolling period)
    const performanceVariances = (() => {
      if (!performanceComparisonEnabled || !spyData || comparisonMode !== 'color') return []

      const variances = []
      const lookbackPeriod = performanceComparisonDays

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
      if (!performanceComparisonEnabled || performanceVariances.length === 0 || comparisonMode !== 'color') {
        return { top20: null, bottom20: null }
      }

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

    // Calculate slope channel
    const slopeChannelInfo = slopeChannelEnabled
      ? calculateSlopeChannel(
          displayPrices,
          true,
          slopeChannelVolumeWeighted,
          optimizedLookbackCount,
          optimizedStdevMult,
          setOptimizedLookbackCount,
          setOptimizedStdevMult
        )
      : null

    const zoneColors = slopeChannelEnabled && slopeChannelInfo
      ? calculateZoneColors(displayPrices, slopeChannelInfo, slopeChannelZones)
      : []

    // Determine number of zones based on period
    const daysNum = parseInt(days) || 365
    const numZonesForChannels = daysNum < 365 ? 3 : 5

    // Calculate zones for all channels
    const allChannelZones = findAllChannelEnabled && allChannels.length > 0
      ? calculateAllChannelZones(displayPrices, allChannels, numZonesForChannels)
      : {}

    // Calculate zones for reversed all channels
    const revAllChannelZones = revAllChannelEnabled && revAllChannels.length > 0
      ? calculateAllChannelZones(displayPrices, revAllChannels, numZonesForChannels)
      : {}

    // Calculate zones for all manual channels
    const allManualChannelZones = manualChannelEnabled && manualChannels.length > 0
      ? manualChannels.map(channel => calculateManualChannelZones(displayPrices, channel))
      : []

    // Build the main chart data array
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
        highVolumeClose: isHighVolume ? price.close : null,
        lowVolumeClose: isLowVolume ? price.close : null,
        topPerformanceClose: isTopPerformance ? price.close : null,
        bottomPerformanceClose: isBottomPerformance ? price.close : null,
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

      // Add reversed all channels data if enabled
      if (revAllChannelEnabled && revAllChannels.length > 0) {
        revAllChannels.forEach((channel, channelIndex) => {
          // Check if this index is within this channel's range
          if (index >= channel.startIndex && index < channel.endIndex) {
            const localIndex = index - channel.startIndex
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
        console.log(`[Comparison] Baseline from FIRST VISIBLE point - Date: ${firstVisibleDate}, Price: ${selectedFirstPrice}`)

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
            console.warn(`[Comparison] No data for ${compStock.symbol} on baseline date ${firstVisibleDate}`)
            return
          }

          console.log(`[Comparison] ${compStock.symbol} baseline: ${compFirstPrice}`)

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

    return {
      chartData,
      visibleChartData,
      smaCache,
      displayPrices,
      allChannelZones,
      revAllChannelZones,
      allManualChannelZones
    }
  }, [
    prices,
    indicators,
    smaPeriods,
    volumeColorEnabled,
    volumeColorMode,
    spyData,
    days,
    slopeChannelEnabled,
    slopeChannelVolumeWeighted,
    slopeChannelZones,
    optimizedLookbackCount,
    optimizedStdevMult,
    setOptimizedLookbackCount,
    setOptimizedStdevMult,
    findAllChannelEnabled,
    allChannels,
    revAllChannelEnabled,
    revAllChannels,
    manualChannelEnabled,
    manualChannels,
    performanceComparisonEnabled,
    performanceComparisonDays,
    comparisonMode,
    comparisonStocks,
    zoomRange
  ])
}
