import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Loader2, Search, Filter, Pause, Play, X, ArrowUpDown, BarChart2, AlertCircle, RefreshCw, TrendingUp, Database, TrendingDown, Minus, DollarSign, Scale, ArrowDown, ArrowUp, ArrowLeftRight, Settings, Clock, Waves } from 'lucide-react'
import { joinUrl } from '../utils/urlHelper'
import VolumeLegendPills from './VolumeLegendPills'

const TOP_SYMBOL_CACHE_KEY_PREFIX = 'stockFilteringTopSymbols'
const RESULT_CACHE_KEY_PREFIX = 'stockFilteringResults'
const SCHEDULE_QUEUE_KEY = 'stockFilteringScheduleQueue'
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

const markets = [
  { label: 'US', value: 'US', limit: 2000, exchange: null },
  { label: 'HK', value: 'HK', limit: 500, exchange: 'HKG' },
  { label: 'CN', value: 'CN', limit: 500, exchange: 'CN' }
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

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeResult = (result) => ({
  ...result,
  dataPoints: toNumber(result?.dataPoints),
  change7d: toNumber(result?.change7d),
  avgTxn: toNumber(result?.avgTxn),
  currentWeight: toNumber(result?.currentWeight),
  lowerSum: toNumber(result?.lowerSum),
  upperSum: toNumber(result?.upperSum),
  sumDiff: toNumber(result?.sumDiff),
  lower2Sum: toNumber(result?.lower2Sum),
  upper2Sum: toNumber(result?.upper2Sum),
  diff2: toNumber(result?.diff2),
  useSumDiff: result?.useSumDiff ?? true
})

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

// Calculate sum of immediate lower slot + current slot
function calculateLowerSum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  const currentWeight = slots[currentIndex]?.weight || 0
  const lowerWeight = currentIndex > 0 ? (slots[currentIndex - 1]?.weight || 0) : 0

  return currentWeight + lowerWeight
}

// Calculate sum of immediate upper slot + current slot
function calculateUpperSum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  const currentWeight = slots[currentIndex]?.weight || 0
  const upperWeight = currentIndex < slots.length - 1 ? (slots[currentIndex + 1]?.weight || 0) : 0

  return currentWeight + upperWeight
}

// Calculate sum of current slot + lower lower slot (2 slots below)
function calculateLower2Sum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  const currentWeight = slots[currentIndex]?.weight || 0
  const lower2Weight = currentIndex > 1 ? (slots[currentIndex - 2]?.weight || 0) : 0

  return currentWeight + lower2Weight
}

// Calculate sum of current slot + upper upper slot (2 slots above)
function calculateUpper2Sum(slots, currentIndex) {
  if (currentIndex < 0 || !Array.isArray(slots)) return 0

  const currentWeight = slots[currentIndex]?.weight || 0
  const upper2Weight = currentIndex < slots.length - 2 ? (slots[currentIndex + 2]?.weight || 0) : 0

  return currentWeight + upper2Weight
}

function formatPeriod(days) {
  const daysNum = parseInt(days, 10)
  if (daysNum >= 1825) return '5Y'
  if (daysNum >= 1095) return '3Y'
  if (daysNum >= 365) return '1Y'
  return `${daysNum}D`
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return ''

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return `${formatDate(startDate)} → ${formatDate(endDate)}`
}

function formatLastRunTime(isoString) {
  if (!isoString) return 'N/A'

  const now = new Date()
  const runTime = new Date(isoString)
  const diffMs = now - runTime
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`

  return runTime.toLocaleDateString() + ' ' + runTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isValidSymbol(symbol) {
  // Filter out symbols with ≥5 characters that don't contain a '.'
  // This excludes long ticker symbols without exchange suffixes (e.g., .HK, .L, .SS, .SZ)
  if (symbol.length >= 5 && !symbol.includes('.')) {
    return false
  }
  return true
}

function StockFiltering({ onV3BacktestSelect, onAnalyzeWithVolProf, onV2BacktestSelect, onVolumeBulkAdd, bulkImport }) {
  const [selectedPeriod, setSelectedPeriod] = useState('1825')
  const [selectedThreshold, setSelectedThreshold] = useState(20)
  const [stockLimit, setStockLimit] = useState(20)
  const [selectedMarket, setSelectedMarket] = useState('US')
  const [specificStockInput, setSpecificStockInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [results, setResults] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentStock, setCurrentStock] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [toastMessage, setToastMessage] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showQueueModal, setShowQueueModal] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleQueue, setScheduleQueue] = useState([])
  const [editingJobId, setEditingJobId] = useState(null)
  const scanQueueRef = useRef([])
  const isScanningRef = useRef(false)
  const isPausedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const toastTimeoutRef = useRef(null)
  const scheduleCheckIntervalRef = useRef(null)
  const scheduledRunMetricsRef = useRef(null)

  // Load cached results on mount (all markets together)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(RESULT_CACHE_KEY_PREFIX)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed)) {
          setResults(parsed.map(normalizeResult))
        }
      }
    } catch (error) {
      console.error('Failed to load cached results', error)
    }
  }, [])

  // Save results to cache when they change (all markets together)
  useEffect(() => {
    if (results.length > 0) {
      try {
        localStorage.setItem(RESULT_CACHE_KEY_PREFIX, JSON.stringify(results))
      } catch (error) {
        console.error('Failed to cache results', error)
      }
    }
  }, [results])

  // Handle bulk import from other tabs
  useEffect(() => {
    if (!bulkImport?.entries || !Array.isArray(bulkImport.entries)) return

    const entries = bulkImport.entries
    if (entries.length === 0) return

    // Get existing symbols to skip them
    const existingSymbols = new Set(results.map(r => r.symbol))

    // Add to scan queue
    const newEntries = entries
      .filter(entry => !existingSymbols.has(entry.symbol))
      .map(entry => ({
        symbol: entry.symbol,
        days: entry.days || selectedPeriod
      }))

    if (newEntries.length === 0) {
      showToast('All imported stocks already in table')
      return
    }

    scanQueueRef.current = [...scanQueueRef.current, ...newEntries]

    // Start scanning if not already scanning
    if (!isScanningRef.current && !scanning) {
      abortControllerRef.current = new AbortController()
      setScanning(true)
      processScanQueue()
    }

    showToast(`Added ${newEntries.length} stock${newEntries.length !== 1 ? 's' : ''} to scan queue`)
  }, [bulkImport])

  // Load schedule queue on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(SCHEDULE_QUEUE_KEY)
      if (cached) {
        const queue = JSON.parse(cached)
        setScheduleQueue(Array.isArray(queue) ? queue : [])
      }
    } catch (error) {
      console.error('Failed to load schedule queue', error)
    }

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Set default date/time for schedule modal
    const now = new Date()
    now.setHours(now.getHours() + 1, 0, 0, 0) // Default to next hour
    setScheduleDate(now.toISOString().split('T')[0])
    setScheduleTime(now.toTimeString().slice(0, 5))
  }, [])

  // Save schedule queue when it changes
  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_QUEUE_KEY, JSON.stringify(scheduleQueue))
    } catch (error) {
      console.error('Failed to save schedule queue', error)
    }
  }, [scheduleQueue])

  // Set up schedule checker to run queued jobs
  useEffect(() => {
    if (scheduleQueue.length > 0) {
      // Check every minute if any job should run
      scheduleCheckIntervalRef.current = setInterval(() => {
        checkAndRunQueuedJobs()
      }, 60000) // Check every minute

      return () => {
        if (scheduleCheckIntervalRef.current) {
          clearInterval(scheduleCheckIntervalRef.current)
        }
      }
    } else {
      if (scheduleCheckIntervalRef.current) {
        clearInterval(scheduleCheckIntervalRef.current)
        scheduleCheckIntervalRef.current = null
      }
    }
  }, [scheduleQueue])

  const showToast = (message) => {
    setToastMessage(message)
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('')
      toastTimeoutRef.current = null
    }, 4500)
  }

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
    setToastMessage('')
  }

  const sendNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  }

  const checkAndRunQueuedJobs = () => {
    const now = new Date()
    const jobsToRun = scheduleQueue.filter(job => {
      const scheduledTime = new Date(job.scheduledTime)
      // If current time is past the scheduled time (within 1 minute window)
      return now >= scheduledTime && (now - scheduledTime) < 60000
    })

    jobsToRun.forEach(job => {
      handleScheduledJobRun(job)
    })
  }

  const handleScheduledJobRun = async (job) => {
    if (loading || scanning) {
      // If already running, delay this job by 5 minutes
      const newTime = new Date(job.scheduledTime)
      newTime.setMinutes(newTime.getMinutes() + 5)
      setScheduleQueue(prev => prev.map(j =>
        j.id === job.id ? { ...j, scheduledTime: newTime.toISOString() } : j
      ))
      return
    }

    // Send notification when job starts
    const startMessage = `${job.market} scan starting: ${periods.find(p => p.value === job.period)?.label || job.period}, ${job.threshold}%, limit ${job.stockLimit === -1 ? 'ALL' : job.stockLimit}`

    sendNotification(
      `Scheduled Scan Starting (${job.market})`,
      `Period: ${periods.find(p => p.value === job.period)?.label || job.period}, Threshold: ${job.threshold}%, Limit: ${job.stockLimit === -1 ? 'ALL' : job.stockLimit}`
    )

    // In-app toast notification
    showToast(startMessage)

    const startTime = Date.now()
    const initialResultsCount = results.length

    // Set the job's settings
    setSelectedMarket(job.market)
    setSelectedPeriod(job.period)
    setSelectedThreshold(job.threshold)
    setStockLimit(job.stockLimit)

    setLoading(true)
    setPaused(false)
    isPausedRef.current = false

    try {
      const market = markets.find(m => m.value === job.market)
      if (!market) {
        removeJobFromQueue(job.id)
        return
      }

      // Load symbols for this market
      const cacheKey = `${TOP_SYMBOL_CACHE_KEY_PREFIX}_${job.market}`
      const cached = localStorage.getItem(cacheKey)
      let symbols = []

      if (cached) {
        const { symbols: cachedSymbols, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < TOP_SYMBOL_TTL_MS) {
          symbols = cachedSymbols
        }
      }

      if (symbols.length === 0) {
        const params = { limit: market.limit }
        if (market.exchange) {
          params.exchange = market.exchange
        }
        const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), { params })
        const payload = response.data
        symbols = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.symbols)
          ? payload.symbols
          : []
        symbols = symbols
          .map(item => (typeof item === 'string' ? item : item?.symbol))
          .filter(Boolean)
          .map(symbol => symbol.toUpperCase())
        localStorage.setItem(cacheKey, JSON.stringify({ symbols, timestamp: Date.now() }))
      }

      if (symbols.length === 0) {
        const runTime = ((Date.now() - startTime) / 1000).toFixed(1)
        sendNotification(
          `Scheduled Scan Failed (${job.market})`,
          `No symbols loaded. Run time: ${runTime}s`
        )
        removeJobFromQueue(job.id)
        setLoading(false)
        return
      }

      const existingSymbols = new Set(results.map(r => r.symbol))
      scanQueueRef.current = symbols
        .filter(symbol => !existingSymbols.has(symbol))
        .map(symbol => ({
          symbol,
          days: job.period
        }))

      if (scanQueueRef.current.length === 0) {
        const runTime = ((Date.now() - startTime) / 1000).toFixed(1)
        sendNotification(
          `Scheduled Scan Complete (${job.market})`,
          `All symbols already scanned. Run time: ${runTime}s`
        )
        removeJobFromQueue(job.id)
        setLoading(false)
        return
      }

      // Store metrics and job info for the scheduled run
      scheduledRunMetricsRef.current = {
        startTime,
        initialCount: initialResultsCount,
        jobId: job.id,
        market: job.market
      }

      abortControllerRef.current = new AbortController()
      setScanning(true)
      setLoading(false)

      processScanQueue()
    } catch (error) {
      console.error('Failed to run scheduled job', error)
      const runTime = ((Date.now() - startTime) / 1000).toFixed(1)
      sendNotification(
        `Scheduled Scan Failed (${job.market})`,
        `Error occurred. Run time: ${runTime}s`
      )
      setLoading(false)
      removeJobFromQueue(job.id)
      scheduledRunMetricsRef.current = null
    }
  }

  const handleOpenScheduleModal = () => {
    setEditingJobId(null)
    const now = new Date()
    now.setHours(now.getHours() + 1, 0, 0, 0)
    setScheduleDate(now.toISOString().split('T')[0])
    setScheduleTime(now.toTimeString().slice(0, 5))
    setShowScheduleModal(true)
  }

  const handleQueueJob = () => {
    const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`)

    if (scheduledDateTime <= new Date()) {
      showToast('Scheduled time must be in the future')
      return
    }

    const job = {
      id: editingJobId || Date.now().toString(),
      market: selectedMarket,
      period: selectedPeriod,
      threshold: selectedThreshold,
      stockLimit: stockLimit,
      scheduledTime: scheduledDateTime.toISOString(),
      createdAt: editingJobId ? scheduleQueue.find(j => j.id === editingJobId)?.createdAt : new Date().toISOString()
    }

    if (editingJobId) {
      setScheduleQueue(prev => prev.map(j => j.id === editingJobId ? job : j))
      showToast('Scheduled job updated')
    } else {
      setScheduleQueue(prev => [...prev, job])
      showToast('Job added to queue')
    }

    setShowScheduleModal(false)
    setEditingJobId(null)
  }

  const handleEditJob = (job) => {
    setEditingJobId(job.id)
    const scheduledDate = new Date(job.scheduledTime)
    setScheduleDate(scheduledDate.toISOString().split('T')[0])
    setScheduleTime(scheduledDate.toTimeString().slice(0, 5))
    setSelectedMarket(job.market)
    setSelectedPeriod(job.period)
    setSelectedThreshold(job.threshold)
    setStockLimit(job.stockLimit)
    setShowQueueModal(false)
    setShowScheduleModal(true)
  }

  const removeJobFromQueue = (jobId) => {
    setScheduleQueue(prev => prev.filter(j => j.id !== jobId))
  }

  const handleDeleteJob = (jobId) => {
    removeJobFromQueue(jobId)
    showToast('Job removed from queue')
  }

  const loadTopSymbols = async () => {
    try {
      const market = markets.find(m => m.value === selectedMarket)
      if (!market) return []

      const cacheKey = `${TOP_SYMBOL_CACHE_KEY_PREFIX}_${selectedMarket}`

      // Check cache first
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { symbols, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < TOP_SYMBOL_TTL_MS) {
          return symbols
        }
      }

      // Fetch from API with market-specific parameters
      const params = { limit: market.limit }
      if (market.exchange) {
        params.exchange = market.exchange
      }

      const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), { params })

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

      // Save to cache with market-specific key
      localStorage.setItem(cacheKey, JSON.stringify({
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

      const priceData = response.data?.prices || []
      if (priceData.length === 0) {
        return null
      }

      // Calculate average volume from last 250 days
      const last250Days = priceData.slice(-250)
      const totalVolume = last250Days.reduce((sum, price) => sum + (price.volume || 0), 0)
      const avgVolume = last250Days.length > 0 ? totalVolume / last250Days.length : 0

      // Calculate 7-day percentage change
      let change7d = 0
      if (priceData.length >= 7) {
        const currentPrice = priceData[priceData.length - 1]?.close
        const price7dAgo = priceData[priceData.length - 7]?.close
        if (currentPrice && price7dAgo && price7dAgo !== 0) {
          change7d = ((currentPrice - price7dAgo) / price7dAgo) * 100
        }
      }

      // Calculate average transaction value (avg volume × avg price in last 30 days)
      const last30Days = priceData.slice(-30)
      const totalVolume30d = last30Days.reduce((sum, price) => sum + (price.volume || 0), 0)
      const avgVolume30d = last30Days.length > 0 ? totalVolume30d / last30Days.length : 0
      const totalPrice30d = last30Days.reduce((sum, price) => sum + (price.close || 0), 0)
      const avgPrice30d = last30Days.length > 0 ? totalPrice30d / last30Days.length : 0
      const avgTxn = avgVolume30d * avgPrice30d

      const { slots, lastPrice, currentSlotIndex } = buildVolumeSlots(priceData)

      if (currentSlotIndex < 0) {
        return null
      }

      const currentWeight = slots[currentSlotIndex]?.weight || 0
      const lowerSum = calculateLowerSum(slots, currentSlotIndex)
      const upperSum = calculateUpperSum(slots, currentSlotIndex)
      const sumDiff = upperSum - lowerSum
      const lower2Sum = calculateLower2Sum(slots, currentSlotIndex)
      const upper2Sum = calculateUpper2Sum(slots, currentSlotIndex)
      const diff2 = upper2Sum - lower2Sum

      // Check if absolute value of either difference meets the threshold
      const sumDiffMeetsThreshold = Math.abs(sumDiff) >= selectedThreshold
      const diff2MeetsThreshold = Math.abs(diff2) >= selectedThreshold
      const matched = sumDiffMeetsThreshold || diff2MeetsThreshold

      // Track which diff to use for divergence check (prioritize sumDiff if it passes)
      const useSumDiff = sumDiffMeetsThreshold

      const volumeLegend = buildLegend(slots, currentSlotIndex)

      // Get start and end dates from price data
      const startDate = priceData.length > 0 ? priceData[0]?.date : null
      const endDate = priceData.length > 0 ? priceData[priceData.length - 1]?.date : null

      return {
        symbol,
        market: selectedMarket,
        period: formatPeriod(days),
        days: days, // Keep the numeric days value for V3 Backtest
        dataPoints: priceData.length,
        startDate,
        endDate,
        change7d,
        avgTxn,
        avgVolume,
        currentWeight,
        lowerSum,
        upperSum,
        sumDiff,
        lower2Sum,
        upper2Sum,
        diff2,
        volumeLegend,
        lastPrice,
        matched,
        useSumDiff,
        lastRunTime: new Date().toISOString()
      }
    } catch (error) {
      if (error.name === 'CanceledError') {
        return null
      }
      return null
    }
  }

  const processScanQueue = async () => {
    if (isScanningRef.current) return
    isScanningRef.current = true
    setLimitReached(false)

    const newResults = []
    const total = scanQueueRef.current.length
    let filteredBySymbolLength = 0
    let filteredByDataPoints = 0
    let filteredByVolume = 0
    let filteredByAvgTxn = 0
    let filteredBySameDirection = 0

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

      // Filter by symbol length
      if (!isValidSymbol(symbol)) {
        filteredBySymbolLength++
        continue
      }

      const result = await analyzeStock(symbol, days)

      // Filter by data points (minimum 250)
      if (result && result.dataPoints < 250) {
        filteredByDataPoints++
        continue
      }

      // Filter by average volume (minimum 100,000)
      if (result && result.avgVolume < 100000) {
        filteredByVolume++
        continue
      }

      // Filter by average transaction value (minimum $10 million)
      if (result && result.avgTxn < 10000000) {
        filteredByAvgTxn++
        continue
      }

      // Filter based on divergence: which diff to check depends on which threshold passed
      // If sumDiff met threshold, check divergence with sumDiff; otherwise check with diff2
      if (result) {
        if (result.useSumDiff) {
          // Filter out if change7d and sumDiff have same direction (no divergence)
          if ((result.change7d * result.sumDiff) >= 0) {
            filteredBySameDirection++
            continue
          }
        } else {
          // Filter out if change7d and diff2 have same direction (no divergence)
          if ((result.change7d * result.diff2) >= 0) {
            filteredBySameDirection++
            continue
          }
        }
      }

      if (result && result.matched) {
        newResults.push(result)
        setResults(prev => [...prev, result])

        // Check if we've reached the limit
        if (stockLimit !== -1 && newResults.length >= stockLimit) {
          setLimitReached(true)
          scanQueueRef.current = [] // Clear the queue
          break
        }
      }

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Show toast notification for filtered stocks
    if (filteredBySymbolLength > 0 || filteredByDataPoints > 0 || filteredByVolume > 0 || filteredByAvgTxn > 0 || filteredBySameDirection > 0) {
      const messages = []
      if (filteredBySymbolLength > 0) {
        messages.push(`${filteredBySymbolLength} by symbol length`)
      }
      if (filteredByDataPoints > 0) {
        messages.push(`${filteredByDataPoints} by data points`)
      }
      if (filteredByVolume > 0) {
        messages.push(`${filteredByVolume} by low volume`)
      }
      if (filteredByAvgTxn > 0) {
        messages.push(`${filteredByAvgTxn} by low avg txn`)
      }
      if (filteredBySameDirection > 0) {
        messages.push(`${filteredBySameDirection} by same direction`)
      }
      showToast(`Filtered stocks: ${messages.join(', ')}`)
    }

    isScanningRef.current = false
    setScanning(false)
    setPaused(false)
    isPausedRef.current = false
    setProgress({ current: 0, total: 0 })
    setCurrentStock('')

    // If this was a scheduled run, send notification with metrics and remove job from queue
    if (scheduledRunMetricsRef.current) {
      const metrics = scheduledRunMetricsRef.current
      const finalCount = results.length
      const runTime = ((Date.now() - metrics.startTime) / 1000).toFixed(1)

      const completionMessage = `${metrics.market} scan complete: ${newResults.length} stocks added, ${finalCount} total, ${runTime}s runtime`

      // Browser notification
      sendNotification(
        `Scheduled Scan Complete (${metrics.market})`,
        `Stocks added: ${newResults.length}\nTotal stocks: ${finalCount}\nRun time: ${runTime}s`
      )

      // In-app toast notification
      showToast(completionMessage)

      removeJobFromQueue(metrics.jobId)
      scheduledRunMetricsRef.current = null
    }
  }

  const handleLoadHeavyVol = async () => {
    if (loading || scanning) return

    setLoading(true)
    setPaused(false)
    isPausedRef.current = false

    try {
      const symbols = await loadTopSymbols()

      if (symbols.length === 0) {
        alert('No symbols loaded')
        return
      }

      // Get existing symbols to skip them
      const existingSymbols = new Set(results.map(r => r.symbol))

      // Create scan queue, excluding already scanned symbols
      scanQueueRef.current = symbols
        .filter(symbol => !existingSymbols.has(symbol))
        .map(symbol => ({
          symbol,
          days: selectedPeriod
        }))

      if (scanQueueRef.current.length === 0) {
        showToast('All symbols already scanned')
        setLoading(false)
        return
      }

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

  const handleScanSpecificStocks = async () => {
    if (!specificStockInput.trim()) {
      showToast('Please enter stock symbols')
      return
    }

    // Parse input (comma or space separated)
    const symbols = specificStockInput
      .toUpperCase()
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (symbols.length === 0) {
      showToast('No valid symbols entered')
      return
    }

    setLoading(true)
    let successCount = 0
    let failCount = 0

    for (const symbol of symbols) {
      setCurrentStock(symbol)

      try {
        const result = await analyzeStock(symbol, selectedPeriod)

        if (result) {
          // Add to results without filter criteria
          setResults(prev => {
            // Check if symbol already exists
            const existingIndex = prev.findIndex(r => r.symbol === symbol)
            if (existingIndex >= 0) {
              // Update existing
              const updated = [...prev]
              updated[existingIndex] = result
              return updated
            } else {
              // Add new
              return [...prev, result]
            }
          })
          successCount++
        } else {
          failCount++
        }
      } catch (error) {
        console.error(`Error scanning ${symbol}:`, error)
        failCount++
      }
    }

    setLoading(false)
    setCurrentStock('')
    setSpecificStockInput('')

    if (successCount > 0) {
      showToast(`Added ${successCount} stock${successCount !== 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`)
    } else {
      showToast(`Failed to scan stocks`)
    }
  }

  const handleRemoveResult = (symbol) => {
    setResults(prev => prev.filter(result => result.symbol !== symbol))
  }

  const handleRemoveAll = () => {
    if (results.length === 0) return
    const count = results.length
    setResults([])
    setSelectedRows(new Set())
    showToast(`Removed all ${count} stock${count !== 1 ? 's' : ''} from table`)
  }

  const handleClearCache = () => {
    try {
      localStorage.removeItem(RESULT_CACHE_KEY_PREFIX)
      const count = results.length
      setResults([])
      setSelectedRows(new Set())
      showToast(`Cleared cache and removed ${count} stock${count !== 1 ? 's' : ''} from table`)
    } catch (error) {
      console.error('Failed to clear cache', error)
      showToast('Failed to clear cache')
    }
  }

  const handleToggleRow = (symbol) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(symbol)) {
        newSet.delete(symbol)
      } else {
        newSet.add(symbol)
      }
      return newSet
    })
  }

  const handleToggleAll = () => {
    if (selectedRows.size === sortedResults.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(sortedResults.map(r => r.symbol)))
    }
  }

  const handleBulkAddToV3Backtest = () => {
    if (selectedRows.size === 0) {
      showToast('No stocks selected')
      return
    }

    const selectedStocks = results.filter(r => selectedRows.has(r.symbol))
    selectedStocks.forEach(stock => {
      onV3BacktestSelect?.(stock.symbol, stock.days)
    })

    showToast(`Added ${selectedRows.size} stock${selectedRows.size !== 1 ? 's' : ''} to V3 Backtest`)
    setSelectedRows(new Set())
  }

  const handleBulkAddToV2Backtest = () => {
    if (selectedRows.size === 0) {
      showToast('No stocks selected')
      return
    }

    const selectedStocks = results.filter(r => selectedRows.has(r.symbol))
    selectedStocks.forEach(stock => {
      onV2BacktestSelect?.(stock.symbol, stock.days)
    })

    showToast(`Added ${selectedRows.size} stock${selectedRows.size !== 1 ? 's' : ''} to V2 Backtest`)
    setSelectedRows(new Set())
  }

  const handleBulkAddToVolumeScreen = () => {
    if (selectedRows.size === 0) {
      showToast('No stocks selected')
      return
    }

    const selectedStocks = results.filter(r => selectedRows.has(r.symbol))
    const entries = selectedStocks.map(stock => ({
      symbol: stock.symbol,
      days: stock.days
    }))

    onVolumeBulkAdd?.(entries)
    showToast(`Added ${selectedRows.size} stock${selectedRows.size !== 1 ? 's' : ''} to Volume Screen`)
    setSelectedRows(new Set())
  }

  const handleReloadStock = async (symbol, days) => {
    // Remove the old result
    setResults(prev => prev.filter(result => result.symbol !== symbol))

    // Re-analyze the stock
    const result = await analyzeStock(symbol, days)

    // Always keep the stock, just refresh the data (same behavior as Reload All)
    if (result) {
      setResults(prev => [...prev, result])
      showToast(`${symbol} reloaded successfully`)
    } else {
      showToast(`${symbol} removed: failed to load data`)
    }
  }

  const handleReloadAll = async () => {
    if (results.length === 0 || scanning) return

    const stocksToReload = results.map(r => ({ symbol: r.symbol, days: r.days }))
    const total = stocksToReload.length

    setScanning(true)
    setProgress({ current: 0, total })

    const newResults = []
    let failedToLoad = 0

    for (let i = 0; i < stocksToReload.length; i++) {
      const { symbol, days } = stocksToReload[i]

      setProgress({ current: i + 1, total })
      setCurrentStock(symbol)

      const result = await analyzeStock(symbol, days)

      // Always keep the stock, just refresh the data
      if (result) {
        newResults.push(result)
      } else {
        failedToLoad++
      }

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setResults(newResults)
    setScanning(false)
    setProgress({ current: 0, total: 0 })
    setCurrentStock('')

    if (failedToLoad > 0) {
      showToast(`Reload complete: ${failedToLoad} stock${failedToLoad !== 1 ? 's' : ''} failed to load data`)
    } else {
      showToast(`All ${total} stocks reloaded successfully`)
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, default to descending
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const filteredResults = results.filter(result => {
    if (!searchQuery) return true
    return result.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const normalizedResults = filteredResults.map(normalizeResult)

  // Apply sorting
  const sortedResults = [...normalizedResults].sort((a, b) => {
    if (!sortField) return 0

    let aVal = a[sortField]
    let bVal = b[sortField]

    // Handle string comparison for symbol and market
    if (sortField === 'symbol' || sortField === 'market') {
      aVal = (aVal || '').toLowerCase()
      bVal = (bVal || '').toLowerCase()
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }

    // Handle date comparison for lastRunTime
    if (sortField === 'lastRunTime') {
      const aTime = aVal ? new Date(aVal).getTime() : 0
      const bTime = bVal ? new Date(bVal).getTime() : 0
      return sortDirection === 'asc' ? aTime - bTime : bTime - aTime
    }

    // Handle numeric comparison
    if (sortDirection === 'asc') {
      return aVal - bVal
    } else {
      return bVal - aVal
    }
  })

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex flex-wrap items-end gap-4">
          {/* Market Selection */}
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Market
            </label>
            <div className="flex gap-2">
              {markets.map(market => (
                <button
                  key={market.value}
                  onClick={() => setSelectedMarket(market.value)}
                  disabled={scanning}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    selectedMarket === market.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  } ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {market.label}
                </button>
              ))}
            </div>
          </div>

          {/* Specific Stock Input */}
          <div className="flex items-end gap-2">
            <div className="min-w-[250px]">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Scan Specific Stocks
              </label>
              <input
                type="text"
                value={specificStockInput}
                onChange={(e) => setSpecificStockInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading && !scanning) {
                    handleScanSpecificStocks()
                  }
                }}
                disabled={loading || scanning}
                placeholder="e.g., AAPL, MSFT, GOOGL"
                className="w-full bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:border-green-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleScanSpecificStocks}
              disabled={loading || scanning || !specificStockInput.trim()}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Search className="w-4 h-4" />
              Scan
            </button>
          </div>

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
              <>
                <button
                  onClick={handleLoadHeavyVol}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Load Heavy Vol
                </button>
                <button
                  onClick={handleOpenScheduleModal}
                  disabled={loading || scanning}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  Schedule
                </button>
                <button
                  onClick={() => setShowQueueModal(true)}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2 relative"
                >
                  <Database className="w-4 h-4" />
                  Show Queue
                  {scheduleQueue.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {scheduleQueue.length}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Current Stock Indicator for Specific Stock Scan */}
        {loading && currentStock && (
          <div className="mt-4">
            <div className="text-sm text-green-400 font-medium">
              Currently scanning: <span className="text-white">{currentStock}</span>
            </div>
          </div>
        )}

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

      {/* Search and Bulk Actions */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-3">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleReloadAll}
            disabled={results.length === 0 || scanning}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors flex items-center gap-2"
            title="Reload all stocks in table"
          >
            <RefreshCw className="w-5 h-5" />
            Reload All
          </button>
          <button
            onClick={handleRemoveAll}
            disabled={results.length === 0 || scanning}
            className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors flex items-center gap-2"
            title="Remove all stocks from table"
          >
            <X className="w-5 h-5" />
            Remove All
          </button>
          <button
            onClick={handleClearCache}
            disabled={scanning}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors flex items-center gap-2"
            title="Clear cached stocks from localStorage"
          >
            <Database className="w-5 h-5" />
            Clear Cache
          </button>
        </div>

        {/* Bulk Actions */}
        {selectedRows.size > 0 && (
          <div className="flex gap-2 items-center pt-2 border-t border-slate-700">
            <span className="text-sm text-slate-400">
              {selectedRows.size} selected:
            </span>
            <button
              onClick={handleBulkAddToV3Backtest}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              + V3 Backtest
            </button>
            <button
              onClick={handleBulkAddToV2Backtest}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              + V2 Backtest
            </button>
            <button
              onClick={handleBulkAddToVolumeScreen}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              + Volume Screen
            </button>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={sortedResults.length > 0 && selectedRows.size === sortedResults.length}
                    onChange={handleToggleAll}
                    className="w-4 h-4 cursor-pointer"
                    title="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('symbol')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Stock
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('market')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Market
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('days')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Sort by period (in days)"
                  >
                    Period
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('dataPoints')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Data Points
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('avgTxn')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Average Transaction Value: Avg volume × avg price (last 30 days)"
                  >
                    <DollarSign className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('currentWeight')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Current Weight: Volume concentration at current price level (%)"
                  >
                    <Scale className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('lower2Sum')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Lower 2 Sum: Current slot + lower lower slot volume weight (%)"
                  >
                    <ArrowDown className="w-4 h-4" />
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('lowerSum')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Lower Sum: Current slot + immediate lower slot volume weight (%)"
                  >
                    <ArrowDown className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('upperSum')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Upper Sum: Current slot + immediate upper slot volume weight (%)"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('upper2Sum')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Upper 2 Sum: Current slot + upper upper slot volume weight (%)"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <ArrowUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('sumDiff')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Difference (Upper - Lower): Indicates volume distribution bias direction"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('diff2')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Difference 2 (Upper 2 - Lower 2): Extended volume distribution bias"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <ArrowLeftRight className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  <button
                    onClick={() => handleSort('change7d')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="7-Day Percentage Change: Price change over last 7 trading days"
                  >
                    7d
                    <TrendingUp className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300" title="Volume Legend: Visual distribution of volume across price levels (sorted by current weight)">
                  <button
                    onClick={() => handleSort('currentWeight')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <Waves className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300" title="Actions: View chart, add to backtest, reload, or remove stock">
                  <div className="flex justify-center">
                    <Settings className="w-4 h-4" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300" title="Last Run: When this stock was last analyzed">
                  <button
                    onClick={() => handleSort('lastRunTime')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <Clock className="w-4 h-4" />
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-4 py-8 text-center text-slate-400">
                    {scanning ? 'Scanning stocks...' : 'No results. Click "Load Heavy Vol" to start scanning.'}
                  </td>
                </tr>
              ) : (
                sortedResults.map((result, idx) => (
                  <tr
                    key={`${result.symbol}-${idx}`}
                    className="border-b border-slate-700 hover:bg-slate-750"
                  >
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(result.symbol)}
                        onChange={() => handleToggleRow(result.symbol)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {result.symbol}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        result.market === 'US' ? 'bg-blue-600 text-white' :
                        result.market === 'HK' ? 'bg-purple-600 text-white' :
                        result.market === 'CN' ? 'bg-red-600 text-white' :
                        'bg-slate-600 text-white'
                      }`}>
                        {result.market}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-slate-300 cursor-help"
                      title={formatDateRange(result.startDate, result.endDate)}
                    >
                      {result.period}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {result.dataPoints}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">
                      {result.avgTxn >= 1000000000
                        ? `$${(result.avgTxn / 1000000000).toFixed(2)}B`
                        : result.avgTxn >= 1000000
                        ? `$${(result.avgTxn / 1000000).toFixed(2)}M`
                        : result.avgTxn >= 1000
                        ? `$${(result.avgTxn / 1000).toFixed(2)}K`
                        : `$${result.avgTxn.toFixed(0)}`
                      }
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
                          backgroundColor: result.lower2Sum >= selectedThreshold ? '#22c55e' : '#64748b',
                          color: '#ffffff'
                        }}
                      >
                        {result.lower2Sum.toFixed(1)}%
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
                      <span
                        className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: result.upper2Sum >= selectedThreshold ? '#22c55e' : '#64748b',
                          color: '#ffffff'
                        }}
                      >
                        {result.upper2Sum.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: result.sumDiff >= 0 ? '#3b82f6' : '#ef4444',
                            color: '#ffffff'
                          }}
                        >
                          {result.sumDiff >= 0 ? '+' : ''}{result.sumDiff.toFixed(1)}%
                        </span>
                        {result.sumDiff > 0 ? (
                          <ArrowUp className="w-4 h-4 text-blue-500" />
                        ) : result.sumDiff < 0 ? (
                          <ArrowDown className="w-4 h-4 text-red-500" />
                        ) : (
                          <Minus className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: result.diff2 >= 0 ? '#3b82f6' : '#ef4444',
                            color: '#ffffff'
                          }}
                        >
                          {result.diff2 >= 0 ? '+' : ''}{result.diff2.toFixed(1)}%
                        </span>
                        {result.diff2 > 0 ? (
                          <ArrowUp className="w-4 h-4 text-blue-500" />
                        ) : result.diff2 < 0 ? (
                          <ArrowDown className="w-4 h-4 text-red-500" />
                        ) : (
                          <Minus className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {result.change7d > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : result.change7d < 0 ? (
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        ) : (
                          <Minus className="w-4 h-4 text-slate-500" />
                        )}
                        <span className={`text-sm font-medium ${
                          result.change7d > 0 ? 'text-green-500' :
                          result.change7d < 0 ? 'text-red-500' :
                          'text-slate-500'
                        }`}>
                          {result.change7d > 0 ? '+' : ''}{result.change7d.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {result.volumeLegend && (
                        <VolumeLegendPills legend={result.volumeLegend} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onAnalyzeWithVolProf?.(result.symbol)}
                          className="text-slate-400 hover:text-cyan-500 transition-colors"
                          title="View in Technical Analysis with Vol Prof V2"
                        >
                          <TrendingUp className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => onV3BacktestSelect?.(result.symbol, result.days)}
                          className="text-slate-400 hover:text-purple-500 transition-colors"
                          title="View in V3 Backtest"
                        >
                          <BarChart2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleReloadStock(result.symbol, result.days)}
                          className="text-slate-400 hover:text-blue-500 transition-colors"
                          title="Reload this stock"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleRemoveResult(result.symbol)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove this stock"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {formatLastRunTime(result.lastRunTime)}
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
            {' '}with |Diff (U-L)| ≥ {selectedThreshold}%
            {limitReached && stockLimit !== -1 && (
              <span className="ml-2 text-green-400 font-semibold">
                (Limit of {stockLimit} reached - scan stopped)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-start gap-3 bg-slate-900 border border-blue-500 text-blue-100 px-4 py-3 rounded-lg shadow-xl max-w-sm">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div className="text-sm leading-relaxed flex-1">{toastMessage}</div>
            <button
              type="button"
              onClick={dismissToast}
              className="ml-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-200">
                {editingJobId ? 'Edit Scheduled Job' : 'Schedule Heavy Vol Scan'}
              </h3>
              <button
                onClick={() => {
                  setShowScheduleModal(false)
                  setEditingJobId(null)
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Settings Display */}
              <div className="bg-slate-700/50 p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Market:</span>
                  <span className="text-white font-medium">{selectedMarket}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Period:</span>
                  <span className="text-white font-medium">{periods.find(p => p.value === selectedPeriod)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Volume Filter:</span>
                  <span className="text-white font-medium">{selectedThreshold}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Stock Limit:</span>
                  <span className="text-white font-medium">{stockLimit === -1 ? 'ALL' : stockLimit}</span>
                </div>
              </div>

              {/* Date Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Time Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Info */}
              <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-300">
                    This job will run once at the scheduled time with the current settings shown above.
                    You'll receive a notification when complete.
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowScheduleModal(false)
                    setEditingJobId(null)
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleQueueJob}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  {editingJobId ? 'Update Job' : 'Queue Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show Queue Modal */}
      {showQueueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-200">
                Scheduled Jobs Queue ({scheduleQueue.length})
              </h3>
              <button
                onClick={() => setShowQueueModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {scheduleQueue.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No scheduled jobs in queue</p>
                <p className="text-sm mt-1">Click "Schedule" to add a job</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduleQueue
                  .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime))
                  .map(job => {
                    const scheduledDate = new Date(job.scheduledTime)
                    const isPast = scheduledDate < new Date()
                    return (
                      <div
                        key={job.id}
                        className={`bg-slate-700/50 p-4 rounded-lg border ${
                          isPast ? 'border-yellow-600/50' : 'border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <div className="text-slate-400 text-xs mb-1">Market</div>
                              <div className="text-white font-medium">{job.market}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs mb-1">Period</div>
                              <div className="text-white font-medium">
                                {periods.find(p => p.value === job.period)?.label || job.period}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs mb-1">Threshold</div>
                              <div className="text-white font-medium">{job.threshold}%</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs mb-1">Stock Limit</div>
                              <div className="text-white font-medium">
                                {job.stockLimit === -1 ? 'ALL' : job.stockLimit}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-slate-400 text-xs mb-1">Scheduled Time</div>
                              <div className={`font-medium ${isPast ? 'text-yellow-400' : 'text-green-400'}`}>
                                {scheduledDate.toLocaleString()}
                                {isPast && ' (Pending execution)'}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditJob(job)}
                              className="text-blue-400 hover:text-blue-300 transition-colors"
                              title="Edit job"
                            >
                              <Settings className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteJob(job.id)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                              title="Delete job"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            <div className="mt-4 p-3 bg-purple-900/20 border border-purple-700/50 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-purple-300">
                  Jobs will run automatically at their scheduled time. Keep this browser tab open for scheduled scans to execute.
                  Each job runs once and is removed from the queue after completion.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StockFiltering
