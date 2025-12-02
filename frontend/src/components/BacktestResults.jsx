import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Search, Loader2, TrendingUp, TrendingDown, DollarSign, Target, Percent, AlertCircle, X, RefreshCcw, Pause, Play, DownloadCloud } from 'lucide-react'
import { apiCache } from '../utils/apiCache'
import { joinUrl } from '../utils/urlHelper'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STOCK_HISTORY_KEY = 'stockSearchHistory'
const BACKTEST_RESULTS_KEY = 'backtestResults'

// Helper function to parse multiple stock symbols from input
function parseStockSymbols(input) {
  if (!input || !input.trim()) return []

  // Split by comma or space
  const symbols = input.split(/[,\s]+/).filter(s => s.trim())

  // Convert to uppercase and filter valid symbols
  return symbols.map(s => s.trim().toUpperCase()).filter(s => s.length > 0)
}

// Calculate Vol Prf V2 breakouts with configurable parameters
function calculateVolPrfV2Breakouts(prices, params = {}) {
  const {
    breakoutThreshold = 0.06,  // 6%
    lookbackZones = 5,          // Check 5 zones below
    resetThreshold = 0.03,      // 3% reaccumulation
    timeoutSlots = 5            // 5-slot timeout
  } = params

  if (!prices || prices.length === 0) return []

  const reversedDisplayPrices = [...prices].reverse()
  const visibleData = reversedDisplayPrices

  if (visibleData.length === 0) return []

  // Calculate global min and max from all visible data
  const allPrices = visibleData.map(p => p.close)
  const globalMin = Math.min(...allPrices)
  const globalMax = Math.max(...allPrices)
  const globalRange = globalMax - globalMin

  if (globalRange === 0) return []

  // Divide data into date slots
  const minSlotSize = 2
  const maxPossibleSlots = Math.floor(visibleData.length / minSlotSize)
  const numDateSlots = Math.min(200, Math.max(1, maxPossibleSlots))
  const slotSize = Math.ceil(visibleData.length / numDateSlots)
  const slots = []

  for (let slotIdx = 0; slotIdx < numDateSlots; slotIdx++) {
    const endIdx = Math.min((slotIdx + 1) * slotSize, visibleData.length)

    if (endIdx === 0) break

    const cumulativeData = visibleData.slice(0, endIdx)
    const slotData = visibleData.slice(slotIdx * slotSize, endIdx)

    if (slotData.length === 0) continue

    const cumulativePrices = cumulativeData.map(p => p.close)
    const cumulativeMin = Math.min(...cumulativePrices)
    const cumulativeMax = Math.max(...cumulativePrices)
    const cumulativeRange = cumulativeMax - cumulativeMin

    if (cumulativeRange === 0) continue

    const numPriceZones = Math.max(3, Math.round((cumulativeRange / globalRange) / 0.03))
    const priceZoneHeight = cumulativeRange / numPriceZones

    // Initialize price zones
    const priceZones = []
    for (let i = 0; i < numPriceZones; i++) {
      priceZones.push({
        minPrice: cumulativeMin + (i * priceZoneHeight),
        maxPrice: cumulativeMin + ((i + 1) * priceZoneHeight),
        volume: 0,
        volumeWeight: 0
      })
    }

    // Accumulate volume
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

    // Calculate volume weights
    priceZones.forEach(zone => {
      zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
    })

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

  // Detect breakouts with state-based logic using provided parameters
  const breakouts = []

  let isInBreakout = false
  let breakoutZoneWeight = 0
  let breakoutSlotIdx = -1

  for (let i = 0; i < slots.length; i++) {
    const currentSlot = slots[i]
    if (!currentSlot) continue

    const currentPrice = currentSlot.currentPrice

    const currentZoneIdx = currentSlot.priceZones.findIndex(zone =>
      currentPrice >= zone.minPrice && currentPrice <= zone.maxPrice
    )

    if (currentZoneIdx === -1) continue

    const currentZone = currentSlot.priceZones[currentZoneIdx]
    const currentWeight = currentZone.volumeWeight

    // Check timeout
    if (isInBreakout && i - breakoutSlotIdx >= timeoutSlots) {
      isInBreakout = false
      breakoutZoneWeight = 0
      breakoutSlotIdx = -1
    }

    // Check reset condition
    if (isInBreakout && currentWeight >= breakoutZoneWeight + resetThreshold) {
      isInBreakout = false
      breakoutZoneWeight = 0
      breakoutSlotIdx = -1
    }

    // Only detect new breakouts if NOT in breakout state
    if (!isInBreakout && currentZoneIdx > 0) {
      // Check price direction (must be moving UP)
      if (i > 0) {
        const previousSlot = slots[i - 1]
        if (previousSlot) {
          const previousPrice = previousSlot.currentPrice
          if (currentPrice <= previousPrice) {
            continue
          }
        }
      }

      // Find max volume zone within N zones below (configurable)
      const lookbackDepth = Math.min(lookbackZones, currentZoneIdx)
      let maxLowerWeight = 0
      let maxZoneIdx = -1

      for (let lookback = 1; lookback <= lookbackDepth; lookback++) {
        const lowerZone = currentSlot.priceZones[currentZoneIdx - lookback]
        if (lowerZone.volumeWeight > maxLowerWeight) {
          maxLowerWeight = lowerZone.volumeWeight
          maxZoneIdx = currentZoneIdx - lookback
        }
      }

      // Check breakout condition
      if (currentWeight < maxLowerWeight && maxLowerWeight - currentWeight >= breakoutThreshold) {
        breakouts.push({
          slotIdx: i,
          date: currentSlot.endDate,
          price: currentPrice,
          isUpBreak: true,
          currentWeight: currentWeight,
          lowerWeight: maxLowerWeight,
          weightDiff: maxLowerWeight - currentWeight
        })

        // Enter breakout state
        isInBreakout = true
        breakoutZoneWeight = currentWeight
        breakoutSlotIdx = i
      }
    }
  }

  return { slots, breakouts }
}

// Check if breakout occurred in last N days (relative to today)
function getRecentBreakouts(breakouts, days = 10) {
  if (!breakouts || breakouts.length === 0) return []

  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return breakouts.filter(b => new Date(b.date) >= cutoffDate)
}

// Get latest breakout info
function getLatestBreakout(breakouts) {
  if (!breakouts || breakouts.length === 0) return null
  return breakouts[breakouts.length - 1]
}

// Optimize Vol Prf V2 parameters by testing combinations
function optimizeVolPrfV2Params(prices) {
  if (!prices || prices.length === 0) {
    return { breakoutThreshold: 0.06, lookbackZones: 5, resetThreshold: 0.03, timeoutSlots: 5, winRate: 0 }
  }

  const paramCombinations = [
    // Test different thresholds and lookback zones
    { breakoutThreshold: 0.05, lookbackZones: 3, resetThreshold: 0.025, timeoutSlots: 5 },
    { breakoutThreshold: 0.05, lookbackZones: 5, resetThreshold: 0.025, timeoutSlots: 5 },
    { breakoutThreshold: 0.06, lookbackZones: 4, resetThreshold: 0.03, timeoutSlots: 5 },
    { breakoutThreshold: 0.06, lookbackZones: 5, resetThreshold: 0.03, timeoutSlots: 5 },  // Default
    { breakoutThreshold: 0.06, lookbackZones: 6, resetThreshold: 0.03, timeoutSlots: 5 },
    { breakoutThreshold: 0.07, lookbackZones: 5, resetThreshold: 0.035, timeoutSlots: 5 },
    { breakoutThreshold: 0.08, lookbackZones: 5, resetThreshold: 0.04, timeoutSlots: 7 },
  ]

  let bestParams = paramCombinations[3] // Default
  let bestScore = -Infinity

  for (const params of paramCombinations) {
    const { breakouts } = calculateVolPrfV2Breakouts(prices, params)

    if (breakouts.length === 0) continue

    // Simple scoring: more recent breakouts are better
    const recentBreakouts = breakouts.filter(b => {
      const daysSince = (new Date(prices[prices.length - 1].date) - new Date(b.date)) / (1000 * 60 * 60 * 24)
      return daysSince <= 30  // Last 30 days
    })

    // Score based on number of recent breakouts and strength
    const score = recentBreakouts.reduce((sum, b) => sum + b.weightDiff, 0)

    if (score > bestScore) {
      bestScore = score
      bestParams = { ...params, winRate: (recentBreakouts.length / Math.max(breakouts.length, 1)) * 100 }
    }
  }

  return bestParams
}

// Calculate SMA for given period
function calculateSMA(prices, period) {
  const sma = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(null)
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((acc, p) => acc + p.close, 0)
      sma.push(sum / period)
    }
  }
  return sma
}

// Optimize single SMA period by testing different values with actual P/L simulation
function optimizeSMAParams(prices, slots, breakouts) {
  if (!slots || slots.length === 0 || !breakouts || breakouts.length === 0) {
    return { period: 50, pl: 0 }
  }

  // Prices are in reverse chronological order, reverse for forward-time processing
  const reversedPrices = [...prices].reverse()

  // Helper to calculate SMA from daily prices in forward chronological order
  const calculateSMAForPrices = (period) => {
    const dateToSMA = new Map()
    for (let i = 0; i < reversedPrices.length; i++) {
      if (i < period - 1) {
        dateToSMA.set(reversedPrices[i].date, null)
      } else {
        const sum = reversedPrices.slice(i - period + 1, i + 1).reduce((acc, p) => acc + p.close, 0)
        dateToSMA.set(reversedPrices[i].date, sum / period)
      }
    }
    return dateToSMA
  }

  // Helper to calculate P&L for a given SMA period (using daily prices)
  const calculatePLForSMA = (smaPeriod) => {
    const dateToSMA = calculateSMAForPrices(smaPeriod)

    // Helper to get SMA slope between two dates
    const getSMASlope = (currentDate, prevDate) => {
      const currentSMA = dateToSMA.get(currentDate)
      const prevSMA = dateToSMA.get(prevDate)
      if (currentSMA !== undefined && prevSMA !== undefined) {
        return currentSMA - prevSMA
      }
      return null
    }

    const breakoutDates = new Set(breakouts.map(b => b.date))
    const trades = []
    let isHolding = false
    let buyPrice = null

    // Iterate through daily prices in forward chronological order for simulation
    for (let i = 0; i < reversedPrices.length; i++) {
      const pricePoint = reversedPrices[i]
      if (!pricePoint) continue

      const currentDate = pricePoint.date
      const currentPrice = pricePoint.close

      // Buy on breakout
      if (breakoutDates.has(currentDate) && !isHolding) {
        isHolding = true
        buyPrice = currentPrice
      }
      // Sell when SMA slope turns negative
      else if (isHolding && i > 0) {
        const prevPrice = reversedPrices[i - 1]
        if (prevPrice) {
          const slope = getSMASlope(currentDate, prevPrice.date)

          if (slope !== null && slope < 0) {
            const sellPrice = currentPrice
            const plPercent = ((sellPrice - buyPrice) / buyPrice) * 100
            trades.push({ plPercent })
            isHolding = false
            buyPrice = null
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
    console.log(`[BacktestOptimize SMA-${smaPeriod}] Prices: ${reversedPrices.length}, Breakouts: ${breakouts.length}, Trades: ${trades.length}, P/L: ${totalPL.toFixed(2)}%`)
    return { totalPL, trades }
  }

  // Test SMA values with proper increments (same as chart simulation)
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

  let bestSMA = 50 // Default
  let bestPL = -Infinity
  let bestTrades = []
  const results = []

  for (const period of testValues) {
    const { totalPL, trades } = calculatePLForSMA(period)
    results.push({ sma: period, pl: totalPL })
    if (totalPL > bestPL) {
      bestPL = totalPL
      bestSMA = period
      bestTrades = trades
    }
  }

  // Show top 10 for debugging
  const top10 = [...results].sort((a, b) => b.pl - a.pl).slice(0, 10)
  console.log(`[SMA Optimization] Top 10 SMA values:`)
  top10.forEach((r, i) => console.log(`  ${i + 1}. SMA ${r.sma}: ${r.pl.toFixed(2)}%`))

  // Calculate total signals: closed trades = 1.0, open trades = 0.5
  const closedTrades = bestTrades.filter(t => !t.isOpen)
  const openTrades = bestTrades.filter(t => t.isOpen)
  const totalSignals = closedTrades.length + (openTrades.length * 0.5)

  return { period: bestSMA, pl: bestPL, totalSignals }
}

function BacktestResults({ onStockSelect }) {
  const [symbols, setSymbols] = useState('')
  const [days, setDays] = useState('1825') // Default to 5Y
  const [loading, setLoading] = useState(false)
  const [loadingTopSymbols, setLoadingTopSymbols] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])
  const [stockHistory, setStockHistory] = useState([])
  const [scanQueue, setScanQueue] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [scanCompleted, setScanCompleted] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const activeScanSymbolRef = useRef(null)

  // Load stock history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem(STOCK_HISTORY_KEY)
    if (savedHistory) {
      try {
        setStockHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to load stock history:', e)
      }
    }
  }, [])

  // Load cached backtest results on mount
  useEffect(() => {
    const savedResults = localStorage.getItem(BACKTEST_RESULTS_KEY)
    if (!savedResults) return

    try {
      const parsed = JSON.parse(savedResults)
      if (Array.isArray(parsed)) {
        const normalized = parsed.map(entry => ({
          ...entry,
          status: entry.status === 'loading' ? 'pending' : entry.status || 'pending',
          error: entry.error || null
        }))
        setResults(normalized)
      }
    } catch (e) {
      console.error('Failed to load cached backtest results:', e)
    }
  }, [])

  // Listen for history updates from other components (e.g., technical analysis tab)
  useEffect(() => {
    const handleHistoryUpdate = (event) => {
      if (Array.isArray(event.detail)) {
        setStockHistory(event.detail)
      }
    }

    window.addEventListener('stockHistoryUpdated', handleHistoryUpdate)
    return () => window.removeEventListener('stockHistoryUpdated', handleHistoryUpdate)
  }, [])

  const saveToHistory = (stockList) => {
    if (!Array.isArray(stockList) || stockList.length === 0) return
    const uniqueStocks = Array.from(new Set(stockList.filter(Boolean)))
    const updatedHistory = [...uniqueStocks, ...stockHistory.filter(s => !uniqueStocks.includes(s))].slice(0, 10)
    setStockHistory(updatedHistory)
    localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(updatedHistory))
    window.dispatchEvent(new CustomEvent('stockHistoryUpdated', { detail: updatedHistory }))
  }

  // Persist backtest results to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(BACKTEST_RESULTS_KEY, JSON.stringify(results))
    } catch (e) {
      console.error('Failed to cache backtest results:', e)
    }
  }, [results])

  const ensureEntries = (symbolList) => {
    if (!Array.isArray(symbolList) || symbolList.length === 0) return

    setResults(prev => {
      const existingSymbols = new Set(prev.map(r => r.symbol))
      const newEntries = symbolList
        .filter(Boolean)
        .filter(symbol => !existingSymbols.has(symbol))
        .map(symbol => ({
          symbol,
          status: 'pending',
          latestBreakout: null,
          latestPrice: null,
          priceData: null,
          optimalParams: null,
          optimalSMAs: null,
          days,
          isRecentBreakout: false,
          recentBreakout: null,
          totalSignals: null,
          error: null
        }))

      if (newEntries.length === 0) return prev
      return [...prev, ...newEntries]
    })
  }

  const runBacktestForSymbol = async (symbol) => {
    ensureEntries([symbol])
    setResults(prev => prev.map(entry => (
      entry.symbol === symbol
        ? { ...entry, status: 'loading', error: null }
        : entry
    )))

    try {
      const cacheKey = symbol
      let cachedData = apiCache.get(cacheKey, days)
      let priceData

      if (!cachedData) {
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: { symbol, days }
        })
        apiCache.set(cacheKey, days, response.data)
        priceData = response.data.prices
      } else {
        priceData = cachedData.prices
      }

      if (!priceData || priceData.length === 0) {
        throw new Error('No price data found')
      }

      const optimalParams = optimizeVolPrfV2Params(priceData)
      const { slots, breakouts } = calculateVolPrfV2Breakouts(priceData, optimalParams)
      const optimalSMAs = optimizeSMAParams(priceData, slots, breakouts)

      const recentBreakouts = getRecentBreakouts(breakouts, 10)
      const latestBreakout = getLatestBreakout(breakouts)
      const latestRecentBreakout = getLatestBreakout(recentBreakouts)

      if (!latestBreakout) {
        throw new Error('No breakout detected')
      }

      const latestPrice = priceData[priceData.length - 1].close

      const completedEntry = {
        symbol,
        status: 'completed',
        totalSignals: optimalSMAs.totalSignals,
        latestBreakout,
        latestPrice,
        priceData,
        optimalParams,
        optimalSMAs,
        days,
        isRecentBreakout: Boolean(latestRecentBreakout),
        recentBreakout: latestRecentBreakout,
        error: null
      }

      setResults(prev => prev.map(entry => (
        entry.symbol === symbol ? completedEntry : entry
      )))
    } catch (err) {
      console.error(`Error processing ${symbol}:`, err)
      setResults(prev => prev.map(entry => (
        entry.symbol === symbol
          ? { ...entry, status: 'error', error: err.message || 'Failed to run backtest' }
          : entry
      )))
    }
  }

  const queueSymbols = (symbolList, { startScan = true } = {}) => {
    if (!Array.isArray(symbolList) || symbolList.length === 0) return
    ensureEntries(symbolList)
    if (startScan) {
      setScanQueue(prev => {
        const existing = new Set(prev)
        const merged = [...prev, ...symbolList.filter(symbol => !existing.has(symbol))]
        setScanTotal(merged.length)
        return merged
      })
      setScanCompleted(0)
      setIsPaused(false)
      setIsScanning(true)
    }
  }

  const loadTopSymbols = async () => {
    if (loadingTopSymbols) return
    setLoadingTopSymbols(true)
    try {
      const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), {
        params: { limit: 2000 }
      })

      const payload = response.data
      const symbols = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.symbols)
          ? payload.symbols
          : []

      const normalized = symbols
        .map(item => (typeof item === 'string' ? item : item?.symbol))
        .filter(Boolean)
        .map(symbol => symbol.toUpperCase())

      ensureEntries(normalized)
    } catch (err) {
      console.error('Failed to load top market cap symbols', err)
      setError('Failed to load top market cap symbols')
    } finally {
      setLoadingTopSymbols(false)
    }
  }

  const runBacktest = (symbolOverride = null) => {
    const targetSymbols = symbolOverride ?? symbols
    const stockList = parseStockSymbols(targetSymbols)

    if (stockList.length === 0) {
      setError('Please enter at least one stock symbol')
      return
    }

    saveToHistory(stockList)
    setError(null)
    ensureEntries(stockList)
    queueSymbols(stockList, { startScan: true })
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      runBacktest()
    }
  }

  const handleHistoryClick = (stock) => {
    setSymbols(stock)
    runBacktest(stock)
  }

  const scanAllQueued = () => {
    if (normalizedResults.length === 0) return
    const pendingSymbols = normalizedResults
      .filter(entry => entry.status !== 'completed')
      .map(entry => entry.symbol)

    if (pendingSymbols.length === 0) return

    setScanQueue(pendingSymbols)
    setScanTotal(pendingSymbols.length)
    setScanCompleted(0)
    setIsPaused(false)
    setIsScanning(true)
  }

  const scanSingle = (symbol) => {
    setScanQueue([symbol])
    setScanTotal(1)
    setScanCompleted(0)
    setIsPaused(false)
    setIsScanning(true)
  }

  const togglePauseResume = () => {
    if (!isScanning) return
    setIsPaused(prev => !prev)
  }

  useEffect(() => {
    if (!isScanning || isPaused) return
    if (scanQueue.length === 0) {
      setIsScanning(false)
      setIsPaused(false)
      setLoading(false)
      return
    }

    const currentSymbol = scanQueue[0]
    if (activeScanSymbolRef.current === currentSymbol) return

    activeScanSymbolRef.current = currentSymbol
    setLoading(true)

    ; (async () => {
      await runBacktestForSymbol(currentSymbol)
      setScanCompleted(prev => prev + 1)
      setScanQueue(prev => prev.slice(1))
      activeScanSymbolRef.current = null
    })()
  }, [isScanning, isPaused, scanQueue])

  useEffect(() => {
    if (isScanning && scanQueue.length === 0) {
      setIsScanning(false)
      setIsPaused(false)
      setLoading(false)
    }
  }, [isScanning, scanQueue.length])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getDaysAgo = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const normalizedResults = results.map(entry => ({
    status: 'completed',
    ...entry
  }))

  const completedResults = normalizedResults.filter(r => r.status === 'completed' && r.latestBreakout)
  const recentBreakoutCount = completedResults.filter(r => r.isRecentBreakout).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6 rounded-lg border border-purple-700">
        <h2 className="text-2xl font-bold text-white mb-2">Vol Prf V2 + SMA Backtest Scanner</h2>
        <p className="text-slate-300">Scan multiple stocks for recent Volume Profile V2 breakouts (last 10 days)</p>
      </div>

      {/* Search Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Stock Symbols (comma or space separated)
              </label>
              {stockHistory.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-slate-400">Recent:</span>
                  {stockHistory.map((stock, index) => (
                    <span key={stock}>
                      <button
                        onClick={() => handleHistoryClick(stock)}
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                      >
                        {stock}
                      </button>
                      {index < stockHistory.length - 1 && (
                        <span className="text-slate-500">, </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <input
              type="text"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="e.g., AAPL, TSLA, MSFT, NVDA"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400"
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Analysis Period
            </label>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="90">3 Months</option>
              <option value="180">6 Months</option>
              <option value="365">1 Year</option>
              <option value="730">2 Years</option>
              <option value="1825">5 Years</option>
            </select>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <button
              onClick={runBacktest}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Scan Stocks
                </>
              )}
            </button>
            <button
              onClick={loadTopSymbols}
              disabled={loadingTopSymbols || loading}
              className="w-full md:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loadingTopSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              Load 2000
            </button>
            <button
              onClick={scanAllQueued}
              disabled={results.length === 0 || isScanning}
              className="w-full md:w-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCcw className="w-5 h-5" />
              Scan
            </button>
            <button
              onClick={togglePauseResume}
              disabled={!isScanning}
              className="w-full md:w-auto px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            {results.length > 0 && (
              <button
                onClick={() => setResults([])}
                disabled={loading}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                title="Clear all results"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {normalizedResults.length > 0 && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-gradient-to-br from-green-900/50 to-green-800/50 p-6 rounded-lg border border-green-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-300">Recent Breakouts (≤10 days)</p>
                <p className="text-3xl font-bold mt-2 text-green-100">
                  {recentBreakoutCount}
                </p>
                <p className="text-sm mt-1 text-green-300">
                  From {completedResults.length} stocks with detected breakouts
                </p>
              </div>
              <div className="text-sm text-green-200 space-y-1 text-right">
                <div>Queued: {scanCompleted}/{scanTotal || normalizedResults.length}</div>
                {isScanning && (
                  <div className="flex items-center gap-2 justify-end text-amber-200">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isPaused ? 'Paused' : 'Scanning'}
                  </div>
                )}
              </div>
              <TrendingUp className="w-12 h-12 text-green-400" />
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold mb-4 text-slate-100">Breakout Signals</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Latest Breakout</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Days Ago</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Breakout Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Current Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Vol Weight</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Support Vol</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Diff</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Total Signals</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Optimal Params</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-slate-700">
                  {normalizedResults.map((result, index) => {
                    const hasBreakout = Boolean(result.latestBreakout)
                    const daysAgo = hasBreakout ? getDaysAgo(result.latestBreakout.date) : null
                    const priceChange = hasBreakout
                      ? ((result.latestPrice - result.latestBreakout.price) / result.latestBreakout.price * 100)
                      : null
                    const isWithinLast10Days = hasBreakout && daysAgo <= 10
                    const status = result.status || (hasBreakout ? 'completed' : 'pending')

                    return (
                      <tr
                        key={index}
                        onClick={() => hasBreakout && onStockSelect && onStockSelect(result.symbol, { ...result.optimalParams, smaPeriods: [result.optimalSMAs?.period], days: result.days })}
                        className={`transition-colors ${hasBreakout ? 'hover:bg-slate-700 cursor-pointer' : 'opacity-75'} ${isWithinLast10Days ? 'bg-blue-900/20 hover:bg-blue-800/30' : ''}`}
                        title={hasBreakout ? 'Click to view in Technical Analysis with optimized parameters' : 'Pending scan'}
                      >
                        <td className="px-4 py-3 text-sm font-bold text-blue-400">
                          {result.symbol}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status === 'completed' ? 'bg-emerald-900/50 text-emerald-200' : status === 'loading' ? 'bg-amber-900/40 text-amber-200' : status === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-slate-700 text-slate-200'}`}>
                            {status === 'completed' ? 'Done' : status === 'loading' ? 'Scanning' : status === 'error' ? 'Error' : 'Pending'}
                          </span>
                          {result.error && (
                            <div className="text-xs text-red-300 mt-1">{result.error}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {hasBreakout ? (
                            <span className={`${result.isRecentBreakout ? 'text-green-200 bg-green-900/50 animate-pulse px-2 py-1 rounded' : 'text-slate-300'}`}>
                              {formatDate(result.latestBreakout.date)}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasBreakout ? (
                            <span className={`px-2 py-1 rounded ${daysAgo <= 3 ? 'bg-green-900/50 text-green-300' : daysAgo <= 7 ? 'bg-yellow-900/50 text-yellow-300' : daysAgo <= 10 ? 'bg-blue-900/50 text-blue-200' : 'bg-slate-700 text-slate-300'}`}>
                              {daysAgo}d
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasBreakout ? formatCurrency(result.latestBreakout.price) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-right">
                          {hasBreakout ? (
                            <span className={priceChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {formatCurrency(result.latestPrice)}
                              <span className="text-xs ml-1">({formatPercent(priceChange)})</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasBreakout ? `${(result.latestBreakout.currentWeight * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasBreakout ? `${(result.latestBreakout.lowerWeight * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-400 text-right font-semibold">
                          {hasBreakout ? `${(result.latestBreakout.weightDiff * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasBreakout ? result.totalSignals : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 text-left">
                          {hasBreakout ? (
                            <div className="space-y-0.5">
                              <div>Th:{(result.optimalParams.breakoutThreshold * 100).toFixed(0)}%</div>
                              <div>LB:{result.optimalParams.lookbackZones}</div>
                              <div className="text-blue-400 font-medium">SMA:{result.optimalSMAs.period}</div>
                              <div className={`font-bold ${result.optimalSMAs.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                P/L:{result.optimalSMAs.pl.toFixed(1)}%
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              scanSingle(result.symbol)
                            }}
                            className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/20 rounded transition-colors mr-1"
                            title="Scan this stock"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation() // Prevent row click
                              setResults(prevResults => prevResults.filter(r => r.symbol !== result.symbol))
                              setScanQueue(prev => prev.filter(symbol => symbol !== result.symbol))
                            }}
                            className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                            title="Remove this stock"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h4 className="text-sm font-semibold text-slate-300 mb-2">Legend</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-400">
              <div><span className="font-semibold">Vol Weight:</span> Current price zone volume %</div>
              <div><span className="font-semibold">Support Vol:</span> Max volume zone below</div>
              <div><span className="font-semibold">Diff:</span> Breakout strength</div>
              <div><span className="font-semibold">Days Ago:</span> <span className="text-green-400">Green ≤3d</span>, <span className="text-yellow-400">Yellow ≤7d</span>, Gray &gt;7d</div>
              <div><span className="font-semibold">Optimal Params:</span> Th=Threshold%, LB=Lookback Zones</div>
              <div className="col-span-full text-purple-300">💡 Click any row to load stock in chart with optimized parameters</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BacktestResults
