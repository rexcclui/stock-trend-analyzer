/**
 * Calculate Volume Profile V3 windows and break signals
 *
 * LOW-VOLUME BREAKOUT DETECTION:
 * - Window extends continuously throughout the entire backtest period
 * - Window keeps extending even when B/S signals are found (no new windows created)
 * - Divide price range evenly into 15-20 zones
 * - Detect when price breaks into a zone with LOW volume (≤8% less than zones below)
 * - This identifies price moving away from high-volume support into resistance
 * - Breakup = buy signal (price escaping support with low volume = bullish)
 *
 * @param {Array} displayPrices - Array of price data {date, close, volume}
 * @param {Object} zoomRange - {start, end} - Range of visible data
 * @param {Array} windowSplitDates - Optional dates where windows should split (empty array = single continuous window)
 * @returns {Object} {windows, breaks} - Windows with volume profile data and break signals
 */
export const calculateVolumeProfileV3 = (displayPrices, zoomRange = { start: 0, end: null }, windowSplitDates = []) => {
  if (!displayPrices || displayPrices.length === 0) return { windows: [], breaks: [] }

  const reversedDisplayPrices = [...displayPrices].reverse()
  const visibleData = reversedDisplayPrices.slice(
    zoomRange.start,
    zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end
  )

  if (visibleData.length === 0) return { windows: [], breaks: [] }

  const MIN_WINDOW_SIZE = 75  // Changed from 150 to 75
  const BREAK_VOLUME_THRESHOLD = 0.10 // 10%
  const BREAK_DIFF_THRESHOLD = 0.08 // 8% - current zone must have LESS volume than zones below
  const ZONE_LOOKBACK = 10 // Check previous 10 zones for break detection
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

      // Check break condition - require at least 150 data points before buy signal
      // This ensures sufficient volume profile history for meaningful detection
      if (i >= MIN_WINDOW_SIZE) {
        // Check the next 10 NON-ZERO volume zones below - current zone must have LESS volume (low-volume breakout)
        let breakConditionMet = false
        let minWeightDiff = 0  // Track most negative difference (strongest support zone)
        let bestPrevZoneIdx = -1
        let bestPrevZoneWeight = 0

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

        // PART 1: Check individual zones for 8% difference
        for (let i = 0; i < nonZeroZonesBelow.length; i++) {
          const zone = nonZeroZonesBelow[i]
          const weightDiff = currentWeight - zone.weight

          // Break if current zone has at least 8% LESS volume than individual zone
          if (weightDiff <= -BREAK_DIFF_THRESHOLD) {
            breakConditionMet = true
          }

          // Track the zone with most negative difference (highest volume support zone)
          if (weightDiff < minWeightDiff) {
            minWeightDiff = weightDiff
            bestPrevZoneIdx = zone.zoneIdx
            bestPrevZoneWeight = zone.weight
          }
        }

        // PART 2: Check merged consecutive zones (zone[i] + zone[i+1])
        const mergedZones = []
        for (let i = 0; i < nonZeroZonesBelow.length - 1; i++) {
          const zone1 = nonZeroZonesBelow[i]
          const zone2 = nonZeroZonesBelow[i + 1]

          // Merge two consecutive zones
          const mergedWeight = zone1.weight + zone2.weight
          const weightDiff = currentWeight - mergedWeight

          mergedZones.push({
            pair: `[${i}+${i+1}]`,
            weights: `${(zone1.weight * 100).toFixed(2)}% + ${(zone2.weight * 100).toFixed(2)}%`,
            merged: `${(mergedWeight * 100).toFixed(2)}%`,
            diff: `${(weightDiff * 100).toFixed(2)}%`,
            triggers: weightDiff <= -BREAK_DIFF_THRESHOLD
          })

          // Break if current zone has at least 8% LESS volume than merged zone
          if (weightDiff <= -BREAK_DIFF_THRESHOLD) {
            breakConditionMet = true
          }

          // Track merged zone if it's stronger support
          if (weightDiff < minWeightDiff) {
            minWeightDiff = weightDiff
            // Use the lower zone index as the support level (zone closer to current price)
            bestPrevZoneIdx = zone1.zoneIdx
            bestPrevZoneWeight = mergedWeight
          }
        }

          // Additional threshold: require support zone (below) to have at least 10% of total window volume
          // This ensures we're breaking away from a significant support, not just noise
          // Note: bestPrevZoneWeight is already the weight (proportion), works for both individual and merged zones
          if (breakConditionMet && bestPrevZoneWeight > 0) {
            if (bestPrevZoneWeight < BREAK_VOLUME_THRESHOLD) {
              breakConditionMet = false
            }
          }

          // Check upper zones: the 3 zones above (if exist) must have LESS volume than current zone
          // This confirms we're moving into progressively thinner resistance
          if (breakConditionMet) {
            for (let m = 1; m <= ZONE_LOOKABOVE; m++) {
              const upperZoneIdx = currentZoneIdx + m
              if (upperZoneIdx < numPriceZones) {
                const upperZoneWeight = priceZones[upperZoneIdx].volumeWeight
                // Skip zones with zero volume (price hasn't reached there yet)
                if (upperZoneWeight > 0) {
                  // Upper zone must have LESS volume than current zone
                  if (upperZoneWeight >= currentWeight) {
                    breakConditionMet = false
                    break
                  }
                }
              }
            }
          }

        if (breakConditionMet) {
          // Record break but DON'T end the window - continue extending
          breaks.push({
            date: dataPoint.date,
            price: currentPrice,
            isUpBreak: true, // Low-volume breakout - price moving away from high-volume support
            currentWeight: currentWeight,  // Low volume weight at break price
            windowIndex: windows.length,
            supportLevel: priceZones[bestPrevZoneIdx]?.minPrice || minPrice,  // High-volume support zone below
            maxVolumeWeight: bestPrevZoneWeight  // Volume weight of support zone
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
 * @param {Object} params - Parameters for P&L calculation
 * @param {Array} params.volumeProfileV3Breaks - Array of break signals {date, price, isUpBreak, supportLevel, windowIndex}
 * @param {Array} params.volumeProfileV3Data - Array of window data with price zones
 * @param {Array} params.prices - Array of price data {date, close, volume}
 * @param {number} params.transactionFee - Transaction fee as decimal (e.g., 0.003 for 0.3%)
 * @param {number} params.cutoffPercent - Initial cutoff percentage as decimal (e.g., 0.12 for 12%)
 * @returns {Object} P&L calculation results
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
  const MIN_WINDOW_SIZE = 75 // Require 75 points after sell before next buy

  const trades = []
  const buySignals = []
  const sellSignals = []
  const supportUpdates = [] // Track support level updates
  const cutoffPrices = [] // Track cutoff price over time for drawing support line
  let isHolding = false
  let buyPrice = null
  let buyDate = null
  let cutoffPrice = null // Track the current cutoff price (trailing stop)
  let currentWindowIndex = null // Track which window we're in while holding
  let currentTradeId = 0 // Track which trade we're in for support line segmentation
  let lastSellIndex = -MIN_WINDOW_SIZE // Track index of last sell (start at -75 so first buy can happen at index 0)

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

    // Check for cutoff: if holding and price dropped below cutoff price, sell
    if (isHolding && cutoffPrice !== null && currentPrice < cutoffPrice) {
      const sellPrice = currentPrice
      // Apply transaction fees: buy fee increases cost, sell fee decreases proceeds
      const effectiveBuyPrice = buyPrice * (1 + TRANSACTION_FEE)
      const effectiveSellPrice = sellPrice * (1 - TRANSACTION_FEE)
      const plPercent = ((effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100

      trades.push({
        buyPrice,
        buyDate,
        sellPrice,
        sellDate: currentDate,
        plPercent,
        isCutoff: true
      })

      sellSignals.push({
        date: currentDate,
        price: sellPrice,
        isCutoff: true,
        reason: `Price $${currentPrice.toFixed(2)} < Cutoff $${cutoffPrice.toFixed(2)}`
      })

      // Reset state
      isHolding = false
      buyPrice = null
      buyDate = null
      cutoffPrice = null
      currentWindowIndex = null
      lastSellIndex = i // Track sell index for 75-point requirement

      continue // Move to next point
    }

    // If holding, update trailing stop dynamically
    if (isHolding && cutoffPrice !== null) {
      // Update trailing stop: if currentPrice * 0.92 > current cutoff, raise it
      const potentialNewCutoff = currentPrice * 0.92
      if (potentialNewCutoff > cutoffPrice) {
        cutoffPrice = potentialNewCutoff

        supportUpdates.push({
          date: currentDate,
          price: cutoffPrice,
          reason: 'Trailing stop update (92% of current price)'
        })

        cutoffPrices.push({
          date: currentDate,
          price: cutoffPrice,
          tradeId: currentTradeId
        })
      }
    }

    // Check for sell condition: price below heaviest zone
    if (isHolding && currentWindowIndex !== null) {
      const windowData = dateToWindowMap.get(currentDate)

      if (windowData) {
        const priceZones = windowData.priceZones

        // Find the heaviest zone in the current window
        let maxWeight = 0
        let heaviestZone = null
        priceZones.forEach(zone => {
          if (zone.volumeWeight > maxWeight) {
            maxWeight = zone.volumeWeight
            heaviestZone = zone
          }
        })

        // Sell if price drops below the heaviest zone's minimum price
        if (heaviestZone && currentPrice < heaviestZone.minPrice) {
          const sellPrice = currentPrice
          const effectiveBuyPrice = buyPrice * (1 + TRANSACTION_FEE)
          const effectiveSellPrice = sellPrice * (1 - TRANSACTION_FEE)
          const plPercent = ((effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100

          trades.push({
            buyPrice,
            buyDate,
            sellPrice,
            sellDate: currentDate,
            plPercent,
            isCutoff: false,
            reason: `Price below heaviest zone (${maxWeight.toFixed(2)} weight)`
          })

          sellSignals.push({
            date: currentDate,
            price: sellPrice,
            isCutoff: false,
            reason: `Price $${currentPrice.toFixed(2)} < Heaviest zone $${heaviestZone.minPrice.toFixed(2)}`
          })

          // Reset state
          isHolding = false
          buyPrice = null
          buyDate = null
          cutoffPrice = null
          currentWindowIndex = null
          currentTradeId++
          lastSellIndex = i // Track sell index for 75-point requirement

          continue // Move to next point
        }
      }
    }

    // Check for break signals at this point
    const breakSignal = breakSignalMap.get(currentDate)
    if (breakSignal) {
      if (breakSignal.isUpBreak) {
        // Breakup signal - BUY only if not already holding AND at least 75 points since last sell
        if (!isHolding && (i - lastSellIndex) >= MIN_WINDOW_SIZE) {
          isHolding = true
          buyPrice = breakSignal.price
          buyDate = breakSignal.date

          // Initial cutoff = buyPrice * (1 - cutoffPercent) - NEVER use zone support
          cutoffPrice = breakSignal.price * (1 - CUTOFF_PERCENT)

          currentWindowIndex = breakSignal.windowIndex // Track starting window

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
        // If consecutive breakup (already holding) or too soon after sell, ignore it
      } else {
        // Breakdown signal - SELL only if holding
        if (isHolding) {
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
            reason: 'Breakdown signal'
          })

          // Reset state
          isHolding = false
          buyPrice = null
          buyDate = null
          cutoffPrice = null
          currentWindowIndex = null
          currentTradeId++
          lastSellIndex = i // Track sell index for 75-point requirement
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

  // Extract sell dates for window splitting
  const sellDates = sellSignals.map(s => s.date)

  return { trades, totalPL, winRate, tradingSignals: buySignals.length, buySignals, sellSignals, supportUpdates, marketChange, cutoffPrices, sellDates }
}

/**
 * Single continuous window: Calculate volume profile over entire range without splitting
 * Window extends continuously throughout the backtest period, even when B/S signals are found
 */
export const calculateVolumeProfileV3WithSells = (displayPrices, zoomRange, transactionFee = 0.003, cutoffPercent = 0.12) => {
  // Calculate breaks with NO window splits - single continuous window
  const result = calculateVolumeProfileV3(displayPrices, zoomRange, [])

  // Calculate P&L based on these breaks
  const plResult = calculateVolumeProfileV3PL({
    volumeProfileV3Breaks: result.breaks,
    volumeProfileV3Data: result.windows,
    prices: displayPrices,
    transactionFee,
    cutoffPercent
  })

  // Return results with single continuous window
  return {
    windows: result.windows,
    breaks: result.breaks,
    ...plResult
  }
}
