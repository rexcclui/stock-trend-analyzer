import { useState, useCallback, useMemo } from 'react'

/**
 * Custom hook for RSI-based buy/sell strategy simulation
 *
 * Strategy Logic:
 * - BUY: When RSI crosses UP through oversold threshold (recovering from oversold) and no position held
 * - SELL: When RSI crosses UP through overbought threshold (becoming overbought) and position held
 *
 * @param {Array} priceData - Array of price data with {date, close} fields
 * @param {number} defaultPeriod - Default RSI period (default: 14)
 * @param {number} defaultOverbought - Default overbought threshold (default: 70)
 * @param {number} defaultOversold - Default oversold threshold (default: 30)
 */
export function useRSIStrategy(priceData, defaultPeriod = 14, defaultOverbought = 70, defaultOversold = 30) {
  const [rsiPeriod, setRsiPeriod] = useState(defaultPeriod)
  const [overboughtThreshold, setOverboughtThreshold] = useState(defaultOverbought)
  const [oversoldThreshold, setOversoldThreshold] = useState(defaultOversold)
  const [simulationResult, setSimulationResult] = useState(null)
  const [lastSimulatedRange, setLastSimulatedRange] = useState(null)

  // Calculate RSI for a given dataset
  const calculateRSI = useCallback((prices, period) => {
    if (!prices || prices.length < period + 1) return []

    const rsiValues = []

    for (let i = 0; i < prices.length; i++) {
      if (i < period) {
        rsiValues.push({ date: prices[i].date, rsi: null, close: prices[i].close })
        continue
      }

      let gains = 0
      let losses = 0

      for (let j = i - period + 1; j <= i; j++) {
        const change = prices[j].close - prices[j - 1].close
        if (change > 0) {
          gains += change
        } else {
          losses += Math.abs(change)
        }
      }

      const avgGain = gains / period
      const avgLoss = losses / period

      let rsi
      if (avgLoss === 0) {
        rsi = 100
      } else {
        const rs = avgGain / avgLoss
        rsi = 100 - (100 / (1 + rs))
      }

      rsiValues.push({ date: prices[i].date, rsi, close: prices[i].close })
    }

    return rsiValues
  }, [])

  // Run the strategy simulation
  const runSimulation = useCallback((visiblePrices) => {
    if (!visiblePrices || visiblePrices.length < rsiPeriod + 2) {
      setSimulationResult({
        trades: 0,
        plPercent: 0,
        buySignals: [],
        sellSignals: [],
        error: 'Insufficient data for simulation'
      })
      return
    }

    // Calculate RSI for the visible range
    const rsiData = calculateRSI(visiblePrices, rsiPeriod)

    const trades = []
    let position = null // { buyPrice, buyDate, buyIndex }
    let totalPL = 0
    const buySignals = []
    const sellSignals = []

    for (let i = 1; i < rsiData.length; i++) {
      const current = rsiData[i]
      const previous = rsiData[i - 1]

      if (current.rsi === null || previous.rsi === null) continue

      // BUY: RSI crosses above oversold threshold (no position)
      if (!position && previous.rsi <= oversoldThreshold && current.rsi > oversoldThreshold) {
        position = {
          buyPrice: current.close,
          buyDate: current.date,
          buyIndex: i
        }
        buySignals.push({ date: current.date, price: current.close, rsi: current.rsi })
      }
      // SELL: RSI crosses above overbought threshold (has position) - take profit when overbought
      else if (position && previous.rsi < overboughtThreshold && current.rsi >= overboughtThreshold) {
        const pl = ((current.close - position.buyPrice) / position.buyPrice) * 100
        totalPL += pl
        trades.push({
          buyDate: position.buyDate,
          buyPrice: position.buyPrice,
          sellDate: current.date,
          sellPrice: current.close,
          plPercent: pl
        })
        sellSignals.push({ date: current.date, price: current.close, rsi: current.rsi })
        position = null
      }
    }

    // If still holding at end, close at last price for P/L calculation
    if (position && rsiData.length > 0) {
      const lastData = rsiData[rsiData.length - 1]
      const pl = ((lastData.close - position.buyPrice) / position.buyPrice) * 100
      totalPL += pl
      trades.push({
        buyDate: position.buyDate,
        buyPrice: position.buyPrice,
        sellDate: lastData.date + ' (open)',
        sellPrice: lastData.close,
        plPercent: pl,
        isOpen: true
      })
    }

    const result = {
      trades: trades.length,
      plPercent: totalPL,
      buySignals,
      sellSignals,
      tradeDetails: trades,
      rsiData
    }

    setSimulationResult(result)
    setLastSimulatedRange(visiblePrices.length)

    return result
  }, [rsiPeriod, overboughtThreshold, oversoldThreshold, calculateRSI])

  // Reset simulation (used when refresh is clicked)
  const resetSimulation = useCallback(() => {
    setSimulationResult(null)
    setLastSimulatedRange(null)
  }, [])

  return {
    // Parameters
    rsiPeriod,
    setRsiPeriod,
    overboughtThreshold,
    setOverboughtThreshold,
    oversoldThreshold,
    setOversoldThreshold,

    // Simulation
    simulationResult,
    runSimulation,
    resetSimulation,
    lastSimulatedRange,

    // Utility
    calculateRSI
  }
}

export default useRSIStrategy
