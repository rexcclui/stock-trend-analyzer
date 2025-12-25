/**
 * Calculate Volume Profile V3 windows and break signals
 *
 * LOW-VOLUME BREAKOUT/BREAKDOWN DETECTION:
 * - Window extends continuously throughout the entire backtest period
 * - Window keeps extending even when B/S signals are found (no new windows created)
 * - Divide price range evenly into 15-20 zones
 *
 * BUY SIGNALS (Low-volume breakout UP):
 * - Current zone must be 8% LESS than ANY support zone (from 10 non-zero zones below)
 * - Individual zone check: Current = 2%, Support = 10.5% → Buy (10.5% - 2% = 8.5% > 8%)
 * - Merged zone check: Current = 2%, Zone1 = 5%, Zone2 = 10.1% → Buy ((5% + 10.1%) - 2% = 13.1% > 8%)
 * - Merged zone requirement: BOTH zones must be at least 2.5% more than current individually
 * - Additional filter: best support zone must have at least 10% total window volume
 * - Additional filter: 3 zones above current must have less volume (thin resistance ahead)
 * - This identifies price moving away from strong high-volume support
 * - Breakup = buy signal (price escaping support with low volume = bullish)
 *
 * SELL SIGNALS (Low-volume breakdown DOWN):
 * - Current zone must be 8% LESS than ANY resistance zone (from 10 non-zero zones above)
 * - Individual zone check: Current = 2%, Resistance = 10.5% → Sell (10.5% - 2% = 8.5% > 8%)
 * - Merged zone check: Current = 2%, Zone1 = 5%, Zone2 = 10.1% → Sell ((5% + 10.1%) - 2% = 13.1% > 8%)
 * - Merged zone requirement: BOTH zones must be at least 2.5% more than current individually
 * - Additional filter: best resistance zone must have at least 10% total window volume
 * - Additional filter: 3 zones below current must have less volume (thin support below)
 * - This identifies price moving away from strong high-volume resistance
 * - Breakdown = sell signal (price escaping resistance with low volume = bearish)
 * - Requires at least 75 points since window reset (all-time high) before sell signal
 *
 * @param {Array} displayPrices - Array of price data {date, close, volume}
 * @param {Object} zoomRange - {start, end} - NOT USED for data filtering, kept for API compatibility
 * @param {Array} windowSplitDates - Optional dates where windows should split (empty array = single continuous window)
 * @returns {Object} {windows, breaks} - Windows with volume profile data and break signals
 *
 * NOTE: V3 ALWAYS analyzes the FULL dataset regardless of zoom level.
 * This ensures consistent backtesting results. Zoom only affects visual display.
 */
export const calculateVolumeProfileV3 = (displayPrices, zoomRange = { start: 0, end: null }, windowSplitDates = []) => {
  if (!displayPrices || displayPrices.length === 0) return { windows: [], breaks: [] }

  const reversedDisplayPrices = [...displayPrices].reverse()
  // ALWAYS use full dataset for V3 analysis (ignore zoomRange for data filtering)
  // zoomRange is only used for visual display, not for calculations
  const visibleData = reversedDisplayPrices

  if (visibleData.length === 0) return { windows: [], breaks: [] }

  const MIN_WINDOW_SIZE = 75  // Changed from 150 to 75
  const BREAK_VOLUME_THRESHOLD = 0.10 // 10%
  const BREAK_DIFF_THRESHOLD = 0.08 // 8% - current zone must have 8% LESS volume than support/resistance
  const MERGED_ZONE_MIN_DIFF = 0.025 // 2.5% - each zone in merged pair must be at least 2.5% more than current
  const ZONE_LOOKBACK = 10 // Check up to 10 non-zero zones for break detection
  const ZONE_LOOKABOVE = 3 // Check upper 3 zones - must have less volume than current

  const windows = []
  const breaks = []
  let currentWindowStart = 0

  // Create a set of split dates for quick lookup
  const splitDateSet = new Set(windowSplitDates)

  while (currentWindowStart < visibleData.length) {
    // Find the next split point (sell date) or end of data
    let windowEnd = visibleData.length
    for (let i = currentWindowStart; i < visibleData.length; i++) {
      if (splitDateSet.has(visibleData[i].date)) {
        windowEnd = i + 1  // INCLUDE the sell date in the current window
        break
      }
    }

    // Process data from currentWindowStart to windowEnd
    let windowData = visibleData.slice(currentWindowStart, windowEnd)

    if (windowData.length === 0) break

    // Process each data point in the window to detect breaks
    const windowPoints = []

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

      // Check break condition - require at least 75 data points before buy/sell signal
      // This ensures sufficient volume profile history for meaningful detection
      if (i >= MIN_WINDOW_SIZE) {
        // BUY SIGNAL DETECTION (Low-volume breakout UP)
        // Check the next 10 NON-ZERO volume zones below - current zone must have LESS volume (low-volume breakout)
        let buyBreakConditionMet = false
        let minWeightDiffBuy = 0  // Track most negative difference (strongest support zone)
        let bestSupportZoneIdx = -1
        let bestSupportZoneWeight = 0

        // Collect non-zero zones below current zone for individual and merged checking
        const nonZeroZonesBelow = []
        let k = 1
        while (nonZeroZonesBelow.length < ZONE_LOOKBACK && (currentZoneIdx - k) >= 0) {
          const prevZoneIdx = currentZoneIdx - k
          const prevZoneWeight = priceZones[prevZoneIdx].volumeWeight

          // Collect only non-zero zones
          if (prevZoneWeight > 0) {
            nonZeroZonesBelow.push({
              zoneIdx: prevZoneIdx,
              weight: prevZoneWeight
            })
          }
          k++
        }

        // PART 1: Check individual zones - current must be 8% LESS than ANY zone below
        // Example: Current = 2%, Zone = 10.5% → Buy (10.5% - 2% = 8.5% > 8%)
        for (let i = 0; i < nonZeroZonesBelow.length; i++) {
          const zone = nonZeroZonesBelow[i]
          const weightDiff = zone.weight - currentWeight  // Support minus current

          // Trigger if support zone has at least 8% MORE volume than current
          if (weightDiff >= BREAK_DIFF_THRESHOLD) {
            buyBreakConditionMet = true
          }

          // Track the zone with most positive difference (strongest support zone)
          if (weightDiff > minWeightDiffBuy) {
            minWeightDiffBuy = weightDiff
            bestSupportZoneIdx = zone.zoneIdx
            bestSupportZoneWeight = zone.weight
          }
        }

        // PART 2: Check merged consecutive zones (zone[i] + zone[i+1])
        // Merged zone must be 8% MORE than current, AND each individual zone must be 2.5% MORE
        for (let i = 0; i < nonZeroZonesBelow.length - 1; i++) {
          const zone1 = nonZeroZonesBelow[i]
          const zone2 = nonZeroZonesBelow[i + 1]

          // Each individual zone must be at least 2.5% more than current
          const diff1 = zone1.weight - currentWeight
          const diff2 = zone2.weight - currentWeight

          if (diff1 >= MERGED_ZONE_MIN_DIFF && diff2 >= MERGED_ZONE_MIN_DIFF) {
            // Check if merged zone is 8% more than current
            const mergedWeight = zone1.weight + zone2.weight
            const mergedDiff = mergedWeight - currentWeight

            if (mergedDiff >= BREAK_DIFF_THRESHOLD) {
              buyBreakConditionMet = true

              // Track merged zone if it's stronger support
              if (mergedDiff > minWeightDiffBuy) {
                minWeightDiffBuy = mergedDiff
                bestSupportZoneIdx = zone1.zoneIdx  // Use first zone index
                bestSupportZoneWeight = mergedWeight
              }
            }
          }
        }

        // Additional threshold: require support zone (below) to have at least 10% of total window volume
        // This ensures we're breaking away from a significant support, not just noise
        // Note: bestSupportZoneWeight is already the weight (proportion), works for both individual and merged zones
        if (buyBreakConditionMet && bestSupportZoneWeight > 0) {
          if (bestSupportZoneWeight < BREAK_VOLUME_THRESHOLD) {
            buyBreakConditionMet = false
          }
        }

        // Check upper zones: the 3 zones above (if exist) must have LESS volume than current zone
        // This confirms we're moving into progressively thinner resistance
        if (buyBreakConditionMet) {
          for (let m = 1; m <= ZONE_LOOKABOVE; m++) {
            const upperZoneIdx = currentZoneIdx + m
            if (upperZoneIdx < numPriceZones) {
              const upperZoneWeight = priceZones[upperZoneIdx].volumeWeight
              // Skip zones with zero volume (price hasn't reached there yet)
              if (upperZoneWeight > 0) {
                // Upper zone must have LESS volume than current zone
                if (upperZoneWeight >= currentWeight) {
                  buyBreakConditionMet = false
                  break
                }
              }
            }
          }
        }

        if (buyBreakConditionMet) {
          // Record buy break but DON'T end the window - continue extending
          breaks.push({
            date: dataPoint.date,
            price: currentPrice,
            isUpBreak: true, // Low-volume breakout - price moving away from high-volume support
            currentWeight: currentWeight,  // Low volume weight at break price
            windowIndex: windows.length,
            supportLevel: priceZones[bestSupportZoneIdx]?.minPrice || minPrice,  // High-volume support zone below
            maxVolumeWeight: bestSupportZoneWeight  // Volume weight of support zone
          })
          // Don't break - keep extending window to find more breaks
        }

        // SELL SIGNAL DETECTION (Low-volume breakdown DOWN) - Reverse of buy logic
        // Check the next 10 NON-ZERO volume zones above - current zone must have LESS volume (low-volume breakdown)
        let sellBreakConditionMet = false
        let minWeightDiffSell = 0  // Track most negative difference (strongest resistance zone)
        let bestResistanceZoneIdx = -1
        let bestResistanceZoneWeight = 0

        // Collect non-zero zones above current zone for individual and merged checking
        const nonZeroZonesAbove = []
        let j = 1
        while (nonZeroZonesAbove.length < ZONE_LOOKBACK && (currentZoneIdx + j) < numPriceZones) {
          const nextZoneIdx = currentZoneIdx + j
          const nextZoneWeight = priceZones[nextZoneIdx].volumeWeight

          // Collect only non-zero zones
          if (nextZoneWeight > 0) {
            nonZeroZonesAbove.push({
              zoneIdx: nextZoneIdx,
              weight: nextZoneWeight
            })
          }
          j++
        }

        // PART 1: Check individual zones - current must be 8% LESS than ANY zone above
        // Example: Current = 2%, Zone = 10.5% → Sell (10.5% - 2% = 8.5% > 8%)
        for (let i = 0; i < nonZeroZonesAbove.length; i++) {
          const zone = nonZeroZonesAbove[i]
          const weightDiff = zone.weight - currentWeight  // Resistance minus current

          // Trigger if resistance zone has at least 8% MORE volume than current
          if (weightDiff >= BREAK_DIFF_THRESHOLD) {
            sellBreakConditionMet = true
          }

          // Track the zone with most positive difference (strongest resistance zone)
          if (weightDiff > minWeightDiffSell) {
            minWeightDiffSell = weightDiff
            bestResistanceZoneIdx = zone.zoneIdx
            bestResistanceZoneWeight = zone.weight
          }
        }

        // PART 2: Check merged consecutive zones (zone[i] + zone[i+1])
        // Merged zone must be 8% MORE than current, AND each individual zone must be 2.5% MORE
        for (let i = 0; i < nonZeroZonesAbove.length - 1; i++) {
          const zone1 = nonZeroZonesAbove[i]
          const zone2 = nonZeroZonesAbove[i + 1]

          // Each individual zone must be at least 2.5% more than current
          const diff1 = zone1.weight - currentWeight
          const diff2 = zone2.weight - currentWeight

          if (diff1 >= MERGED_ZONE_MIN_DIFF && diff2 >= MERGED_ZONE_MIN_DIFF) {
            // Check if merged zone is 8% more than current
            const mergedWeight = zone1.weight + zone2.weight
            const mergedDiff = mergedWeight - currentWeight

            if (mergedDiff >= BREAK_DIFF_THRESHOLD) {
              sellBreakConditionMet = true

              // Track merged zone if it's stronger resistance
              if (mergedDiff > minWeightDiffSell) {
                minWeightDiffSell = mergedDiff
                bestResistanceZoneIdx = zone1.zoneIdx  // Use first zone index
                bestResistanceZoneWeight = mergedWeight
              }
            }
          }
        }

        // Additional threshold: require resistance zone (above) to have at least 10% of total window volume
        if (sellBreakConditionMet && bestResistanceZoneWeight > 0) {
          if (bestResistanceZoneWeight < BREAK_VOLUME_THRESHOLD) {
            sellBreakConditionMet = false
          }
        }

        // Check lower zones: the 3 zones below (if exist) must have LESS volume than current zone
        // This confirms we're moving into progressively thinner support
        if (sellBreakConditionMet) {
          for (let m = 1; m <= ZONE_LOOKABOVE; m++) {
            const lowerZoneIdx = currentZoneIdx - m
            if (lowerZoneIdx >= 0) {
              const lowerZoneWeight = priceZones[lowerZoneIdx].volumeWeight
              // Skip zones with zero volume
              if (lowerZoneWeight > 0) {
                // Lower zone must have LESS volume than current zone
                if (lowerZoneWeight >= currentWeight) {
                  sellBreakConditionMet = false
                  break
                }
              }
            }
          }
        }

        if (sellBreakConditionMet) {
          // Record sell break but DON'T end the window - continue extending
          breaks.push({
            date: dataPoint.date,
            price: currentPrice,
            isUpBreak: false, // Low-volume breakdown - price moving away from high-volume resistance
            currentWeight: currentWeight,  // Low volume weight at break price
            windowIndex: windows.length,
            resistanceLevel: priceZones[bestResistanceZoneIdx]?.maxPrice || maxPrice,  // High-volume resistance zone above
            maxVolumeWeight: bestResistanceZoneWeight  // Volume weight of resistance zone
          })
          // Don't break - keep extending window to find more breaks
        }
      }

      windowPoints.push({
        date: dataPoint.date,
        price: dataPoint.close,
        volume: dataPoint.volume || 0,
        priceZones: priceZones,
        currentZoneIdx: currentZoneIdx,
        priceZoneHeight
      })
    }

    // Store all window data with cumulative profiles
    if (windowPoints.length > 0) {
      windows.push({
        windowIndex: windows.length,
        startDate: windowPoints[0].date,
        endDate: windowPoints[windowPoints.length - 1].date,
        dataPoints: windowPoints,  // Use cumulative profiles from windowPoints
        breakDetected: breaks.length > 0
      })
    }

    // Move to next window (starts right after the current window ends)
    if (windowEnd < visibleData.length) {
      currentWindowStart = windowEnd  // Start at next data point (window already includes sell date)
    } else {
      break  // Reached end of data
    }
  }

  return { windows, breaks }
}

/**
 * Calculate P&L for Volume Profile V3 trading strategy
 *
 * BUY LOGIC: Buy on low-volume breakout (isUpBreak: true)
 * SELL LOGIC:
 * 1. Sell on low-volume breakdown (isUpBreak: false)
 * 2. Volume profile window RESETS when price reaches all-time high while holding
 *    - Discards all previous cumulative data
 *    - Starts fresh volume calculation from the ATH point
 * 3. After window reset, need 75+ points before sell signal can trigger
 * 4. Sell signals can trigger immediately after buy (no waiting period)
 *
 * NOTE: Cutoff (trailing stop) logic is currently DISABLED
 *
 * @param {Object} params - Parameters for P&L calculation
 * @param {Array} params.volumeProfileV3Breaks - Array of break signals {date, price, isUpBreak, supportLevel/resistanceLevel, windowIndex}
 * @param {Array} params.volumeProfileV3Data - Array of window data with price zones
 * @param {Array} params.prices - Array of price data {date, close, volume}
 * @param {number} params.transactionFee - Transaction fee as decimal (e.g., 0.003 for 0.3%)
 * @param {number} params.cutoffPercent - Initial cutoff percentage as decimal (e.g., 0.12 for 12%) - NOT USED (cutoff disabled)
 * @returns {Object} P&L calculation results including athResetDates array
 */
export const calculateVolumeProfileV3PL = ({
  volumeProfileV3Breaks = [],
  volumeProfileV3Data = [],
  prices = [],
  transactionFee = 0.003,
  cutoffPercent = 0.12
}) => {
  if (volumeProfileV3Breaks.length === 0) {
    return {
      trades: [],
      totalPL: 0,
      winRate: 0,
      tradingSignals: 0,
      buySignals: [],
      sellSignals: [],
      supportUpdates: [],
      marketChange: 0,
      isHolding: false
    }
  }

  const TRANSACTION_FEE = transactionFee
  const CUTOFF_PERCENT = cutoffPercent

  const trades = []
  const buySignals = []
  const sellSignals = []
  const supportUpdates = [] // Track support level updates
  const cutoffPrices = [] // Track cutoff price over time for drawing support line
  const athResetDates = [] // Track all-time high reset dates while holding
  let isHolding = false
  let buyPrice = null
  let buyDate = null
  let cutoffPrice = null // Track the current cutoff price (trailing stop)
  let currentWindowIndex = null // Track which window we're in while holding
  let currentTradeId = 0 // Track which trade we're in for support line segmentation
  let allTimeHigh = 0 // Track all-time high price
  let pointsSinceWindowReset = 0 // Track points since last window reset (for 75-point minimum)
  const MIN_POINTS_FOR_SELL = 75 // Minimum points required before sell signal after window reset

  // Get all prices in forward chronological order
  const reversedPrices = [...prices].reverse()

  // Create a map of break signals by date for quick lookup
  const breakSignalMap = new Map()
  volumeProfileV3Breaks.forEach(breakSignal => {
    breakSignalMap.set(breakSignal.date, breakSignal)
  })

  // Create a map of date -> window data for tracking window changes
  const dateToWindowMap = new Map()
  volumeProfileV3Data.forEach(window => {
    window.dataPoints.forEach(point => {
      dateToWindowMap.set(point.date, {
        windowIndex: window.windowIndex,
        priceZones: point.priceZones
      })
    })
  })

  // Iterate through all price points in chronological order
  for (let i = 0; i < reversedPrices.length; i++) {
    const currentPoint = reversedPrices[i]
    const currentPrice = currentPoint.close
    const currentDate = currentPoint.date

    // Update all-time high
    if (currentPrice > allTimeHigh) {
      allTimeHigh = currentPrice

      // If holding and reached new all-time high, reset window counter AND mark for window split
      if (isHolding) {
        pointsSinceWindowReset = 0
        athResetDates.push(currentDate) // Mark this date for volume profile window reset
        supportUpdates.push({
          date: currentDate,
          price: currentPrice,
          reason: 'All-time high - window reset'
        })
      }
    }

    // Increment points counter if holding
    if (isHolding) {
      pointsSinceWindowReset++
    }

    // CUTOFF LOGIC DISABLED
    // Check for cutoff: if holding and price dropped below cutoff price, sell
    // if (isHolding && cutoffPrice !== null && currentPrice < cutoffPrice) {
    //   const sellPrice = currentPrice
    //   // Apply transaction fees: buy fee increases cost, sell fee decreases proceeds
    //   const effectiveBuyPrice = buyPrice * (1 + TRANSACTION_FEE)
    //   const effectiveSellPrice = sellPrice * (1 - TRANSACTION_FEE)
    //   const plPercent = ((effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100

    //   trades.push({
    //     buyPrice,
    //     buyDate,
    //     sellPrice,
    //     sellDate: currentDate,
    //     plPercent,
    //     isCutoff: true
    //   })

    //   sellSignals.push({
    //     date: currentDate,
    //     price: sellPrice,
    //     isCutoff: true,
    //     reason: `Price $${currentPrice.toFixed(2)} < Cutoff $${cutoffPrice.toFixed(2)}`
    //   })

    //   // Reset state
    //   isHolding = false
    //   buyPrice = null
    //   buyDate = null
    //   cutoffPrice = null
    //   currentWindowIndex = null
    //   pointsSinceWindowReset = 0

    //   continue // Move to next point
    // }

    // CUTOFF LOGIC DISABLED
    // If holding, update trailing stop dynamically
    // if (isHolding && cutoffPrice !== null) {
    //   // Update trailing stop: if currentPrice * 0.92 > current cutoff, raise it
    //   const potentialNewCutoff = currentPrice * 0.92
    //   if (potentialNewCutoff > cutoffPrice) {
    //     cutoffPrice = potentialNewCutoff

    //     supportUpdates.push({
    //       date: currentDate,
    //       price: cutoffPrice,
    //       reason: 'Trailing stop update (92% of current price)'
    //     })

    //     cutoffPrices.push({
    //       date: currentDate,
    //       price: cutoffPrice,
    //       tradeId: currentTradeId
    //     })
    //   }
    // }

    // Check for break signals at this point
    const breakSignal = breakSignalMap.get(currentDate)
    if (breakSignal) {
      if (breakSignal.isUpBreak) {
        // Breakup signal - BUY only if not already holding
        if (!isHolding) {
          isHolding = true
          buyPrice = breakSignal.price
          buyDate = breakSignal.date

          // Initial cutoff = buyPrice * (1 - cutoffPercent) - NEVER use zone support
          cutoffPrice = breakSignal.price * (1 - CUTOFF_PERCENT)

          currentWindowIndex = breakSignal.windowIndex // Track starting window
          pointsSinceWindowReset = MIN_POINTS_FOR_SELL // Set to 75 so sells can trigger immediately after buy

          buySignals.push({
            date: breakSignal.date,
            price: breakSignal.price
          })

          // Add initial cutoff point
          cutoffPrices.push({
            date: breakSignal.date,
            price: cutoffPrice,
            tradeId: currentTradeId
          })
        }
        // If consecutive breakup (already holding), ignore it
      } else {
        // Breakdown signal - SELL only if holding AND we have at least 75 points since window reset
        if (isHolding && pointsSinceWindowReset >= MIN_POINTS_FOR_SELL) {
          const sellPrice = breakSignal.price
          // Apply transaction fees: buy fee increases cost, sell fee decreases proceeds
          const effectiveBuyPrice = buyPrice * (1 + TRANSACTION_FEE)
          const effectiveSellPrice = sellPrice * (1 - TRANSACTION_FEE)
          const plPercent = ((effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100

          trades.push({
            buyPrice,
            buyDate,
            sellPrice,
            sellDate: breakSignal.date,
            plPercent,
            isCutoff: false
          })

          sellSignals.push({
            date: breakSignal.date,
            price: breakSignal.price,
            isCutoff: false,
            reason: 'Breakdown signal (low-volume breakdown)'
          })

          // Reset state
          isHolding = false
          buyPrice = null
          buyDate = null
          cutoffPrice = null
          currentWindowIndex = null
          pointsSinceWindowReset = 0
          currentTradeId++
        }
        // If breakdown but not enough points since window reset, ignore it
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

  // Extract sell dates for window splitting
  const sellDates = sellSignals.map(s => s.date)

  return { trades, totalPL, winRate, tradingSignals: buySignals.length, buySignals, sellSignals, supportUpdates, marketChange, cutoffPrices, sellDates, athResetDates }
}

/**
 * Multi-pass calculation: Calculate volume profile with window resets at sell dates and all-time highs while holding
 *
 * Pass 1: Calculate with no window splits to get initial P&L and identify ATH reset dates
 * Pass 2: Recalculate with window splits at ATH dates to get updated breaks
 * Pass 3: Final P&L calculation with ATH-aware volume profile
 */
export const calculateVolumeProfileV3WithSells = (displayPrices, zoomRange, transactionFee = 0.003, cutoffPercent = 0.12) => {
  // PASS 1: Calculate breaks with NO window splits to identify all-time high reset dates
  const initialResult = calculateVolumeProfileV3(displayPrices, zoomRange, [])

  const initialPL = calculateVolumeProfileV3PL({
    volumeProfileV3Breaks: initialResult.breaks,
    volumeProfileV3Data: initialResult.windows,
    prices: displayPrices,
    transactionFee,
    cutoffPercent
  })

  // PASS 2: Recalculate volume profile with window splits at all-time high reset dates
  // This ensures fresh volume calculations after each ATH while holding
  const athWindowSplitDates = initialPL.athResetDates || []

  const finalResult = calculateVolumeProfileV3(displayPrices, zoomRange, athWindowSplitDates)

  // PASS 3: Final P&L calculation with ATH-aware volume profile
  const finalPL = calculateVolumeProfileV3PL({
    volumeProfileV3Breaks: finalResult.breaks,
    volumeProfileV3Data: finalResult.windows,
    prices: displayPrices,
    transactionFee,
    cutoffPercent
  })

  // Return results with ATH-aware windowing
  return {
    windows: finalResult.windows,
    breaks: finalResult.breaks,
    ...finalPL
  }
}
