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
      marketChange: 0,
      isHolding: false
    }
  }

  const TRANSACTION_FEE = transactionFee
  const CUTOFF_PERCENT = cutoffPercent

  const trades = []
  const buySignals = []
  const sellSignals = []
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
        // We've entered a new window - update cutoff to heaviest volume zone
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

        // Update cutoff to the BOTTOM of the heaviest volume zone
        // IMPORTANT: Cutoff can only move UP (for long positions), never down
        // This ensures it's a true trailing stop
        if (maxWeightZone) {
          const newCutoffPrice = maxWeightZone.minPrice
          // Only update if new cutoff is HIGHER than current cutoff
          if (newCutoffPrice > cutoffPrice) {
            cutoffPrice = newCutoffPrice
          }
          currentWindowIndex = windowData.windowIndex
        }
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
    marketChange,
    isHolding
  }
}
