import { useState } from 'react'
import axios from 'axios'
import { Search, Loader2, TrendingUp, TrendingDown, DollarSign, Target, Percent, AlertCircle } from 'lucide-react'
import { apiCache } from '../utils/apiCache'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Helper function to parse multiple stock symbols from input
function parseStockSymbols(input) {
  if (!input || !input.trim()) return []

  // Split by comma or space
  const symbols = input.split(/[,\s]+/).filter(s => s.trim())

  // Convert to uppercase and filter valid symbols
  return symbols.map(s => s.trim().toUpperCase()).filter(s => s.length > 0)
}

// Calculate Vol Prf V2 breakouts (extracted from PriceChart.jsx logic)
function calculateVolPrfV2Breakouts(prices) {
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

  // Detect breakouts with state-based logic
  const breakouts = []
  const BREAKOUT_THRESHOLD = 0.06
  const RESET_THRESHOLD = 0.03
  const TIMEOUT_SLOTS = 5

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
    if (isInBreakout && i - breakoutSlotIdx >= TIMEOUT_SLOTS) {
      isInBreakout = false
      breakoutZoneWeight = 0
      breakoutSlotIdx = -1
    }

    // Check reset condition
    if (isInBreakout && currentWeight >= breakoutZoneWeight + RESET_THRESHOLD) {
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

      // Find max volume zone within 5 zones below
      const lookbackDepth = Math.min(5, currentZoneIdx)
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
      if (currentWeight < maxLowerWeight && maxLowerWeight - currentWeight >= BREAKOUT_THRESHOLD) {
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

  return breakouts
}

// Check if breakout occurred in last N days
function hasRecentBreakout(breakouts, prices, days = 10) {
  if (!breakouts || breakouts.length === 0) return false

  const latestDate = new Date(prices[prices.length - 1].date)
  const cutoffDate = new Date(latestDate)
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return breakouts.some(b => new Date(b.date) >= cutoffDate)
}

// Get latest breakout info
function getLatestBreakout(breakouts) {
  if (!breakouts || breakouts.length === 0) return null
  return breakouts[breakouts.length - 1]
}

function BacktestResults({ onStockSelect }) {
  const [symbols, setSymbols] = useState('')
  const [days, setDays] = useState('1825') // Default to 5Y
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])

  const runBacktest = async () => {
    const stockList = parseStockSymbols(symbols)

    if (stockList.length === 0) {
      setError('Please enter at least one stock symbol')
      return
    }

    setLoading(true)
    setError(null)
    setResults([])

    const backtestResults = []

    try {
      for (const symbol of stockList) {
        try {
          // Fetch price data
          const cacheKey = symbol
          let priceData = apiCache.get(cacheKey, days)

          if (!priceData) {
            const response = await axios.get(`${API_URL}/prices`, {
              params: { symbol, days }
            })
            priceData = response.data.prices
            apiCache.set(cacheKey, days, { prices: priceData })
          } else {
            priceData = priceData.prices
          }

          if (!priceData || priceData.length === 0) {
            continue
          }

          // Calculate Vol Prf V2 breakouts
          const breakouts = calculateVolPrfV2Breakouts(priceData)

          // Check if breakout in last 10 days
          if (hasRecentBreakout(breakouts, priceData, 10)) {
            const latestBreakout = getLatestBreakout(breakouts)
            const latestPrice = priceData[priceData.length - 1].close

            backtestResults.push({
              symbol,
              totalBreakouts: breakouts.length,
              latestBreakout,
              latestPrice,
              priceData
            })
          }
        } catch (err) {
          console.error(`Error processing ${symbol}:`, err)
          // Continue with next stock
        }
      }

      setResults(backtestResults)

      if (backtestResults.length === 0) {
        setError('No stocks with breakouts in the last 10 days found.')
      }
    } catch (err) {
      setError('Failed to run backtest. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      runBacktest()
    }
  }

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
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Stock Symbols (comma or space separated)
            </label>
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
          <div className="flex items-end">
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
      {results.length > 0 && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-gradient-to-br from-green-900/50 to-green-800/50 p-6 rounded-lg border border-green-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-300">Stocks with Recent Breakouts</p>
                <p className="text-3xl font-bold mt-2 text-green-100">
                  {results.length}
                </p>
                <p className="text-sm mt-1 text-green-300">
                  Breakouts detected in last 10 days
                </p>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Latest Breakout</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Days Ago</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Breakout Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Current Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Vol Weight</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Support Vol</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Diff</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Total Signals</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-slate-700">
                  {results.map((result, index) => {
                    const daysAgo = getDaysAgo(result.latestBreakout.date)
                    const priceChange = ((result.latestPrice - result.latestBreakout.price) / result.latestBreakout.price * 100)

                    return (
                      <tr
                        key={index}
                        onClick={() => onStockSelect && onStockSelect(result.symbol)}
                        className="hover:bg-slate-700 cursor-pointer transition-colors"
                        title="Click to view in Technical Analysis"
                      >
                        <td className="px-4 py-3 text-sm font-bold text-blue-400">
                          {result.symbol}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {formatDate(result.latestBreakout.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          <span className={`px-2 py-1 rounded ${daysAgo <= 3 ? 'bg-green-900/50 text-green-300' : daysAgo <= 7 ? 'bg-yellow-900/50 text-yellow-300' : 'bg-slate-700 text-slate-300'}`}>
                            {daysAgo}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {formatCurrency(result.latestBreakout.price)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-right">
                          <span className={priceChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatCurrency(result.latestPrice)}
                            <span className="text-xs ml-1">({formatPercent(priceChange)})</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {(result.latestBreakout.currentWeight * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {(result.latestBreakout.lowerWeight * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-sm text-green-400 text-right font-semibold">
                          {(result.latestBreakout.weightDiff * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {result.totalBreakouts}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-400">
              <div><span className="font-semibold">Vol Weight:</span> Current price zone volume %</div>
              <div><span className="font-semibold">Support Vol:</span> Max volume zone within 5 zones below</div>
              <div><span className="font-semibold">Diff:</span> Breakout strength (Support - Current volume)</div>
              <div><span className="font-semibold">Days Ago:</span> <span className="text-green-400">Green ≤3d</span>, <span className="text-yellow-400">Yellow ≤7d</span>, Gray &gt;7d</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BacktestResults
