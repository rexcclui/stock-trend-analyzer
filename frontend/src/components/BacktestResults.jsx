import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Search, Loader2, TrendingUp, TrendingDown, DollarSign, Target, Percent, AlertCircle, X, RefreshCcw, Pause, Play, DownloadCloud, Bookmark, BookmarkCheck, ArrowUpDown, Eraser, Trash2, RotateCw, Upload, Download, Filter, Waves, Hash, Clock3 } from 'lucide-react'
import { apiCache } from '../utils/apiCache'
import { joinUrl } from '../utils/urlHelper'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STOCK_HISTORY_KEY = 'stockSearchHistory'
const BACKTEST_RESULTS_KEY = 'backtestResults'
const SCAN_QUEUE_KEY = 'backtestScanQueue'
const INVALID_FIVE_CHAR_LENGTH = 5
const BLOCKED_SUFFIX = '.TO'
const HYPHEN = '-'

// Helper function to convert days to display period (e.g., 1825 -> "5Y")
function formatPeriod(days) {
  const daysNum = parseInt(days, 10)
  if (daysNum >= 1825) return '5Y'
  if (daysNum >= 1095) return '3Y'
  if (daysNum >= 730) return '2Y'
  if (daysNum >= 365) return '1Y'
  if (daysNum >= 180) return '6M'
  if (daysNum >= 90) return '3M'
  return `${daysNum}D`
}

// Helper function to create unique key for symbol+period combination
function getEntryKey(symbol, days) {
  return `${symbol}-${days}`
}

function computeMarketChange(priceData) {
  if (!Array.isArray(priceData) || priceData.length === 0) return null

  const firstItem = priceData[0]
  const lastItem = priceData[priceData.length - 1]

  if (!firstItem || !lastItem) return null

  // Determine if data is in chronological or reverse chronological order
  const firstDate = new Date(firstItem.date)
  const lastDate = new Date(lastItem.date)

  let oldestPrice, newestPrice

  if (firstDate < lastDate) {
    // Chronological order: first is oldest, last is newest
    oldestPrice = firstItem.close
    newestPrice = lastItem.close
  } else {
    // Reverse chronological order: first is newest, last is oldest
    oldestPrice = lastItem.close
    newestPrice = firstItem.close
  }

  if (typeof oldestPrice !== 'number' || typeof newestPrice !== 'number' || oldestPrice === 0) return null

  return ((newestPrice - oldestPrice) / oldestPrice) * 100
}

function normalizeCachedResults(entries = []) {
  if (!Array.isArray(entries)) return []

  return entries
    .filter(entry => entry && entry.symbol && !isDisallowedSymbol(entry.symbol))
    .map(entry => {
      const normalizedEntry = {
        ...entry,
        status: entry.status === 'loading' ? 'pending' : entry.status || 'pending',
        error: entry.error || null,
        bookmarked: Boolean(entry.bookmarked),
        marketChange: typeof entry.marketChange === 'number' ? entry.marketChange : computeMarketChange(entry.priceData),
        durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : null
      }

      // Don't clear completed or error results on reload - they should be preserved
      // The < 4 signals check is already enforced during backtest execution
      return normalizedEntry
    })
}

// Helper function to process individual stock symbol - convert numbers to .HK format
function processStockSymbol(symbol) {
  const trimmed = symbol.trim().toUpperCase()
  if (!trimmed) return null

  // If it already ends with .HK, just pad the number part
  if (trimmed.endsWith('.HK')) {
    const numberPart = trimmed.replace('.HK', '')
    // Check if it's a pure number
    if (/^\d+$/.test(numberPart)) {
      const padded = numberPart.padStart(4, '0')
      return `${padded}.HK`
    }
    // If not a pure number (e.g., has letters), return as is
    return trimmed
  }

  // Check if it's a pure number (no .HK suffix)
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.padStart(4, '0')
    return `${padded}.HK`
  }

  // Otherwise, return as is (e.g., AAPL, MSFT, 000100.SS, etc.)
  return trimmed
}

// Helper function to parse multiple stock symbols from input
function parseStockSymbols(input) {
  // Handle non-string inputs
  if (!input) return []
  if (typeof input !== 'string') {
    console.warn('parseStockSymbols received non-string input:', input)
    return []
  }
  if (!input.trim()) return []

  // Split by comma or space
  const symbols = input.split(/[,\s]+/).filter(s => s.trim())

  // Process each symbol (converts pure numbers to .HK format)
  return symbols.map(processStockSymbol).filter(s => s !== null)
}

function isInvalidFiveCharSymbol(symbol) {
  return typeof symbol === 'string' && symbol.length === INVALID_FIVE_CHAR_LENGTH && !symbol.includes('.')
}

function hasBlockedSuffix(symbol) {
  return typeof symbol === 'string' && symbol.toUpperCase().endsWith(BLOCKED_SUFFIX)
}

function isDisallowedSymbol(symbol) {
  return isInvalidFiveCharSymbol(symbol) || hasBlockedSuffix(symbol) || (typeof symbol === 'string' && symbol.includes(HYPHEN))
}

// Extract market identifier from stock symbol
// e.g., "12.HK" -> "HK", "000100.SS" -> "SS", "AAPL" -> "US"
function extractMarket(symbol) {
  if (!symbol || typeof symbol !== 'string') return 'US'
  const dotIndex = symbol.lastIndexOf('.')
  if (dotIndex === -1) return 'US'
  const market = symbol.substring(dotIndex + 1).toUpperCase()
  return market || 'US'
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

// Find resistance zones: price zones with volume weight > current weight + 5%
function findResistanceZones(breakout, slots) {
  if (!breakout || !slots || slots.length === 0) return { upResist: null, downResist: null }

  const slotIdx = breakout.slotIdx
  if (slotIdx < 0 || slotIdx >= slots.length) return { upResist: null, downResist: null }

  const slot = slots[slotIdx]
  if (!slot || !slot.priceZones) return { upResist: null, downResist: null }

  const currentWeight = breakout.currentWeight
  const currentPrice = breakout.price
  const threshold = currentWeight + 0.05  // 5% higher

  // Find zones with volume weight > threshold, split by position relative to current price
  const upResistZones = []
  const downResistZones = []

  slot.priceZones.forEach(zone => {
    if (zone.volumeWeight > threshold) {
      const zoneMidPrice = (zone.minPrice + zone.maxPrice) / 2
      const zoneData = {
        price: zoneMidPrice,
        volumeWeight: zone.volumeWeight
      }

      if (zoneMidPrice > currentPrice) {
        upResistZones.push(zoneData)
      } else if (zoneMidPrice < currentPrice) {
        downResistZones.push(zoneData)
      }
    }
  })

  // Sort by highest weight first and take the strongest
  upResistZones.sort((a, b) => b.volumeWeight - a.volumeWeight)
  downResistZones.sort((a, b) => b.volumeWeight - a.volumeWeight)

  return {
    upResist: upResistZones.length > 0 ? upResistZones[0] : null,
    downResist: downResistZones.length > 0 ? downResistZones[0] : null
  }
}

// Check if a breakout has been closed (sell signal occurred after breakout date)
function isBreakoutClosed(breakoutDate, prices, smaPeriod) {
  if (!breakoutDate || !prices || prices.length === 0 || !smaPeriod) return false

  // Prices are in reverse chronological order, reverse for forward-time processing
  const reversedPrices = [...prices].reverse()

  // Calculate SMA for each date
  const dateToSMA = new Map()
  for (let i = 0; i < reversedPrices.length; i++) {
    if (i < smaPeriod - 1) {
      dateToSMA.set(reversedPrices[i].date, null)
    } else {
      const sum = reversedPrices.slice(i - smaPeriod + 1, i + 1).reduce((acc, p) => acc + p.close, 0)
      dateToSMA.set(reversedPrices[i].date, sum / smaPeriod)
    }
  }

  // Find the breakout index
  let breakoutIdx = -1
  for (let i = 0; i < reversedPrices.length; i++) {
    if (reversedPrices[i].date === breakoutDate) {
      breakoutIdx = i
      break
    }
  }

  if (breakoutIdx === -1) return false

  // Check for sell signal (SMA slope turning negative) after breakout
  for (let i = breakoutIdx + 1; i < reversedPrices.length; i++) {
    const currentDate = reversedPrices[i].date
    const prevDate = reversedPrices[i - 1].date

    const currentSMA = dateToSMA.get(currentDate)
    const prevSMA = dateToSMA.get(prevDate)

    if (currentSMA !== null && prevSMA !== null && currentSMA !== undefined && prevSMA !== undefined) {
      const slope = currentSMA - prevSMA
      if (slope < 0) {
        return true  // Sell signal found after breakout
      }
    }
  }

  return false  // No sell signal after breakout
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

    // Calculate total signals: closed trades = 1.0, open trades = 0.5
    const closedTrades = trades.filter(t => !t.isOpen)
    const openTrades = trades.filter(t => t.isOpen)
    const totalSignals = closedTrades.length + (openTrades.length * 0.5)

    results.push({ sma: period, pl: totalPL, totalSignals })

    // Only consider SMAs with >= 4 signals, then pick highest P/L
    if (totalSignals >= 4 && totalPL > bestPL) {
      bestPL = totalPL
      bestSMA = period
      bestTrades = trades
    }
  }

  // Calculate total signals for the selected best SMA
  const closedTradesForBest = bestTrades.filter(t => !t.isOpen)
  const openTradesForBest = bestTrades.filter(t => t.isOpen)
  const totalSignals = closedTradesForBest.length + (openTradesForBest.length * 0.5)

  return { period: bestSMA, pl: bestPL, totalSignals }
}

function BacktestResults({ onStockSelect, onVolumeSelect }) {
  const [symbols, setSymbols] = useState('')
  const [days, setDays] = useState('1825') // Default to 5Y
  const [loading, setLoading] = useState(false)
  const [loadingTopSymbols, setLoadingTopSymbols] = useState(false)
  const [loadingHKSymbols, setLoadingHKSymbols] = useState(false)
  const [error, setError] = useState(null)
  const [lastAddedKey, setLastAddedKey] = useState(null)
  const initialHydratedResultsRef = useRef(null)
  const [results, setResults] = useState(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return []

    try {
      const saved = localStorage.getItem(BACKTEST_RESULTS_KEY)
      if (!saved) return []

      const parsed = JSON.parse(saved)
      const normalized = normalizeCachedResults(parsed)
      initialHydratedResultsRef.current = normalized
      return normalized
    } catch (e) {
      console.error('Failed to parse cached backtest results:', e)
      return []
    }
  })
  const [stockHistory, setStockHistory] = useState([])
  const [scanQueue, setScanQueue] = useState(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return []
    try {
      const saved = localStorage.getItem(SCAN_QUEUE_KEY)
      if (!saved) return []
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed.queue) ? parsed.queue : []
    } catch (e) {
      console.error('Failed to parse cached scan queue:', e)
      return []
    }
  })
  const [isScanning, setIsScanning] = useState(false) // Always start paused on page load
  const [isPaused, setIsPaused] = useState(false)
  const [scanCompleted, setScanCompleted] = useState(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 0
    try {
      const saved = localStorage.getItem(SCAN_QUEUE_KEY)
      if (!saved) return 0
      const parsed = JSON.parse(saved)
      return typeof parsed.completed === 'number' ? parsed.completed : 0
    } catch (e) {
      return 0
    }
  })
  const [scanTotal, setScanTotal] = useState(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 0
    try {
      const saved = localStorage.getItem(SCAN_QUEUE_KEY)
      if (!saved) return 0
      const parsed = JSON.parse(saved)
      return typeof parsed.total === 'number' ? parsed.total : 0
    } catch (e) {
      return 0
    }
  })
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false)
  const [showRecentBreakoutsOnly, setShowRecentBreakoutsOnly] = useState(false)
  const [selectedMarkets, setSelectedMarkets] = useState([])
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [hasHydratedCache, setHasHydratedCache] = useState(() => initialHydratedResultsRef.current !== null)
  const activeScanSymbolRef = useRef(null)
  const importInputRef = useRef(null)

  // Hydrate cached backtest results after mount before enabling persistence
  useEffect(() => {
    if (hasHydratedCache) return
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      setHasHydratedCache(true)
      return
    }

    try {
      const savedResults = localStorage.getItem(BACKTEST_RESULTS_KEY)
      if (savedResults) {
        const parsed = JSON.parse(savedResults)
        const normalized = normalizeCachedResults(parsed)
        setResults(normalized)
        initialHydratedResultsRef.current = normalized
      }
    } catch (e) {
      console.error('Failed to load cached backtest results:', e)
    } finally {
      setHasHydratedCache(true)
    }
  }, [hasHydratedCache])

  const clearEntryData = (entry, status = 'pending', errorMsg = null) => ({
    ...entry,
    status,
    latestBreakout: null,
    latestPrice: null,
    priceData: null,
    optimalParams: null,
    optimalSMAs: null,
    marketChange: null,
    isRecentBreakout: false,
    recentBreakout: null,
    totalSignals: null,
    durationMs: entry.durationMs ?? null,
    error: errorMsg
  })

  const pruneDisallowedEntries = (currentEntries = []) => {
    const disallowed = new Set(
      currentEntries
        .filter(entry => isDisallowedSymbol(entry.symbol))
        .map(entry => entry.symbol)
    )

    if (disallowed.size === 0) return currentEntries

    setScanQueue(prev => prev.filter(symbol => !disallowed.has(symbol)))

    return currentEntries.filter(entry => !disallowed.has(entry.symbol))
  }

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

  // Persist backtest results to localStorage (selective caching to save space)
  useEffect(() => {
    if (!hasHydratedCache) return

    try {
      // Only cache full details for bookmarked or recent breakout rows
      // Others get minimal cache (symbol, status, lastScanAt, bookmarked)
      const selectiveResults = results.map(result => {
        const { priceData, ...rest } = result

        // Full cache for: bookmarked OR recent breakout
        const shouldCacheFull = result.bookmarked || result.isRecentBreakout

        if (shouldCacheFull) {
          return rest // Keep all fields except priceData
        }

        // Slim cache: only essential fields for non-important results
        return {
          symbol: result.symbol,
          days: result.days,
          period: result.period,
          status: result.status || 'pending',
          lastScanAt: result.lastScanAt || null,
          bookmarked: result.bookmarked || false,
          error: result.error || null
        }
      })

      localStorage.setItem(BACKTEST_RESULTS_KEY, JSON.stringify(selectiveResults))
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded. Consider clearing old results.')
        // Optionally clear old data automatically
        // localStorage.clear()
      } else {
        console.error('Failed to cache backtest results:', e)
      }
    }
  }, [results, hasHydratedCache])

  // Persist scan queue and progress to localStorage
  useEffect(() => {
    if (!hasHydratedCache) return

    try {
      const queueData = {
        queue: scanQueue,
        isScanning,
        completed: scanCompleted,
        total: scanTotal
      }
      localStorage.setItem(SCAN_QUEUE_KEY, JSON.stringify(queueData))
    } catch (e) {
      console.error('Failed to cache scan queue:', e)
    }
  }, [scanQueue, isScanning, scanCompleted, scanTotal, hasHydratedCache])

  // Auto-scroll to newly added entry and apply blink effect
  useEffect(() => {
    if (!lastAddedKey) return

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      const scrollTimer = setTimeout(() => {
        const element = document.querySelector(`[data-entry-key="${lastAddedKey}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'auto', block: 'center' })
          // Add blink animation class
          element.classList.add('blink-highlight')
        }
      }, 200)

      // Remove blink animation and clear state after 3 seconds
      const blinkTimer = setTimeout(() => {
        const element = document.querySelector(`[data-entry-key="${lastAddedKey}"]`)
        if (element) {
          element.classList.remove('blink-highlight')
        }
        setLastAddedKey(null)
      }, 3300)

      return () => {
        clearTimeout(scrollTimer)
        clearTimeout(blinkTimer)
      }
    })

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [lastAddedKey])

  const ensureEntries = (symbolList) => {
    if (!Array.isArray(symbolList) || symbolList.length === 0) {
      return
    }

    const allowedSymbols = symbolList.filter(symbol => !isDisallowedSymbol(symbol))
    if (allowedSymbols.length === 0) {
      return
    }

    // Calculate existing symbols BEFORE setResults using current results state
    const existingKeys = new Set(
      results
        .filter(r => r.days != null)
        .map(r => getEntryKey(r.symbol, r.days))
    )
    const existingSymbols = allowedSymbols.filter(symbol =>
      existingKeys.has(getEntryKey(symbol, days))
    )

    let firstNewKey = null

    setResults(prev => {
      // Use symbol+days combination as unique key to allow same stock with different periods
      // Filter out entries without days field to handle old cached data
      const existingKeys = new Set(
        prev
          .filter(r => r.days != null)
          .map(r => getEntryKey(r.symbol, r.days))
      )

      const newEntries = allowedSymbols
        .filter(Boolean)
        .filter(symbol => !existingKeys.has(getEntryKey(symbol, days)))
        .map(symbol => {
          const key = getEntryKey(symbol, days)
          if (!firstNewKey) {
            firstNewKey = key
          }
          return {
            symbol,
            status: 'pending',
            latestBreakout: null,
            latestPrice: null,
            priceData: null,
            optimalParams: null,
            optimalSMAs: null,
            days,
            period: formatPeriod(days),  // Add period display format
            isRecentBreakout: false,
            recentBreakout: null,
            totalSignals: null,
            error: null,
            bookmarked: false,
            marketChange: null
          }
        })

      if (newEntries.length === 0) return prev

      return [...prev, ...newEntries]
    })

    // Set the first new entry as last added for auto-scroll (only if new entries were added)
    // Use setTimeout to ensure DOM has updated
    if (firstNewKey) {
      setTimeout(() => {
        setLastAddedKey(firstNewKey)
      }, 150)
    } else if (existingSymbols.length > 0) {
      // Stock already exists - scroll to the existing entry
      const existingEntry = results.find(r =>
        existingSymbols.includes(r.symbol) && r.days === days
      )
      if (existingEntry) {
        const existingKey = getEntryKey(existingEntry.symbol, existingEntry.days)
        setTimeout(() => {
          setLastAddedKey(existingKey)
        }, 100)
      }
    }
  }

  const eraseResult = (symbol) => {
    setResults(prev => prev.map(entry => (
      entry.symbol === symbol ? clearEntryData(entry) : entry
    )))
  }

  const eraseAllResults = () => {
    setResults(prev => prev.map(entry => clearEntryData(entry)))
  }

  const clearCachedResults = () => {
    try {
      localStorage.removeItem(BACKTEST_RESULTS_KEY)
      localStorage.removeItem(SCAN_QUEUE_KEY)
    } catch (e) {
      console.error('Failed to clear cached results:', e)
    }
    setResults([])
    setScanQueue([])
    setScanTotal(0)
    setScanCompleted(0)
    setIsScanning(false)
    setIsPaused(false)
  }

  const exportResults = () => {
    const dataToExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      days,
      results: results.map(result => ({
        symbol: result.symbol,
        status: result.status,
        latestBreakout: result.latestBreakout,
        latestPrice: result.latestPrice,
        optimalParams: result.optimalParams,
        optimalSMAs: result.optimalSMAs,
        marketChange: result.marketChange,
        durationMs: result.durationMs,
        days: result.days,
        isRecentBreakout: result.isRecentBreakout,
        recentBreakout: result.recentBreakout,
        totalSignals: result.totalSignals,
        error: result.error,
        bookmarked: result.bookmarked,
        lastScanAt: result.lastScanAt
      }))
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backtest-results-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importResults = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result)
        if (!imported.results || !Array.isArray(imported.results)) {
          setError('Invalid import file format')
          return
        }

        const importedResults = imported.results.map(result => ({
          ...result,
          bookmarked: Boolean(result.bookmarked),
          status: result.status || 'pending'
        }))

        setResults(importedResults)
        setError(null)
      } catch (err) {
        console.error('Failed to import results:', err)
        setError('Failed to import results. Please check the file format.')
      }
    }
    reader.readAsText(file)

    // Reset input so same file can be imported again
    if (importInputRef.current) {
      importInputRef.current.value = ''
    }
  }

  const runBacktestForSymbol = async (symbol, entryDays = null) => {
    // Use provided entryDays or current days state
    const targetDays = entryDays || days

    ensureEntries([symbol])
    setResults(prev => prev.map(entry => (
      entry.symbol === symbol && entry.days === targetDays
        ? { ...entry, status: 'loading', error: null, durationMs: null }
        : entry
    )))

    const startTime = Date.now()
    try {
      const cacheKey = symbol
      let cachedData = apiCache.get(cacheKey, targetDays)
      let priceData

      if (!cachedData) {
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: { symbol, days: targetDays }
        })
        apiCache.set(cacheKey, targetDays, response.data)
        priceData = response.data.prices
      } else {
        priceData = cachedData.prices
      }

      if (!priceData || priceData.length === 0) {
        throw new Error('No price data found')
      }

      // Skip stocks with insufficient data for SMA calculation
      if (priceData.length < 250) {
        throw new Error(`Insufficient data: only ${priceData.length} days (need 250+)`)
      }

      // Test all parameter combinations to find one with >= 4 signals
      const paramCombinations = [
        { breakoutThreshold: 0.05, lookbackZones: 3, resetThreshold: 0.025, timeoutSlots: 5 },
        { breakoutThreshold: 0.05, lookbackZones: 5, resetThreshold: 0.025, timeoutSlots: 5 },
        { breakoutThreshold: 0.06, lookbackZones: 4, resetThreshold: 0.03, timeoutSlots: 5 },
        { breakoutThreshold: 0.06, lookbackZones: 5, resetThreshold: 0.03, timeoutSlots: 5 },
        { breakoutThreshold: 0.06, lookbackZones: 6, resetThreshold: 0.03, timeoutSlots: 5 },
        { breakoutThreshold: 0.07, lookbackZones: 5, resetThreshold: 0.035, timeoutSlots: 5 },
        { breakoutThreshold: 0.08, lookbackZones: 5, resetThreshold: 0.04, timeoutSlots: 7 },
      ]

      let bestResult = null
      let bestPL = -Infinity

      for (const params of paramCombinations) {
        const { slots, breakouts } = calculateVolPrfV2Breakouts(priceData, params)

        if (breakouts.length === 0) {
          continue
        }

        const smaResult = optimizeSMAParams(priceData, slots, breakouts)

        // Only consider combinations with >= 4 signals
        if (smaResult.totalSignals >= 4) {
          if (smaResult.pl > bestPL) {
            bestPL = smaResult.pl
            bestResult = {
              params,
              slots,
              breakouts,
              smaResult
            }
          }
        }
      }

      // If no combination produced >= 4 signals, throw error
      if (!bestResult) {
        throw new Error('Excluded: fewer than 4 total signals')
      }

      const { params: optimalParams, breakouts, slots, smaResult: optimalSMAs } = bestResult

      const recentBreakouts = getRecentBreakouts(breakouts, 10)
      let latestBreakout = getLatestBreakout(breakouts)
      const latestRecentBreakout = getLatestBreakout(recentBreakouts)

      if (!latestBreakout) {
        throw new Error('No breakout detected')
      }

      // Find resistance zones before potentially nullifying latestBreakout
      const { upResist, downResist } = findResistanceZones(latestBreakout, slots)

      // Check if the latest breakout has been closed by a sell signal
      // Store original breakout for reference, but hide break price if closed
      const originalBreakout = latestBreakout
      const breakoutClosed = isBreakoutClosed(latestBreakout.date, priceData, optimalSMAs.period)
      if (breakoutClosed) {
        latestBreakout = null  // This hides the break price column only
      }

      // Determine if data is in chronological or reverse chronological order
      const firstDate = new Date(priceData[0].date)
      const lastDate = new Date(priceData[priceData.length - 1].date)

      let latestPrice
      if (firstDate < lastDate) {
        // Chronological order: first is oldest, last is newest
        latestPrice = priceData[priceData.length - 1].close
      } else {
        // Reverse chronological order: first is newest, last is oldest
        latestPrice = priceData[0].close
      }

      const marketChange = computeMarketChange(priceData)
      const durationMs = Date.now() - startTime

      const completedEntry = {
        symbol,
        status: 'completed',
        totalSignals: optimalSMAs.totalSignals,
        latestBreakout,
        originalBreakout,  // Always has the breakout data, even if closed
        breakoutClosed,
        latestPrice,
        priceData,
        optimalParams,
        optimalSMAs,
        marketChange,
        durationMs,
        days: targetDays,
        period: formatPeriod(targetDays),  // Add period display format
        isRecentBreakout: Boolean(latestRecentBreakout),
        recentBreakout: latestRecentBreakout,
        upResist,
        downResist,
        lastScanAt: new Date().toISOString(),
        error: null
      }

      setResults(prev => prev.map(entry => (
        entry.symbol === symbol && entry.days === targetDays ? completedEntry : entry
      )))
    } catch (err) {
      console.error(`Error processing ${symbol}:`, err)
      setResults(prev => prev.map(entry => (
        entry.symbol === symbol && entry.days === targetDays
          ? clearEntryData({ ...entry, durationMs: Date.now() - startTime }, 'error', err.message || 'Failed to run backtest')
          : entry
      )))
    }
  }

  const queueSymbols = (symbolList, { startScan = true } = {}) => {
    if (!Array.isArray(symbolList) || symbolList.length === 0) return

    const allowedSymbols = symbolList.filter(symbol => !isDisallowedSymbol(symbol))
    if (allowedSymbols.length === 0) return

    ensureEntries(allowedSymbols)

    if (startScan) {
      // Mark the entries with current days as 'queued' so scanner knows which ones to process
      setResults(prev => prev.map(entry => {
        if (allowedSymbols.includes(entry.symbol) && entry.days === days && entry.status === 'pending') {
          return { ...entry, status: 'queued' }
        }
        return entry
      }))

      setScanQueue(prev => {
        const existing = new Set(prev)
        const merged = [...prev, ...allowedSymbols.filter(symbol => !existing.has(symbol))]
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
        .filter(symbol => !/^4\d{3}\.HK$/.test(symbol))
        .filter(symbol => !isDisallowedSymbol(symbol))

      ensureEntries(normalized)
    } catch (err) {
      console.error('Failed to load top market cap symbols', err)
      setError('Failed to load top market cap symbols')
    } finally {
      setLoadingTopSymbols(false)
    }
  }

  const loadTopHKSymbols = async () => {
    if (loadingHKSymbols) return
    setLoadingHKSymbols(true)
    try {
      const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), {
        params: { limit: 500, exchange: 'HKG' }
      })

      console.log('[HK500] API Response:', response.data)

      const payload = response.data
      const symbols = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.symbols)
          ? payload.symbols
          : []

      console.log('[HK500] Raw symbols count:', symbols.length)
      console.log('[HK500] First 10 symbols:', symbols.slice(0, 10))

      const normalized = symbols
        .map(item => (typeof item === 'string' ? item : item?.symbol))
        .filter(Boolean)
        .map(symbol => symbol.toUpperCase())
        .filter(symbol => !isDisallowedSymbol(symbol))

      console.log('[HK500] Normalized symbols count:', normalized.length)
      console.log('[HK500] First 10 normalized:', normalized.slice(0, 10))

      if (normalized.length === 0) {
        setError('No HK stocks returned from API. The exchange parameter might be incorrect.')
      } else {
        ensureEntries(normalized)
      }
    } catch (err) {
      console.error('Failed to load top HK market cap symbols', err)
      setError('Failed to load top HK market cap symbols: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoadingHKSymbols(false)
    }
  }

  const runBacktest = (symbolOverride = null) => {
    const targetSymbols = symbolOverride ?? symbols
    const stockList = parseStockSymbols(targetSymbols).filter(symbol => !isDisallowedSymbol(symbol))

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

    setResults(prev => pruneDisallowedEntries(prev))

    const pendingSymbols = pruneDisallowedEntries(normalizedResults)
      .filter(entry => entry.status !== 'completed')
      .map(entry => entry.symbol)

    if (pendingSymbols.length === 0) return

    setScanQueue(pendingSymbols)
    setScanTotal(pendingSymbols.length)
    setScanCompleted(0)
    setIsPaused(false)
    setIsScanning(true)
  }

  const forceScanAll = () => {
    if (normalizedResults.length === 0) return

    setResults(prev => pruneDisallowedEntries(prev))

    const allSymbols = pruneDisallowedEntries(normalizedResults)
      .map(entry => entry.symbol)

    if (allSymbols.length === 0) return

    // Clear all results to pending state before rescanning
    setResults(prev => prev.map(entry => clearEntryData(entry)))

    setScanQueue(allSymbols)
    setScanTotal(allSymbols.length)
    setScanCompleted(0)
    setIsPaused(false)
    setIsScanning(true)
  }

  const toggleBookmark = (symbol, entryDays) => {
    setResults(prev => prev.map(entry => (
      entry.symbol === symbol && entry.days === entryDays ? { ...entry, bookmarked: !entry.bookmarked } : entry
    )))
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

    // Find the entry to get its days value (find first queued entry, then fall back to pending/loading)
    const entry = results.find(r => r.symbol === currentSymbol && r.status === 'queued') ||
                  results.find(r => r.symbol === currentSymbol && (r.status === 'pending' || r.status === 'loading'))
    if (!entry) return  // Entry might have been removed

    activeScanSymbolRef.current = currentSymbol
    setLoading(true)

    ; (async () => {
      await runBacktestForSymbol(currentSymbol, entry.days)
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

  const formatDuration = (ms) => {
    if (typeof ms !== 'number' || Number.isNaN(ms)) return '—'
    if (ms < 1000) return `${ms.toFixed(0)} ms`
    const totalSeconds = ms / 1000
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.round(totalSeconds % 60)
    const paddedSeconds = seconds.toString().padStart(2, '0')
    return `${minutes}:${paddedSeconds}`
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

  const formatLastScanTime = (isoString) => {
    if (!isoString) return '—'
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '—'

    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${month}-${day} ${hours}:${minutes}`
  }

  const isLastScanOutdated = (isoString) => {
    if (!isoString) return false
    const scanDate = new Date(isoString)
    if (isNaN(scanDate.getTime())) return false

    const now = new Date()
    const diffDays = (now - scanDate) / (1000 * 60 * 60 * 24)
    return diffDays > 7
  }

  const normalizedResults = results.map(entry => {
    const computedMarketChange = typeof entry.marketChange === 'number'
      ? entry.marketChange
      : computeMarketChange(entry.priceData)

    return {
      status: 'completed',
      bookmarked: Boolean(entry.bookmarked),
      marketChange: computedMarketChange,
      market: extractMarket(entry.symbol),
      ...entry
    }
  })

  // Get unique markets from all results
  const availableMarkets = Array.from(new Set(normalizedResults.map(r => r.market))).sort()

  // Get unique periods from all results
  const availablePeriods = Array.from(new Set(normalizedResults.map(r => r.period).filter(Boolean))).sort()

  const filteredResults = normalizedResults.filter(result => {
    // Exclude any entries with errors
    if (result.error) return false
    if (showBookmarksOnly && !result.bookmarked) return false
    if (showRecentBreakoutsOnly && !result.isRecentBreakout) return false
    if (selectedMarkets.length > 0 && !selectedMarkets.includes(result.market)) return false
    if (selectedPeriods.length > 0 && !selectedPeriods.includes(result.period)) return false

    // Support multiple search terms separated by comma or space
    if (searchFilter) {
      const searchTerms = searchFilter
        .split(/[,\s]+/)
        .map(term => term.trim().toUpperCase())
        .filter(term => term.length > 0)

      if (searchTerms.length > 0) {
        const symbolUpper = result.symbol.toUpperCase()
        const matchesAnyTerm = searchTerms.some(term => symbolUpper === term)
        if (!matchesAnyTerm) return false
      }
    }

    return true
  })

  const toggleMarketFilter = (market) => {
    setSelectedMarkets(prev => {
      if (prev.includes(market)) {
        return prev.filter(m => m !== market)
      } else {
        return [...prev, market]
      }
    })
  }

  const togglePeriodFilter = (period) => {
    setSelectedPeriods(prev => {
      if (prev.includes(period)) {
        return prev.filter(p => p !== period)
      } else {
        return [...prev, period]
      }
    })
  }

  const scanVisible = () => {
    const visibleSymbols = sortedResults.map(r => r.symbol)
    if (visibleSymbols.length === 0) return

    // Clear existing queue and scan only visible stocks
    ensureEntries(visibleSymbols)
    setScanQueue(visibleSymbols)
    setScanTotal(visibleSymbols.length)
    setScanCompleted(0)
    setIsPaused(false)
    setIsScanning(true)
  }

  const eraseVisible = () => {
    const visibleSymbols = new Set(sortedResults.map(r => r.symbol))
    setResults(prev => prev.map(entry =>
      visibleSymbols.has(entry.symbol) ? clearEntryData(entry) : entry
    ))
  }

  const removeVisible = () => {
    const visibleSymbols = new Set(sortedResults.map(r => r.symbol))
    setResults(prev => prev.filter(entry => !visibleSymbols.has(entry.symbol)))
    setScanQueue(prev => prev.filter(symbol => !visibleSymbols.has(symbol)))
  }

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortableValue = (entry, key) => {
    switch (key) {
      case 'symbol':
        return entry.symbol ?? ''
      case 'status':
        return entry.status ?? ''
      case 'dataPoints':
        return entry.priceData?.length ?? -Infinity
      case 'daysAgo':
        return entry.originalBreakout ? getDaysAgo(entry.originalBreakout.date) : Infinity
      case 'breakoutPrice':
        return entry.latestBreakout?.price ?? -Infinity
      case 'currentPrice':
        // Sort by absolute value of percentage change from breakout price (value in brackets)
        if (entry.originalBreakout && entry.latestPrice) {
          return Math.abs(((entry.latestPrice - entry.originalBreakout.price) / entry.originalBreakout.price) * 100)
        }
        return -Infinity
      case 'volWeight':
        return entry.originalBreakout?.currentWeight ?? -Infinity
      case 'upResist':
        return entry.upResist?.volumeWeight ?? -Infinity
      case 'downResist':
        return entry.downResist?.volumeWeight ?? -Infinity
      case 'diff':
        return entry.originalBreakout?.weightDiff ?? -Infinity
      case 'totalSignals':
        return entry.totalSignals ?? -Infinity
      case 'pl':
        return entry.optimalSMAs?.pl ?? -Infinity
      case 'marketChange':
        return typeof entry.marketChange === 'number' ? entry.marketChange : -Infinity
      case 'bookmark':
        return entry.bookmarked ? 1 : 0
      default:
        return 0
    }
  }

  // Only sort when a sort key is set, otherwise preserve insertion order
  const sortedResults = !sortConfig.key ? filteredResults : [...filteredResults].sort((a, b) => {
    const aVal = getSortableValue(a, sortConfig.key)
    const bVal = getSortableValue(b, sortConfig.key)
    if (aVal === bVal) return 0
    const direction = sortConfig.direction === 'asc' ? 1 : -1
    return aVal > bVal ? direction : -direction
  })

  const renderSortIndicator = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-4 h-4 inline ml-1 text-slate-500" />
    return sortConfig.direction === 'asc'
      ? <span className="ml-1 text-slate-300">↑</span>
      : <span className="ml-1 text-slate-300">↓</span>
  }

  const completedResults = normalizedResults.filter(r => r.status === 'completed' && r.latestBreakout)
  const recentBreakoutCount = completedResults.filter(r => r.isRecentBreakout).length
  const totalScanDurationMs = normalizedResults.reduce((sum, entry) =>
    typeof entry.durationMs === 'number' ? sum + entry.durationMs : sum
  , 0)
  const totalDurationDisplay = totalScanDurationMs > 0 ? formatDuration(totalScanDurationMs) : '—'

  // Show loading message while hydrating cache
  if (!hasHydratedCache) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <p className="text-slate-300">Loading cached results...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes blinkHighlight {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(168, 85, 247, 0.3); }
        }
        .blink-highlight {
          animation: blinkHighlight 1s ease-in-out 3;
        }
      `}</style>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6 rounded-lg border border-purple-700">
        <h2 className="text-2xl font-bold text-white mb-2">Vol Prf V2 + SMA Backtest Scanner</h2>
        <p className="text-slate-300">Scan multiple stocks for recent Volume Profile V2 breakouts (last 10 days)</p>
        <p className="text-xs text-slate-400 mt-1">
          Backtest results and bookmarks are cached locally, so your queued or completed scans reload automatically after refresh.
        </p>
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
              <option value="1095">3 Years</option>
              <option value="1825">5 Years</option>
            </select>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <button
              onClick={() => runBacktest()}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              title="Scan entered stock symbols"
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
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              title="Load top 2000 US market cap symbols"
            >
              {loadingTopSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              <span className="text-sm font-medium">US2000</span>
            </button>
            <button
              onClick={loadTopHKSymbols}
              disabled={loadingHKSymbols || loading}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              title="Load top 500 Hong Kong market cap symbols"
            >
              {loadingHKSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              <span className="text-sm font-medium">HK500</span>
            </button>
            <button
              onClick={scanAllQueued}
              disabled={results.length === 0 || isScanning}
              className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              title="Scan only stocks without backtest results"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
            <button
              onClick={forceScanAll}
              disabled={results.length === 0 || isScanning}
              className="p-2 bg-slate-700 text-red-500 rounded-lg hover:bg-slate-600 hover:text-red-400 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              title="Force rescan all stocks (clears existing results)"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            <button
              onClick={togglePauseResume}
              disabled={!isScanning}
              className="p-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              title={isPaused ? 'Resume scanning' : 'Pause scanning'}
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={loading}
              className="p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              title="Import backtest results from JSON file"
            >
              <Upload className="w-5 h-5" />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={importResults}
              className="hidden"
            />
            {results.length > 0 && (
              <>
                <button
                  onClick={eraseAllResults}
                  disabled={loading}
                  className="p-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                  title="Erase all backtest results"
                >
                  <Eraser className="w-5 h-5" />
                </button>
                <button
                  onClick={clearCachedResults}
                  disabled={loading}
                  className="p-2 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                  title="Remove cached backtests from storage"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={exportResults}
                  disabled={loading}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                  title="Export backtest results to JSON file"
                >
                  <Download className="w-5 h-5" />
                </button>
              </>
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
                <div>Total Duration: {totalDurationDisplay}</div>
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
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-100">Breakout Signals</h3>
                {sortedResults.length > 0 && (
                  <div className="flex items-center gap-2 border-l border-slate-600 pl-3">
                    <span className="text-xs text-slate-400">{sortedResults.length} visible:</span>
                    <button
                      onClick={scanVisible}
                      disabled={isScanning}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Scan all visible stocks"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={eraseVisible}
                      disabled={isScanning}
                      className="p-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Erase backtest results for all visible stocks"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={removeVisible}
                      disabled={isScanning}
                      className="p-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Remove all visible stocks from table"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="AAPL, 2628..."
                    className="pl-9 pr-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400 text-sm w-48"
                  />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowBookmarksOnly(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${showBookmarksOnly ? 'border-amber-500 text-amber-200 bg-amber-900/30' : 'border-slate-600 text-slate-200 hover:bg-slate-700/50'}`}
                >
                  {showBookmarksOnly ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  {showBookmarksOnly ? 'Showing Bookmarks' : 'Filter Bookmarks'}
                </button>
                <button
                  onClick={() => setShowRecentBreakoutsOnly(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${showRecentBreakoutsOnly ? 'border-green-500 text-green-200 bg-green-900/30' : 'border-slate-600 text-slate-200 hover:bg-slate-700/50'}`}
                >
                  <Filter className="w-4 h-4" />
                  {showRecentBreakoutsOnly ? 'Showing Recent (≤10d)' : 'Filter Recent Breakouts'}
                </button>
                {availableMarkets.length > 0 && (
                  <div className="flex items-center gap-2 border border-slate-600 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-300">Market:</span>
                    {availableMarkets.map(market => (
                      <button
                        key={market}
                        onClick={() => toggleMarketFilter(market)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          selectedMarkets.includes(market)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {market}
                      </button>
                    ))}
                  </div>
                )}
                {availablePeriods.length > 0 && (
                  <div className="flex items-center gap-2 border border-slate-600 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-300">Period:</span>
                    {availablePeriods.map(period => (
                      <button
                        key={period}
                        onClick={() => togglePeriodFilter(period)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          selectedPeriods.includes(period)
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="max-h-[780px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-900 sticky top-0 z-10">
                  <tr>
                    <th onClick={() => handleSort('bookmark')} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Click to bookmark stocks for quick filtering">
                      <span className="flex items-center gap-1">
                        <Bookmark className="w-4 h-4" />
                        {renderSortIndicator('bookmark')}
                      </span>
                    </th>
                    <th onClick={() => handleSort('symbol')} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Stock ticker symbol">Symbol {renderSortIndicator('symbol')}</th>
                    <th onClick={() => handleSort('period')} className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Analysis period (3M, 6M, 1Y, 2Y, 3Y, 5Y)">
                      <span className="inline-flex items-center justify-center gap-1">
                        <Clock3 className="w-4 h-4" aria-hidden="true" />
                        <span className="sr-only">Period</span>
                        {renderSortIndicator('period')}
                      </span>
                    </th>
                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Backtest scan status: pending, loading, completed, or error">Status {renderSortIndicator('status')}</th>
                    <th onClick={() => handleSort('dataPoints')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Number of data points (trading days) tested in backtest">Days {renderSortIndicator('dataPoints')}</th>
                    <th onClick={() => handleSort('daysAgo')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Number of days since the most recent breakout signal">Days Ago {renderSortIndicator('daysAgo')}</th>
                    <th onClick={() => handleSort('breakoutPrice')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Stock price at the most recent breakout point">BrkPx {renderSortIndicator('breakoutPrice')}</th>
                    <th onClick={() => handleSort('currentPrice')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Current stock price with % change from breakout price">Current Price {renderSortIndicator('currentPrice')}</th>
                    <th onClick={() => handleSort('volWeight')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Volume weight % at current price zone (lower = less resistance)">Vol% {renderSortIndicator('volWeight')}</th>
                    <th onClick={() => handleSort('upResist')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Price zones ABOVE breakout with volume weight >5% higher than current (strongest resistance)">Up resist {renderSortIndicator('upResist')}</th>
                    <th onClick={() => handleSort('downResist')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Price zones BELOW breakout with volume weight >5% higher than current (strongest support)">Down resist {renderSortIndicator('downResist')}</th>
                    <th onClick={() => handleSort('diff')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Breakout strength: difference between resistance volume and current volume weight (higher = stronger breakout)">Diff {renderSortIndicator('diff')}</th>
                    <th onClick={() => handleSort('totalSignals')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Number of trading signals generated by the backtest (closed trades = 1.0, open trades = 0.5)">
                      <span className="flex items-center gap-1 justify-end">
                        <Hash className="w-4 h-4" />
                        {renderSortIndicator('totalSignals')}
                      </span>
                    </th>
                    <th onClick={() => handleSort('pl')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Profit/Loss % from the Vol Prf V2 + SMA trading strategy">P/L {renderSortIndicator('pl')}</th>
                    <th onClick={() => handleSort('marketChange')} className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase cursor-pointer select-none" title="Buy-and-hold % change over the entire backtest period (oldest to newest price)">Mkt% {renderSortIndicator('marketChange')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase" title="Optimized parameters: Th=Breakout Threshold %, LB=Lookback Zones, SMA=SMA Period">Optimal Params</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase" title="Timestamp of when this backtest was last run (red if >7 days old)">Last Scan</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase" title="Actions: Load in Volume tab, Rescan, Erase results, Remove from table">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-slate-700">
                  {sortedResults.map((result, index) => {
                    const hasBreakout = Boolean(result.latestBreakout)
                    const hasData = Boolean(result.originalBreakout)  // Has breakout data (may be closed)
                    const daysAgo = hasData ? getDaysAgo(result.originalBreakout.date) : null
                    const priceChange = hasData
                      ? ((result.latestPrice - result.originalBreakout.price) / result.originalBreakout.price * 100)
                      : null
                    const isWithinLast10Days = hasData && daysAgo <= 10
                    const status = result.status || (hasData ? 'completed' : 'pending')

                    return (
                      <tr
                        key={index}
                        data-entry-key={getEntryKey(result.symbol, result.days)}
                        onClick={() => hasData && onStockSelect && onStockSelect(result.symbol, { ...result.optimalParams, smaPeriods: [result.optimalSMAs?.period], days: result.days })}
                        className={`transition-colors ${hasData ? 'hover:bg-slate-700 cursor-pointer' : 'opacity-75'} ${isWithinLast10Days ? 'bg-blue-900/20 hover:bg-blue-800/30' : ''}`}
                        title={hasData ? (result.breakoutClosed ? 'Click to view (breakout closed by sell signal)' : 'Click to view in Technical Analysis with optimized parameters') : 'Pending scan'}
                      >
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBookmark(result.symbol, result.days)
                            }}
                            className={`p-1 rounded transition-colors ${result.bookmarked ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-900/30' : 'text-slate-400 hover:text-amber-200 hover:bg-slate-700/70'}`}
                            title={result.bookmarked ? 'Remove bookmark' : 'Bookmark stock'}
                          >
                            {result.bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-blue-400">
                          {result.symbol}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className="px-2 py-1 rounded bg-purple-900/50 text-purple-200 text-xs font-semibold">
                            {result.period || formatPeriod(result.days)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-sm max-w-[80px]">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${status === 'completed' ? 'bg-emerald-900/50 text-emerald-200' : status === 'loading' ? 'bg-amber-900/40 text-amber-200' : status === 'queued' ? 'bg-blue-900/40 text-blue-200' : status === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-slate-700 text-slate-200'}`}
                            title={result.error || undefined}
                          >
                            {status === 'completed' ? 'Done' : status === 'loading' ? 'Scanning' : status === 'queued' ? 'Queued' : status === 'error' ? 'Error' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {result.priceData?.length > 0 ? (
                            <span className="font-medium">{result.priceData.length}</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasData ? (
                            <span
                              className={`px-2 py-1 rounded ${daysAgo <= 3 ? 'bg-green-900/50 text-green-300' : daysAgo <= 7 ? 'bg-yellow-900/50 text-yellow-300' : daysAgo <= 10 ? 'bg-blue-900/50 text-blue-200' : 'bg-slate-700 text-slate-300'}`}
                              title={result.priceData?.length > 0 ? `Breakout: ${formatDate(result.originalBreakout.date)}\nLast data: ${result.priceData[0].date}` : formatDate(result.originalBreakout.date)}
                            >
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
                          {hasData ? (
                            <span className={priceChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {formatCurrency(result.latestPrice)}
                              <span className="text-xs ml-1">({formatPercent(priceChange)})</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasData ? `${(result.originalBreakout.currentWeight * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-400 text-right font-medium">
                          {result.upResist ? (
                            <div className="whitespace-nowrap">
                              {formatCurrency(result.upResist.price)}
                              <span className="text-slate-400 ml-1">
                                ({(result.upResist.volumeWeight * 100).toFixed(1)}%)
                              </span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-400 text-right font-medium">
                          {result.downResist ? (
                            <div className="whitespace-nowrap">
                              {formatCurrency(result.downResist.price)}
                              <span className="text-slate-400 ml-1">
                                ({(result.downResist.volumeWeight * 100).toFixed(1)}%)
                              </span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-400 text-right font-semibold">
                          {hasData ? `${(result.originalBreakout.weightDiff * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {hasData ? result.totalSignals : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          {hasData ? (
                            <span className={
                              typeof result.marketChange === 'number' && result.optimalSMAs.pl > result.marketChange
                                ? 'text-blue-400'
                                : result.optimalSMAs.pl >= 0
                                  ? 'text-green-400'
                                  : 'text-red-400'
                            }>
                              {formatPercent(result.optimalSMAs.pl)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          {typeof result.marketChange === 'number' ? (
                            <span className={result.marketChange >= 0 ? 'text-green-300' : 'text-red-300'}>
                              {formatPercent(result.marketChange)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 text-left">
                          {hasData ? (
                            <div className="whitespace-nowrap">
                              Th:{(result.optimalParams.breakoutThreshold * 100).toFixed(0)}% LB:{result.optimalParams.lookbackZones} <span className="text-blue-400 font-medium">SMA:{result.optimalSMAs.period}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.lastScanAt ? (
                            <span
                              className={`text-xs ${isLastScanOutdated(result.lastScanAt) ? 'text-red-400' : 'text-slate-400'}`}
                              title={new Date(result.lastScanAt).toLocaleString()}
                            >
                              {formatLastScanTime(result.lastScanAt)}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {onVolumeSelect && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onVolumeSelect(result.symbol)
                              }}
                              className="p-1 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 rounded transition-colors mr-1"
                              title="Load in Volume Screening"
                            >
                              <Waves className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              scanSingle(result.symbol)
                            }}
                            className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20 rounded transition-colors mr-1"
                            title="Scan this stock"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              eraseResult(result.symbol)
                            }}
                            className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors mr-1"
                            title="Erase backtest result"
                          >
                            <Eraser className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation() // Prevent row click
                              setResults(prevResults => prevResults.filter(r => r.symbol !== result.symbol))
                              setScanQueue(prev => prev.filter(symbol => symbol !== result.symbol))
                            }}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
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
          </div>

          {/* Legend */}
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h4 className="text-sm font-semibold text-slate-300 mb-2">Legend</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-400">
              <div><span className="font-semibold">Vol Weight:</span> Current price zone volume %</div>
              <div><span className="font-semibold">Resist Vol:</span> Max volume zone below</div>
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
