import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Loader2, Search, Filter, Pause, Play } from 'lucide-react'
import { joinUrl } from '../utils/urlHelper'
import VolumeLegendPills from './VolumeLegendPills'

const TOP_SYMBOL_CACHE_KEY = 'stockFilteringTopSymbols'
const RESULT_CACHE_KEY = 'stockFilteringResults'
const TOP_SYMBOL_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 1 month cache
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const periods = [
  { label: '1Y', value: '365' },
  { label: '3Y', value: '1095' },
  { label: '5Y', value: '1825' }
]

const volumeThresholds = [
  { label: '5%', value: 5 },
  { label: '10%', value: 10 },
  { label: '15%', value: 15 },
  { label: '20%', value: 20 },
  { label: '25%', value: 25 },
  { label: '30%', value: 30 },
  { label: '35%', value: 35 }
]

const stockLimits = [
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: 'ALL', value: -1 }
]

function getSlotColor(weight) {
  const colorStops = [
    { weight: 0, color: [254, 249, 195] },    // Light yellow
    { weight: 2.5, color: [249, 115, 22] },   // Orange
    { weight: 5, color: [239, 68, 68] },      // Red
    { weight: 10, color: [168, 85, 247] },    // Purple
    { weight: 15, color: [59, 130, 246] },    // Blue
    { weight: 20, color: [34, 197, 94] }      // Green
  ]

  const clampWeight = Math.max(0, Math.min(weight ?? 0, 20))
  const lastStop = colorStops[colorStops.length - 1]

  if (clampWeight >= lastStop.weight) {
    const luminance = (0.299 * lastStop.color[0] + 0.587 * lastStop.color[1] + 0.114 * lastStop.color[2]) / 255
    const textColor = luminance > 0.65 ? '#0f172a' : '#f8fafc'
    return { color: `rgb(${lastStop.color.join(', ')})`, textColor }
  }

  let lowerStop = colorStops[0]
  let upperStop = colorStops[1]

  for (let i = 1; i < colorStops.length; i++) {
    if (clampWeight <= colorStops[i].weight) {
      lowerStop = colorStops[i - 1]
      upperStop = colorStops[i]
      break
    }
  }

  const range = upperStop.weight - lowerStop.weight || 1
  const ratio = Math.min(1, Math.max(0, (clampWeight - lowerStop.weight) / range))
  const mix = (start, end) => Math.round(start + (end - start) * ratio)

  const blended = [
    mix(lowerStop.color[0], upperStop.color[0]),
    mix(lowerStop.color[1], upperStop.color[1]),
    mix(lowerStop.color[2], upperStop.color[2])
  ]

  const luminance = (0.299 * blended[0] + 0.587 * blended[1] + 0.114 * blended[2]) / 255
  const textColor = luminance > 0.65 ? '#0f172a' : '#f8fafc'

  return { color: `rgb(${blended.join(', ')})`, textColor }
}

function findSlotIndex(slots, price) {
  if (!Array.isArray(slots) || slots.length === 0 || price == null) return -1
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const isLast = i === slots.length - 1
    if ((price >= slot.start && price <= slot.end) || (isLast && price >= slot.start)) {
      return i
    }
  }
  return -1
}

function buildVolumeSlots(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { slots: [], lastPrice: null, currentSlotIndex: -1 }
  }

  const sorted = [...prices].sort((a, b) => new Date(a.date) - new Date(b.date))
  const minLow = Math.min(...sorted.map(p => p.low))
  const maxHigh = Math.max(...sorted.map(p => p.high))
  const baseSlotSize = (maxHigh - minLow) / 20 || 0
  const effectiveMax = minLow === maxHigh
    ? maxHigh + Math.max(0.0001, maxHigh * 0.05)
    : maxHigh

  const buildSlots = (getWidth) => {
    const slots = []
    let start = minLow

    while (start < effectiveMax) {
      const width = Math.max(0.0001, getWidth(start))
      const end = Math.min(effectiveMax, start + width)
      if (end === start) break
      slots.push({ start, end, volume: 0, weight: 0 })
      start = end
    }

    return slots
  }

  const adaptiveSlots = buildSlots((start) => {
    const percentWidth = Math.max(0.0001, (start || minLow || 1) * 0.05)
    const targetWidth = baseSlotSize || percentWidth
    return targetWidth > percentWidth ? percentWidth : targetWidth
  })

  const slots = adaptiveSlots.length > 40
    ? buildSlots(() => Math.max(0.0001, (effectiveMax - minLow) / 40))
    : adaptiveSlots

  sorted.forEach(price => {
    const refPrice = price.close ?? price.high ?? price.low
    const slotIndex = findSlotIndex(slots, refPrice)
    if (slotIndex >= 0) {
      slots[slotIndex].volume += price.volume || 0
    }
  })

  const totalVolume = slots.reduce((sum, slot) => sum + slot.volume, 0)
  const safeDivisor = totalVolume > 0 ? totalVolume : 1
  slots.forEach(slot => {
    slot.weight = (slot.volume / safeDivisor) * 100
  })

  const lastPoint = sorted[sorted.length - 1]
  const lastPrice = lastPoint?.close ?? lastPoint?.high ?? lastPoint?.low ?? null
  const currentSlotIndex = findSlotIndex(slots, lastPrice)

  return { slots, lastPrice, currentSlotIndex }
}

function buildLegend(slots, currentIndex) {
  if (!Array.isArray(slots) || slots.length === 0) return []

  const hasCurrentIndex = currentIndex >= 0
  const anchorIndex = hasCurrentIndex ? currentIndex : Math.floor(slots.length / 2)

  const startIndex = Math.max(0, anchorIndex - 8)
  const endIndex = Math.min(slots.length - 1, anchorIndex + 8)
  const selected = slots.slice(startIndex, endIndex + 1)
  return selected.map((slot, idx) => ({
    ...slot,
    legendIndex: startIndex + idx,
    label: `${slot.weight.toFixed(1)}%`,
    ...getSlotColor(slot.weight),
    isCurrent: hasCurrentIndex && (startIndex + idx === currentIndex)
  }))
}

// Calculate sum of lower slots + current slot
function calculateLowerSum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  let sum = 0
  // Sum all slots below current slot
  for (let i = 0; i < currentIndex; i++) {
    sum += slots[i]?.weight || 0
  }
  // Add current slot
  sum += slots[currentIndex]?.weight || 0

  return sum
}

// Calculate sum of upper slots + current slot
function calculateUpperSum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  let sum = 0
  // Sum all slots above current slot
  for (let i = currentIndex + 1; i < slots.length; i++) {
    sum += slots[i]?.weight || 0
  }
  // Add current slot
  sum += slots[currentIndex]?.weight || 0

  return sum
}

function formatPeriod(days) {
  const daysNum = parseInt(days, 10)
  if (daysNum >= 1825) return '5Y'
  if (daysNum >= 1095) return '3Y'
  if (daysNum >= 365) return '1Y'
  return `${daysNum}D`
}

function StockFiltering() {
  const [selectedPeriod, setSelectedPeriod] = useState('1825')
  const [selectedThreshold, setSelectedThreshold] = useState(20)
  const [stockLimit, setStockLimit] = useState(20)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [results, setResults] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentStock, setCurrentStock] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [debugLogs, setDebugLogs] = useState([])
  const scanQueueRef = useRef([])
  const isScanningRef = useRef(false)
  const isPausedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const debugLogRef = useRef(null)

  // Load cached results on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(RESULT_CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed)) {
          setResults(parsed)
        }
      }
    } catch (error) {
      console.error('Failed to load cached results', error)
    }
  }, [])

  // Save results to cache when they change
  useEffect(() => {
    if (results.length > 0) {
      try {
        localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(results))
      } catch (error) {
        console.error('Failed to cache results', error)
      }
    }
  }, [results])

  const loadTopSymbols = async () => {
    try {
      // Check cache first
      const cached = localStorage.getItem(TOP_SYMBOL_CACHE_KEY)
      if (cached) {
        const { symbols, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < TOP_SYMBOL_TTL_MS) {
          return symbols
        }
      }

      // Fetch from API
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

      // Save to cache
      localStorage.setItem(TOP_SYMBOL_CACHE_KEY, JSON.stringify({
        symbols: normalized,
        timestamp: Date.now()
      }))

      return normalized
    } catch (error) {
      console.error('Failed to load top market cap symbols', error)
      return []
    }
  }

  const analyzeStock = async (symbol, days) => {
    try {
      const response = await axios.get(joinUrl(API_URL, '/analyze'), {
        params: { symbol, days },
        signal: abortControllerRef.current?.signal
      })

      const priceData = response.data?.data || []
      if (priceData.length === 0) return null

      const { slots, lastPrice, currentSlotIndex } = buildVolumeSlots(priceData)

      if (currentSlotIndex < 0) return null

      const currentWeight = slots[currentSlotIndex]?.weight || 0
      const lowerSum = calculateLowerSum(slots, currentSlotIndex)
      const upperSum = calculateUpperSum(slots, currentSlotIndex)

      // Check if it matches the threshold
      const matched = lowerSum >= selectedThreshold || upperSum >= selectedThreshold

      const volumeLegend = buildLegend(slots, currentSlotIndex)

      return {
        symbol,
        period: formatPeriod(days),
        currentWeight,
        lowerSum,
        upperSum,
        volumeLegend,
        lastPrice,
        matched
      }
    } catch (error) {
      if (error.name === 'CanceledError') {
        return null
      }
      console.error(`Failed to analyze ${symbol}`, error)
      return null
    }
  }

  const addDebugLog = (symbol, lowerSum, upperSum, matched) => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = {
      timestamp,
      symbol,
      lowerSum: lowerSum.toFixed(1),
      upperSum: upperSum.toFixed(1),
      matched
    }

    // Log to browser console
    console.log(
      `[${timestamp}] ${symbol} - Lower: ${lowerSum.toFixed(1)}%, Upper: ${upperSum.toFixed(1)}%${matched ? ' ✓ MATCH' : ''}`
    )

    setDebugLogs(prev => {
      const newLogs = [logEntry, ...prev]
      // Keep only the last 100 entries
      return newLogs.slice(0, 100)
    })

    // Auto-scroll to top of debug console
    if (debugLogRef.current) {
      debugLogRef.current.scrollTop = 0
    }
  }

  const processScanQueue = async () => {
    if (isScanningRef.current) return
    isScanningRef.current = true
    setLimitReached(false)

    const newResults = []
    const total = scanQueueRef.current.length

    while (scanQueueRef.current.length > 0 && isScanningRef.current) {
      // Check if paused - wait until resumed
      while (isPausedRef.current && isScanningRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // If stopped while paused, exit
      if (!isScanningRef.current) break

      const { symbol, days } = scanQueueRef.current.shift()
      const current = total - scanQueueRef.current.length

      setProgress({ current, total })
      setCurrentStock(symbol)

      const result = await analyzeStock(symbol, days)

      // Log debug information for all stocks
      if (result) {
        addDebugLog(symbol, result.lowerSum, result.upperSum, result.matched)

        // Only add to results if it matches the threshold
        if (result.matched) {
          newResults.push(result)
          setResults(prev => [...prev, result])

          // Check if we've reached the limit
          if (stockLimit !== -1 && newResults.length >= stockLimit) {
            setLimitReached(true)
            scanQueueRef.current = [] // Clear the queue
            break
          }
        }
      }

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    isScanningRef.current = false
    setScanning(false)
    setPaused(false)
    isPausedRef.current = false
    setProgress({ current: 0, total: 0 })
    setCurrentStock('')
  }

  const handleLoadHeavyVol = async () => {
    if (loading || scanning) return

    setLoading(true)
    setResults([])
    setDebugLogs([])
    setPaused(false)
    isPausedRef.current = false

    try {
      const symbols = await loadTopSymbols()

      if (symbols.length === 0) {
        alert('No symbols loaded')
        return
      }

      // Create scan queue
      scanQueueRef.current = symbols.map(symbol => ({
        symbol,
        days: selectedPeriod
      }))

      abortControllerRef.current = new AbortController()
      setScanning(true)
      setLoading(false)

      processScanQueue()
    } catch (error) {
      console.error('Failed to load heavy vol', error)
      setLoading(false)
    }
  }

  const handlePause = () => {
    setPaused(true)
    isPausedRef.current = true
  }

  const handleResume = () => {
    setPaused(false)
    isPausedRef.current = false
  }

  const handleStop = () => {
    isScanningRef.current = false
    isPausedRef.current = false
    abortControllerRef.current?.abort()
    scanQueueRef.current = []
    setScanning(false)
    setPaused(false)
    setProgress({ current: 0, total: 0 })
    setCurrentStock('')
  }

  const filteredResults = results.filter(result => {
    if (!searchQuery) return true
    return result.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex flex-wrap items-end gap-4">
          {/* Period Selection */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Period
            </label>
            <div className="flex gap-2">
              {periods.map(period => (
                <button
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  disabled={scanning}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    selectedPeriod === period.value
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  } ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          {/* Volume Weight Threshold */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Volume Weight Filter
            </label>
            <select
              value={selectedThreshold}
              onChange={(e) => setSelectedThreshold(Number(e.target.value))}
              disabled={scanning}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {volumeThresholds.map(threshold => (
                <option key={threshold.value} value={threshold.value}>
                  {threshold.label}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Limit */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Stocks to Find
            </label>
            <select
              value={stockLimit}
              onChange={(e) => setStockLimit(Number(e.target.value))}
              disabled={scanning}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stockLimits.map(limit => (
                <option key={limit.value} value={limit.value}>
                  {limit.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {scanning ? (
              <>
                {paused ? (
                  <button
                    onClick={handleResume}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4" />
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={handleLoadHeavyVol}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Load Heavy Vol
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        {scanning && progress.total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-slate-300 mb-2">
              <span>{paused ? 'Scan paused...' : 'Scanning stocks...'}</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${paused ? 'bg-yellow-600' : 'bg-purple-600'}`}
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            {currentStock && !paused && (
              <div className="text-sm text-purple-400 font-medium">
                Currently scanning: <span className="text-white">{currentStock}</span>
              </div>
            )}
            {paused && (
              <div className="text-sm text-yellow-400 font-medium">
                Scanning paused - Click Resume to continue
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search stocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Debug Console */}
      {scanning && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300">
              Debug Console (Last 100 scans) - {debugLogs.length} entries
            </h3>
          </div>
          <div
            ref={debugLogRef}
            className="overflow-y-auto bg-slate-950 p-4 font-mono text-xs"
            style={{ maxHeight: '300px' }}
          >
            {debugLogs.length === 0 ? (
              <div className="text-slate-500 text-center py-4">
                Waiting for scan data...
              </div>
            ) : (
              debugLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 pb-1 border-b border-slate-800 ${log.matched ? 'text-green-400' : 'text-slate-500'}`}
                >
                  <span className="text-slate-500">[{log.timestamp}]</span>
                  {' '}
                  <span className="text-white font-semibold">{log.symbol}</span>
                  {' - '}
                  <span className="text-blue-400">Lower: {log.lowerSum}%</span>
                  {', '}
                  <span className="text-purple-400">Upper: {log.upperSum}%</span>
                  {log.matched && <span className="ml-2 text-green-500">✓ MATCH</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Stock
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Period
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Current Weight
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Lower Sum
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Upper Sum
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  Volume Legend
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                    {scanning ? 'Scanning stocks...' : 'No results. Click "Load Heavy Vol" to start scanning.'}
                  </td>
                </tr>
              ) : (
                filteredResults.map((result, idx) => (
                  <tr
                    key={`${result.symbol}-${idx}`}
                    className="border-b border-slate-700 hover:bg-slate-750"
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      {result.symbol}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {result.period}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: getSlotColor(result.currentWeight).color,
                          color: getSlotColor(result.currentWeight).textColor
                        }}
                      >
                        {result.currentWeight.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: result.lowerSum >= selectedThreshold ? '#22c55e' : '#64748b',
                          color: '#ffffff'
                        }}
                      >
                        {result.lowerSum.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: result.upperSum >= selectedThreshold ? '#22c55e' : '#64748b',
                          color: '#ffffff'
                        }}
                      >
                        {result.upperSum.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {result.volumeLegend && (
                        <VolumeLegendPills legend={result.volumeLegend} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      {filteredResults.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-300">
            Showing {filteredResults.length} stock{filteredResults.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
            {' '}with volume weight ≥ {selectedThreshold}%
            {limitReached && stockLimit !== -1 && (
              <span className="ml-2 text-green-400 font-semibold">
                (Limit of {stockLimit} reached - scan stopped)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StockFiltering
