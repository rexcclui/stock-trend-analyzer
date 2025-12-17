/**
 * Calculate Volume Profile V3 windows and break signals
 *
 * LOW-VOLUME BREAKOUT DETECTION:
 * - Start with 150 data points, extend until breakthrough detected
 * - Divide price range evenly into 15-20 zones
 * - Detect when price breaks into a zone with LOW volume (≤8% less than zones below)
 * - This identifies price moving away from high-volume support into resistance
 * - Breakup = buy signal (price escaping support with low volume = bullish)
 * - Continue creating windows while holding to update support
 *
 * @param {Array} displayPrices - Array of price data {date, close, volume}
 * @param {Object} zoomRange - {start, end} - Range of visible data
 * @returns {Object} {windows, breaks} - Windows with volume profile data and break signals
 */
export const calculateVolumeProfileV3 = (displayPrices, zoomRange = { start: 0, end: null }) => {
  if (!displayPrices || displayPrices.length === 0) return { windows: [], breaks: [] }

  const reversedDisplayPrices = [...displayPrices].reverse()
  const visibleData = reversedDisplayPrices.slice(
    zoomRange.start,
    zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end
  )

  if (visibleData.length === 0) return { windows: [], breaks: [] }

  const MIN_WINDOW_SIZE = 150
  const BREAK_VOLUME_THRESHOLD = 0.10 // 10%
  const BREAK_DIFF_THRESHOLD = 0.08 // 8% - current zone must have LESS volume than zones below
  const PRICE_SLOT_MIN_RATIO = 0.50 // Each zone must be at least 50% of previous window's zone
  const ZONE_LOOKBACK = 5 // Check previous 5 zones for break detection

  const windows = []
  const breaks = []
  let currentWindowStart = 0
  let previousWindowZoneHeight = null // Track previous window's zone height

  while (currentWindowStart < visibleData.length) {
    // Process all remaining data, extending window until break detected
    let windowData = visibleData.slice(currentWindowStart)

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

      // Check break condition - require at least 150 data points before buy signal
      // This ensures sufficient volume profile history for meaningful detection
      if (i >= MIN_WINDOW_SIZE && currentZoneIdx >= ZONE_LOOKBACK) {
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
          // Check the next 5 NON-ZERO volume zones below - current zone must have LESS volume (low-volume breakout)
          let breakConditionMet = false
          let minWeightDiff = 0  // Track most negative difference (strongest support zone)
          let bestPrevZoneIdx = -1
          let bestPrevZoneWeight = 0

          // Look back through zones, counting only non-zero zones
          let nonZeroZonesFound = 0
          let k = 1
          while (nonZeroZonesFound < ZONE_LOOKBACK && (currentZoneIdx - k) >= 0) {
            const prevZoneIdx = currentZoneIdx - k
            const prevZoneWeight = priceZones[prevZoneIdx].volumeWeight

            // Skip zones with zero volume weight
            if (prevZoneWeight > 0) {
              nonZeroZonesFound++

              const weightDiff = currentWeight - prevZoneWeight
              // Break if current zone has at least 8% LESS volume than any non-zero zone below
              if (weightDiff <= -BREAK_DIFF_THRESHOLD) {
                breakConditionMet = true
              }

              // Track the zone with most negative difference (highest volume support zone)
              if (weightDiff < minWeightDiff) {
                minWeightDiff = weightDiff
                bestPrevZoneIdx = prevZoneIdx
                bestPrevZoneWeight = prevZoneWeight
              }
            }
            k++
          }

          // Additional threshold: require support zone (below) to have at least 10% of total window volume
          // This ensures we're breaking away from a significant support, not just noise
          if (breakConditionMet && totalVolume > 0 && bestPrevZoneIdx >= 0) {
            const supportZoneVolume = priceZones[bestPrevZoneIdx]?.volume || 0
            if (supportZoneVolume / totalVolume < BREAK_VOLUME_THRESHOLD) {
              breakConditionMet = false
            }
          }

          if (breakConditionMet) {
            breakDetected = true
            breakIndex = currentWindowStart + i

            breaks.push({
              date: dataPoint.date,
              price: currentPrice,
              isUpBreak: true, // Low-volume breakout - price moving away from high-volume support
              currentWeight: currentWeight,  // Low volume weight at break price
              windowIndex: windows.length,
              supportLevel: priceZones[bestPrevZoneIdx]?.minPrice || minPrice,  // High-volume support zone below
              maxVolumeWeight: bestPrevZoneWeight  // Volume weight of support zone
            })
            break
          }
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

    // Store window data (up to breakIndex if detected, otherwise all processed data)
    const windowEnd = breakDetected ? breakIndex + 1 : currentWindowStart + windowData.length
    const finalWindowData = visibleData.slice(currentWindowStart, windowEnd)
    if (finalWindowData.length > 0) {
      // Recalculate zones for final window
      const windowPrices = finalWindowData.map(p => p.close)
      const minPrice = Math.min(...windowPrices)
      const maxPrice = Math.max(...windowPrices)
      const priceRange = maxPrice - minPrice

      const priceZoneHeight = priceRange > 0 ? priceRange / Math.max(15, Math.min(20, Math.floor(finalWindowData.length / 15))) : 1
      previousWindowZoneHeight = priceZoneHeight

      const priceZones = []
      const numPriceZones = Math.max(15, Math.min(20, Math.floor(finalWindowData.length / 15)))
      for (let i = 0; i < numPriceZones; i++) {
        priceZones.push({
          minPrice: minPrice + (i * priceZoneHeight),
          maxPrice: minPrice + ((i + 1) * priceZoneHeight),
          volume: 0,
          volumeWeight: 0
        })
      }

      let totalVolume = 0
      finalWindowData.forEach(price => {
        const volume = price.volume || 0
        totalVolume += volume
        let zoneIndex = Math.floor((price.close - minPrice) / priceZoneHeight)
        if (zoneIndex >= numPriceZones) zoneIndex = numPriceZones - 1
        if (zoneIndex < 0) zoneIndex = 0
        priceZones[zoneIndex].volume += volume
      })

      priceZones.forEach(zone => {
        zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
      })

      windows.push({
        windowIndex: windows.length,
        startDate: finalWindowData[0].date,
        endDate: finalWindowData[finalWindowData.length - 1].date,
        dataPoints: finalWindowData.map(point => ({
          date: point.date,
          price: point.close,
          volume: point.volume || 0,
          priceZones: priceZones
        })),
        breakDetected: breakDetected
      })
    }

    // Move to next window only if break was detected
    if (breakDetected && breakIndex >= currentWindowStart) {
      currentWindowStart = breakIndex + 1
    } else {
      // No break detected - window extended to end of data, so we're done
      break
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

      continue // Move to next point
    }

    // If holding, check if we entered a new window and update cutoff
    if (isHolding && currentWindowIndex !== null) {
      const windowData = dateToWindowMap.get(currentDate)

      if (windowData && windowData.windowIndex !== currentWindowIndex) {
        // Entered a new window - update cutoff to heaviest zone's minPrice if higher
        const priceZones = windowData.priceZones

        // Find the zone with maximum volume weight
        let maxWeight = 0
        let maxWeightZone = null
        priceZones.forEach(zone => {
          if (zone.volumeWeight > maxWeight) {
            maxWeight = zone.volumeWeight
            maxWeightZone = zone
          }
        })

        if (maxWeightZone) {
          // Use support as 5% below the heaviest zone's bottom
          const newWindowSupport = maxWeightZone.minPrice * 0.95

          // Only update if new support is at least 3% higher than current cutoff
          const minIncrease = cutoffPrice * 1.03

          if (newWindowSupport >= minIncrease) {
            const newCutoffPrice = newWindowSupport

            supportUpdates.push({
              date: currentDate,
              price: newCutoffPrice,
              volumeWeight: maxWeight
            })

            // Add cutoff price change point
            cutoffPrices.push({
              date: currentDate,
              price: newCutoffPrice,
              tradeId: currentTradeId
            })

            cutoffPrice = newCutoffPrice
          }
        }

        // Update window index
        currentWindowIndex = windowData.windowIndex
      }
    }

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

  return { trades, totalPL, winRate, tradingSignals: buySignals.length, buySignals, sellSignals, supportUpdates, marketChange, cutoffPrices }
}
