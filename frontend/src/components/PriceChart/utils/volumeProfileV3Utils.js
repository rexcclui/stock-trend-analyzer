/**
 * Calculate Volume Profile V3 windows and break signals
 *
 * New logic:
 * - Start with 150 data points, extend until breakthrough detected
 * - Divide price range evenly into zones
 * - Check if LAST point's zone is a breakthrough
 * - Breakup = buy, Breakdown = sell
 * - Continue creating windows while holding to update support
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
  const NUM_PRICE_ZONES = 20 // Fixed number of zones
  const BREAK_DIFF_THRESHOLD = 0.08 // 8% difference
  const ZONE_LOOKBACK = 5 // Check previous 5 zones

  const windows = []
  const breaks = []
  let currentWindowStart = 0

  while (currentWindowStart < visibleData.length) {
    let windowEnd = Math.min(currentWindowStart + MIN_WINDOW_SIZE, visibleData.length)
    let breakDetected = false
    let breakIndex = -1
    let isUpBreak = false
    let breakPrice = 0

    // Keep extending window until breakthrough detected or end of data
    while (windowEnd <= visibleData.length && !breakDetected) {
      const windowData = visibleData.slice(currentWindowStart, windowEnd)

      if (windowData.length < MIN_WINDOW_SIZE) break

      // Calculate price range for THIS window
      const windowPrices = windowData.map(p => p.close)
      const minPrice = Math.min(...windowPrices)
      const maxPrice = Math.max(...windowPrices)
      const priceRange = maxPrice - minPrice

      if (priceRange === 0) {
        windowEnd++
        continue
      }

      const zoneHeight = priceRange / NUM_PRICE_ZONES

      // Create evenly divided price zones
      const priceZones = []
      for (let i = 0; i < NUM_PRICE_ZONES; i++) {
        priceZones.push({
          minPrice: minPrice + (i * zoneHeight),
          maxPrice: minPrice + ((i + 1) * zoneHeight),
          volume: 0,
          volumeWeight: 0
        })
      }

      // Accumulate volume in each zone
      let totalVolume = 0
      windowData.forEach(price => {
        const priceValue = price.close
        const volume = price.volume || 0
        totalVolume += volume

        let zoneIndex = Math.floor((priceValue - minPrice) / zoneHeight)
        if (zoneIndex >= NUM_PRICE_ZONES) zoneIndex = NUM_PRICE_ZONES - 1
        if (zoneIndex < 0) zoneIndex = 0

        priceZones[zoneIndex].volume += volume
      })

      // Calculate volume weights
      priceZones.forEach(zone => {
        zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
      })

      // Check if LAST data point's zone is a breakthrough
      const lastPoint = windowData[windowData.length - 1]
      const lastPrice = lastPoint.close
      let lastZoneIdx = Math.floor((lastPrice - minPrice) / zoneHeight)
      if (lastZoneIdx >= NUM_PRICE_ZONES) lastZoneIdx = NUM_PRICE_ZONES - 1
      if (lastZoneIdx < 0) lastZoneIdx = 0

      const lastZone = priceZones[lastZoneIdx]
      const lastWeight = lastZone.volumeWeight

      // Determine trend direction: compare last zone to previous zone
      const prevZoneIdx = lastZoneIdx > 0 ? lastZoneIdx - 1 : 0
      const isTrendUp = lastZoneIdx > prevZoneIdx && lastPrice > windowData[windowData.length - 2]?.close

      // Check breakthrough condition
      let breakConditionMet = false

      if (isTrendUp) {
          // Trend up: check 5 zones below (skip zones with 0% volume)
          let zonesChecked = 0
          for (let offset = 1; offset <= NUM_PRICE_ZONES && zonesChecked < ZONE_LOOKBACK; offset++) {
            const belowZoneIdx = lastZoneIdx - offset
            if (belowZoneIdx < 0) break

            const belowWeight = priceZones[belowZoneIdx].volumeWeight
            // Skip zones with 0% volume
            if (belowWeight === 0) continue

            zonesChecked++
            if (belowWeight - lastWeight >= BREAK_DIFF_THRESHOLD) {
              breakConditionMet = true
              isUpBreak = true
              break
            }
          }
        } else if (!isTrendUp) {
          // Trend down: check 5 zones above (skip zones with 0% volume)
          let zonesChecked = 0
          for (let offset = 1; offset <= NUM_PRICE_ZONES && zonesChecked < ZONE_LOOKBACK; offset++) {
            const aboveZoneIdx = lastZoneIdx + offset
            if (aboveZoneIdx >= NUM_PRICE_ZONES) break

            const aboveWeight = priceZones[aboveZoneIdx].volumeWeight
            // Skip zones with 0% volume
            if (aboveWeight === 0) continue

            zonesChecked++
            if (aboveWeight - lastWeight >= BREAK_DIFF_THRESHOLD) {
              breakConditionMet = true
              isUpBreak = false
              break
            }
          }
        }

        if (breakConditionMet) {
          breakDetected = true
          breakIndex = windowEnd - 1
          breakPrice = lastPrice

          // Find heaviest volume zone for support level
          let maxWeight = 0
          let maxWeightZone = null
          priceZones.forEach(zone => {
            if (zone.volumeWeight > maxWeight) {
              maxWeight = zone.volumeWeight
              maxWeightZone = zone
            }
          })

          console.log('[Breakthrough]', {
            date: lastPoint.date,
            type: isUpBreak ? 'BREAKUP' : 'BREAKDOWN',
            windowSize: windowData.length,
            priceRange: `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`,
            heaviestZoneWeight: (maxWeight * 100).toFixed(1) + '%',
            zoneDistribution: priceZones.map((z, i) => ({
              zone: i,
              weight: (z.volumeWeight * 100).toFixed(1) + '%'
            })).filter(z => parseFloat(z.weight) > 0)
          })

          breaks.push({
            date: lastPoint.date,
            price: breakPrice,
            isUpBreak: isUpBreak,
            currentWeight: lastWeight,
            windowIndex: windows.length,
            supportLevel: maxWeightZone ? maxWeightZone.minPrice : minPrice,
            maxVolumeWeight: maxWeight,
            supportZoneVolume: maxWeightZone ? maxWeightZone.volume : 0 // Store absolute volume of support zone
          })
        }

      // If no break detected, extend window by 1
      if (!breakDetected) {
        windowEnd++
      }
    }

    // Store window data
    const finalWindowData = visibleData.slice(currentWindowStart, windowEnd)
    if (finalWindowData.length > 0) {
      // Recalculate zones for final window
      const windowPrices = finalWindowData.map(p => p.close)
      const minPrice = Math.min(...windowPrices)
      const maxPrice = Math.max(...windowPrices)
      const priceRange = maxPrice - minPrice
      const zoneHeight = priceRange > 0 ? priceRange / NUM_PRICE_ZONES : 1

      const priceZones = []
      for (let i = 0; i < NUM_PRICE_ZONES; i++) {
        priceZones.push({
          minPrice: minPrice + (i * zoneHeight),
          maxPrice: minPrice + ((i + 1) * zoneHeight),
          volume: 0,
          volumeWeight: 0
        })
      }

      let totalVolume = 0
      finalWindowData.forEach(price => {
        const volume = price.volume || 0
        totalVolume += volume
        let zoneIndex = Math.floor((price.close - minPrice) / zoneHeight)
        if (zoneIndex >= NUM_PRICE_ZONES) zoneIndex = NUM_PRICE_ZONES - 1
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

    // Move to next window
    if (breakDetected && breakIndex >= currentWindowStart) {
      currentWindowStart = breakIndex + 1
    } else {
      break // End of data
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
  const cutoffPrices = [] // Track cutoff price over time for drawing support line
  let isHolding = false
  let buyPrice = null
  let buyDate = null
  let cutoffPrice = null // Track the current cutoff price (trailing stop)
  let currentWindowIndex = null // Track which window we're in while holding
  let currentTradeId = 0 // Track which trade we're in for support line segmentation
  let supportZoneVolume = 0 // Track the absolute volume of the original support zone

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
      supportZoneVolume = 0
      currentTradeId++ // Increment for next trade
    }

    // If holding, check for enhanced breakdown detection
    if (isHolding && supportZoneVolume > 0) {
      const windowData = dateToWindowMap.get(currentDate)

      if (windowData && windowData.priceZones) {
        const priceZones = windowData.priceZones
        const currentPrice = currentPoint.close

        // Find which zone the current price is in
        const windowPrices = reversedPrices.slice(
          Math.max(0, i - 200),
          Math.min(reversedPrices.length, i + 50)
        ).map(p => p.close)
        const minPrice = Math.min(...windowPrices)
        const maxPrice = Math.max(...windowPrices)
        const priceRange = maxPrice - minPrice

        if (priceRange > 0) {
          const zoneHeight = priceRange / 20
          let currentZoneIdx = Math.floor((currentPrice - minPrice) / zoneHeight)
          if (currentZoneIdx >= 20) currentZoneIdx = 19
          if (currentZoneIdx < 0) currentZoneIdx = 0

          const currentZone = priceZones[currentZoneIdx]
          if (currentZone) {
            const currentWeight = currentZone.volumeWeight

            // Check for breakdown: compare with 5 zones above that have sufficient volume
            let zonesChecked = 0
            let breakdownDetected = false
            let breakdownReason = ''

            for (let offset = 1; offset <= 20 && zonesChecked < 5; offset++) {
              const aboveZoneIdx = currentZoneIdx + offset
              if (aboveZoneIdx >= 20) break

              const aboveZone = priceZones[aboveZoneIdx]
              // Skip zones with 0% volume
              if (aboveZone.volumeWeight === 0) continue
              // Skip zones with volume < 50% of original support zone volume
              if (aboveZone.volume < supportZoneVolume * 0.5) continue

              zonesChecked++
              const aboveWeight = aboveZone.volumeWeight

              if (aboveWeight - currentWeight >= 0.08) {
                breakdownDetected = true
                breakdownReason = `Breakdown: Zone ${currentZoneIdx} (${(currentWeight * 100).toFixed(1)}%) vs Zone ${aboveZoneIdx} (${(aboveWeight * 100).toFixed(1)}%)`
                break
              }
            }

            if (breakdownDetected) {
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
                isCutoff: false
              })

              sellSignals.push({
                date: currentDate,
                price: sellPrice,
                isCutoff: false,
                reason: breakdownReason
              })

              // Reset state
              isHolding = false
              buyPrice = null
              buyDate = null
              cutoffPrice = null
              currentWindowIndex = null
              supportZoneVolume = 0
              currentTradeId++

              continue // Skip other checks for this point
            }
          }
        }
      }
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

        console.log('[Support Check]', {
          date: currentDate,
          windowIdx: windowData.windowIndex,
          zonesWithVolume: priceZones.filter(z => z.volumeWeight > 0).length,
          maxWeight: (maxWeight * 100).toFixed(1) + '%',
          distribution: priceZones.map((z, i) => ({
            zone: i,
            weight: (z.volumeWeight * 100).toFixed(1) + '%',
            priceRange: `${z.minPrice.toFixed(2)}-${z.maxPrice.toFixed(2)}`
          })).filter(z => parseFloat(z.weight) > 0)
        })

        if (maxWeightZone) {
          const newWindowSupport = maxWeightZone.minPrice
          const newCutoffPrice = Math.max(cutoffPrice, newWindowSupport)

          // Track support update if it moved up
          if (newCutoffPrice > cutoffPrice) {
            console.log('[Support UPDATE]', {
              date: currentDate,
              oldCutoff: cutoffPrice.toFixed(2),
              newCutoff: newCutoffPrice.toFixed(2),
              supportLevel: newWindowSupport.toFixed(2),
              volumeWeight: (maxWeight * 100).toFixed(1) + '%'
            })

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

          // Initial cutoff = MAX(buyPrice * 0.92, heaviest zone minPrice)
          const priceBasedCutoff = breakSignal.price * (1 - CUTOFF_PERCENT)
          const supportBasedCutoff = breakSignal.supportLevel || 0
          cutoffPrice = Math.max(priceBasedCutoff, supportBasedCutoff)

          currentWindowIndex = breakSignal.windowIndex // Track starting window
          supportZoneVolume = breakSignal.supportZoneVolume || 0 // Track support zone volume for breakdown detection

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
            price: sellPrice,
            isCutoff: false,
            reason: 'Breakdown: Volume pattern deterioration'
          })

          // Reset state
          isHolding = false
          buyPrice = null
          buyDate = null
          cutoffPrice = null
          currentWindowIndex = null
          supportZoneVolume = 0
          currentTradeId++ // Increment for next trade
        }
      }
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

  // If still holding at the end, extend to current price
  if (isHolding && cutoffPrice !== null && reversedPrices.length > 0) {
    const lastPrice = reversedPrices[reversedPrices.length - 1]
    cutoffPrices.push({
      date: lastPrice.date,
      price: cutoffPrice,
      tradeId: currentTradeId
    })
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
    cutoffPrices,
    marketChange,
    isHolding
  }
}
