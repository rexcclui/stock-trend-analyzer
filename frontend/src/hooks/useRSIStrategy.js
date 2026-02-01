import { useState, useCallback } from 'react'

/**
 * Custom hook for RSI-based buy/sell strategy simulation
 *
 * Strategy Logic:
 * - BUY: When RSI crosses UP through oversold threshold (recovering from oversold) and no position held
 * - SELL: When RSI drops BELOW overbought threshold (was overbought, now dropping) and position held
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
  const [isOptimizing, setIsOptimizing] = useState(false)

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

  // Transaction cost per trade (buy or sell)
  const TRANSACTION_COST_PERCENT = 0.15

  // Run simulation with specific parameters (used for optimization)
  const runSimulationWithParams = useCallback((visiblePrices, period, overbought, oversold) => {
    if (!visiblePrices || visiblePrices.length < period + 2) {
      return null
    }

    const rsiData = calculateRSI(visiblePrices, period)

    const trades = []
    let position = null
    let totalPL = 0
    const buySignals = []
    const sellSignals = []
    // Total cost per round trip (buy + sell)
    const roundTripCost = TRANSACTION_COST_PERCENT * 2

    for (let i = 1; i < rsiData.length; i++) {
      const current = rsiData[i]
      const previous = rsiData[i - 1]

      if (current.rsi === null || previous.rsi === null) continue

      // BUY: RSI crosses above oversold threshold (no position)
      if (!position && previous.rsi <= oversold && current.rsi > oversold) {
        position = {
          buyPrice: current.close,
          buyDate: current.date,
          buyIndex: i
        }
        buySignals.push({ date: current.date, price: current.close, rsi: current.rsi })
      }
      // SELL: RSI drops below overbought threshold (was overbought, now dropping)
      else if (position && previous.rsi >= overbought && current.rsi < overbought) {
        const grossPL = ((current.close - position.buyPrice) / position.buyPrice) * 100
        const pl = grossPL - roundTripCost // Deduct transaction costs (buy + sell)
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

    // If still holding at end, close at last price
    if (position && rsiData.length > 0) {
      const lastData = rsiData[rsiData.length - 1]
      const grossPL = ((lastData.close - position.buyPrice) / position.buyPrice) * 100
      // Only charge buy cost for open positions (sell hasn't happened yet)
      const pl = grossPL - TRANSACTION_COST_PERCENT
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

    return {
      trades: trades.length,
      plPercent: totalPL,
      buySignals,
      sellSignals,
      tradeDetails: trades,
      rsiData
    }
  }, [calculateRSI])

  // Run the strategy simulation with current parameters
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

    const result = runSimulationWithParams(visiblePrices, rsiPeriod, overboughtThreshold, oversoldThreshold)
    if (result) {
      setSimulationResult(result)
      setLastSimulatedRange(visiblePrices.length)
    }

    return result
  }, [rsiPeriod, overboughtThreshold, oversoldThreshold, runSimulationWithParams])

  // Generate all parameter combinations based on slider step rules
  const generateParameterCombinations = useCallback(() => {
    const combinations = []

    // Period: 9-50, increment 1 below 14, 2 below 20, 4 below 50
    const periods = []
    for (let p = 9; p <= 50; ) {
      periods.push(p)
      if (p < 14) p += 1
      else if (p < 20) p += 2
      else p += 4
    }

    // Overbought: 65-95, increment 3
    const overboughts = []
    for (let o = 65; o <= 95; o += 3) {
      overboughts.push(o)
    }

    // Oversold: 5-35, increment 3
    const oversolds = []
    for (let o = 5; o <= 35; o += 3) {
      oversolds.push(o)
    }

    // Generate all combinations
    for (const period of periods) {
      for (const overbought of overboughts) {
        for (const oversold of oversolds) {
          // Only valid if oversold < overbought
          if (oversold < overbought) {
            combinations.push({ period, overbought, oversold })
          }
        }
      }
    }

    return combinations
  }, [])

  // Optimize parameters to find best P/L with minimum trades per year
  const optimizeParameters = useCallback((visiblePrices, minTradesPerYear = 2) => {
    if (!visiblePrices || visiblePrices.length < 10) {
      return null
    }

    setIsOptimizing(true)

    // Calculate the time span in years
    const firstDate = new Date(visiblePrices[0].date)
    const lastDate = new Date(visiblePrices[visiblePrices.length - 1].date)
    const yearSpan = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000)

    const combinations = generateParameterCombinations()
    let bestResult = null
    let bestParams = null
    let bestPL = -Infinity

    for (const { period, overbought, oversold } of combinations) {
      const result = runSimulationWithParams(visiblePrices, period, overbought, oversold)

      if (!result) continue

      // Calculate trades per year
      const tradesPerYear = yearSpan > 0 ? result.trades / yearSpan : result.trades

      // Skip if not enough trades per year
      if (tradesPerYear < minTradesPerYear) continue

      // Check if this is the best P/L so far
      if (result.plPercent > bestPL) {
        bestPL = result.plPercent
        bestResult = result
        bestParams = { period, overbought, oversold }
      }
    }

    setIsOptimizing(false)

    if (bestParams) {
      // Update the parameters to optimal values
      setRsiPeriod(bestParams.period)
      setOverboughtThreshold(bestParams.overbought)
      setOversoldThreshold(bestParams.oversold)
      setSimulationResult(bestResult)
      setLastSimulatedRange(visiblePrices.length)

      return {
        params: bestParams,
        result: bestResult
      }
    }

    return null
  }, [generateParameterCombinations, runSimulationWithParams])

  // Reset simulation
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

    // Optimization
    isOptimizing,
    optimizeParameters,

    // Utility
    calculateRSI
  }
}

export default useRSIStrategy
