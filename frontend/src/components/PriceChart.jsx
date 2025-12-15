import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceDot, Customized } from 'recharts'
import { X, ArrowLeftRight, Hand } from 'lucide-react'
import { findBestChannels, filterOverlappingChannels } from './PriceChart/utils/bestChannelFinder'
import {
  CustomTooltip as ImportedCustomTooltip,
  CustomXAxisTick as ImportedCustomXAxisTick,
  CustomZoneLines as ImportedCustomZoneLines,
  CustomSlopeChannelLabel as ImportedCustomSlopeChannelLabel,
  CustomVolumeProfile as ImportedCustomVolumeProfile,
  CustomVolumeProfileV2 as ImportedCustomVolumeProfileV2,
  CustomVolumeProfileV3 as ImportedCustomVolumeProfileV3,
  CustomLegend as ImportedCustomLegend,
  CustomResistanceLine as ImportedCustomResistanceLine,
  CustomSecondVolZoneLine as ImportedCustomSecondVolZoneLine,
  CustomThirdVolZoneLine as ImportedCustomThirdVolZoneLine,
  CustomRevAllChannelZoneLines as ImportedCustomRevAllChannelZoneLines,
  CustomRevAllChannelStdevLabels as ImportedCustomRevAllChannelStdevLabels,
  CustomManualChannelZoneLines as ImportedCustomManualChannelZoneLines,
  CustomManualChannelLabels as ImportedCustomManualChannelLabels,
  CustomBestChannelZoneLines as ImportedCustomBestChannelZoneLines,
  CustomBestChannelStdevLabels as ImportedCustomBestChannelStdevLabels
} from './PriceChart/components'
import VolumeLegendPills from './VolumeLegendPills'
import { getVolumeColor } from './PriceChart/utils'
import { calculateVolumeProfileV3PL } from './PriceChart/utils/volumeProfileV3Utils'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, volumeColorEnabled = false, volumeColorMode = 'absolute', volumeProfileEnabled = false, volumeProfileMode = 'auto', volumeProfileManualRanges = [], onVolumeProfileManualRangeChange, onVolumeProfileRangeRemove, volumeProfileV2Enabled = false, volumeProfileV2StartDate = null, volumeProfileV2EndDate = null, volumeProfileV2RefreshTrigger = 0, volumeProfileV2Params = null, onVolumeProfileV2StartChange, onVolumeProfileV2EndChange, volumeProfileV3Enabled = false, volumeProfileV3RefreshTrigger = 0, spyData = null, performanceComparisonEnabled = false, performanceComparisonBenchmark = 'SPY', performanceComparisonDays = 30, comparisonMode = 'line', comparisonStocks = [], slopeChannelEnabled = false, slopeChannelVolumeWeighted = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, revAllChannelEnabled = false, revAllChannelEndIndex = null, onRevAllChannelEndChange, revAllChannelRefreshTrigger = 0, revAllChannelVolumeFilterEnabled = false, manualChannelEnabled = false, manualChannelDragMode = false, zoomMode = false, bestChannelEnabled = false, bestChannelVolumeFilterEnabled = false, bestStdevEnabled = false, bestStdevVolumeFilterEnabled = false, bestStdevRefreshTrigger = 0, mktGapOpenEnabled = false, mktGapOpenCount = 5, mktGapOpenRefreshTrigger = 0, loadingMktGap = false, resLnEnabled = false, resLnRange = 100, resLnRefreshTrigger = 0, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod, chartId, simulatingSma = {}, onSimulateComplete }) {
  const chartContainerRef = useRef(null)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Vol Profile V2 parameters - use provided params or defaults
  const volPrfV2Params = volumeProfileV2Params || {
    breakoutThreshold: 0.06,
    lookbackZones: 5,
    resetThreshold: 0.03,
    timeoutSlots: 5
  }

  // Store ABSOLUTE optimized parameters (not percentages) so they persist across period changes
  const [optimizedLookbackCount, setOptimizedLookbackCount] = useState(null)
  const [optimizedStdevMult, setOptimizedStdevMult] = useState(null)

  // Store all channels
  const [allChannels, setAllChannels] = useState([])
  const [allChannelsVisibility, setAllChannelsVisibility] = useState({})

  // Store reversed all channels
  const [revAllChannels, setRevAllChannels] = useState([])
  const [revAllChannelsVisibility, setRevAllChannelsVisibility] = useState({})

  // Store best channels
  const [bestChannels, setBestChannels] = useState([])
  const [bestChannelsVisibility, setBestChannelsVisibility] = useState({})

  // Store best stdev channels
  const [bestStdevChannels, setBestStdevChannels] = useState([])
  const [bestStdevChannelZones, setBestStdevChannelZones] = useState({})
  const [bestStdevChannelsVisibility, setBestStdevChannelsVisibility] = useState({})
  const [bestStdevValue, setBestStdevValue] = useState(null)

  // Store market gap open data
  const [mktGapOpenData, setMktGapOpenData] = useState([])
  const [resLnData, setResLnData] = useState([])

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

  // Zoom selection state
  const [isSelectingZoom, setIsSelectingZoom] = useState(false)
  const [zoomSelectionStart, setZoomSelectionStart] = useState(null)
  const [zoomSelectionEnd, setZoomSelectionEnd] = useState(null)

  // Chart panning state
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(null)
  const [panStartZoom, setPanStartZoom] = useState(null)

  // Volume Profile V2 hover state
  const [volV2HoveredBar, setVolV2HoveredBar] = useState(null)
  const [volV2SliderDragging, setVolV2SliderDragging] = useState(false)

  // Volume Profile V3 hover state
  const [volV3HoveredBar, setVolV3HoveredBar] = useState(null)

  // Hovered volume zone pill
  const [hoveredVolumeLegend, setHoveredVolumeLegend] = useState(null)

  // Volume Profile V2 calculated data (only recalculates on manual refresh)
  const [volumeProfileV2Result, setVolumeProfileV2Result] = useState({ slots: [], breakouts: [] })

  // Volume Profile V3 calculated data (only recalculates on manual refresh)
  const [volumeProfileV3Result, setVolumeProfileV3Result] = useState({ windows: [], breaks: [] })

  // Note: Zoom reset is handled by parent (StockAnalyzer) when time period changes
  // No need to reset here to avoid infinite loop

  // Reset optimized parameters when volume weighted mode changes
  useEffect(() => {
    setOptimizedLookbackCount(null)
    setOptimizedStdevMult(null)
  }, [slopeChannelVolumeWeighted])

  // Track window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Calculate Resistance Line (Rolling POC)
  useEffect(() => {
    if (!resLnEnabled || !prices || prices.length === 0) {
      setResLnData([])
      return
    }

    const calculateResistanceLine = () => {
      const totalPoints = prices.length
      const zoomStart = zoomRange.start || 0
      const zoomEnd = zoomRange.end === null ? totalPoints : zoomRange.end
      const newestStartIndex = totalPoints - zoomEnd
      const newestEndIndex = totalPoints - zoomStart

      const visiblePrices = prices.slice(newestStartIndex, newestEndIndex)
      const result = []

      // Calculate chart range (highest - lowest price in entire visible chart)
      let chartMinPrice = Infinity
      let chartMaxPrice = -Infinity
      visiblePrices.forEach(p => {
        if (p.low < chartMinPrice) chartMinPrice = p.low
        if (p.high > chartMaxPrice) chartMaxPrice = p.high
      })
      const chartRange = chartMaxPrice - chartMinPrice

      visiblePrices.forEach((point, index) => {
        const currentPriceIndex = newestStartIndex + index

        // CRITICAL UNDERSTANDING:
        // - prices array: index 0 = 2025-11-21 (newest), index 1255 = 2020-11-23 (oldest)
        // - Chart display: LEFT = newest (2025), RIGHT = oldest (2020)
        // - visiblePrices[0] = 2025-11-21 (leftmost on chart)
        // - visiblePrices[1255] = 2020-11-23 (rightmost on chart)
        //
        // For a point at 2024-01-01 (somewhere in the middle):
        // - To look BACK 100 days means looking at data from 2023-10-01 to 2023-12-31
        // - Those OLDER dates have HIGHER indices in the prices array
        // - So we look FORWARD in the array (higher indices)
        //
        // WAIT - this is still wrong! Let me reconsider...
        //
        // Actually, if we're at the RIGHTMOST point (2020-11-23, oldest date):
        // - Looking back 100 days would mean data BEFORE 2020-11-23
        // - But there IS NO data before 2020-11-23 in our dataset!
        // - So for rightmost points, we should have NO lookback data
        //
        // If we're at the LEFTMOST point (2025-11-21, newest date):
        // - Looking back 100 days means data from ~2025-08 to 2025-11-20
        // - Those dates are OLDER (chronologically before 2025-11-21)
        // - In the prices array, older dates have HIGHER indices
        // - So we look at indices AFTER currentPriceIndex

        const lookbackStartIndex = currentPriceIndex + 1 // Start after current point
        const lookbackEndIndex = Math.min(currentPriceIndex + 1 + resLnRange, prices.length)
        const lookbackData = prices.slice(lookbackStartIndex, lookbackEndIndex)

        // If not enough historical data, use current price
        if (lookbackData.length < 10) {
          result.push({ date: point.date, highVolZone: point.close, volumePercent: 0 })
          return
        }

        // Calculate volume profile for lookback window
        // Find the overall price range across all candles in the window (zone range)
        let minPrice = Infinity
        let maxPrice = -Infinity
        lookbackData.forEach(p => {
          if (p.low < minPrice) minPrice = p.low
          if (p.high > maxPrice) maxPrice = p.high
        })

        const zoneRange = maxPrice - minPrice

        if (zoneRange === 0 || chartRange === 0) {
          result.push({ date: point.date, highVolZone: point.close, volumePercent: 0 })
          return
        }

        // Calculate number of zones based on price range ratio
        // numZones = (zone range / chart range) / 0.02 (target ~2% of chart height per zone)
        const numZones = Math.max(7, Math.floor((zoneRange / chartRange) / 0.02))
        const zoneHeight = zoneRange / numZones
        const volumeZones = new Array(numZones).fill(0)

        // Distribute each candle's volume across the zones it spans (from low to high)
        lookbackData.forEach(candle => {
          const volume = candle.volume || 0
          const candleLow = candle.low
          const candleHigh = candle.high

          // Find which zones this candle spans
          let startZone = Math.floor((candleLow - minPrice) / zoneHeight)
          let endZone = Math.floor((candleHigh - minPrice) / zoneHeight)

          // Clamp to valid range
          startZone = Math.max(0, Math.min(numZones - 1, startZone))
          endZone = Math.max(0, Math.min(numZones - 1, endZone))

          // Distribute volume evenly across the zones this candle spans
          const numZonesSpanned = endZone - startZone + 1
          const volumePerZone = volume / numZonesSpanned

          for (let z = startZone; z <= endZone; z++) {
            volumeZones[z] += volumePerZone
          }
        })

        // Find the zone with maximum volume
        let maxVol = -1
        let maxVolZoneIndex = 0
        let totalVolume = 0

        volumeZones.forEach((vol, idx) => {
          totalVolume += vol
          if (vol > maxVol) {
            maxVol = vol
            maxVolZoneIndex = idx
          }
        })

        // Calculate the center price of the highest volume zone
        const pocPrice = minPrice + (maxVolZoneIndex + 0.5) * zoneHeight
        const pocLower = minPrice + maxVolZoneIndex * zoneHeight
        const pocUpper = minPrice + (maxVolZoneIndex + 1) * zoneHeight

        // Calculate volume percentage for this zone
        const volumePercent = totalVolume > 0 ? (maxVol / totalVolume) * 100 : 0

        // Find second and third volume zones based on current price position
        let secondVolZone = null
        let secondVolZoneLower = null
        let secondVolZoneUpper = null
        let secondVolPercent = 0
        let thirdVolZone = null
        let thirdVolZoneLower = null
        let thirdVolZoneUpper = null
        let thirdVolPercent = 0

        // Determine if current price is above or below the POC
        const currentPrice = point.close

        if (currentPrice > pocPrice) {
          // Current price is ABOVE POC (main line is below current price)
          // Second zone: highest volume zone ABOVE the POC (further resistance)
          let secondMaxVol = -1
          let secondMaxVolZoneIndex = -1

          volumeZones.forEach((vol, idx) => {
            const zonePrice = minPrice + (idx + 0.5) * zoneHeight
            if (zonePrice > pocPrice && vol > secondMaxVol) {
              secondMaxVol = vol
              secondMaxVolZoneIndex = idx
            }
          })

          if (secondMaxVolZoneIndex >= 0) {
            secondVolZone = minPrice + (secondMaxVolZoneIndex + 0.5) * zoneHeight
            secondVolZoneLower = minPrice + secondMaxVolZoneIndex * zoneHeight
            secondVolZoneUpper = minPrice + (secondMaxVolZoneIndex + 1) * zoneHeight
            secondVolPercent = totalVolume > 0 ? (secondMaxVol / totalVolume) * 100 : 0
          }

          // Third zone: highest volume zone ABOVE current price (resistance on opposite side)
          let thirdMaxVol = -1
          let thirdMaxVolZoneIndex = -1

          volumeZones.forEach((vol, idx) => {
            const zonePrice = minPrice + (idx + 0.5) * zoneHeight
            if (zonePrice > currentPrice && vol > thirdMaxVol) {
              thirdMaxVol = vol
              thirdMaxVolZoneIndex = idx
            }
          })

          if (thirdMaxVolZoneIndex >= 0) {
            thirdVolZone = minPrice + (thirdMaxVolZoneIndex + 0.5) * zoneHeight
            thirdVolZoneLower = minPrice + thirdMaxVolZoneIndex * zoneHeight
            thirdVolZoneUpper = minPrice + (thirdMaxVolZoneIndex + 1) * zoneHeight
            thirdVolPercent = totalVolume > 0 ? (thirdMaxVol / totalVolume) * 100 : 0
          }
        } else {
          // Current price is BELOW POC (main line is above current price)
          // Second zone: highest volume zone BELOW the POC (further support)
          let secondMaxVol = -1
          let secondMaxVolZoneIndex = -1

          volumeZones.forEach((vol, idx) => {
            const zonePrice = minPrice + (idx + 0.5) * zoneHeight
            if (zonePrice < pocPrice && vol > secondMaxVol) {
              secondMaxVol = vol
              secondMaxVolZoneIndex = idx
            }
          })

          if (secondMaxVolZoneIndex >= 0) {
            secondVolZone = minPrice + (secondMaxVolZoneIndex + 0.5) * zoneHeight
            secondVolZoneLower = minPrice + secondMaxVolZoneIndex * zoneHeight
            secondVolZoneUpper = minPrice + (secondMaxVolZoneIndex + 1) * zoneHeight
            secondVolPercent = totalVolume > 0 ? (secondMaxVol / totalVolume) * 100 : 0
          }

          // Third zone: highest volume zone BELOW current price (support on opposite side)
          let thirdMaxVol = -1
          let thirdMaxVolZoneIndex = -1

          volumeZones.forEach((vol, idx) => {
            const zonePrice = minPrice + (idx + 0.5) * zoneHeight
            if (zonePrice < currentPrice && vol > thirdMaxVol) {
              thirdMaxVol = vol
              thirdMaxVolZoneIndex = idx
            }
          })

          if (thirdMaxVolZoneIndex >= 0) {
            thirdVolZone = minPrice + (thirdMaxVolZoneIndex + 0.5) * zoneHeight
            thirdVolZoneLower = minPrice + thirdMaxVolZoneIndex * zoneHeight
            thirdVolZoneUpper = minPrice + (thirdMaxVolZoneIndex + 1) * zoneHeight
            thirdVolPercent = totalVolume > 0 ? (thirdMaxVol / totalVolume) * 100 : 0
          }
        }

        result.push({
          date: point.date,
          highVolZone: pocPrice,
          highVolZoneLower: pocLower,
          highVolZoneUpper: pocUpper,
          volumePercent,
          secondVolZone,
          secondVolZoneLower,
          secondVolZoneUpper,
          secondVolPercent,
          thirdVolZone,
          thirdVolZoneLower,
          thirdVolZoneUpper,
          thirdVolPercent
        })
      })

      setResLnData(result)
    }

    const timer = setTimeout(calculateResistanceLine, 10)
    return () => clearTimeout(timer)
  }, [resLnEnabled, resLnRange, prices, zoomRange, days, resLnRefreshTrigger])

  // Calculate Market Gap Open data
  useEffect(() => {
    if (!mktGapOpenEnabled || !spyData || !spyData.prices || spyData.prices.length === 0) {
      setMktGapOpenData([])
      return
    }

    // Determine visible range in Newest-First indices
    // zoomRange is based on Oldest-First data (chartData)
    // prices is Newest-First
    // chartData[i] corresponds to prices[total - 1 - i]

    const totalPoints = prices.length
    const zoomStart = zoomRange.start || 0
    const zoomEnd = zoomRange.end === null ? totalPoints : zoomRange.end // exclusive end index in chartData

    // Convert to Newest-First indices
    // The range [zoomStart, zoomEnd) in chartData corresponds to:
    // prices indices from (total - zoomEnd) to (total - zoomStart)
    // Example: Total 100. Zoom [80, 100] (Last 20). 
    // Newest indices: [100-100, 100-80] = [0, 20].

    const newestStartIndex = totalPoints - zoomEnd
    const newestEndIndex = totalPoints - zoomStart

    console.log(`[MktGap] DEBUG: Period=${days}, Zoom=[${zoomStart}, ${zoomEnd}], NewestIndices=[${newestStartIndex}, ${newestEndIndex}]`)

    // Get visible dates from the main chart data
    // prices is NEWEST FIRST, so indices match
    const visiblePrices = prices.slice(newestStartIndex, newestEndIndex)
    if (visiblePrices.length === 0) {
      console.log('[MktGap] No visible prices found')
      return
    }

    const visibleDates = new Set(visiblePrices.map(p => p.date))
    console.log(`[MktGap] Visible dates count: ${visibleDates.size}. First: ${visiblePrices[0].date}, Last: ${visiblePrices[visiblePrices.length - 1].date}`)

    // Filter SPY data to match visible dates
    // SPY data should also be NEWEST FIRST
    const spyPrices = spyData.prices

    // Calculate gaps for SPY
    const gaps = []

    // We need previous close, so we iterate up to length - 1
    for (let i = 0; i < spyPrices.length - 1; i++) {
      const currentDay = spyPrices[i]
      const prevDay = spyPrices[i + 1]

      // Only consider if this date is visible on the main chart
      if (!visibleDates.has(currentDay.date)) continue

      const gap = Math.abs(currentDay.open - prevDay.close)
      const changePercentVal = (currentDay.close - prevDay.close) / prevDay.close * 100
      const changePercent = changePercentVal.toFixed(2)
      const isGapUp = currentDay.open > prevDay.close

      gaps.push({
        date: currentDay.date,
        gap: gap,
        changePercent: changePercent,
        isGapUp: isGapUp,
        symbol: 'SPY' // Hardcoded for now as we use SPY data
      })
    }

    console.log(`[MktGap] Found ${gaps.length} gaps within visible range. Top gap: ${gaps.length > 0 ? gaps[0].gap : 'N/A'}`)
    if (gaps.length > 0) {
      console.log('[MktGap] Top 3 gaps details:')
      gaps.slice(0, 3).forEach((g, i) => {
        console.log(`  ${i + 1}. Date: ${g.date}, Gap: ${g.gap.toFixed(4)}, Change: ${g.changePercent}%, Open: ${spyPrices.find(p => p.date === g.date)?.open}, PrevClose: ${spyPrices.find(p => p.date === g.date)?.close}`) // Note: PrevClose logic in loop was correct, just logging current close for reference
      })
    }
    // Sort by gap size (descending) and take top N
    const topGaps = gaps.sort((a, b) => b.gap - a.gap).slice(0, mktGapOpenCount)

    setMktGapOpenData(topGaps)

  }, [mktGapOpenEnabled, mktGapOpenCount, mktGapOpenRefreshTrigger, spyData, zoomRange, prices])

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

  // Adjust a channel's range without recalculating slope or stdev
  const adjustChannelRangeWithoutRecalc = (channel, newStartIndex, newEndIndex) => {
    const dataLength = Math.min(prices.length, indicators.length)
    const clampedStart = Math.max(0, Math.min(newStartIndex, dataLength - 1))
    const clampedEnd = Math.max(clampedStart, Math.min(newEndIndex, dataLength - 1))

    // Maintain a minimum visible length of 10 points
    if (clampedEnd - clampedStart + 1 < 10) return channel

    return {
      ...channel,
      startIndex: clampedStart,
      endIndex: clampedEnd,
      // Preserve the original chronological anchors so the fitted slope/intercept remain unchanged
      lookbackCount: clampedEnd - clampedStart + 1
    }
  }

  const getChannelLocalIndex = (channel, globalIndex) => {
    const chronologicalStart = channel.chronologicalStartIndex ?? channel.startIndex
    const chronologicalEnd = channel.chronologicalEndIndex ?? channel.endIndex
    const direction = chronologicalEnd >= chronologicalStart ? 1 : -1

    return (globalIndex - chronologicalStart) * direction
  }

  // Find all channels with constant stdev by simulating different stdev values
  // and choosing the one that maximizes total touching points across all channels
  const findAllChannelsWithConstantStdev = (data, volumeFilterEnabled = false) => {
    const minLookback = getInitialLookbackForPeriod(days)
    if (!data || data.length < minLookback) return { channels: [], optimalStdev: 2.5 }

    // Filter data by volume if enabled
    let validIndices = new Set(data.map((_, idx) => idx))

    if (volumeFilterEnabled) {
      const volumes = data.map(d => d.volume || 0).filter(v => v > 0)
      if (volumes.length > 0) {
        const sortedVolumes = [...volumes].sort((a, b) => a - b)
        const percentile10Index = Math.floor(sortedVolumes.length * 0.1)
        const volumeThreshold = sortedVolumes[percentile10Index]

        validIndices = new Set()
        data.forEach((point, idx) => {
          if ((point.volume || 0) > volumeThreshold) {
            validIndices.add(idx)
          }
        })

        if (validIndices.size < minLookback) {
          validIndices = new Set(data.map((_, idx) => idx))
        }
      }
    }

    // Find turning points for the entire dataset
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
    const turningPoints = volumeFilterEnabled
      ? allTurningPoints.filter(tp => validIndices.has(tp.index))
      : allTurningPoints

    // Function to find channels with a given constant stdev multiplier
    const findChannelsWithStdev = (constantStdevMult) => {
      const channels = []
      let currentStartIndex = 0

      while (currentStartIndex <= data.length - minLookback) {
        const remainingLength = data.length - currentStartIndex
        if (remainingLength < minLookback) break

        let lookbackCount = minLookback
        let channelBroken = false
        let breakIndex = currentStartIndex + lookbackCount

        // Calculate initial channel parameters
        let currentSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        let n = 0

        currentSegment.forEach((point, index) => {
          const absoluteIndex = currentStartIndex + index
          if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
            return
          }
          n++
          sumX += index
          sumY += point.close
          sumXY += index * point.close
          sumX2 += index * index
        })

        if (n < 2) {
          currentStartIndex++
          continue
        }

        let slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
        let intercept = (sumY - slope * sumX) / n

        const distances = []
        currentSegment.forEach((point, index) => {
          const absoluteIndex = currentStartIndex + index
          if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
            return
          }
          const predictedY = slope * index + intercept
          distances.push(point.close - predictedY)
        })

        if (distances.length === 0) {
          currentStartIndex++
          continue
        }

        const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
        let stdDev = Math.sqrt(variance)

        // Try to extend the lookback period
        while (currentStartIndex + lookbackCount < data.length) {
          const previousLookback = lookbackCount
          const previous90Percent = Math.floor(previousLookback * 0.9)

          lookbackCount++
          const extendedSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)

          const channelWidth = stdDev * constantStdevMult
          const boundRange = channelWidth * 2
          const outsideTolerance = boundRange * 0.05
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

          if (newPoints.length > 0 && pointsOutside / newPoints.length >= 0.15) {
            channelBroken = true
            breakIndex = currentStartIndex + previousLookback
            lookbackCount = previousLookback
            break
          }

          // Recalculate channel with extended data
          sumX = 0
          sumY = 0
          sumXY = 0
          sumX2 = 0
          n = 0

          extendedSegment.forEach((point, index) => {
            const absoluteIndex = currentStartIndex + index
            if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
              return
            }
            n++
            sumX += index
            sumY += point.close
            sumXY += index * point.close
            sumX2 += index * index
          })

          if (n < 2) break

          slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
          intercept = (sumY - slope * sumX) / n

          const newDistances = []
          extendedSegment.forEach((point, index) => {
            const absoluteIndex = currentStartIndex + index
            if (volumeFilterEnabled && !validIndices.has(absoluteIndex)) {
              return
            }
            const predictedY = slope * index + intercept
            newDistances.push(point.close - predictedY)
          })

          if (newDistances.length === 0) break

          const newMeanDistance = newDistances.reduce((a, b) => a + b, 0) / newDistances.length
          const newVariance = newDistances.reduce((sum, d) => sum + Math.pow(d - newMeanDistance, 2), 0) / newDistances.length
          stdDev = Math.sqrt(newVariance)
        }

        const channelSegment = data.slice(currentStartIndex, currentStartIndex + lookbackCount)
        const channelWidth = stdDev * constantStdevMult
        const channelTurningPoints = turningPoints.filter(tp => tp.index >= currentStartIndex && tp.index < currentStartIndex + lookbackCount)

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

        // Count touches to turning points
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

          // Upper bound: only count local peaks that are above midline
          if (tp.type === 'max' && distanceToUpper <= boundRange * touchTolerance && tp.value >= predictedY) {
            touchCount++
          }
          // Lower bound: only count local dips that are below midline
          else if (tp.type === 'min' && distanceToLower <= boundRange * touchTolerance && tp.value <= predictedY) {
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
          optimalStdevMult: constantStdevMult,
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

    // Simulate different stdev multipliers from 1.2 to 4.0
    const stdevMultipliers = []
    for (let mult = 1.2; mult <= 4.0; mult += 0.1) {
      stdevMultipliers.push(mult)
    }

    let bestTotalTouches = 0
    let bestStdevMult = 2.5
    let bestChannels = []

    // Test each stdev multiplier and find the one with maximum total touches
    stdevMultipliers.forEach(stdevMult => {
      const channels = findChannelsWithStdev(stdevMult)
      const totalTouches = channels.reduce((sum, channel) => sum + channel.touchCount, 0)

      if (totalTouches > bestTotalTouches) {
        bestTotalTouches = totalTouches
        bestStdevMult = stdevMult
        bestChannels = channels
      }
    })

    return { channels: bestChannels, optimalStdev: bestStdevMult }
  }

  // Effect to calculate reversed all channels when revAllChannelEnabled changes
  useEffect(() => {
    if (revAllChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const totalLength = displayPrices.length

      if (totalLength === 0) {
        setRevAllChannels([])
        setRevAllChannelsVisibility({})
        return
      }

      const visibleStart = zoomRange?.start ?? 0
      const visibleEnd = zoomRange?.end === null ? totalLength : Math.min(totalLength, zoomRange.end)

      const startDisplayIndex = Math.max(0, totalLength - visibleEnd)
      const endDisplayIndex = Math.min(totalLength - 1, totalLength - 1 - visibleStart)

      const visibleSlice = displayPrices.slice(startDisplayIndex, endDisplayIndex + 1)
      const visibleOldestToNewest = visibleSlice.slice().reverse()

      if (visibleOldestToNewest.length < 2) {
        setRevAllChannels([])
        setRevAllChannelsVisibility({})
        return
      }

      const maxEndIndex = visibleOldestToNewest.length - 1
      const clampedEndIndex = Math.min(
        Math.max(revAllChannelEndIndex ?? maxEndIndex, 0),
        maxEndIndex
      )

      const channelData = visibleOldestToNewest.slice(0, clampedEndIndex + 1)
      const foundChannelsLocal = findAllChannelsReversed(channelData, revAllChannelVolumeFilterEnabled)

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

      setRevAllChannels(adjustedChannels)
      setRevAllChannelsVisibility(prev => {
        const visibility = {}
        adjustedChannels.forEach((_, index) => {
          visibility[index] = prev[index] !== false
        })
        return visibility
      })
    } else {
      setRevAllChannels([])
      setRevAllChannelsVisibility({})
    }
  }, [revAllChannelEnabled, prices, indicators, revAllChannelEndIndex, revAllChannelRefreshTrigger, revAllChannelVolumeFilterEnabled])

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

  // Effect to calculate best stdev channels when bestStdevEnabled changes
  useEffect(() => {
    if (bestStdevEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const totalLength = displayPrices.length

      if (totalLength === 0) {
        setBestStdevChannels([])
        setBestStdevChannelsVisibility({})
        setBestStdevValue(null)
        return
      }

      const visibleStart = zoomRange?.start ?? 0
      const visibleEnd = zoomRange?.end === null ? totalLength : Math.min(totalLength, zoomRange.end)

      const startDisplayIndex = Math.max(0, totalLength - visibleEnd)
      const endDisplayIndex = Math.min(totalLength - 1, totalLength - 1 - visibleStart)

      const visibleSlice = displayPrices.slice(startDisplayIndex, endDisplayIndex + 1)
      const visibleOldestToNewest = visibleSlice.slice().reverse()

      if (visibleOldestToNewest.length < 2) {
        setBestStdevChannels([])
        setBestStdevChannelsVisibility({})
        setBestStdevValue(null)
        return
      }

      const { channels: foundChannelsLocal, optimalStdev } = findAllChannelsWithConstantStdev(visibleOldestToNewest, bestStdevVolumeFilterEnabled)

      const adjustIndexToDisplay = (localIndex) => startDisplayIndex + (visibleOldestToNewest.length - 1 - localIndex)

      const adjustedChannels = foundChannelsLocal.map(channel => {
        const mappedStart = adjustIndexToDisplay(channel.startIndex)
        const mappedEnd = adjustIndexToDisplay(channel.endIndex)

        const chronologicalStartIndex = mappedStart
        const chronologicalEndIndex = mappedEnd
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

      const bestStdevZones = calculateAllChannelZones(displayPrices, adjustedChannels, 5)
      setBestStdevChannelZones(bestStdevZones)

      setBestStdevChannels(adjustedChannels)
      setBestStdevValue(optimalStdev)
      setBestStdevChannelsVisibility(prev => {
        const visibility = {}
        adjustedChannels.forEach((_, index) => {
          visibility[index] = prev[index] !== false
        })
        return visibility
      })
    } else {
      setBestStdevChannels([])
      setBestStdevChannelZones({})
      setBestStdevChannelsVisibility({})
      setBestStdevValue(null)
    }
  }, [bestStdevEnabled, prices, indicators, bestStdevRefreshTrigger, bestStdevVolumeFilterEnabled, zoomRange?.start, zoomRange?.end])

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

          const localIndex = getChannelLocalIndex(channel, globalIndex)
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
  const dataLength = Math.min(prices?.length || 0, indicators?.length || 0)

  // Calculate last channel ONLY on the data that will be displayed
  // This prevents mismatch when period changes and indicators haven't updated yet
  const displayPrices = useMemo(() => prices.slice(0, dataLength), [prices, dataLength])
  const displayIndicators = useMemo(() => indicators.slice(0, dataLength), [indicators, dataLength])

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

  // Calculate Volume Profile V2 - 200 date slots with volume distribution per price range
  const calculateVolumeProfileV2 = () => {
    if (!volumeProfileV2Enabled || displayPrices.length === 0) return { slots: [], breakouts: [] }

    const reversedDisplayPrices = [...displayPrices].reverse()
    const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

    if (visibleData.length === 0) return { slots: [], breakouts: [] }

    // Convert dates to indices (dates are locked, indices adjust based on visible data)
    // If dates are not found, use full range (don't call setters during render)
    let effectiveStartIndex = 0
    let effectiveEndIndex = visibleData.length

    if (volumeProfileV2StartDate !== null) {
      const startIdx = visibleData.findIndex(d => d.date === volumeProfileV2StartDate)
      if (startIdx !== -1) {
        effectiveStartIndex = startIdx
      }
      // If not found, keep default (0) and use full range
    }

    if (volumeProfileV2EndDate !== null) {
      const endIdx = visibleData.findIndex(d => d.date === volumeProfileV2EndDate)
      if (endIdx !== -1) {
        effectiveEndIndex = endIdx + 1 // +1 because slice end is exclusive
      }
      // If not found, keep default (visibleData.length) and use full range
    }

    const limitedVisibleData = visibleData.slice(effectiveStartIndex, effectiveEndIndex)

    if (limitedVisibleData.length === 0) return { slots: [], breakouts: [] }

    // Calculate global min and max from all visible data for consistent price ranges
    const allPrices = visibleData.map(p => p.close)
    const globalMin = Math.min(...allPrices)
    const globalMax = Math.max(...allPrices)
    const globalRange = globalMax - globalMin

    if (globalRange === 0) return { slots: [], breakouts: [] }

    // USER REQUEST: Dynamic zone count per slot
    // numPriceZones is now calculated per slot based on: (cumulativeRange / globalRange) / 0.03

    // Divide LIMITED data into date slots
    // For small datasets, use fewer slots to ensure each bar is visible (minimum 2 data points per slot)
    const minSlotSize = 2
    const maxPossibleSlots = Math.floor(limitedVisibleData.length / minSlotSize)
    const numDateSlots = Math.min(200, Math.max(1, maxPossibleSlots))
    const slotSize = Math.ceil(limitedVisibleData.length / numDateSlots)
    const slots = []

    for (let slotIdx = 0; slotIdx < numDateSlots; slotIdx++) {
      const endIdx = Math.min((slotIdx + 1) * slotSize, limitedVisibleData.length)

      if (endIdx === 0) break

      // CUMULATIVE: Get all data from START to current slot's end
      const cumulativeData = limitedVisibleData.slice(0, endIdx)
      const slotData = limitedVisibleData.slice(slotIdx * slotSize, endIdx)

      if (slotData.length === 0) continue

      // DYNAMIC ZONES: Calculate min/max from cumulative data up to this point
      const cumulativePrices = cumulativeData.map(p => p.close)
      const cumulativeMin = Math.min(...cumulativePrices)
      const cumulativeMax = Math.max(...cumulativePrices)
      const cumulativeRange = cumulativeMax - cumulativeMin

      if (cumulativeRange === 0) continue

      // DYNAMIC ZONE COUNT: numPriceZones = (cumulativeRange / globalRange) / 0.03
      // This makes zones proportional to how much of the total range has been seen
      // Minimum of 3 zones to ensure bars are always visible
      const numPriceZones = Math.max(3, Math.round((cumulativeRange / globalRange) / 0.03))
      const priceZoneHeight = cumulativeRange / numPriceZones

      // Initialize price zones based on cumulative range
      const priceZones = []
      for (let i = 0; i < numPriceZones; i++) {
        priceZones.push({
          minPrice: cumulativeMin + (i * priceZoneHeight),
          maxPrice: cumulativeMin + ((i + 1) * priceZoneHeight),
          volume: 0,
          volumeWeight: 0
        })
      }

      // Accumulate volume in each price zone from START to current slot
      let totalVolume = 0
      cumulativeData.forEach(price => {
        const priceValue = price.close
        const volume = price.volume || 0
        totalVolume += volume

        let zoneIndex = Math.floor((priceValue - cumulativeMin) / priceZoneHeight)
        if (zoneIndex >= numPriceZones) zoneIndex = numPriceZones - 1
        if (zoneIndex < 0) zoneIndex = 0

        priceZones[zoneIndex].volume += volume
      })

      // Calculate volume weights as percentage of total volume
      priceZones.forEach(zone => {
        zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
      })

      // Get current price (last price in this slot's data)
      const currentPrice = slotData[slotData.length - 1].close

      slots.push({
        slotIndex: slotIdx,
        startDate: slotData[0].date,
        endDate: slotData[slotData.length - 1].date,
        priceZones,
        totalVolume,
        currentPrice
      })
    }

    // Detect up breakouts: current zone has <6% weight compared to MAX volume zone within 5 zones below
    // State-based detection to prevent duplicate signals until price reaccumulates
    const breakouts = []
    // Use Vol Profile V2 params from props (backtest optimization) or defaults
    const BREAKOUT_THRESHOLD = volPrfV2Params.breakoutThreshold
    const RESET_THRESHOLD = volPrfV2Params.resetThreshold
    const TIMEOUT_SLOTS = volPrfV2Params.timeoutSlots
    const LOOKBACK_ZONES = volPrfV2Params.lookbackZones

    let isInBreakout = false
    let breakoutZoneWeight = 0
    let breakoutSlotIdx = -1

    for (let i = 0; i < slots.length; i++) {
      const currentSlot = slots[i]
      if (!currentSlot) continue

      const currentPrice = currentSlot.currentPrice

      // Find which zone current price falls into
      const currentZoneIdx = currentSlot.priceZones.findIndex(zone =>
        currentPrice >= zone.minPrice && currentPrice <= zone.maxPrice
      )

      if (currentZoneIdx === -1) continue

      const currentZone = currentSlot.priceZones[currentZoneIdx]
      const currentWeight = currentZone.volumeWeight

      // Check timeout: if in breakout state for 5+ slots without reset, auto-reset
      if (isInBreakout && i - breakoutSlotIdx >= TIMEOUT_SLOTS) {
        isInBreakout = false
        breakoutZoneWeight = 0
        breakoutSlotIdx = -1
      }

      // Check reset condition: entered high volume zone (breakout weight + 3%)
      // This means price has "reaccumulated" and we can look for next breakout
      if (isInBreakout && currentWeight >= breakoutZoneWeight + RESET_THRESHOLD) {
        isInBreakout = false
        breakoutZoneWeight = 0
        breakoutSlotIdx = -1
      }

      // Only detect new breakouts if NOT currently in a breakout state
      if (!isInBreakout && currentZoneIdx > 0) {
        // Verify price is moving UP by comparing with previous slot
        // Can't have an "up breakout" if price is falling
        if (i > 0) {
          const previousSlot = slots[i - 1]
          if (previousSlot) {
            const previousPrice = previousSlot.currentPrice
            // Skip if price is not moving up
            if (currentPrice <= previousPrice) {
              continue
            }
          }
        }

        // Look up to N zones below and find the zone with MAXIMUM volume weight
        // This identifies the strongest support/resistance level to break through
        const lookbackDepth = Math.min(LOOKBACK_ZONES, currentZoneIdx) // Check up to N zones or until start
        let maxLowerWeight = 0
        let maxZoneIdx = -1

        for (let lookback = 1; lookback <= lookbackDepth; lookback++) {
          const lowerZone = currentSlot.priceZones[currentZoneIdx - lookback]
          if (lowerZone.volumeWeight > maxLowerWeight) {
            maxLowerWeight = lowerZone.volumeWeight
            maxZoneIdx = currentZoneIdx - lookback
          }
        }

        // Check if current zone has at least 6% less weight than the strongest zone below
        // This means price is breaking up through significant support into a lower volume area
        if (currentWeight < maxLowerWeight && maxLowerWeight - currentWeight >= BREAKOUT_THRESHOLD) {
          breakouts.push({
            slotIdx: i,
            date: currentSlot.endDate,
            price: currentPrice,
            isUpBreak: true,
            currentWeight: currentWeight,
            lowerWeight: maxLowerWeight,
            weightDiff: maxLowerWeight - currentWeight,
            maxZoneIdx: maxZoneIdx, // Track which zone had the max volume
            zonesChecked: lookbackDepth // How many zones we looked at
          })

          // Enter breakout state - no more signals until reset
          isInBreakout = true
          breakoutZoneWeight = currentWeight
          breakoutSlotIdx = i
        }
      }
    }

    return { slots, breakouts }
  }

  // Calculate Volume Profile V3 - Windowed analysis with break detection
  const calculateVolumeProfileV3 = () => {
    if (!volumeProfileV3Enabled || displayPrices.length === 0) return { windows: [], breaks: [] }

    const reversedDisplayPrices = [...displayPrices].reverse()
    const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

    if (visibleData.length === 0) return { windows: [], breaks: [] }

    const MIN_WINDOW_SIZE = 150
    const BREAK_VOLUME_THRESHOLD = 0.10 // 10%
    const BREAK_DIFF_THRESHOLD = 0.08 // 8% difference from previous 5 zones
    const PRICE_SLOT_MIN_RATIO = 0.50 // Each zone must be at least 50% of previous window's zone
    const ZONE_LOOKBACK = 5 // Check previous 5 zones for break detection

    const windows = []
    const breaks = []
    let currentWindowStart = 0
    let previousWindowZoneHeight = null // Track previous window's zone height

    while (currentWindowStart < visibleData.length) {
      // Determine window end (at least MIN_WINDOW_SIZE points or until end of data)
      let currentWindowEnd = Math.min(currentWindowStart + MIN_WINDOW_SIZE, visibleData.length)
      let windowData = visibleData.slice(currentWindowStart, currentWindowEnd)

      if (windowData.length === 0) break

      // Process each data point in the window to detect breaks
      const windowPoints = []
      let breakDetected = false
      let breakIndex = -1

      for (let i = 0; i < windowData.length; i++) {
        const dataPoint = windowData[i]

        // Calculate volume distribution across price zones for current cumulative data
        const cumulativeData = windowData.slice(0, i + 1)

        // Calculate dynamic number of zones: data points / 15, min 15, max 20
        const numPriceZones = Math.max(15, Math.min(20, Math.floor(cumulativeData.length / 15)))

        // Calculate min/max from CUMULATIVE data (not entire window)
        const cumulativePrices = cumulativeData.map(p => p.close)
        const minPrice = Math.min(...cumulativePrices)
        const maxPrice = Math.max(...cumulativePrices)
        const priceRange = maxPrice - minPrice

        // Skip if no price movement yet
        if (priceRange === 0) {
          windowPoints.push({
            date: dataPoint.date,
            price: dataPoint.close,
            volume: dataPoint.volume || 0,
            priceZones: [{
              minPrice: minPrice,
              maxPrice: minPrice,
              volume: dataPoint.volume || 0,
              volumeWeight: 1.0
            }],
            currentZoneIdx: 0
          })
          continue
        }

        const priceZoneHeight = priceRange / numPriceZones

        // Create price zones based on cumulative range (dynamic number of zones)
        const priceZones = []
        for (let j = 0; j < numPriceZones; j++) {
          priceZones.push({
            minPrice: minPrice + (j * priceZoneHeight),
            maxPrice: minPrice + ((j + 1) * priceZoneHeight),
            volume: 0,
            volumeWeight: 0
          })
        }

        // Accumulate volume in each price zone
        let totalVolume = 0
        cumulativeData.forEach(price => {
          const priceValue = price.close
          const volume = price.volume || 0
          totalVolume += volume

          let zoneIndex = Math.floor((priceValue - minPrice) / priceZoneHeight)
          if (zoneIndex >= numPriceZones) zoneIndex = numPriceZones - 1
          if (zoneIndex < 0) zoneIndex = 0

          priceZones[zoneIndex].volume += volume
        })

        // Calculate volume weights
        priceZones.forEach(zone => {
          zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
        })

        // Find which zone the current price falls into
        const currentPrice = dataPoint.close
        let currentZoneIdx = Math.floor((currentPrice - minPrice) / priceZoneHeight)
        if (currentZoneIdx >= numPriceZones) currentZoneIdx = numPriceZones - 1
        if (currentZoneIdx < 0) currentZoneIdx = 0

        const currentZone = priceZones[currentZoneIdx]
        const currentWeight = currentZone.volumeWeight

        // Check break condition (skip first few points to have meaningful data)
        if (i >= 10 && currentZoneIdx >= ZONE_LOOKBACK) {
          // Price slot constraint: Check if current zone height is at least 50% of previous window
          // If zones are too small compared to previous window, don't break - keep extending
          let priceSlotSizeOk = true
          if (previousWindowZoneHeight !== null) {
            if (priceZoneHeight < previousWindowZoneHeight * PRICE_SLOT_MIN_RATIO) {
              priceSlotSizeOk = false
            }
          }

          // Only check volume break condition if price slot size is acceptable
          if (priceSlotSizeOk) {
            // Check any of the previous 5 zones for volume difference
            let breakConditionMet = false
            let maxWeightDiff = 0
            let bestPrevZoneIdx = -1

            for (let lookback = 1; lookback <= ZONE_LOOKBACK; lookback++) {
              const prevZoneIdx = currentZoneIdx - lookback
              if (prevZoneIdx >= 0) {
                const prevZone = priceZones[prevZoneIdx]
                const prevWeight = prevZone.volumeWeight
                const weightDiff = prevWeight - currentWeight

                // Track the best weight difference
                if (weightDiff > maxWeightDiff) {
                  maxWeightDiff = weightDiff
                  bestPrevZoneIdx = prevZoneIdx
                }

                // Break condition: current weight < 10% AND 8% less than any of previous 5 zones
                // Price direction check:
                // - For break up: previous zone must be lower (prevZoneIdx < currentZoneIdx)
                // - For break down: previous zone must be higher (prevZoneIdx > currentZoneIdx)
                const isPriceMovingUp = prevZoneIdx < currentZoneIdx
                const isPriceMovingDown = prevZoneIdx > currentZoneIdx

                if (currentWeight < BREAK_VOLUME_THRESHOLD &&
                    weightDiff >= BREAK_DIFF_THRESHOLD &&
                    (isPriceMovingUp || isPriceMovingDown)) {
                  breakConditionMet = true
                  break
                }
              }
            }

            if (breakConditionMet) {
              // Determine if it's an up or down break based on price movement from previous zone
              const isUpBreak = bestPrevZoneIdx < currentZoneIdx

              // Additional check: Ensure no higher volume resistance/support in break direction
              // For break up: check 5 zones above for higher volume (resistance)
              // For break down: check 5 zones below for higher volume (support)
              let hasResistanceInDirection = false

              if (isUpBreak) {
                // Check 5 zones ABOVE current zone
                for (let lookAhead = 1; lookAhead <= ZONE_LOOKBACK; lookAhead++) {
                  const futureZoneIdx = currentZoneIdx + lookAhead
                  if (futureZoneIdx < numPriceZones) {
                    const futureZone = priceZones[futureZoneIdx]
                    if (futureZone.volumeWeight > currentWeight) {
                      hasResistanceInDirection = true
                      break
                    }
                  }
                }
              } else {
                // Check 5 zones BELOW current zone
                for (let lookAhead = 1; lookAhead <= ZONE_LOOKBACK; lookAhead++) {
                  const futureZoneIdx = currentZoneIdx - lookAhead
                  if (futureZoneIdx >= 0) {
                    const futureZone = priceZones[futureZoneIdx]
                    if (futureZone.volumeWeight > currentWeight) {
                      hasResistanceInDirection = true
                      break
                    }
                  }
                }
              }

              // Only proceed if there's no resistance/support in the break direction
              if (!hasResistanceInDirection) {
                // Find the zone with MAXIMUM volume weight (the volume-concentrated zone)
                // This is the strongest support/resistance level in the current window
                let maxWeight = 0
                let maxWeightZone = null
                let maxWeightZoneIdx = -1

                priceZones.forEach((zone, idx) => {
                  if (zone.volumeWeight > maxWeight) {
                    maxWeight = zone.volumeWeight
                    maxWeightZone = zone
                    maxWeightZoneIdx = idx
                  }
                })

                // Support level is the BOTTOM of the heaviest volume zone (for upbreak)
                // Price must break through the entire support zone to trigger a sell
                // Example: If support zone is $16.2-$16.4, price must drop below $16.2
                const supportLevel = isUpBreak ?
                  (maxWeightZone ? maxWeightZone.minPrice : currentZone.minPrice) :
                  (maxWeightZone ? maxWeightZone.maxPrice : currentZone.maxPrice)

                breaks.push({
                  date: dataPoint.date,
                  price: currentPrice,
                  isUpBreak: isUpBreak,
                  currentWeight: currentWeight,
                  prevWeight: bestPrevZoneIdx >= 0 ? priceZones[bestPrevZoneIdx].volumeWeight : 0,
                  weightDiff: maxWeightDiff,
                  windowIndex: windows.length,
                  supportLevel: supportLevel, // Price level to monitor for failed breakout
                  concentratedZoneIdx: maxWeightZoneIdx, // Index of the heaviest volume zone
                  breakoutZoneIdx: currentZoneIdx, // Index of the low-volume breakout zone
                  maxVolumeWeight: maxWeight // Track the max volume weight
                })

                breakDetected = true
                breakIndex = i
                break // Exit the loop to start a new window
              }
            }
          }
        }

        // Store this data point with its volume profile
        windowPoints.push({
          date: dataPoint.date,
          price: dataPoint.close,
          volume: dataPoint.volume || 0,
          priceZones: priceZones,
          currentZoneIdx: currentZoneIdx
        })
      }

      // Add the window to our results
      windows.push({
        windowIndex: windows.length,
        startDate: windowData[0].date,
        endDate: windowData[windowData.length - 1].date,
        dataPoints: windowPoints,
        breakDetected: breakDetected
      })

      // Store the zone height from the last data point for next window comparison
      if (windowPoints.length > 0) {
        const lastPoint = windowPoints[windowPoints.length - 1]
        if (lastPoint.priceZones && lastPoint.priceZones.length > 0) {
          const lastZone = lastPoint.priceZones[0]
          previousWindowZoneHeight = lastZone.maxPrice - lastZone.minPrice
        }
      }

      // Move to next window
      if (breakDetected && breakIndex > 0) {
        // Start new window after the break point
        currentWindowStart += breakIndex + 1
      } else {
        // No break detected, move to next window
        currentWindowStart = currentWindowEnd
      }
    }

    return { windows, breaks }
  }

  // Use the cached Volume Profile V2 data (only recalculates on manual refresh)
  const volumeProfileV2Data = volumeProfileV2Result.slots || []
  const volumeProfileV2Breakouts = volumeProfileV2Result.breakouts || []

  // Use the cached Volume Profile V3 data (only recalculates on manual refresh)
  const volumeProfileV3Data = volumeProfileV3Result.windows || []
  const volumeProfileV3Breaks = volumeProfileV3Result.breaks || []

  // Calculate P&L based on breakout trading signals with SMA slope for sell
  const calculateBreakoutPL = () => {
    if (volumeProfileV2Data.length === 0) return { trades: [], totalPL: 0, winRate: 0, sellSignals: [], smaUsed: null }

    // Check which SMA is enabled (use smallest period available)
    if (smaPeriods.length === 0) {
      console.warn('No SMA enabled - cannot generate sell signals. Please enable SMA5 or SMA10.')
      return { trades: [], totalPL: 0, winRate: 0, sellSignals: [], smaUsed: null }
    }

    const smaPeriod = Math.min(...smaPeriods) // Use smallest SMA period
    const smaKey = `sma${smaPeriod}`

    const trades = []
    const sellSignals = [] // Track sell signal points for visualization
    let isHolding = false
    let buyPrice = null
    let buyDate = null
    let buySlotIdx = null
    let prevSlopeWhileHolding = null

    // Create a map of breakout dates for quick lookup
    const breakoutDates = new Set(volumeProfileV2Breakouts.map(b => b.date))

    // Prices are in reverse chronological order (newest first), so reverse for forward-time processing
    const reversedPrices = [...prices].reverse()

    // Calculate SMA from daily prices in forward chronological order
    const dateToSMA = new Map()
    for (let i = 0; i < reversedPrices.length; i++) {
      if (i < smaPeriod - 1) {
        dateToSMA.set(reversedPrices[i].date, null)
      } else {
        const sum = reversedPrices.slice(i - smaPeriod + 1, i + 1).reduce((acc, p) => acc + p.close, 0)
        dateToSMA.set(reversedPrices[i].date, sum / smaPeriod)
      }
    }

    // Calculate SMA slope helper
    const getSMASlope = (currentDate, prevDate) => {
      const currentSMA = dateToSMA.get(currentDate)
      const prevSMA = dateToSMA.get(prevDate)
      if (currentSMA !== undefined && prevSMA !== undefined) {
        return currentSMA - prevSMA // Positive = going up, Negative = going down
      }
      return null
    }

    // Iterate through daily prices in forward chronological order for simulation
    for (let i = 0; i < reversedPrices.length; i++) {
      const pricePoint = reversedPrices[i]
      if (!pricePoint) continue

      const currentDate = pricePoint.date
      const currentPrice = pricePoint.close

      // Check if this is an up breakout date - BUY signal
      if (breakoutDates.has(currentDate) && !isHolding) {
        isHolding = true
        buyPrice = currentPrice
        buyDate = currentDate
        prevSlopeWhileHolding = null
      }
      // If holding, check SMA slope for SELL signal
      else if (isHolding && i > 0) {
        const prevPrice = reversedPrices[i - 1]
        if (prevPrice) {
          const slope = getSMASlope(currentDate, prevPrice.date)
          const currentSMA = dateToSMA.get(currentDate)
          const prevSMA = dateToSMA.get(prevPrice.date)

          // If SMA is going down (negative slope), SELL
          if (slope !== null && prevSlopeWhileHolding !== null && prevSlopeWhileHolding >= 0 && slope < 0) {
            const sellPrice = currentPrice
            const plPercent = ((sellPrice - buyPrice) / buyPrice) * 100

            trades.push({
              buyPrice,
              buyDate,
              sellPrice,
              sellDate: currentDate,
              plPercent
            })

            sellSignals.push({
              date: currentDate,
              price: sellPrice
            })

            // Reset state
            isHolding = false
            buyPrice = null
            buyDate = null
            prevSlopeWhileHolding = null
          }

          if (slope !== null) {
            prevSlopeWhileHolding = slope
          }
        }
      }
    }

    // If still holding at the end, mark as open position
    if (isHolding && reversedPrices.length > 0) {
      const lastPrice = reversedPrices[reversedPrices.length - 1]
      const currentPrice = lastPrice.close
      const plPercent = ((currentPrice - buyPrice) / buyPrice) * 100

      trades.push({
        buyPrice,
        buyDate,
        sellPrice: currentPrice,
        sellDate: lastPrice.date,
        plPercent,
        isOpen: true
      })
    }

    // Calculate total P&L and win rate
    const totalPL = trades.reduce((sum, trade) => sum + trade.plPercent, 0)
    const closedTrades = trades.filter(t => !t.isOpen)
    const winningTrades = closedTrades.filter(t => t.plPercent > 0).length
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0

    // Calculate market buy-and-hold performance for comparison
    let marketChange = 0
    if (trades.length > 0) {
      const firstTrade = trades[0]
      const lastTrade = trades[trades.length - 1]
      const startPrice = firstTrade.buyPrice
      const endPrice = lastTrade.sellPrice
      marketChange = ((endPrice - startPrice) / startPrice) * 100
    }

    return { trades, totalPL, winRate, closedTradeCount: closedTrades.length, sellSignals, smaUsed: smaKey, marketChange }
  }


  // Reset Vol Prf v2 dates if they're not found in current visible data
  useEffect(() => {
    if (!volumeProfileV2Enabled || displayPrices.length === 0) return

    const reversedDisplayPrices = [...displayPrices].reverse()
    const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

    if (visibleData.length === 0) return

    let shouldResetStart = false
    let shouldResetEnd = false

    if (volumeProfileV2StartDate !== null) {
      const startIdx = visibleData.findIndex(d => d.date === volumeProfileV2StartDate)
      if (startIdx === -1) shouldResetStart = true
    }

    if (volumeProfileV2EndDate !== null) {
      const endIdx = visibleData.findIndex(d => d.date === volumeProfileV2EndDate)
      if (endIdx === -1) shouldResetEnd = true
    }

    if (shouldResetStart && onVolumeProfileV2StartChange) {
      onVolumeProfileV2StartChange(null)
    }
    if (shouldResetEnd && onVolumeProfileV2EndChange) {
      onVolumeProfileV2EndChange(null)
    }
  }, [volumeProfileV2Enabled, volumeProfileV2StartDate, volumeProfileV2EndDate, displayPrices, zoomRange, onVolumeProfileV2StartChange, onVolumeProfileV2EndChange])

  // Calculate Volume Profile V2 - only when manually refreshed or feature toggled
  useEffect(() => {
    if (!volumeProfileV2Enabled) {
      setVolumeProfileV2Result({ slots: [], breakouts: [] })
      return
    }

    // Recalculate when refresh trigger changes or feature is enabled
    const result = calculateVolumeProfileV2()
    setVolumeProfileV2Result(result)
  }, [volumeProfileV2Enabled, volumeProfileV2RefreshTrigger, volumeProfileV2StartDate, volumeProfileV2EndDate])

  // Calculate Volume Profile V3 - only when manually refreshed or feature toggled
  useEffect(() => {
    if (!volumeProfileV3Enabled) {
      setVolumeProfileV3Result({ windows: [], breaks: [] })
      return
    }

    // Recalculate when refresh trigger changes or feature is enabled
    // Note: Does NOT recalculate on zoom change - only on refresh or period change
    const result = calculateVolumeProfileV3()
    setVolumeProfileV3Result(result)
  }, [volumeProfileV3Enabled, volumeProfileV3RefreshTrigger, displayPrices])

  // SMA Simulation Logic - find optimal SMA value based on P&L
  useEffect(() => {
    if (!volumeProfileV2Enabled || !chartId || !onSimulateComplete) return

    // Check if this chart has any SMA being simulated
    const simulatingKeys = Object.keys(simulatingSma).filter(key => key.startsWith(`${chartId}-`))
    if (simulatingKeys.length === 0) return

    // Get the SMA index being simulated
    const simulatingKey = simulatingKeys[0]
    const smaIndex = simulatingSma[simulatingKey]
    if (smaIndex === undefined || smaIndex === null || smaIndex === true) return

    // Run simulation asynchronously
    setTimeout(() => {
      let bestPL = -Infinity
      let bestSmaValue = null

      // Prices are in reverse chronological order, reverse for forward-time processing
      const reversedPrices = [...prices].reverse()

      // Helper to calculate P&L for a given SMA period (using daily prices)
      const calculatePLForSMA = (smaPeriod) => {
        if (reversedPrices.length === 0) return -Infinity

        // Calculate SMA from daily prices in forward chronological order
        const dateToSMA = new Map()
        for (let i = 0; i < reversedPrices.length; i++) {
          if (i < smaPeriod - 1) {
            dateToSMA.set(reversedPrices[i].date, null)
          } else {
            const sum = reversedPrices.slice(i - smaPeriod + 1, i + 1).reduce((acc, p) => acc + p.close, 0)
            dateToSMA.set(reversedPrices[i].date, sum / smaPeriod)
          }
        }

        const getSMASlope = (currentDate, prevDate) => {
          const currentSMA = dateToSMA.get(currentDate)
          const prevSMA = dateToSMA.get(prevDate)
          if (currentSMA !== undefined && prevSMA !== undefined) {
            return currentSMA - prevSMA
          }
          return null
        }

        const breakoutDates = new Set(volumeProfileV2Breakouts.map(b => b.date))
        const trades = []
        let isHolding = false
        let buyPrice = null
        let buyDate = null
        let prevSlopeWhileHolding = null

        // Iterate through daily prices in forward chronological order
        for (let i = 0; i < reversedPrices.length; i++) {
          const pricePoint = reversedPrices[i]
          if (!pricePoint) continue

          const currentDate = pricePoint.date
          const currentPrice = pricePoint.close

          if (breakoutDates.has(currentDate) && !isHolding) {
            isHolding = true
            buyPrice = currentPrice
            buyDate = currentDate
            prevSlopeWhileHolding = null
          } else if (isHolding && i > 0) {
            const prevPrice = reversedPrices[i - 1]
            if (prevPrice) {
              const slope = getSMASlope(currentDate, prevPrice.date)
              if (slope !== null && prevSlopeWhileHolding !== null && prevSlopeWhileHolding >= 0 && slope < 0) {
                const sellPrice = currentPrice
                const plPercent = ((sellPrice - buyPrice) / buyPrice) * 100
                trades.push({ plPercent })
                isHolding = false
                buyPrice = null
                buyDate = null
                prevSlopeWhileHolding = null
              }
              if (slope !== null) {
                prevSlopeWhileHolding = slope
              }
            }
          }
        }

        // If still holding, close at end
        if (isHolding && reversedPrices.length > 0) {
          const lastPrice = reversedPrices[reversedPrices.length - 1]
          const currentPrice = lastPrice.close
          const plPercent = ((currentPrice - buyPrice) / buyPrice) * 100
          trades.push({ plPercent, isOpen: true })
        }

        const totalPL = trades.reduce((sum, trade) => sum + trade.plPercent, 0)

        // Calculate total signals: closed trades = 1.0, open trades = 0.5
        const closedTrades = trades.filter(t => !t.isOpen)
        const openTrades = trades.filter(t => t.isOpen)
        const totalSignals = closedTrades.length + (openTrades.length * 0.5)

        return { totalPL, totalSignals }
      }

      // Test SMA values with proper increments
      const testValues = []
      for (let val = 3; val <= 200;) {
        testValues.push(val)
        if (val <= 10) val += 1
        else if (val <= 20) val += 2
        else if (val <= 40) val += 3
        else if (val <= 50) val += 4
        else if (val <= 100) val += 5
        else val += 10
      }

      const results = []
      for (const smaValue of testValues) {
        const { totalPL, totalSignals } = calculatePLForSMA(smaValue)
        results.push({ sma: smaValue, pl: totalPL, signals: totalSignals })

        // Only consider SMAs with >= 4 signals, then pick highest P/L
        if (totalSignals >= 4 && totalPL > bestPL) {
          bestPL = totalPL
          bestSmaValue = smaValue
        }
      }

      // Call the callback with results
      if (onSimulateComplete && bestSmaValue !== null) {
        onSimulateComplete(smaIndex, bestSmaValue)
      }
    }, 100) // Small delay to let UI update

  }, [simulatingSma, chartId, volumeProfileV2Enabled, onSimulateComplete, displayPrices, volumeProfileV2Data, volumeProfileV2Breakouts])

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
  // Use only the visible range to calculate thresholds
  const performanceVarianceThresholds = (() => {
    if (!performanceComparisonEnabled || performanceVariances.length === 0 || comparisonMode !== 'color') return { top20: null, bottom20: null }

    // Calculate the visible range end index
    const visibleEndIndex = zoomRange.end === null ? performanceVariances.length : Math.min(zoomRange.end, performanceVariances.length)
    const visibleStartIndex = Math.max(0, Math.min(zoomRange.start, performanceVariances.length - 1))

    // Only use variances from the visible range
    const visibleVariances = performanceVariances
      .slice(visibleStartIndex, visibleEndIndex)
      .filter(v => v !== null)

    if (visibleVariances.length === 0) return { top20: null, bottom20: null }

    const sorted = [...visibleVariances].sort((a, b) => a - b)
    const idx80 = Math.floor(sorted.length * 0.8)
    const idx20 = Math.floor(sorted.length * 0.2)

    return {
      top20: sorted[idx80],      // Top 20% (highest positive variance) in visible range
      bottom20: sorted[idx20]    // Bottom 20% (most negative variance) in visible range
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

  const chartData = displayPrices.map((price, index) => {
    const indicator = displayIndicators[index] || {}

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
      revAllChannels.forEach((channel, channelIndex) => {
        // Check if this index is within this channel's range
        if (index >= channel.startIndex && index < channel.endIndex) {
          const localIndex = getChannelLocalIndex(channel, index)
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

    // Add best stdev channels data
    if (bestStdevEnabled && bestStdevChannels.length > 0) {
      bestStdevChannels.forEach((channel, channelIndex) => {
        if (index >= channel.startIndex && index < channel.endIndex) {
          const localIndex = getChannelLocalIndex(channel, index)
          const midValue = channel.slope * localIndex + channel.intercept
          const upperBound = midValue + channel.channelWidth
          const lowerBound = midValue - channel.channelWidth

          dataPoint[`bestStdevChannel${channelIndex}Upper`] = upperBound
          dataPoint[`bestStdevChannel${channelIndex}Mid`] = midValue
          dataPoint[`bestStdevChannel${channelIndex}Lower`] = lowerBound

          // Add zone boundaries for this best stdev channel
          if (bestStdevChannelZones[channelIndex]) {
            const channelRange = upperBound - lowerBound
            bestStdevChannelZones[channelIndex].forEach((zone, zoneIndex) => {
              const zoneLower = lowerBound + channelRange * zone.zoneStart
              const zoneUpper = lowerBound + channelRange * zone.zoneEnd
              dataPoint[`bestStdevChannel${channelIndex}Zone${zoneIndex}Lower`] = zoneLower
              dataPoint[`bestStdevChannel${channelIndex}Zone${zoneIndex}Upper`] = zoneUpper
            })
          }
        }
      })
    }

    // Add resistance line data if enabled
    if (resLnEnabled && resLnData.length > 0) {
      const resLnPoint = resLnData.find(r => r.date === price.date)
      if (resLnPoint) {
        dataPoint.highVolZone = resLnPoint.highVolZone
        dataPoint.highVolZoneLower = resLnPoint.highVolZoneLower
        dataPoint.highVolZoneUpper = resLnPoint.highVolZoneUpper
        dataPoint.volumePercent = resLnPoint.volumePercent

        dataPoint.secondVolZone = resLnPoint.secondVolZone
        dataPoint.secondVolZoneLower = resLnPoint.secondVolZoneLower
        dataPoint.secondVolZoneUpper = resLnPoint.secondVolZoneUpper
        dataPoint.secondVolPercent = resLnPoint.secondVolPercent

        dataPoint.thirdVolZone = resLnPoint.thirdVolZone
        dataPoint.thirdVolZoneLower = resLnPoint.thirdVolZoneLower
        dataPoint.thirdVolZoneUpper = resLnPoint.thirdVolZoneUpper
        dataPoint.thirdVolPercent = resLnPoint.thirdVolPercent
      }
    }

    return dataPoint
  }).reverse() // Show oldest to newest

  // Calculate P&L after chartData is created (needs SMA values from chartData)
  const breakoutPL = calculateBreakoutPL()
  const v3PL = useMemo(() => {
    const breaks = volumeProfileV3Result.breaks || []
    const windows = volumeProfileV3Result.windows || []

    return calculateVolumeProfileV3PL({
      volumeProfileV3Breaks: breaks,
      volumeProfileV3Data: windows,
      prices,
      transactionFee: 0.003, // 0.3% broker fee
      cutoffPercent: 0.08 // 8% cutoff
    })
  }, [volumeProfileV3Result, prices])

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
        <div className="p-1">
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

          {/* Show Resistance Line info if enabled */}
          {resLnEnabled && data.highVolZone && data.volumePercent !== undefined && (
            <div className="mt-2 pt-2 border-t border-slate-600">
              <p className="text-sm font-semibold text-slate-200">Volume Zones</p>

              {/* Main high volume zone */}
              <div className="mt-1">
                <p className="text-xs text-slate-400">Primary Zone:</p>
                <p className="text-sm text-slate-300">
                  Price: ${data.highVolZone.toFixed(2)}
                </p>
                <p className="text-sm" style={{
                  color: data.volumePercent >= 50 ? '#3b82f6' :
                    data.volumePercent >= 40 ? '#60a5fa' :
                      data.volumePercent >= 30 ? '#22c55e' :
                        data.volumePercent >= 25 ? '#84cc16' :
                          data.volumePercent >= 20 ? '#a3e635' :
                            data.volumePercent >= 16 ? '#eab308' :
                              data.volumePercent >= 12 ? '#f97316' :
                                data.volumePercent >= 8 ? '#fb923c' :
                                  data.volumePercent >= 5 ? '#fbbf24' : '#ef4444'
                }}>
                  Volume: {data.volumePercent.toFixed(1)}%
                </p>
              </div>

              {/* Second volume zone */}
              {data.secondVolZone && (
                <div className="mt-1">
                  <p className="text-xs text-slate-400">Secondary Zone:</p>
                  <p className="text-sm text-slate-300">
                    Price: ${data.secondVolZone.toFixed(2)}
                  </p>
                  <p className="text-sm" style={{
                    color: data.secondVolPercent >= 50 ? '#3b82f6' :
                      data.secondVolPercent >= 40 ? '#60a5fa' :
                        data.secondVolPercent >= 30 ? '#22c55e' :
                          data.secondVolPercent >= 25 ? '#84cc16' :
                            data.secondVolPercent >= 20 ? '#a3e635' :
                              data.secondVolPercent >= 16 ? '#eab308' :
                                data.secondVolPercent >= 12 ? '#f97316' :
                                  data.secondVolPercent >= 8 ? '#fb923c' :
                                    data.secondVolPercent >= 5 ? '#fbbf24' : '#ef4444'
                  }}>
                    Volume: {data.secondVolPercent.toFixed(1)}%
                  </p>
                </div>
              )}

              {/* Third volume zone */}
              {data.thirdVolZone && (
                <div className="mt-1">
                  <p className="text-xs text-slate-400">Tertiary Zone:</p>
                  <p className="text-sm text-slate-300">
                    Price: ${data.thirdVolZone.toFixed(2)}
                  </p>
                  <p className="text-sm" style={{
                    color: data.thirdVolPercent >= 50 ? '#3b82f6' :
                      data.thirdVolPercent >= 40 ? '#60a5fa' :
                        data.thirdVolPercent >= 30 ? '#22c55e' :
                          data.thirdVolPercent >= 25 ? '#84cc16' :
                            data.thirdVolPercent >= 20 ? '#a3e635' :
                              data.thirdVolPercent >= 16 ? '#eab308' :
                                data.thirdVolPercent >= 12 ? '#f97316' :
                                  data.thirdVolPercent >= 8 ? '#fb923c' :
                                    data.thirdVolPercent >= 5 ? '#fbbf24' : '#ef4444'
                  }}>
                    Volume: {data.thirdVolPercent.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}
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
    const activePayload = e?.activePayload?.[0]?.payload
    const hoveredVolumeZone = (() => {
      const hoveredDate = activePayload?.date
      const hoveredPrice = activePayload?.close

      if (!hoveredDate || hoveredPrice === undefined || hoveredPrice === null) {
        return null
      }

      const buildLegend = (zones, currentIndex, percentKey = 'volumePercent') => {
        if (!Array.isArray(zones) || zones.length === 0 || currentIndex < 0) return null

        return zones.map((zone, idx) => {
          const percentValue = percentKey === 'volumeWeight'
            ? (zone.volumeWeight || 0) * 100
            : zone[percentKey] || 0

          return {
            legendIndex: idx,
            start: zone.minPrice,
            end: zone.maxPrice,
            label: `${percentValue.toFixed(1)}%`,
            color: getVolumeColor(percentValue),
            textColor: '#0f172a',
            isCurrent: idx === currentIndex
          }
        })
      }

      // Check Vol Prf V3 first (highest priority)
      if (volumeProfileV3Enabled && volumeProfileV3Data.length > 0) {
        // Find the window that contains this date
        for (const window of volumeProfileV3Data) {
          if (!window.dataPoints || window.dataPoints.length === 0) continue

          // Find the data point for this date
          const dataPoint = window.dataPoints.find(point => point.date === hoveredDate)

          if (dataPoint && dataPoint.priceZones) {
            const currentZoneIdx = dataPoint.priceZones.findIndex(zone =>
              hoveredPrice >= zone.minPrice && hoveredPrice <= zone.maxPrice
            )

            if (currentZoneIdx >= 0) {
              return buildLegend(dataPoint.priceZones, currentZoneIdx, 'volumeWeight')
            }
          }
        }
      }

      if (volumeProfileV2Enabled && volumeProfileV2Data.length > 0) {
        const matchingSlot = volumeProfileV2Data.find(slot =>
          hoveredDate >= slot.startDate && hoveredDate <= slot.endDate
        )

        if (matchingSlot) {
          const currentZoneIdx = matchingSlot.priceZones.findIndex(zone =>
            hoveredPrice >= zone.minPrice && hoveredPrice <= zone.maxPrice
          )

          if (currentZoneIdx >= 0) {
            return buildLegend(matchingSlot.priceZones, currentZoneIdx, 'volumeWeight')
          }
        }
      }

      if (volumeProfileEnabled && volumeProfiles.length > 0) {
        const matchingProfile = volumeProfiles.find(profile => {
          if (!profile.dateRange) return true
          return hoveredDate >= profile.dateRange.startDate && hoveredDate <= profile.dateRange.endDate
        }) || volumeProfiles[0]

        if (matchingProfile) {
          const currentZoneIdx = matchingProfile.zones.findIndex(zone =>
            hoveredPrice >= zone.minPrice && hoveredPrice <= zone.maxPrice
          )

          if (currentZoneIdx >= 0) {
            return buildLegend(matchingProfile.zones, currentZoneIdx)
          }
        }
      }

      return null
    })()

    setHoveredVolumeLegend(hoveredVolumeZone)

    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }

    // Handle chart panning - only when NOT in manual channel drag mode or zoom mode
    if (isPanning && !manualChannelDragMode && !zoomMode && e && e.chartX !== undefined && panStartX !== null && panStartZoom !== null) {
      const deltaX = e.chartX - panStartX
      const chartWidth = chartContainerRef.current?.offsetWidth || 800
      const totalDataLength = chartData.length

      // Check if we're showing all data
      const isShowingAllData = panStartZoom.start === 0 && (panStartZoom.end === null || panStartZoom.end === totalDataLength)

      if (isShowingAllData) {
        // When showing all data, first zoom in to create a window, then pan
        // Create a window that's 90% of total data
        const windowSize = Math.floor(totalDataLength * 0.9)

        // Calculate mouse position as ratio of chart width
        const mouseRatio = (panStartX / chartWidth)

        // Center the window around the mouse position
        let newStart = Math.floor(mouseRatio * totalDataLength - windowSize / 2)
        let newEnd = newStart + windowSize

        // Ensure bounds
        if (newStart < 0) {
          newStart = 0
          newEnd = windowSize
        }
        if (newEnd > totalDataLength) {
          newEnd = totalDataLength
          newStart = totalDataLength - windowSize
        }

        // Apply the pan to this new window
        const panPercent = -(deltaX / chartWidth)
        const panAmount = Math.floor(panPercent * windowSize)

        newStart = Math.max(0, Math.min(totalDataLength - windowSize, newStart + panAmount))
        newEnd = newStart + windowSize

        onZoomChange({ start: newStart, end: newEnd === totalDataLength ? null : newEnd })

        // Update panStartZoom to the new window so subsequent moves work correctly
        setPanStartZoom({ start: newStart, end: newEnd === totalDataLength ? null : newEnd })
        return
      }

      // Normal panning when already zoomed in
      const panPercent = -(deltaX / chartWidth)
      const currentRange = (panStartZoom.end || totalDataLength) - panStartZoom.start
      const panAmount = Math.floor(panPercent * currentRange)

      // Keep window size constant and just shift
      let newStart = panStartZoom.start + panAmount
      let newEnd = (panStartZoom.end || totalDataLength) + panAmount

      // Ensure we don't pan beyond data bounds while maintaining window size
      if (newStart < 0) {
        newStart = 0
        newEnd = Math.min(totalDataLength, currentRange)
      }
      if (newEnd > totalDataLength) {
        newEnd = totalDataLength
        newStart = Math.max(0, totalDataLength - currentRange)
      }

      const finalZoom = { start: newStart, end: newEnd === totalDataLength ? null : newEnd }
      onZoomChange(finalZoom)
      return
    }

    // Handle volume profile manual selection
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && e && e.activeLabel) {
      setVolumeProfileSelectionEnd(e.activeLabel)
      return
    }

    // Handle zoom selection
    if (zoomMode && isSelectingZoom && e && e.activeLabel) {
      setZoomSelectionEnd(e.activeLabel)
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
    setHoveredVolumeLegend(null)
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

    // Zoom mode selection - second priority
    if (zoomMode && e && e.activeLabel) {
      setIsSelectingZoom(true)
      setZoomSelectionStart(e.activeLabel)
      setZoomSelectionEnd(e.activeLabel)
      return
    }

    // Manual channel selection - third priority
    if (manualChannelEnabled && manualChannelDragMode && e && e.activeLabel) {
      setIsSelecting(true)
      setSelectionStart(e.activeLabel)
      setSelectionEnd(e.activeLabel)
      return
    }

    // Panning - only when no other mode is active
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

    // Process zoom selection
    if (zoomMode && isSelectingZoom && zoomSelectionStart && zoomSelectionEnd) {
      // Find the indices in the reversed display prices (oldest first)
      const reversedDisplayPrices = [...displayPrices].reverse()
      const startIndex = reversedDisplayPrices.findIndex(p => p.date === zoomSelectionStart)
      const endIndex = reversedDisplayPrices.findIndex(p => p.date === zoomSelectionEnd)

      if (startIndex !== -1 && endIndex !== -1) {
        // Ensure correct order (start should be earlier in time, which means lower index)
        const minIndex = Math.min(startIndex, endIndex)
        const maxIndex = Math.max(startIndex, endIndex)

        // Apply zoom to the selected range
        onZoomChange({ start: minIndex, end: maxIndex + 1 })
      }

      // Reset zoom selection state
      setIsSelectingZoom(false)
      setZoomSelectionStart(null)
      setZoomSelectionEnd(null)
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
    if (zoomMode) return 'crosshair'
    if (manualChannelDragMode) return 'crosshair'
    if (isPanning) return 'grabbing'
    return 'grab'
  }

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight, position: 'relative', cursor: getCursorStyle(), userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
      {/* Show loading state if data is not available */}
      {(!prices || !indicators || prices.length === 0 || indicators.length === 0) ? (
        <div className="flex items-center justify-center h-full text-slate-400">
          <div className="text-center">
            <div className="text-lg">Loading chart data...</div>
            <div className="text-xs mt-2 opacity-50">
              Debug: prices={prices?.length || 0}, indicators={indicators?.length || 0}
            </div>
          </div>
        </div>
      ) : (
        <>
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
                <path d="M18 6L6 18M6 6l12 12" />
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

      {/* Volume Profile V2 Dual-Handle Range Slider */}
      {volumeProfileV2Enabled && (() => {
        const reversedDisplayPrices = [...displayPrices].reverse()
        const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)
        const maxIndex = visibleData.length

        // Convert stored dates to current visible indices
        let effectiveStartIndex = 0
        let effectiveEndIndex = maxIndex

        if (volumeProfileV2StartDate !== null) {
          const startIdx = visibleData.findIndex(d => d.date === volumeProfileV2StartDate)
          if (startIdx !== -1) {
            effectiveStartIndex = startIdx
          }
          // If not found, use default (0)
        }

        if (volumeProfileV2EndDate !== null) {
          const endIdx = visibleData.findIndex(d => d.date === volumeProfileV2EndDate)
          if (endIdx !== -1) {
            effectiveEndIndex = endIdx + 1
          }
          // If not found, use default (maxIndex)
        }

        const startDate = visibleData[effectiveStartIndex]?.date || '...'
        const endDate = visibleData[effectiveEndIndex - 1]?.date || '...'

        if (maxIndex <= 1) return null

        const topOffset = revAllChannelEnabled && revAllVisibleLength > 1 ? '46px' : '4px'

        return (
          <div
            style={{
              position: 'absolute',
              top: topOffset,
              left: '60px', // Align with chart left edge (Y-axis width)
              right: '20px', // Align with chart right edge
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
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Vol V2 Range</span>

              {/* Date range popup - shown while dragging */}
              {volV2SliderDragging && (
                <div style={{
                  position: 'absolute',
                  top: '-35px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(148, 163, 184, 0.5)',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  color: '#e2e8f0',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  zIndex: 10
                }}>
                  {startDate} → {endDate}
                </div>
              )}

              {/* Dual-handle range slider container */}
              <div style={{ flex: 1, position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
                {/* Background track */}
                <div style={{
                  position: 'absolute',
                  width: '100%',
                  height: '6px',
                  background: '#475569',
                  borderRadius: '3px',
                  zIndex: 1
                }} />

                {/* Active range highlight */}
                <div style={{
                  position: 'absolute',
                  left: `${(effectiveStartIndex / maxIndex) * 100}%`,
                  width: `${((effectiveEndIndex - effectiveStartIndex) / maxIndex) * 100}%`,
                  height: '6px',
                  background: '#06b6d4',
                  borderRadius: '3px',
                  zIndex: 2
                }} />

                {/* Start handle slider */}
                <input
                  type="range"
                  min={0}
                  max={maxIndex}
                  value={effectiveStartIndex}
                  title={`Start: ${startDate}`}
                  onChange={(e) => {
                    const newStartIdx = parseInt(e.target.value, 10)
                    if (newStartIdx < effectiveEndIndex && visibleData[newStartIdx]) {
                      // Convert index to date and store the date
                      const newStartDate = visibleData[newStartIdx].date
                      onVolumeProfileV2StartChange && onVolumeProfileV2StartChange(newStartDate)
                    }
                  }}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '6px',
                    margin: 0,
                    padding: 0,
                    background: 'transparent',
                    pointerEvents: 'all',
                    cursor: 'pointer',
                    zIndex: 4,
                    WebkitAppearance: 'none',
                    appearance: 'none'
                  }}
                  onMouseDown={() => setVolV2SliderDragging(true)}
                  onMouseUp={() => setVolV2SliderDragging(false)}
                  onTouchStart={() => setVolV2SliderDragging(true)}
                  onTouchEnd={() => setVolV2SliderDragging(false)}
                />

                {/* End handle slider */}
                <input
                  type="range"
                  min={0}
                  max={maxIndex}
                  value={effectiveEndIndex}
                  title={`End: ${endDate}`}
                  onChange={(e) => {
                    const newEndIdx = parseInt(e.target.value, 10)
                    if (newEndIdx > effectiveStartIndex && visibleData[newEndIdx - 1]) {
                      // Convert index to date and store the date
                      const newEndDate = visibleData[newEndIdx - 1].date
                      onVolumeProfileV2EndChange && onVolumeProfileV2EndChange(newEndDate)
                    }
                  }}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '6px',
                    margin: 0,
                    padding: 0,
                    background: 'transparent',
                    pointerEvents: 'all',
                    cursor: 'pointer',
                    zIndex: 3,
                    WebkitAppearance: 'none',
                    appearance: 'none'
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.zIndex = '5'; setVolV2SliderDragging(true); }}
                  onMouseUp={(e) => { e.currentTarget.style.zIndex = '3'; setVolV2SliderDragging(false); }}
                  onTouchStart={() => setVolV2SliderDragging(true)}
                  onTouchEnd={() => setVolV2SliderDragging(false)}
                />

                <style>{`
                  input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #06b6d4;
                    border: 2px solid #fff;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  }

                  input[type="range"]::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #06b6d4;
                    border: 2px solid #fff;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  }

                  input[type="range"]::-webkit-slider-runnable-track {
                    background: transparent;
                    height: 6px;
                  }

                  input[type="range"]::-moz-range-track {
                    background: transparent;
                    height: 6px;
                  }
                `}</style>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{
        width: '100%',
        height: '100%',
        paddingTop: (() => {
          const hasRevSlider = revAllChannelEnabled && revAllVisibleLength > 1
          const hasVolV2Slider = volumeProfileV2Enabled && displayPrices.length > 0
          if (hasRevSlider && hasVolV2Slider) return '84px' // Rev slider + Vol V2 slider
          if (hasRevSlider || hasVolV2Slider) return '42px' // One slider
          return '0' // No sliders
        })()
      }}>
        <ResponsiveContainer>
          <ComposedChart
            data={chartDataWithZones}
            margin={{ top: 5, right: 0, left: 0, bottom: 32 }}
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
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} stroke="#475569" width={isMobile ? 40 : 60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              align="center"
              verticalAlign="bottom"
              wrapperStyle={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                marginTop: 0,
                paddingTop: 0
              }}
              content={<ImportedCustomLegend
              smaVisibility={smaVisibility}
              onToggleSma={onToggleSma}
              onDeleteSma={onDeleteSma}
              allChannelsVisibility={allChannelsVisibility}
              setAllChannelsVisibility={setAllChannelsVisibility}
              allChannels={allChannels}
              setAllChannels={setAllChannels}
              revAllChannelsVisibility={revAllChannelsVisibility}
              setRevAllChannelsVisibility={setRevAllChannelsVisibility}
              revAllChannels={revAllChannels}
              setRevAllChannels={setRevAllChannels}
              adjustChannelRangeWithoutRecalc={adjustChannelRangeWithoutRecalc}
              bestStdevChannelsVisibility={bestStdevChannelsVisibility}
              setBestStdevChannelsVisibility={setBestStdevChannelsVisibility}
              trendChannelVisible={trendChannelVisible}
              setTrendChannelVisible={setTrendChannelVisible}
              slopeChannelEnabled={slopeChannelEnabled}
              onSlopeChannelParamsChange={onSlopeChannelParamsChange}
              controlsVisible={controlsVisible}
              setControlsVisible={setControlsVisible}
              manualChannels={manualChannels}
              setManualChannels={setManualChannels}
              extendManualChannel={extendManualChannel}
              volumeProfileV2Enabled={volumeProfileV2Enabled}
              volumeProfileV3Enabled={volumeProfileV3Enabled}
              isMobile={isMobile}
              displayPrices={displayPrices}
              zoomRange={zoomRange}
              hoveredVolumeLegend={hoveredVolumeLegend}
              hoveredVolumeTitleFormatter={(slot) => `$${slot.start?.toFixed(2)} - $${slot.end?.toFixed(2)}`}
            />}
            />
            {syncedMouseDate && (
              <ReferenceLine
                x={syncedMouseDate}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            {/* Volume Profile V2 - Progressive Horizontal Bars (RENDER FIRST - UNDER EVERYTHING) */}
            <Customized component={(props) => <ImportedCustomVolumeProfileV2 {...props} volumeProfileV2Enabled={volumeProfileV2Enabled} volumeProfileV2Data={volumeProfileV2Data} displayPrices={displayPrices} zoomRange={zoomRange} volV2HoveredBar={volV2HoveredBar} setVolV2HoveredBar={setVolV2HoveredBar} volumeProfileV2Breakouts={volumeProfileV2Breakouts} breakoutPL={breakoutPL} />} />

            {/* Volume Profile V3 - Windowed Analysis with Break Detection */}
            <Customized component={(props) => <ImportedCustomVolumeProfileV3 {...props} volumeProfileV3Enabled={volumeProfileV3Enabled} volumeProfileV3Data={volumeProfileV3Data} displayPrices={displayPrices} zoomRange={zoomRange} volV3HoveredBar={volV3HoveredBar} setVolV3HoveredBar={setVolV3HoveredBar} volumeProfileV3Breaks={volumeProfileV3Breaks} v3PL={v3PL} />} />

            {/* Last Channel Zones as Parallel Lines */}
            <Customized component={CustomZoneLines} />

            {/* Last Channel Stdev Label */}
            <Customized component={CustomSlopeChannelLabel} />

            {/* All Channels Zones as Parallel Lines */}
            <Customized component={(props) => <ImportedCustomRevAllChannelZoneLines {...props} revAllChannelEnabled={revAllChannelEnabled} revAllChannels={revAllChannels} revAllChannelsVisibility={revAllChannelsVisibility} revAllChannelZones={revAllChannelZones} chartDataWithZones={chartDataWithZones} />} />

            {/* All Channels Stdev Labels at Lower Bound Midpoint */}
            <Customized component={(props) => <ImportedCustomRevAllChannelStdevLabels {...props} revAllChannelEnabled={revAllChannelEnabled} revAllChannels={revAllChannels} revAllChannelsVisibility={revAllChannelsVisibility} chartDataWithZones={chartDataWithZones} />} />

            {/* Manual Channel Zones as Parallel Lines */}
            <Customized component={(props) => <ImportedCustomManualChannelZoneLines {...props} manualChannelEnabled={manualChannelEnabled} manualChannels={manualChannels} allManualChannelZones={allManualChannelZones} chartDataWithZones={chartDataWithZones} />} />

            {/* Manual Channel Stdev Labels */}
            <Customized component={(props) => <ImportedCustomManualChannelLabels {...props} manualChannelEnabled={manualChannelEnabled} manualChannels={manualChannels} displayPrices={displayPrices} chartDataWithZones={chartDataWithZones} zoomRange={zoomRange} />} />

            {/* Best Channel Zones as Parallel Lines */}
            <Customized component={(props) => <ImportedCustomBestChannelZoneLines {...props} bestChannelEnabled={bestChannelEnabled} bestChannels={bestChannels} bestChannelsVisibility={bestChannelsVisibility} bestChannelZones={bestChannelZones} chartDataWithZones={chartDataWithZones} />} />

            {/* Best Channel Stdev Labels */}
            <Customized component={(props) => <ImportedCustomBestChannelStdevLabels {...props} bestChannelEnabled={bestChannelEnabled} bestChannels={bestChannels} bestChannelsVisibility={bestChannelsVisibility} chartDataWithZones={chartDataWithZones} />} />

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

            {/* Zoom Selection Rectangle */}
            {zoomMode && isSelectingZoom && zoomSelectionStart && zoomSelectionEnd && (
              <Customized component={(props) => {
                const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
                if (!xAxisMap || !yAxisMap) return null

                const xAxis = xAxisMap[0]
                const yAxis = yAxisMap[0]

                if (!xAxis || !yAxis) return null

                const startX = xAxis.scale(zoomSelectionStart)
                const endX = xAxis.scale(zoomSelectionEnd)

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
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="#3b82f6"
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

            {/* Best Stdev Channel Lines */}
            {bestStdevEnabled && bestStdevChannels.length > 0 && bestStdevChannels.map((channel, index) => {
              // Color palette for best stdev channels (purple/magenta tones)
              const channelColors = [
                '#a855f7',  // Purple
                '#d946ef',  // Fuchsia
                '#c026d3',  // Magenta
                '#e879f9',  // Light Purple
                '#f0abfc',  // Pale Purple
              ]
              const channelColor = channelColors[index % channelColors.length]
              const isVisible = bestStdevChannelsVisibility[index] !== false

              return (
                <React.Fragment key={`best-stdev-channel-${index}`}>
                  <Line
                    type="monotone"
                    dataKey={`bestStdevChannel${index}Upper`}
                    stroke={channelColor}
                    strokeWidth={2}
                    dot={false}
                    legendType="none"
                    strokeDasharray="4 4"
                    opacity={0.7}
                    hide={!isVisible}
                  />
                  <Customized
                    key={`best-stdev-channel-${index}-zones`}
                    component={<CustomBestStdevZoneLines
                      bestStdevChannels={bestStdevChannels}
                      bestStdevChannelsVisibility={bestStdevChannelsVisibility}
                      bestStdevChannelZones={bestStdevChannelZones}
                    />}
                  />
                  <Line
                    type="monotone"
                    dataKey={`bestStdevChannel${index}Mid`}
                    stroke={channelColor}
                    strokeWidth={2.5}
                    dot={false}
                    name={`BStd${index + 1} (${channel.lookbackCount}pts, ${channel.touchCount} touches, ${bestStdevValue?.toFixed(2)}σ)`}
                    strokeDasharray="4 4"
                    hide={!isVisible}
                  />
                  <Line
                    type="monotone"
                    dataKey={`bestStdevChannel${index}Lower`}
                    stroke={channelColor}
                    strokeWidth={2}
                    dot={false}
                    legendType="none"
                    strokeDasharray="4 4"
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

            {/* Market Gap Open Indicators */}
            {mktGapOpenEnabled && mktGapOpenData.map((gap, index) => {
              // Find the corresponding data point in the main chart to position the arrow
              const pricePoint = prices.find(p => p.date === gap.date)
              if (!pricePoint) return null

              // Gap Up (SPY > 0) -> Down Arrow
              // Gap Down (SPY < 0) -> Up Arrow
              // Anchor to CLOSE price so it touches the line
              const isGapUp = gap.isGapUp
              const yPos = pricePoint.close
              const color = isGapUp ? "#ef4444" : "#22c55e" // Red for Gap Up (Down Arrow), Green for Gap Down (Up Arrow)

              return (
                <ReferenceDot
                  key={`gap-${gap.date}-${index}`}
                  x={gap.date}
                  y={yPos}
                  r={0} // Invisible dot, just for positioning
                  label={({ viewBox }) => {
                    const { x, y } = viewBox
                    // y is the screen coordinate of the price point (High or Low)

                    return (
                      <g transform={`translate(${x}, ${y})`}>
                        {isGapUp ? (
                          // Gap Up: Down Arrow pointing at High (y)
                          // Text above arrow
                          <>
                            <text
                              x={0}
                              y={-20}
                              textAnchor="middle"
                              fill={color}
                              fontSize={11}
                              fontWeight="bold"
                            >
                              {gap.symbol} {gap.changePercent}%
                            </text>
                            <path
                              d="M0,-15 L0,0 M-5,-5 L0,0 L5,-5"
                              stroke={color}
                              strokeWidth={2}
                              fill="none"
                            />
                          </>
                        ) : (
                          // Gap Down: Up Arrow pointing at Low (y)
                          // Text below arrow
                          <>
                            <path
                              d="M0,15 L0,0 M-5,5 L0,0 L5,5"
                              stroke={color}
                              strokeWidth={2}
                              fill="none"
                            />
                            <text
                              x={0}
                              y={27}
                              textAnchor="middle"
                              fill={color}
                              fontSize={11}
                              fontWeight="bold"
                            >
                              {gap.symbol} {gap.changePercent}%
                            </text>
                          </>
                        )}
                      </g>
                    )
                  }}
                />
              )
            })}

            {/* Resistance Line - Color-coded by volume percentage */}
            <Customized component={(props) => <ImportedCustomResistanceLine {...props} chartDataWithZones={chartDataWithZones} resLnEnabled={resLnEnabled} />} />

            {/* Second Volume Zone Line - Support/Resistance in same direction */}
            <Customized component={(props) => <ImportedCustomSecondVolZoneLine {...props} chartDataWithZones={chartDataWithZones} resLnEnabled={resLnEnabled} />} />

            {/* Third Volume Zone Line - Support/Resistance in opposite direction */}
            <Customized component={(props) => <ImportedCustomThirdVolZoneLine {...props} chartDataWithZones={chartDataWithZones} resLnEnabled={resLnEnabled} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </>
      )}
    </div>
  )
}

// Custom component to render zone lines for best stdev channels
const CustomBestStdevZoneLines = (props) => {
  const { xAxisMap, yAxisMap, data, bestStdevChannels, bestStdevChannelsVisibility, bestStdevChannelZones } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis || !bestStdevChannels || !bestStdevChannelZones) return null

  // Define color palette for best stdev channels (purple/magenta tones)
  const channelColors = [
    '#a855f7',  // Purple
    '#d946ef',  // Fuchsia
    '#c026d3',  // Magenta
    '#e879f9',  // Light Purple
    '#f0abfc',  // Pale Purple
  ]

  return (
    <g>
      {bestStdevChannels.map((channel, channelIndex) => {
        const isVisible = bestStdevChannelsVisibility[channelIndex] !== false
        if (!isVisible) return null

        const channelColor = channelColors[channelIndex % channelColors.length]
        const zones = bestStdevChannelZones[channelIndex]
        if (!zones) return null

        return zones.map((zone, zoneIndex) => {
          const points = data.map((point) => {
            const upper = point[`bestStdevChannel${channelIndex}Zone${zoneIndex}Upper`]
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

          // Opacity and color intensity based on volume weight: higher volume = more intense
          const minOpacity = 0.3
          const maxOpacity = 0.9
          const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

          // Parse the channel color and adjust lightness based on volume weight
          // Higher volume = deeper/darker color
          const colorMap = {
            '#a855f7': 271, // Purple
            '#d946ef': 300, // Fuchsia
            '#c026d3': 295, // Magenta
            '#e879f9': 292, // Light Purple
            '#f0abfc': 291, // Pale Purple
          }
          const hue = colorMap[channelColor] || 271
          const minLightness = 35 // Darker
          const maxLightness = 65 // Lighter
          const lightness = maxLightness - (zone.volumeWeight * (maxLightness - minLightness))
          const color = `hsl(${hue}, 70%, ${lightness}%)`

          const lastPoint = points[points.length - 1]

          return (
            <g key={`best-stdev-channel-${channelIndex}-zone-${zoneIndex}`}>
              {/* Zone boundary line */}
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
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

export default PriceChart
