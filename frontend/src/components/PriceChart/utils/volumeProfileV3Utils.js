/**
 * Calculate Volume Profile V3 windows and break signals
 *
 * @param {Array} displayPrices - Array of price data {date, close, volume}
 * @param {Object} zoomRange - {start, end} - Range of visible data
 * @returns {Object} {windows, breaks} - Windows with volume profile data and break signals
 */
export const calculateVolumeProfileV3 = (displayPrices, zoomRange = { start: 0, end: null }) => {
  if (!displayPrices || displayPrices.length === 0) return { windows: [], breaks: [] }

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

/**
 * Calculate P&L for Volume Profile V3 trading strategy
 *
 * @param {Object} params - Parameters for P&L calculation
 * @param {Array} params.volumeProfileV3Breaks - Array of break signals {date, price, isUpBreak, supportLevel, windowIndex}
 * @param {Array} params.volumeProfileV3Data - Array of window data with price zones
 * @param {Array} params.prices - Array of price data {date, close, volume}
 * @param {number} params.transactionFee - Transaction fee as decimal (e.g., 0.003 for 0.3%)
 * @param {number} params.cutoffPercent - Initial cutoff percentage as decimal (e.g., 0.08 for 8%)
 * @returns {Object} P&L calculation results
 */
export const calculateVolumeProfileV3PL = ({
  volumeProfileV3Breaks = [],
  volumeProfileV3Data = [],
  prices = [],
  transactionFee = 0.003,
  cutoffPercent = 0.08
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
  let isHolding = false
  let buyPrice = null
  let buyDate = null
  let cutoffPrice = null // Track the current cutoff price (trailing stop)
  let currentWindowIndex = null // Track which window we're in while holding
  let lastCutoffBuyPrice = null // Track original buy price from last cutoff sell

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
        isCutoff: true
      })

      // Save the original buy price for potential re-entry
      lastCutoffBuyPrice = buyPrice

      // Reset state
      isHolding = false
      buyPrice = null
      buyDate = null
      cutoffPrice = null
      currentWindowIndex = null
    }

    // If holding, check if we've moved to a new window and update cutoff price
    if (isHolding && currentWindowIndex !== null) {
      const windowData = dateToWindowMap.get(currentDate)

      if (windowData && windowData.windowIndex !== currentWindowIndex) {
        // We've entered a new window - check for support level update
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

        // Only update cutoff if max volume weight >= 15%
        if (maxWeightZone && maxWeight >= 0.15) {
          const newWindowSupport = maxWeightZone.minPrice
          const newCutoffPrice = Math.max(cutoffPrice, newWindowSupport)

          // Track support update if it moved up
          if (newCutoffPrice > cutoffPrice) {
            supportUpdates.push({
              date: currentDate,
              price: newCutoffPrice,
              volumeWeight: maxWeight
            })
            cutoffPrice = newCutoffPrice
          }
        }

        // Update window index regardless
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
          cutoffPrice = breakSignal.price * (1 - CUTOFF_PERCENT) // Initial -8% cutoff
          currentWindowIndex = breakSignal.windowIndex // Track starting window
          buySignals.push({
            date: breakSignal.date,
            price: breakSignal.price
          })

          // Clear cutoff tracking on new upbreak
          lastCutoffBuyPrice = null
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
            price: sellPrice,
            isCutoff: false
          })

          // Reset state
          isHolding = false
          buyPrice = null
          buyDate = null
          cutoffPrice = null
          currentWindowIndex = null
        }

        // Clear cutoff tracking on any breakdown (new window started)
        lastCutoffBuyPrice = null
      }
    }

    // Re-entry logic: If not holding and price recovered above original buy price after cutoff sell
    // This indicates the cutoff was a temporary dip and trend continues
    if (!isHolding && lastCutoffBuyPrice !== null && currentPrice > lastCutoffBuyPrice) {
      // Re-enter the position
      isHolding = true
      buyPrice = currentPrice
      buyDate = currentDate
      cutoffPrice = currentPrice * (1 - CUTOFF_PERCENT) // Set -8% cutoff from re-entry price
      currentWindowIndex = null // Will be set if we enter a new window

      buySignals.push({
        date: currentDate,
        price: currentPrice,
        isReEntry: true // Mark this as a re-entry signal
      })

      // Clear the cutoff tracking
      lastCutoffBuyPrice = null
    }
  }

  // If still holding at the end, add an open trade with current price
  if (isHolding && buyPrice !== null && reversedPrices.length > 0) {
    const lastPrice = reversedPrices[reversedPrices.length - 1]
    const currentPrice = lastPrice.close
    // Apply transaction fees: buy fee increases cost, sell would decrease proceeds
    const effectiveBuyPrice = buyPrice * (1 + TRANSACTION_FEE)
    const effectiveSellPrice = currentPrice * (1 - TRANSACTION_FEE)
    const plPercent = ((effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100

    trades.push({
      buyPrice,
      buyDate,
      sellPrice: currentPrice,
      sellDate: lastPrice.date,
      plPercent,
      isOpen: true // Mark as open position
    })
  }

  // Calculate statistics
  const closedTrades = trades.filter(t => !t.isOpen)
  const totalPL = trades.reduce((sum, t) => sum + t.plPercent, 0) // Include open position
  const winningTrades = closedTrades.filter(t => t.plPercent > 0).length
  const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0

  // Calculate trading signals: 1 complete trade = 1 signal, open position = 0.5 signal
  const tradingSignals = closedTrades.length + (isHolding ? 0.5 : 0)

  // Calculate market change (first buy to last sell/current) with transaction fees
  let marketChange = 0
  if (trades.length > 0) {
    const firstTrade = trades[0]
    const lastTrade = trades[trades.length - 1]
    const startPrice = firstTrade.buyPrice
    const endPrice = lastTrade.sellPrice
    // Apply transaction fees for buy-and-hold comparison
    const effectiveStartPrice = startPrice * (1 + TRANSACTION_FEE)
    const effectiveEndPrice = endPrice * (1 - TRANSACTION_FEE)
    marketChange = ((effectiveEndPrice - effectiveStartPrice) / effectiveStartPrice) * 100
  }

  return {
    trades,
    totalPL,
    winRate,
    tradingSignals,
    closedTradeCount: closedTrades.length,
    buySignals,
    sellSignals,
    supportUpdates,
    marketChange,
    isHolding
  }
}
