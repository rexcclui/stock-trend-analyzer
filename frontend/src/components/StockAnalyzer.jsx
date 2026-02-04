import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings, ChevronDown, ChevronUp, RefreshCw, Filter, Menu, ZoomIn, LineChart, ArrowUp, ArrowDown } from 'lucide-react'
import PriceChart from './PriceChart'
import IndicatorsChart from './IndicatorsChart'
import StatisticsCharts from './StatisticsCharts'
import SignalsList from './SignalsList'
import { apiCache } from '../utils/apiCache'
import { joinUrl } from '../utils/urlHelper'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STOCK_HISTORY_KEY = 'stockSearchHistory'

// Helper function to get the step size for a given SMA value
function getSmaStepSize(value) {
  if (value <= 10) return 1
  if (value <= 20) return 2
  if (value <= 40) return 3
  if (value <= 50) return 4
  if (value <= 100) return 5
  return 10
}

// Helper function to snap SMA value to nearest valid increment
function snapToValidSmaValue(value) {
  // Clamp to min/max range
  if (value < 3) return 3
  if (value > 200) return 200

  // Define ranges and their increments
  if (value <= 10) {
    // Increment 1 between 3 and 10
    return Math.round(value)
  } else if (value <= 20) {
    // Increment 2 from 10 to 20
    return Math.round(value / 2) * 2
  } else if (value <= 40) {
    // Increment 3 from 20 to 40
    return Math.round(value / 3) * 3
  } else if (value <= 50) {
    // Increment 4 from 40 to 50
    return Math.round(value / 4) * 4
  } else if (value <= 100) {
    // Increment 5 from 50 to 100
    return Math.round(value / 5) * 5
  } else {
    // Increment 10 from 100 to 200
    return Math.round(value / 10) * 10
  }
}

// Helper function to increment SMA value by the appropriate step
function incrementSmaValue(value) {
  const step = getSmaStepSize(value)
  return snapToValidSmaValue(value + step)
}

// Helper function to decrement SMA value by the appropriate step
function decrementSmaValue(value) {
  const step = getSmaStepSize(value - 1) // Use step size for the previous range
  return snapToValidSmaValue(value - step)
}

// Helper function to process stock symbol - convert numbers to .HK format
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

  // Otherwise, return as is (e.g., MS, MSFT, etc.)
  return trimmed
}

// Helper function to parse multiple stock symbols from input
function parseStockSymbols(input) {
  if (!input || !input.trim()) return []

  // Split by comma or space
  const symbols = input.split(/[,\s]+/).filter(s => s.trim())

  // Process each symbol
  return symbols.map(processStockSymbol).filter(s => s !== null)
}

// Helper function to get the fetch period based on display period
// Fetch exactly what's requested - no over-fetching
function getFetchPeriod(displayDays) {
  return String(displayDays)
}

// Helper function to calculate percentage change for visible range
// Data is in newest→oldest order, so index 0 is the most recent price
// Returns { percentChange, days } or null
function calculateVisibleRangeChange(prices, zoomRange) {
  if (!prices || prices.length === 0) return null

  const endIndex = zoomRange.end === null ? prices.length : zoomRange.end
  const visiblePrices = prices.slice(zoomRange.start, endIndex)

  if (visiblePrices.length < 2) return null

  const newestPrice = visiblePrices[0]?.close
  const oldestPrice = visiblePrices[visiblePrices.length - 1]?.close
  const newestDate = visiblePrices[0]?.date
  const oldestDate = visiblePrices[visiblePrices.length - 1]?.date

  if (!newestPrice || !oldestPrice || oldestPrice === 0) return null

  const percentChange = ((newestPrice - oldestPrice) / oldestPrice) * 100

  // Calculate days between oldest and newest dates
  let days = visiblePrices.length // Default to number of data points
  if (newestDate && oldestDate) {
    const newest = new Date(newestDate)
    const oldest = new Date(oldestDate)
    days = Math.round((newest - oldest) / (1000 * 60 * 60 * 24))
  }

  return { percentChange, days }
}

function StockAnalyzer({ selectedSymbol, selectedParams }) {
  const [symbol, setSymbol] = useState('')
  const [days, setDays] = useState('365')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [charts, setCharts] = useState([])
  const [syncedMouseDate, setSyncedMouseDate] = useState(null)
  const [stockHistory, setStockHistory] = useState([])
  const [displayColumns, setDisplayColumns] = useState(1)
  const [chartHeight, setChartHeight] = useState(520) // Increased by 30% from 400
  const [optimalParams, setOptimalParams] = useState(null)

  // Handle external symbol selection (from backtest results)
  useEffect(() => {
    if (selectedSymbol && selectedSymbol.trim()) {
      setSymbol(selectedSymbol)
      // Set days to match backtest period if params provided
      if (selectedParams) {
        // Use the days from selectedParams if available, otherwise default to 5Y
        setDays(selectedParams.days || '1825')
      }
      // Trigger analysis for the selected symbol, passing params directly
      analyzeStock(selectedSymbol, selectedParams)
    }
  }, [selectedSymbol, selectedParams])
  const [slopeChannelDialogOpen, setSlopeChannelDialogOpen] = useState(false)
  const [editingSlopeChannelChartId, setEditingSlopeChannelChartId] = useState(null)
  const [globalZoomRange, setGlobalZoomRange] = useState({ start: 0, end: null })
  const [loadingComparisonStocks, setLoadingComparisonStocks] = useState({}) // Track loading state per chart
  const [loadingMktGap, setLoadingMktGap] = useState({}) // Track loading state for Mkt Gap data
  const [mobileControlsVisible, setMobileControlsVisible] = useState({}) // Track mobile controls visibility per chart

  // Refs for press-and-hold functionality on SMA increment/decrement buttons
  const smaButtonIntervalRef = useRef(null)
  const smaButtonTimeoutRef = useRef(null)

  // Track SMA simulation state (chartId-index pairs that are simulating)
  const [simulatingSma, setSimulatingSma] = useState({})

  // Track comprehensive SMA+bounds simulation state (chartId-index pairs)
  const [simulatingComprehensive, setSimulatingComprehensive] = useState({})

  // Track breakout threshold simulation state (chartId that is simulating)
  const [simulatingBreakoutThreshold, setSimulatingBreakoutThreshold] = useState({})
  const [rsiSimulationResults, setRsiSimulationResults] = useState({})

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

  // Listen for history updates from other components (e.g., backtesting tab)
  useEffect(() => {
    const handleHistoryUpdate = (event) => {
      if (Array.isArray(event.detail)) {
        setStockHistory(event.detail)
      }
    }

    window.addEventListener('stockHistoryUpdated', handleHistoryUpdate)
    return () => window.removeEventListener('stockHistoryUpdated', handleHistoryUpdate)
  }, [])

  const saveToHistory = (stockSymbol) => {
    const updatedHistory = [stockSymbol, ...stockHistory.filter(s => s !== stockSymbol)].slice(0, 10)
    setStockHistory(updatedHistory)
    localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(updatedHistory))
    window.dispatchEvent(new CustomEvent('stockHistoryUpdated', { detail: updatedHistory }))
  }

  const analyzeStock = async (symbolToAnalyze = null, params = null) => {
    // Check if symbolToAnalyze is a string (not an event object)
    const targetSymbol = (typeof symbolToAnalyze === 'string') ? symbolToAnalyze : symbol

    if (!targetSymbol.trim()) {
      setError('Please enter a stock symbol')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Parse multiple symbols from input
      const symbols = parseStockSymbols(targetSymbol)

      if (symbols.length === 0) {
        setError('Please enter valid stock symbol(s)')
        setLoading(false)
        return
      }

      // Smart pre-loading: fetch more data than displayed to enable smooth panning
      // Use days from params if provided (from backtest results), otherwise use state
      const displayDays = params?.days || days
      // IMPORTANT: If params provided (from backtest), fetch EXACT amount to match backtest data
      // Otherwise use smart pre-loading for smooth panning
      const fetchDays = params?.days ? displayDays : getFetchPeriod(displayDays)

      const newCharts = []
      const errors = []

      // Fetch data for each symbol
      const forceVolumeProfileV2 = params?.forceVolumeProfileV2 === true
      const hasOptimalParams = Array.isArray(params?.smaPeriods) && params.smaPeriods.length > 0
      const defaultSMAs = hasOptimalParams ? params.smaPeriods : []
      const defaultSMAVisibility = hasOptimalParams
        ? params.smaPeriods.reduce((acc, period) => ({ ...acc, [period]: true }), {})
        : {}

      for (const upperSymbol of symbols) {
        try {
          // Try to get from cache first (use fetch period for cache key)
          let data = apiCache.get(upperSymbol, fetchDays)

          // If V3 backtest provided the latest date and cached data is older, force refresh
          const expectedLatestDate = params?.expectedLatestDate
          const cachedLatestDate = data?.prices?.[0]?.date
          if (data && expectedLatestDate && cachedLatestDate && cachedLatestDate !== expectedLatestDate) {
            data = null
          }

          if (!data) {
            const response = await axios.get(joinUrl(API_URL, '/analyze'), {
              params: {
                symbol: upperSymbol,
                days: fetchDays  // Fetch more data than displayed
              }
            })
            data = response.data

            // Store in cache (use fetch period for cache key)
            apiCache.set(upperSymbol, fetchDays, data)
          }

          // Save to history
          saveToHistory(upperSymbol)
          // Create new chart
          const newChart = {
            id: Date.now() + newCharts.length, // Ensure unique IDs
            symbol: upperSymbol,
            data: data,
            showRSI: false,
            showMACD: false,
            showStatistics: false,
            smaPeriods: defaultSMAs,
            smaVisibility: defaultSMAVisibility,
            smaChannelUpperPercent: defaultSMAs.reduce((acc, period) => ({ ...acc, [period]: 5 }), {}),
            smaChannelLowerPercent: defaultSMAs.reduce((acc, period) => ({ ...acc, [period]: 5 }), {}),
            smaChannelUpperEnabled: {}, // Track which SMAs have upper bound enabled
            smaChannelLowerEnabled: {}, // Track which SMAs have lower bound enabled
            smaOptimalTouches: {}, // Stores optimal touch counts from simulation: { period: { upper: N, lower: M, total: N+M } }
            volumeColorEnabled: false,
            volumeColorMode: 'absolute',
            volumeProfileEnabled: false,
            volumeProfileMode: 'auto',
            volumeProfileManualRanges: [],
            volumeProfileV2Enabled: params?.volumeProfileV3Enabled ? false : (hasOptimalParams || forceVolumeProfileV2),
            volumeProfileV2StartDate: null,
            volumeProfileV2EndDate: null,
            volumeProfileV2RefreshTrigger: 0,
            volumeProfileV2Params: params?.volumeProfileV3Enabled ? null : (hasOptimalParams || forceVolumeProfileV2 ? params : null),
            volumeProfileV2BreakoutThreshold: params?.breakoutThreshold ? params.breakoutThreshold * 100 : 6,  // Store as percentage (6% default)
            volumeProfileV3Enabled: params?.volumeProfileV3Enabled || false,
            volumeProfileV3RefreshTrigger: 0,
            volumeProfileV3RegressionThreshold: params?.regressionThreshold ?? 6,
            spyData: null,
            performanceComparisonEnabled: false,
            performanceComparisonBenchmark: 'SPY',
            performanceComparisonDays: 30,
            comparisonMode: 'line',
            comparisonStocks: [],
            slopeChannelEnabled: false,
            slopeChannelVolumeWeighted: false,
            slopeChannelZones: 8,
            slopeChannelDataPercent: 30,
            slopeChannelWidthMultiplier: 2.5,
            revAllChannelEnabled: false,
            revAllChannelEndIndex: null,
            revAllChannelRefreshTrigger: 0,
            revAllChannelVolumeFilterEnabled: false,
            manualChannelEnabled: false,
            manualChannelDragMode: false,
            zoomMode: false,
            linearRegressionEnabled: false,
            linearRegressionSelections: [],
            bestChannelEnabled: false,
            bestChannelVolumeFilterEnabled: false,
            bestStdevEnabled: false,
            bestStdevVolumeFilterEnabled: false,
            bestStdevRefreshTrigger: 0,
            mktGapOpenEnabled: false,
            mktGapOpenCount: 5,
            mktGapOpenRefreshTrigger: 0,
            resLnEnabled: false,
            resLnRange: 100,
            resLnRefreshTrigger: 0,
            vsSpyVolEnabled: false,
            vsSpyVolBackDays: 30,
            collapsed: false
          }
          newCharts.push(newChart)
        } catch (err) {
          console.error(`[Error] Failed to fetch ${upperSymbol}:`, err)
          errors.push(`${upperSymbol}: ${err.response?.data?.error || 'Failed to fetch'}`)
        }
      }

      // Log cache statistics
      apiCache.logStats()

      // Add all successfully fetched charts
      if (newCharts.length > 0) {
        setCharts(prevCharts => [...newCharts, ...prevCharts])
      }

      // Show errors if any
      if (errors.length > 0) {
        setError(`Failed to fetch some symbols: ${errors.join(', ')}`)
      }

      // Clear input if not clicked from history
      if (!symbolToAnalyze) {
        setSymbol('')
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze stock. Please check the symbol and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleHistoryClick = (stockSymbol) => {
    setSymbol(stockSymbol)
    analyzeStock(stockSymbol)
  }

  const removeChart = (chartId) => {
    setCharts(prevCharts => prevCharts.filter(chart => chart.id !== chartId))
  }

  const updateChartIndicator = (chartId, indicator, value) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, [indicator]: value }
          : chart
      )
    )
  }

  const updateGlobalZoom = (zoomRange) => {
    setGlobalZoomRange(zoomRange)
  }

  const updateSmaPeriods = (chartId, newPeriods) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const newVisibility = {}
          const newUpperPercent = {}
          const newLowerPercent = {}
          const newUpperEnabled = {}
          const newLowerEnabled = {}
          const newOptimalTouches = {}
          newPeriods.forEach(period => {
            newVisibility[period] = chart.smaVisibility?.[period] ?? true
            newUpperPercent[period] = chart.smaChannelUpperPercent?.[period] ?? 5
            newLowerPercent[period] = chart.smaChannelLowerPercent?.[period] ?? 5
            newUpperEnabled[period] = chart.smaChannelUpperEnabled?.[period] ?? false
            newLowerEnabled[period] = chart.smaChannelLowerEnabled?.[period] ?? false
            if (chart.smaOptimalTouches?.[period]) {
              newOptimalTouches[period] = chart.smaOptimalTouches[period]
            }
          })
          return {
            ...chart,
            smaPeriods: newPeriods,
            smaVisibility: newVisibility,
            smaChannelUpperPercent: newUpperPercent,
            smaChannelLowerPercent: newLowerPercent,
            smaChannelUpperEnabled: newUpperEnabled,
            smaChannelLowerEnabled: newLowerEnabled,
            smaOptimalTouches: newOptimalTouches
          }
        }
        return chart
      })
    )
  }

  const handleSimulateSma = (chartId, smaIndex, optimalValue) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const newPeriods = [...chart.smaPeriods]
          const oldPeriod = newPeriods[smaIndex]
          newPeriods[smaIndex] = optimalValue
          const newVisibility = {}
          const newUpperPercent = {}
          const newLowerPercent = {}
          newPeriods.forEach(period => {
            newVisibility[period] = chart.smaVisibility?.[period] ?? true
            newUpperPercent[period] = chart.smaChannelUpperPercent?.[period] ?? chart.smaChannelUpperPercent?.[oldPeriod] ?? 5
            newLowerPercent[period] = chart.smaChannelLowerPercent?.[period] ?? chart.smaChannelLowerPercent?.[oldPeriod] ?? 5
          })
          return {
            ...chart,
            smaPeriods: newPeriods,
            smaVisibility: newVisibility,
            smaChannelUpperPercent: newUpperPercent,
            smaChannelLowerPercent: newLowerPercent
          }
        }
        return chart
      })
    )
  }

  const toggleSmaVisibility = (chartId, period) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            smaVisibility: {
              ...chart.smaVisibility,
              [period]: !chart.smaVisibility[period]
            }
          }
        }
        return chart
      })
    )
  }

  const updateBreakoutThreshold = (chartId, newThreshold) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV2BreakoutThreshold: newThreshold,
            volumeProfileV2RefreshTrigger: chart.volumeProfileV2RefreshTrigger + 1  // Trigger refresh
          }
        }
        return chart
      })
    )
  }

  const handleSimulateBreakoutThreshold = (chartId, optimalValue, optimalSMA) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV2BreakoutThreshold: optimalValue,
            volumeProfileV2RefreshTrigger: chart.volumeProfileV2RefreshTrigger + 1  // Trigger refresh
          }
        }
        return chart
      })
    )
  }

  const deleteSma = (chartId, period) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const newPeriods = chart.smaPeriods.filter(p => p !== period)
          const newVisibility = { ...chart.smaVisibility }
          const newUpperPercent = { ...chart.smaChannelUpperPercent }
          const newLowerPercent = { ...chart.smaChannelLowerPercent }
          const newUpperEnabled = { ...chart.smaChannelUpperEnabled }
          const newLowerEnabled = { ...chart.smaChannelLowerEnabled }
          const newOptimalTouches = { ...chart.smaOptimalTouches }
          delete newVisibility[period]
          delete newUpperPercent[period]
          delete newLowerPercent[period]
          delete newUpperEnabled[period]
          delete newLowerEnabled[period]
          delete newOptimalTouches[period]
          return {
            ...chart,
            smaPeriods: newPeriods,
            smaVisibility: newVisibility,
            smaChannelUpperPercent: newUpperPercent,
            smaChannelLowerPercent: newLowerPercent,
            smaChannelUpperEnabled: newUpperEnabled,
            smaChannelLowerEnabled: newLowerEnabled,
            smaOptimalTouches: newOptimalTouches
          }
        }
        return chart
      })
    )
  }

  const updateSmaChannelPercent = (chartId, period, type, value) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          if (type === 'upper') {
            return {
              ...chart,
              smaChannelUpperPercent: {
                ...chart.smaChannelUpperPercent,
                [period]: value
              }
            }
          } else {
            return {
              ...chart,
              smaChannelLowerPercent: {
                ...chart.smaChannelLowerPercent,
                [period]: value
              }
            }
          }
        }
        return chart
      })
    )
  }

  const toggleSmaChannelBound = (chartId, period, boundType) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          if (boundType === 'upper') {
            const newEnabled = { ...chart.smaChannelUpperEnabled }
            newEnabled[period] = !newEnabled[period]
            return {
              ...chart,
              smaChannelUpperEnabled: newEnabled
            }
          } else {
            const newEnabled = { ...chart.smaChannelLowerEnabled }
            newEnabled[period] = !newEnabled[period]
            return {
              ...chart,
              smaChannelLowerEnabled: newEnabled
            }
          }
        }
        return chart
      })
    )
  }

  const getTolerance = (smaPeriod) => {
    // Dynamic tolerance based on SMA period
    if (smaPeriod <= 5) return 0.3
    if (smaPeriod < 10) return 0.75
    if (smaPeriod < 15) return 1.2
    if (smaPeriod < 20) return 1.5
    if (smaPeriod < 25) return 2
    if (smaPeriod < 30) return 2.25
    if (smaPeriod < 40) return 3
    if (smaPeriod < 50) return 3.75
    if (smaPeriod < 60) return 4
    if (smaPeriod < 75) return 5
    if (smaPeriod < 100) return 6
    return 6 // 100 and above
  }

  const simulateSmaChannelPercent = (chartId, period, prices, smaData, enabledBounds = { upper: true, lower: true }, visibleRange = null) => {
    // Find optimal upper and lower percentages that touch the most turning points
    // "Touch" means the bound is within tolerance% absolute variance of the price
    // Tolerance is dynamic based on SMA period
    // enabledBounds specifies which bounds to optimize (upper, lower, or both)
    // visibleRange specifies the data range to use (null = use all data)
    if (!prices || !smaData || prices.length === 0 || smaData.length === 0) {
      return { upper: 5, lower: 5, upperTouches: 0, lowerTouches: 0, totalTouches: 0 }
    }

    // Apply visible range filter if provided
    let filteredPrices = prices
    let filteredSmaData = smaData
    if (visibleRange) {
      const start = visibleRange.start || 0
      const end = visibleRange.end || prices.length
      filteredPrices = prices.slice(start, end)
      filteredSmaData = smaData.slice(start, end)
    }

    const tolerance = getTolerance(period)
    const windowSize = 5 // N days before and after

    // Identify turning points (local maxima and minima)
    const turningPoints = []
    for (let i = windowSize; i < filteredPrices.length - windowSize; i++) {
      if (!filteredSmaData[i] || filteredSmaData[i] <= 0) continue

      const curr = filteredPrices[i].close

      // Check if this is a local maximum within the window
      let isMaximum = true
      let isMinimum = true

      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue // Skip the current point itself

        const comparePrice = filteredPrices[j].close
        if (comparePrice >= curr) {
          isMaximum = false
        }
        if (comparePrice <= curr) {
          isMinimum = false
        }

        // Early exit if neither
        if (!isMaximum && !isMinimum) break
      }

      // Local maximum (Higher than all points in the N-day window)
      if (isMaximum) {
        turningPoints.push({ index: i, type: 'max', price: curr, sma: filteredSmaData[i] })
      }
      // Local minimum (Lower than all points in the N-day window)
      else if (isMinimum) {
        turningPoints.push({ index: i, type: 'min', price: curr, sma: filteredSmaData[i] })
      }
    }

    if (turningPoints.length === 0) {
      return { upper: 5, lower: 5, upperTouches: 0, lowerTouches: 0, totalTouches: 0 }
    }

    // Separate maxima and minima
    const maxima = turningPoints.filter(tp => tp.type === 'max')
    const minima = turningPoints.filter(tp => tp.type === 'min')

    // Test different percentage values and count touches
    // Test from 1% to 30% in 0.5% increments
    const testPercentages = []
    for (let p = 1; p <= 30; p += 0.5) {
      testPercentages.push(p)
    }

    let bestUpper = 5
    let bestUpperTouches = 0
    let bestLower = 5
    let bestLowerTouches = 0
    let bestTotalTouches = 0
    let bestContainmentRate = 0

    // Test combinations of upper and lower bounds
    // Find the combination that maximizes touches while keeping 75%+ prices within channel
    // If touches are equal, prefer higher containment rate
    // Only test bounds that are enabled
    const upperPercentagesToTest = enabledBounds.upper ? testPercentages : [bestUpper]
    const lowerPercentagesToTest = enabledBounds.lower ? testPercentages : [bestLower]

    upperPercentagesToTest.forEach(upperPct => {
      lowerPercentagesToTest.forEach(lowerPct => {
        // Check containment rules separately for upper and lower bounds
        // Upper bound: 75% of prices ABOVE SMA should be within upper bound
        // Lower bound: 75% of prices BELOW SMA should be within lower bound
        let pricesAboveSma = 0
        let pricesAboveSmaWithinUpperBound = 0
        let pricesBelowSma = 0
        let pricesBelowSmaWithinLowerBound = 0

        for (let i = 0; i < filteredPrices.length; i++) {
          if (!filteredSmaData[i] || filteredSmaData[i] <= 0) continue

          const price = filteredPrices[i].close
          const sma = filteredSmaData[i]
          const upperBound = sma * (1 + upperPct / 100)
          const lowerBound = sma * (1 - lowerPct / 100)

          if (price > sma) {
            pricesAboveSma++
            if (price <= upperBound) {
              pricesAboveSmaWithinUpperBound++
            }
          } else if (price < sma) {
            pricesBelowSma++
            if (price >= lowerBound) {
              pricesBelowSmaWithinLowerBound++
            }
          }
        }

        // Calculate containment rates
        const upperContainmentRate = pricesAboveSma > 0 ? pricesAboveSmaWithinUpperBound / pricesAboveSma : 1
        const lowerContainmentRate = pricesBelowSma > 0 ? pricesBelowSmaWithinLowerBound / pricesBelowSma : 1

        // Check if containment rules are satisfied
        if (enabledBounds.upper && upperContainmentRate < 0.75) {
          return // Skip if upper bound doesn't contain 75% of prices above SMA
        }
        if (enabledBounds.lower && lowerContainmentRate < 0.75) {
          return // Skip if lower bound doesn't contain 75% of prices below SMA
        }

        // Calculate overall containment rate for tiebreaker (average of both)
        const containmentRate = (upperContainmentRate + lowerContainmentRate) / 2

        // Count touches for this combination
        let upperTouches = 0
        let lowerTouches = 0

        maxima.forEach(tp => {
          const upperBound = tp.sma * (1 + upperPct / 100)
          const variance = Math.abs(upperBound - tp.price) / tp.price * 100
          if (variance <= tolerance) {
            upperTouches++
          }
        })

        minima.forEach(tp => {
          const lowerBound = tp.sma * (1 - lowerPct / 100)
          const variance = Math.abs(lowerBound - tp.price) / tp.price * 100
          if (variance <= tolerance) {
            lowerTouches++
          }
        })

        const totalTouches = upperTouches + lowerTouches

        // Keep the combination with the most total touches
        // If touches are equal, prefer higher containment rate (more data within bounds)
        if (totalTouches > bestTotalTouches ||
            (totalTouches === bestTotalTouches && containmentRate > bestContainmentRate)) {
          bestTotalTouches = totalTouches
          bestUpperTouches = upperTouches
          bestLowerTouches = lowerTouches
          bestUpper = upperPct
          bestLower = lowerPct
          bestContainmentRate = containmentRate
        }
      })
    })

    // Round to 1 decimal place
    return {
      upper: Math.round(bestUpper * 10) / 10,
      lower: Math.round(bestLower * 10) / 10,
      upperTouches: bestUpperTouches,
      lowerTouches: bestLowerTouches,
      totalTouches: bestUpperTouches + bestLowerTouches
    }
  }

  const simulateComprehensive = async (chartId, smaIndex, prices, chart, forcedEnabledBounds = null, visibleRange = null) => {
    // Find optimal SMA period AND upper/lower bounds that touch the most turning points
    if (!prices || prices.length === 0) return null

    // Apply visible range filter if provided
    let filteredPrices = prices
    if (visibleRange) {
      const start = visibleRange.start || 0
      const end = visibleRange.end || prices.length
      filteredPrices = prices.slice(start, end)
    }

    // Get which bounds are enabled from the current period or use forced bounds
    const currentPeriod = chart.smaPeriods[smaIndex]
    const enabledBounds = forcedEnabledBounds || {
      upper: chart.smaChannelUpperEnabled?.[currentPeriod] ?? false,
      lower: chart.smaChannelLowerEnabled?.[currentPeriod] ?? false
    }

    // Test SMA periods: use common values
    const testPeriods = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 120, 150, 200]

    let bestResult = { period: 10, upper: 5, lower: 5, totalTouches: 0, containmentRate: 0 }

    // For each SMA period, find optimal bounds
    for (const period of testPeriods) {
      // Calculate SMA for this period (Newest -> Oldest direction)
      const smaData = []
      for (let i = 0; i < filteredPrices.length; i++) {
        // We need 'period' number of points from i to i + period - 1
        if (i + period - 1 >= filteredPrices.length) {
          smaData.push(null) // Not enough older data to calculate SMA
        } else {
          let sum = 0
          for (let j = 0; j < period; j++) {
            sum += filteredPrices[i + j].close
          }
          smaData.push(sum / period)
        }
      }

      // Find optimal bounds for this period, only for enabled bounds (no need to pass visibleRange as we already filtered)
      const result = simulateSmaChannelPercent(chartId, period, filteredPrices, smaData, enabledBounds)

      // Calculate containment rate for this configuration
      // Upper bound: 75% of prices ABOVE SMA should be within upper bound
      // Lower bound: 75% of prices BELOW SMA should be within lower bound
      let pricesAboveSma = 0
      let pricesAboveSmaWithinUpperBound = 0
      let pricesBelowSma = 0
      let pricesBelowSmaWithinLowerBound = 0

      for (let i = 0; i < filteredPrices.length; i++) {
        if (!smaData[i] || smaData[i] <= 0) continue

        const price = filteredPrices[i].close
        const sma = smaData[i]
        const upperBound = sma * (1 + result.upper / 100)
        const lowerBound = sma * (1 - result.lower / 100)

        if (price > sma) {
          pricesAboveSma++
          if (price <= upperBound) {
            pricesAboveSmaWithinUpperBound++
          }
        } else if (price < sma) {
          pricesBelowSma++
          if (price >= lowerBound) {
            pricesBelowSmaWithinLowerBound++
          }
        }
      }

      // Calculate containment rates
      const upperContainmentRate = pricesAboveSma > 0 ? pricesAboveSmaWithinUpperBound / pricesAboveSma : 1
      const lowerContainmentRate = pricesBelowSma > 0 ? pricesBelowSmaWithinLowerBound / pricesBelowSma : 1
      const containmentRate = (upperContainmentRate + lowerContainmentRate) / 2

      // Count total touches for this configuration
      const tolerance = getTolerance(period)
      const windowSize = 5 // N days before and after
      const turningPoints = []
      for (let i = windowSize; i < filteredPrices.length - windowSize; i++) {
        if (!smaData[i] || smaData[i] <= 0) continue

        const curr = filteredPrices[i].close

        // Check if this is a local maximum/minimum within the window
        let isMaximum = true
        let isMinimum = true

        for (let j = i - windowSize; j <= i + windowSize; j++) {
          if (j === i) continue

          const comparePrice = filteredPrices[j].close
          if (comparePrice >= curr) {
            isMaximum = false
          }
          if (comparePrice <= curr) {
            isMinimum = false
          }

          if (!isMaximum && !isMinimum) break
        }

        if (isMaximum) {
          turningPoints.push({ type: 'max', price: curr, sma: smaData[i] })
        } else if (isMinimum) {
          turningPoints.push({ type: 'min', price: curr, sma: smaData[i] })
        }
      }

      let totalTouches = 0
      turningPoints.forEach(tp => {
        if (tp.type === 'max') {
          const upperBound = tp.sma * (1 + result.upper / 100)
          const variance = Math.abs(upperBound - tp.price) / tp.price * 100
          if (variance <= tolerance) totalTouches++
        } else {
          const lowerBound = tp.sma * (1 - result.lower / 100)
          const variance = Math.abs(lowerBound - tp.price) / tp.price * 100
          if (variance <= tolerance) totalTouches++
        }
      })

      // Prefer more touches, but if equal, prefer higher containment rate
      if (totalTouches > bestResult.totalTouches ||
          (totalTouches === bestResult.totalTouches && containmentRate > bestResult.containmentRate)) {
        bestResult = {
          period,
          upper: result.upper,
          lower: result.lower,
          upperTouches: result.upperTouches,
          lowerTouches: result.lowerTouches,
          totalTouches,
          containmentRate
        }
      }
    }

    return bestResult
  }

  const handleComprehensiveSimulation = async (chartId, smaIndex, forcedEnabledBounds = null, visibleRange = null) => {
    // Use setCharts to access the latest chart state (not stale closure)
    let latestChart = null
    setCharts(prevCharts => {
      latestChart = prevCharts.find(c => c.id === chartId)
      return prevCharts // Don't modify, just read
    })

    if (!latestChart || !latestChart.data || !latestChart.data.prices) return

    const smaKey = `${chartId}-${smaIndex}`
    setSimulatingComprehensive(prev => ({ ...prev, [smaKey]: true }))

    // Run simulation asynchronously
    setTimeout(async () => {
      try {
        const result = await simulateComprehensive(chartId, smaIndex, latestChart.data.prices, latestChart, forcedEnabledBounds, visibleRange)

        if (result) {
          // Update the SMA period and bounds
          setCharts(prevCharts =>
            prevCharts.map(c => {
              if (c.id === chartId) {
                const newPeriods = [...c.smaPeriods]
                const oldPeriod = newPeriods[smaIndex]
                newPeriods[smaIndex] = result.period

                const newUpperPercent = { ...c.smaChannelUpperPercent }
                const newLowerPercent = { ...c.smaChannelLowerPercent }
                const newUpperEnabled = { ...c.smaChannelUpperEnabled }
                const newLowerEnabled = { ...c.smaChannelLowerEnabled }

                // Remove old period entries
                delete newUpperPercent[oldPeriod]
                delete newLowerPercent[oldPeriod]

                // Transfer enabled state from old period to new period
                const wasUpperEnabled = newUpperEnabled[oldPeriod] ?? false
                const wasLowerEnabled = newLowerEnabled[oldPeriod] ?? false
                delete newUpperEnabled[oldPeriod]
                delete newLowerEnabled[oldPeriod]
                newUpperEnabled[result.period] = wasUpperEnabled
                newLowerEnabled[result.period] = wasLowerEnabled

                // Add new period entries
                newUpperPercent[result.period] = result.upper
                newLowerPercent[result.period] = result.lower

                const newVisibility = {}
                newPeriods.forEach(period => {
                  newVisibility[period] = c.smaVisibility?.[period] ?? true
                })

                const newOptimalTouches = { ...c.smaOptimalTouches }
                // Remove old period entry
                delete newOptimalTouches[oldPeriod]
                // Add new period entry
                newOptimalTouches[result.period] = {
                  upper: result.upperTouches,
                  lower: result.lowerTouches,
                  total: result.totalTouches
                }

                return {
                  ...c,
                  smaPeriods: newPeriods,
                  smaVisibility: newVisibility,
                  smaChannelUpperPercent: newUpperPercent,
                  smaChannelLowerPercent: newLowerPercent,
                  smaChannelUpperEnabled: newUpperEnabled,
                  smaChannelLowerEnabled: newLowerEnabled,
                  smaOptimalTouches: newOptimalTouches
                }
              }
              return c
            })
          )
        }
      } finally {
        setSimulatingComprehensive(prev => {
          const newState = { ...prev }
          delete newState[smaKey]
          return newState
        })
      }
    }, 100)
  }

  // Helper function to stop SMA button press-and-hold
  const stopSmaButtonHold = () => {
    if (smaButtonTimeoutRef.current) {
      clearTimeout(smaButtonTimeoutRef.current)
      smaButtonTimeoutRef.current = null
    }
    if (smaButtonIntervalRef.current) {
      clearInterval(smaButtonIntervalRef.current)
      smaButtonIntervalRef.current = null
    }
  }

  // Helper function to start SMA button press-and-hold
  const startSmaButtonHold = (chartId, index, direction) => {
    // Clear any existing timers
    stopSmaButtonHold()

    // Function to update the SMA value
    const updateSma = () => {
      setCharts(prevCharts => {
        const chart = prevCharts.find(c => c.id === chartId)
        if (!chart || !chart.smaPeriods[index]) return prevCharts

        const currentPeriod = chart.smaPeriods[index]
        let newValue

        if (direction === 'increment') {
          if (currentPeriod >= 200) return prevCharts
          newValue = incrementSmaValue(currentPeriod)
        } else {
          if (currentPeriod <= 3) return prevCharts
          newValue = decrementSmaValue(currentPeriod)
        }

        return prevCharts.map(c => {
          if (c.id === chartId) {
            const newPeriods = [...c.smaPeriods]
            const oldPeriod = newPeriods[index]
            newPeriods[index] = newValue
            const newVisibility = {}
            const newUpperPercent = {}
            const newLowerPercent = {}
            newPeriods.forEach(period => {
              newVisibility[period] = c.smaVisibility?.[period] ?? true
              newUpperPercent[period] = c.smaChannelUpperPercent?.[period] ?? c.smaChannelUpperPercent?.[oldPeriod] ?? 5
              newLowerPercent[period] = c.smaChannelLowerPercent?.[period] ?? c.smaChannelLowerPercent?.[oldPeriod] ?? 5
            })
            return {
              ...c,
              smaPeriods: newPeriods,
              smaVisibility: newVisibility,
              smaChannelUpperPercent: newUpperPercent,
              smaChannelLowerPercent: newLowerPercent
            }
          }
          return c
        })
      })
    }

    // Execute once immediately
    updateSma()

    // Start repeating after a delay
    smaButtonTimeoutRef.current = setTimeout(() => {
      smaButtonIntervalRef.current = setInterval(updateSma, 100) // Repeat every 100ms
    }, 300) // Wait 300ms before starting repeat
  }

  const openSlopeChannelDialog = (chartId) => {
    setEditingSlopeChannelChartId(chartId)
    setSlopeChannelDialogOpen(true)
  }

  const closeSlopeChannelDialog = () => {
    setSlopeChannelDialogOpen(false)
    setEditingSlopeChannelChartId(null)
  }

  const toggleSlopeChannel = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            slopeChannelEnabled: !chart.slopeChannelEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleSlopeChannelVolumeWeighted = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            slopeChannelVolumeWeighted: !chart.slopeChannelVolumeWeighted
          }
        }
        return chart
      })
    )
  }

  const updateSlopeChannelZones = (chartId, zones) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            slopeChannelZones: zones
          }
        }
        return chart
      })
    )
  }

  const updateSlopeChannelParams = (chartId, params) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            ...params
          }
        }
        return chart
      })
    )
  }

  const toggleRevAllChannel = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            revAllChannelEnabled: !chart.revAllChannelEnabled,
            revAllChannelEndIndex: null
          }
        }
        return chart
      })
    )
  }

  const toggleRevAllChannelVolumeFilter = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            revAllChannelVolumeFilterEnabled: !chart.revAllChannelVolumeFilterEnabled,
            revAllChannelRefreshTrigger: (chart.revAllChannelRefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const toggleManualChannel = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            manualChannelEnabled: !chart.manualChannelEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleLinearRegression = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            linearRegressionEnabled: !chart.linearRegressionEnabled
          }
        }
        return chart
      })
    )
  }

  const addLinearRegressionSelection = (chartId, selection) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            linearRegressionSelections: [...(chart.linearRegressionSelections || []), selection]
          }
        }
        return chart
      })
    )
  }

  const clearLinearRegressionSelections = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            linearRegressionSelections: []
          }
        }
        return chart
      })
    )
  }

  const removeLinearRegressionSelection = (chartId, index) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            linearRegressionSelections: (chart.linearRegressionSelections || []).filter((_, i) => i !== index)
          }
        }
        return chart
      })
    )
  }

  const toggleBestChannel = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            bestChannelEnabled: !chart.bestChannelEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleBestChannelVolumeFilter = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            bestChannelVolumeFilterEnabled: !chart.bestChannelVolumeFilterEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleBestStdev = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            bestStdevEnabled: !chart.bestStdevEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleBestStdevVolumeFilter = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            bestStdevVolumeFilterEnabled: !chart.bestStdevVolumeFilterEnabled,
            bestStdevRefreshTrigger: (chart.bestStdevRefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const refreshBestStdev = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            bestStdevRefreshTrigger: (chart.bestStdevRefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const toggleManualChannelDragMode = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            manualChannelDragMode: !chart.manualChannelDragMode
          }
        }
        return chart
      })
    )
  }

  const toggleMktGapOpen = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    const newState = !chart.mktGapOpenEnabled

    setCharts(prevCharts =>
      prevCharts.map(c => {
        if (c.id === chartId) {
          return {
            ...c,
            mktGapOpenEnabled: newState
          }
        }
        return c
      })
    )

    // If enabling and we don't have SPY data, fetch it
    if (newState && !chart.spyData) {
      setLoadingMktGap(prev => ({ ...prev, [chartId]: true }))
      try {
        // Check cache first
        let spyData = apiCache.get('SPY', days)

        if (!spyData) {
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: days
            }
          })
          spyData = response.data
          apiCache.set('SPY', days, spyData)
        }

        setCharts(prevCharts =>
          prevCharts.map(c => {
            if (c.id === chartId) {
              return {
                ...c,
                spyData: spyData
              }
            }
            return c
          })
        )
      } catch (err) {
        console.error('Failed to fetch SPY data:', err)
        setError('Failed to fetch SPY data for Market Gap Open analysis')
      } finally {
        setLoadingMktGap(prev => {
          const newState = { ...prev }
          delete newState[chartId]
          return newState
        })
      }
    }
  }

  const updateMktGapOpenCount = (chartId, count) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            mktGapOpenCount: count
          }
        }
        return chart
      })
    )
  }

  const refreshMktGapOpen = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            mktGapOpenRefreshTrigger: (chart.mktGapOpenRefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const toggleResLn = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId ? { ...chart, resLnEnabled: !chart.resLnEnabled } : chart
      )
    )
  }

  const updateResLnRange = (chartId, range) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId ? { ...chart, resLnRange: range } : chart
      )
    )
  }

  const refreshResLn = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            resLnRefreshTrigger: (chart.resLnRefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const updateRevAllChannelEnd = (chartId, endIndex) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, revAllChannelEndIndex: endIndex }
          : chart
      )
    )
  }

  const updateVolumeProfileV2Start = (chartId, startDate) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, volumeProfileV2StartDate: startDate }
          : chart
      )
    )
  }

  const updateVolumeProfileV2End = (chartId, endDate) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, volumeProfileV2EndDate: endDate }
          : chart
      )
    )
  }

  const updateVolumeProfileV3RegressionThreshold = (chartId, threshold) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, volumeProfileV3RegressionThreshold: threshold }
          : chart
      )
    )
  }

  const toggleVolumeColor = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeColorEnabled: !chart.volumeColorEnabled
          }
        }
        return chart
      })
    )
  }

  const toggleVolumeProfile = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileEnabled: !chart.volumeProfileEnabled
          }
        }
        return chart
      })
    )
  }

  const cycleVolumeProfileMode = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const modes = ['auto', 'manual']
          const currentIndex = modes.indexOf(chart.volumeProfileMode)
          const nextMode = modes[(currentIndex + 1) % modes.length]

          return {
            ...chart,
            volumeProfileMode: nextMode,
            // Clear manual ranges when switching back to auto
            volumeProfileManualRanges: nextMode === 'auto' ? [] : chart.volumeProfileManualRanges
          }
        }
        return chart
      })
    )
  }

  const toggleVolumeProfileV2 = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV2Enabled: !chart.volumeProfileV2Enabled
          }
        }
        return chart
      })
    )
  }

  const refreshVolumeProfileV2 = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV2RefreshTrigger: (chart.volumeProfileV2RefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const toggleVolumeProfileV3 = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV3Enabled: !chart.volumeProfileV3Enabled
          }
        }
        return chart
      })
    )
  }

  const refreshVolumeProfileV3 = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileV3RefreshTrigger: (chart.volumeProfileV3RefreshTrigger || 0) + 1
          }
        }
        return chart
      })
    )
  }

  const updateVolumeProfileManualRange = (chartId, range) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            // Add new range to the array (don't replace)
            volumeProfileManualRanges: [...chart.volumeProfileManualRanges, range]
          }
        }
        return chart
      })
    )
  }

  const removeVolumeProfileRange = (chartId, rangeIndex) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            volumeProfileManualRanges: chart.volumeProfileManualRanges.filter((_, index) => index !== rangeIndex)
          }
        }
        return chart
      })
    )
  }

  const cycleVolumeColorMode = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    const modes = ['absolute', 'relative-spy']
    const currentIndex = modes.indexOf(chart.volumeColorMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]

    // If switching to relative-spy mode and we don't have SPY data, fetch it
    if (nextMode === 'relative-spy' && !chart.spyData) {
      try {
        // Check cache first
        let spyData = apiCache.get('SPY', days)

        if (!spyData) {
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: days
            }
          })
          spyData = response.data
          apiCache.set('SPY', days, spyData)
        }

        setCharts(prevCharts =>
          prevCharts.map(c => {
            if (c.id === chartId) {
              return {
                ...c,
                volumeColorMode: nextMode,
                spyData: spyData
              }
            }
            return c
          })
        )
      } catch (err) {
        console.error('Failed to fetch SPY data:', err)
        setError('Failed to fetch SPY data for volume comparison')
      }
    } else {
      setCharts(prevCharts =>
        prevCharts.map(c => {
          if (c.id === chartId) {
            return {
              ...c,
              volumeColorMode: nextMode
            }
          }
          return c
        })
      )
    }
  }

  const togglePerformanceComparison = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    const newState = !chart.performanceComparisonEnabled

    // Toggle the enabled state
    setCharts(prevCharts =>
      prevCharts.map(c => {
        if (c.id === chartId) {
          return {
            ...c,
            performanceComparisonEnabled: newState
          }
        }
        return c
      })
    )

    // If enabling and we don't have benchmark data, fetch it
    if (newState && !chart.spyData) {
      // Use fetchBenchmarkData after state update
      setTimeout(() => fetchBenchmarkData(chartId), 0)
    }
  }

  const fetchBenchmarkData = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart || !chart.performanceComparisonEnabled) return

    const benchmarkSymbol = chart.performanceComparisonBenchmark
    if (!benchmarkSymbol || benchmarkSymbol.trim() === '') return

    try {
      // Check cache first
      let benchmarkData = apiCache.get(benchmarkSymbol, days)

      if (!benchmarkData) {
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: {
            symbol: benchmarkSymbol,
            days: days
          }
        })
        benchmarkData = response.data
        apiCache.set(benchmarkSymbol, days, benchmarkData)
      }

      setCharts(prevCharts =>
        prevCharts.map(c => {
          if (c.id === chartId) {
            return {
              ...c,
              spyData: benchmarkData
            }
          }
          return c
        })
      )
    } catch (err) {
      console.error('Failed to fetch benchmark data:', err)
      setError(`Failed to fetch ${benchmarkSymbol} data for performance comparison`)
    }
  }

  const toggleVsSpyVol = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    const newState = !chart.vsSpyVolEnabled

    // Toggle the enabled state
    setCharts(prevCharts =>
      prevCharts.map(c => {
        if (c.id === chartId) {
          return {
            ...c,
            vsSpyVolEnabled: newState
          }
        }
        return c
      })
    )

    // If enabling and we don't have SPY data, fetch it
    if (newState && !chart.spyData) {
      try {
        // Check cache first
        let spyData = apiCache.get('SPY', days)

        if (!spyData) {
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: days
            }
          })
          spyData = response.data
          apiCache.set('SPY', days, spyData)
        }

        setCharts(prevCharts =>
          prevCharts.map(c => {
            if (c.id === chartId) {
              return {
                ...c,
                spyData: spyData
              }
            }
            return c
          })
        )
      } catch (err) {
        console.error('Failed to fetch SPY data:', err)
        setError('Failed to fetch SPY data for volume comparison')
      }
    }
  }

  const addComparisonStock = async (chartId, symbol) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    // Check if symbol already exists
    if (chart.comparisonStocks.some(s => s.symbol === symbol)) {
      setError(`${symbol} is already added for comparison`)
      setTimeout(() => setError(null), 3000)
      return
    }

    // Set loading state for this chart
    setLoadingComparisonStocks(prev => ({ ...prev, [chartId]: symbol }))

    try {
      // Always fetch maximum data (3650 days) to have full history available
      const maxDays = '3650'

      // Check cache first
      let stockData = apiCache.get(symbol, maxDays)

      if (!stockData) {
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: {
            symbol: symbol,
            days: maxDays
          }
        })
        stockData = response.data
        apiCache.set(symbol, maxDays, stockData)
      }

      setCharts(prevCharts =>
        prevCharts.map(c => {
          if (c.id === chartId) {
            return {
              ...c,
              comparisonStocks: [...c.comparisonStocks, { symbol, data: stockData }]
            }
          }
          return c
        })
      )
    } catch (err) {
      console.error('[Comparison] Failed to fetch comparison stock data:', err)
      setError(`Failed to fetch ${symbol} data for comparison`)
      setTimeout(() => setError(null), 3000)
    } finally {
      // Clear loading state for this chart
      setLoadingComparisonStocks(prev => {
        const newState = { ...prev }
        delete newState[chartId]
        return newState
      })
    }
  }

  const removeComparisonStock = (chartId, stockIndex) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            comparisonStocks: chart.comparisonStocks.filter((_, index) => index !== stockIndex)
          }
        }
        return chart
      })
    )
  }

  const toggleChartCollapse = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            collapsed: !chart.collapsed
          }
        }
        return chart
      })
    )
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      analyzeStock()
    }
  }

  const changeTimeRange = async (newDays) => {
    setDays(newDays)
    setError(null)

    // Reset zoom to show all data when period changes
    setGlobalZoomRange({ start: 0, end: null })

    // Show loading spinner during data fetch
    setLoading(true)

    // Update all charts with the new time range
    try {
      // Smart pre-loading: fetch more data than displayed
      const displayDays = newDays
      const fetchDays = getFetchPeriod(newDays)

      // Check if any chart needs SPY data (for volume comparison, performance comparison, mkt gap open, or vs SPY vol)
      const needsSpy = charts.some(chart => chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled || chart.mktGapOpenEnabled || chart.vsSpyVolEnabled)
      let spyDataForPeriod = null

      if (needsSpy) {
        // Fetch SPY data using smart loading
        spyDataForPeriod = apiCache.get('SPY', fetchDays)
        if (!spyDataForPeriod) {
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: fetchDays  // Fetch more data for SPY too
            }
          })
          spyDataForPeriod = response.data
          apiCache.set('SPY', fetchDays, spyDataForPeriod)
        }
      }

      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first using fetch period
        let data = apiCache.get(chart.symbol, fetchDays)

        if (!data) {
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: chart.symbol,
              days: fetchDays  // Fetch more data than displayed
            }
          })
          data = response.data

          // Store in cache using fetch period as key
          apiCache.set(chart.symbol, fetchDays, data)
        }

        return { id: chart.id, data }
      })

      const results = await Promise.all(updatePromises)

      // Log cache statistics
      apiCache.logStats()

      setCharts(prevCharts =>
        prevCharts.map(chart => {
          const updatedData = results.find(r => r.id === chart.id)
          const updates = { data: updatedData.data }

          // Update SPY data if chart is in relative-spy mode, performance comparison mode, mkt gap open mode, or vs SPY vol mode
          if ((chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled || chart.mktGapOpenEnabled || chart.vsSpyVolEnabled) && spyDataForPeriod) {
            updates.spyData = spyDataForPeriod
          }

          return updatedData ? { ...chart, ...updates } : chart
        })
      )

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update charts.')
    } finally {
      setLoading(false)
    }
  }

  const getTrendColor = (trend) => {
    if (trend?.includes('BULLISH')) return 'text-green-600'
    if (trend?.includes('BEARISH')) return 'text-red-600'
    return 'text-gray-600'
  }

  const getTrendIcon = (trend) => {
    if (trend?.includes('BULLISH')) return <TrendingUp className="w-6 h-6" />
    if (trend?.includes('BEARISH')) return <TrendingDown className="w-6 h-6" />
    return <AlertCircle className="w-6 h-6" />
  }

  const timeRanges = [
    { label: '7D', days: '7' },
    { label: '1M', days: '30' },
    { label: '3M', days: '90' },
    { label: '6M', days: '180' },
    { label: '1Y', days: '365' },
    { label: '3Y', days: '1095' },
    { label: '5Y', days: '1825' },
    { label: 'Max', days: '3650' }
  ]

  const extendTimePeriod = () => {
    const currentIndex = timeRanges.findIndex(range => range.days === days)
    if (currentIndex < timeRanges.length - 1) {
      const nextRange = timeRanges[currentIndex + 1]
      changeTimeRange(nextRange.days)
      return true
    }
    return false
  }

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Stock Symbol
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
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., MS 2 MSFT (space/comma separated, numbers → .HK)"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400"
            />
          </div>
          <div className="flex items-end gap-4">
            <button
              type="button"
              onClick={analyzeStock}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Add Chart
                </>
              )}
            </button>
            <div className="flex gap-4 flex-wrap items-end">
              <div className="hidden md:flex md:flex-col">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Cols
                </label>
                <select
                  value={displayColumns}
                  onChange={(e) => setDisplayColumns(Number(e.target.value))}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Chart Height
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChartHeight(prev => Math.max(200, prev - 50))}
                    className="p-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg hover:bg-slate-600 transition-colors"
                    title="Decrease height"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartHeight(prev => Math.min(1000, prev + 50))}
                    className="p-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg hover:bg-slate-600 transition-colors"
                    title="Increase height"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Charts Section */}
      {charts.length > 0 && (
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${Math.min(displayColumns, charts.length)}, minmax(0, 1fr))`
          }}
        >
          {charts.map((chart) => (
            <div key={chart.id} className="space-y-6">
              {/* Price Chart */}
              <div className="bg-slate-800 relative">
                {/* Collapse and Close buttons */}
                <div className="absolute top-4 right-4 flex gap-2 z-20">
                  <button
                    type="button"
                    onClick={() => toggleChartCollapse(chart.id)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title={chart.collapsed ? "Expand chart" : "Collapse chart"}
                  >
                    {chart.collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeChart(chart.id)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Remove chart"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pr-24">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-100">
                      <a
                        href={`https://www.tradingview.com/symbols/${chart.symbol}/financials-overview/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 transition-colors"
                      >
                        {chart.symbol}
                      </a>
                      {(() => {
                        const result = calculateVisibleRangeChange(chart.data?.prices, globalZoomRange)
                        if (result === null) return null
                        const { percentChange, days } = result
                        const isPositive = percentChange >= 0
                        return (
                          <span className={`ml-2 text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{percentChange.toFixed(2)}% <span className="text-slate-400">({days}d)</span>
                          </span>
                        )
                      })()}
                    </h3>
                    {/* Mobile controls toggle button */}
                    {!chart.collapsed && (
                      <button
                        type="button"
                        onClick={() => setMobileControlsVisible(prev => ({ ...prev, [chart.id]: !prev[chart.id] }))}
                        className="md:hidden p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                        title="Toggle chart controls"
                      >
                        <Menu className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  {!chart.collapsed && <div className={`${
                    // On mobile: hidden by default, shown as overlay when toggled
                    // On desktop: always visible
                    mobileControlsVisible[chart.id]
                      ? 'fixed md:relative inset-x-0 top-0 md:top-auto z-50 bg-slate-800 md:bg-transparent p-4 md:p-0 border-b md:border-0 border-slate-700 max-h-96 overflow-y-auto'
                      : 'hidden md:flex'
                    }`}>
                    {/* Mobile overlay header with close button */}
                    {mobileControlsVisible[chart.id] && (
                      <div className="md:hidden flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
                        <h4 className="text-sm font-semibold text-slate-200">Chart Controls</h4>
                        <button
                          type="button"
                          onClick={() => setMobileControlsVisible(prev => ({ ...prev, [chart.id]: false }))}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                    {/* Controls in a grid for mobile, flex for desktop */}
                    <div className="flex md:flex gap-2 flex-wrap">
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => toggleVolumeColor(chart.id)}
                          className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.volumeColorEnabled
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Highlight high volume (top 20%) and low volume (bottom 20%)"
                        >
                          Vol. Col
                        </button>
                        {chart.volumeColorEnabled && (
                          <button
                            type="button"
                            onClick={() => cycleVolumeColorMode(chart.id)}
                            className="px-2 py-1 text-xs rounded font-medium bg-slate-600 text-slate-200 hover:bg-slate-500 transition-colors"
                            title="Click to cycle: Absolute Volume → Volume vs SPY"
                          >
                            {chart.volumeColorMode === 'absolute' ? 'ABS' : 'vs SPY'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => toggleVsSpyVol(chart.id)}
                          className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.vsSpyVolEnabled
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Show volume ratio relative to SPY (5-day MA) compared to historical value"
                        >
                          Vs SPY vol
                        </button>
                        {chart.vsSpyVolEnabled && (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="5"
                                max="100"
                                value={chart.vsSpyVolBackDays}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value)
                                  setCharts(prevCharts =>
                                    prevCharts.map(c =>
                                      c.id === chart.id
                                        ? { ...c, vsSpyVolBackDays: value }
                                        : c
                                    )
                                  )
                                }}
                                className="w-20 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                title="Control back days for comparison"
                              />
                              <span className="text-xs text-slate-300 w-8 text-right">{chart.vsSpyVolBackDays}d</span>
                            </div>
                            {/* Color Legend */}
                            <div className="flex items-center gap-1 ml-2 px-2 py-1 bg-slate-700/50 rounded text-xs">
                              <span className="text-slate-400">Vol:</span>
                              <span className="px-1 rounded" style={{ backgroundColor: '#dc2626', color: 'white' }}>↓</span>
                              <span className="px-1 rounded" style={{ backgroundColor: '#f97316', color: 'white' }}>-</span>
                              <span className="px-1 rounded" style={{ backgroundColor: '#22c55e', color: 'white' }}>±10%</span>
                              <span className="px-1 rounded" style={{ backgroundColor: '#06b6d4', color: 'white' }}>+</span>
                              <span className="px-1 rounded" style={{ backgroundColor: '#3b82f6', color: 'white' }}>↑</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => toggleVolumeProfile(chart.id)}
                          className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.volumeProfileEnabled
                            ? 'bg-yellow-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Show horizontal volume profile"
                        >
                          Vol. Prf
                        </button>
                        {chart.volumeProfileEnabled && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCharts(prevCharts =>
                                  prevCharts.map(c =>
                                    c.id === chart.id
                                      ? { ...c, volumeProfileMode: 'auto' }
                                      : c
                                  )
                                )
                              }}
                              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${chart.volumeProfileMode === 'auto'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                }`}
                              title="Auto volume profile - across visible data"
                            >
                              Auto
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCharts(prevCharts =>
                                  prevCharts.map(c =>
                                    c.id === chart.id
                                      ? { ...c, volumeProfileMode: 'manual' }
                                      : c
                                  )
                                )
                              }}
                              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${chart.volumeProfileMode === 'manual'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                }`}
                              title="Manual volume profile - draw rectangle to select range"
                            >
                              Man
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => toggleVolumeProfileV2(chart.id)}
                          className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.volumeProfileV2Enabled
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Show volume profile v2 - progressive accumulation from left to right"
                        >
                          Vol Prf v2
                        </button>
                        {chart.volumeProfileV2Enabled && (
                          <button
                            type="button"
                            onClick={() => refreshVolumeProfileV2(chart.id)}
                            className="px-2 py-1 text-sm rounded font-medium transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Refresh Vol Prf V2"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => toggleVolumeProfileV3(chart.id)}
                          className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.volumeProfileV3Enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Show volume profile v3 - windowed analysis with break detection"
                        >
                          Vol Prf V3
                        </button>
                        {chart.volumeProfileV3Enabled && (
                          <button
                            type="button"
                            onClick={() => refreshVolumeProfileV3(chart.id)}
                            className="px-2 py-1 text-sm rounded font-medium transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Refresh Vol Prf V3"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setCharts(prevCharts =>
                              prevCharts.map(c =>
                                c.id === chart.id
                                  ? { ...c, comparisonMode: c.comparisonMode === 'color' ? 'line' : 'color' }
                                  : c
                              )
                            )
                          }}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${chart.comparisonMode === 'color'
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                            }`}
                          title="Click to toggle: Vs Perf Color ↔ Vs Perf"
                        >
                          {chart.comparisonMode === 'color' ? 'Color' : 'Line'}
                        </button>
                        {chart.comparisonMode === 'color' && (
                          <>
                            <button
                              type="button"
                              onClick={() => togglePerformanceComparison(chart.id)}
                              className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.performanceComparisonEnabled
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                              title="Highlight top 20% and bottom 20% performance variance vs benchmark"
                            >
                              Vs Perf Color
                            </button>
                            {chart.performanceComparisonEnabled && (
                              <>
                                <input
                                  type="text"
                                  value={chart.performanceComparisonBenchmark}
                                  onChange={(e) => {
                                    const newBenchmark = e.target.value.toUpperCase()
                                    setCharts(prevCharts =>
                                      prevCharts.map(c =>
                                        c.id === chart.id
                                          ? { ...c, performanceComparisonBenchmark: newBenchmark }
                                          : c
                                      )
                                    )
                                  }}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      fetchBenchmarkData(chart.id)
                                    }
                                  }}
                                  onBlur={() => {
                                    fetchBenchmarkData(chart.id)
                                  }}
                                  placeholder="SPY"
                                  className="w-16 px-2 py-1 text-xs bg-slate-600 border border-slate-500 text-slate-100 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                                  title="Benchmark symbol (press Enter or blur to load)"
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min="1"
                                    max="365"
                                    value={chart.performanceComparisonDays}
                                    onChange={(e) => {
                                      const value = parseInt(e.target.value)
                                      setCharts(prevCharts =>
                                        prevCharts.map(c =>
                                          c.id === chart.id
                                            ? { ...c, performanceComparisonDays: value }
                                            : c
                                        )
                                      )
                                    }}
                                    className="w-24 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    title="Lookback days"
                                  />
                                  <span className="text-xs text-slate-300 w-8 text-right">{chart.performanceComparisonDays}d</span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                        {chart.comparisonMode === 'line' && (
                          <>
                            <button
                              type="button"
                              className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                              title="Vs Perf - Compare performance relative to first data point"
                            >
                              Vs Perf
                            </button>
                            <input
                              type="text"
                              placeholder="Type symbol, press Enter"
                              className="w-32 px-2 py-1 text-xs bg-slate-600 border border-slate-500 text-slate-100 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                  const symbol = e.target.value.toUpperCase().trim()
                                  e.target.value = ''
                                  addComparisonStock(chart.id, symbol)
                                }
                              }}
                              title="Type symbol and press Enter to add (e.g., SPY)"
                            />
                            {chart.comparisonStocks && chart.comparisonStocks.length > 0 && (
                              <div className="flex gap-1 items-center">
                                {chart.comparisonStocks.map((stock, index) => {
                                  // Match the color palette from PriceChart
                                  const tagColors = [
                                    'bg-blue-600',   // Blue
                                    'bg-green-600',  // Green
                                    'bg-yellow-600', // Yellow
                                    'bg-purple-600', // Purple
                                    'bg-pink-600',   // Pink
                                    'bg-teal-600',   // Teal
                                  ]
                                  const tagColor = tagColors[index % tagColors.length]

                                  return (
                                    <span
                                      key={index}
                                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${tagColor} text-white rounded`}
                                    >
                                      {stock.symbol}
                                      <button
                                        type="button"
                                        onClick={() => removeComparisonStock(chart.id, index)}
                                        className="hover:text-red-300"
                                        title="Remove"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCharts(prevCharts =>
                            prevCharts.map(c =>
                              c.id === chart.id
                                ? { ...c, zoomMode: !c.zoomMode }
                                : c
                            )
                          )
                        }}
                        className={`px-2 py-1 text-sm rounded transition-colors ${chart.zoomMode
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Zoom Mode - Drag to select a range to zoom into"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLinearRegression(chart.id)}
                        className={`px-2 py-1 text-sm rounded transition-colors ${chart.linearRegressionEnabled
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Linear Regression - Drag to select a range and plot regression line"
                      >
                        <LineChart className="w-4 h-4" />
                      </button>
                      {chart.linearRegressionEnabled && chart.linearRegressionSelections?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => clearLinearRegressionSelections(chart.id)}
                          className="px-2 py-1 text-xs rounded font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
                          title="Clear all regression lines"
                        >
                          Clear All
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openSlopeChannelDialog(chart.id)}
                        className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                        title="Configure Last Channel"
                      >
                        <Settings className="w-4 h-4" />
                        Last Ch
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRevAllChannel(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.revAllChannelEnabled
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="All Channels"
                      >
                        All Ch
                      </button>
                      {chart.revAllChannelEnabled && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCharts(prevCharts =>
                                prevCharts.map(c =>
                                  c.id === chart.id
                                    ? { ...c, revAllChannelRefreshTrigger: (c.revAllChannelRefreshTrigger || 0) + 1 }
                                    : c
                                )
                              )
                            }}
                            className="px-2 py-1 text-sm rounded font-medium transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Refresh All Channels"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRevAllChannelVolumeFilter(chart.id)}
                            className={`px-2 py-1 text-sm rounded transition-colors ${chart.revAllChannelVolumeFilterEnabled
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            title="Volume Filter - Ignore data points with bottom 10% of volume"
                          >
                            <Filter className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleBestStdev(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.bestStdevEnabled
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Best Stdev - Find optimal constant stdev for all channels"
                      >
                        Best Std
                      </button>
                      {chart.bestStdevEnabled && (
                        <>
                          <button
                            type="button"
                            onClick={() => refreshBestStdev(chart.id)}
                            className="px-2 py-1 text-sm rounded font-medium transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Refresh Best Stdev Channels"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBestStdevVolumeFilter(chart.id)}
                            className={`px-2 py-1 text-sm rounded transition-colors ${chart.bestStdevVolumeFilterEnabled
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            title="Volume Filter - Ignore data points with bottom 10% of volume"
                          >
                            <Filter className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleManualChannel(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.manualChannelEnabled
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Manual Channel - Draw rectangle to select data range"
                      >
                        Man Ch
                      </button>
                      {chart.manualChannelEnabled && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCharts(prevCharts =>
                                prevCharts.map(c =>
                                  c.id === chart.id
                                    ? { ...c, manualChannelDragMode: false }
                                    : c
                                )
                              )
                            }}
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${!chart.manualChannelDragMode
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                              }`}
                            title="Auto mode - pan the chart"
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCharts(prevCharts =>
                                prevCharts.map(c =>
                                  c.id === chart.id
                                    ? { ...c, manualChannelDragMode: true }
                                    : c
                                )
                              )
                            }}
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${chart.manualChannelDragMode
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                              }`}
                            title="Manual mode - drag to select range for channel"
                          >
                            Man
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleBestChannel(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.bestChannelEnabled
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Best Channel - Simulates parameters to find channels with most touching points"
                      >
                        Best Channel
                      </button>
                      {chart.bestChannelEnabled && (
                        <button
                          type="button"
                          onClick={() => toggleBestChannelVolumeFilter(chart.id)}
                          className={`px-2 py-1 text-sm rounded transition-colors ${chart.bestChannelVolumeFilterEnabled
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          title="Volume Filter - Ignore data points with bottom 10% of volume"
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleMktGapOpen(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.mktGapOpenEnabled
                          ? 'bg-pink-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Market Gap Open - Highlight biggest gaps in SPY"
                      >
                        Mkt Gap Opn
                      </button>
                      {chart.mktGapOpenEnabled && (
                        <>
                          <div className="flex items-center gap-1 bg-slate-700 rounded px-2 py-1">
                            <span className="text-xs text-slate-300">Top</span>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={chart.mktGapOpenCount}
                              onChange={(e) => updateMktGapOpenCount(chart.id, parseInt(e.target.value) || 5)}
                              className="w-10 bg-slate-600 border border-slate-500 text-slate-100 text-xs rounded px-1 text-center focus:ring-1 focus:ring-pink-500 focus:border-transparent"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshMktGapOpen(chart.id)}
                            className="px-2 py-1 text-sm rounded transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Refresh Market Gap Analysis"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleResLn(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.resLnEnabled
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        title="Resistance Line - Plot rolling highest volume price level"
                      >
                        Res Ln
                      </button>
                      {chart.resLnEnabled && (
                        <>
                          <div className="flex items-center gap-2 bg-slate-700 rounded px-2 py-1" title={`Lookback Range: ${chart.resLnRange} days`}>
                            <span className="text-xs text-slate-300">Rng</span>
                            <input
                              type="range"
                              min="10"
                              max="365"
                              value={chart.resLnRange}
                              onChange={(e) => updateResLnRange(chart.id, parseInt(e.target.value))}
                              className="w-20 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="text-xs text-slate-300 w-6 text-right">{chart.resLnRange}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshResLn(chart.id)}
                            className="px-2 py-1 text-sm rounded transition-colors bg-slate-600 text-slate-200 hover:bg-slate-500"
                            title="Recalculate based on visible data range"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1 bg-slate-700 rounded px-2 py-1" title="Volume concentration in high-volume zone">
                            <span className="text-xs text-slate-300">Vol%:</span>
                            <div className="flex items-center gap-0.5">
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} title="<5% - Minimal"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fbbf24' }} title="5-8%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fb923c' }} title="8-12%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f97316' }} title="12-16%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#eab308' }} title="16-20%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#a3e635' }} title="20-25%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#84cc16' }} title="25-30%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }} title="30-40%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#60a5fa' }} title="40-50%"></div>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} title="50%+"></div>
                            </div>
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const defaultPeriods = [10, 20, 50, 100, 200]
                          const currentLength = chart.smaPeriods?.length || 0

                          // Add two SMAs at once
                          if (currentLength < 4) {  // Changed from < 5 to < 4 since we're adding 2
                            const firstPeriod = defaultPeriods[currentLength] || 30
                            const secondPeriod = defaultPeriods[currentLength + 1] || 50
                            const newPeriods = [...(chart.smaPeriods || []), firstPeriod, secondPeriod]

                            // Update the chart with new periods
                            setCharts(prevCharts =>
                              prevCharts.map(c => {
                                if (c.id === chart.id) {
                                  const newVisibility = {}
                                  const newUpperPercent = { ...c.smaChannelUpperPercent }
                                  const newLowerPercent = { ...c.smaChannelLowerPercent }
                                  const newUpperEnabled = { ...c.smaChannelUpperEnabled }
                                  const newLowerEnabled = { ...c.smaChannelLowerEnabled }

                                  newPeriods.forEach(period => {
                                    newVisibility[period] = c.smaVisibility?.[period] ?? true
                                    newUpperPercent[period] = c.smaChannelUpperPercent?.[period] ?? 5
                                    newLowerPercent[period] = c.smaChannelLowerPercent?.[period] ?? 5
                                  })

                                  // Enable upper bound on first new SMA
                                  newUpperEnabled[firstPeriod] = true
                                  // Enable lower bound on second new SMA
                                  newLowerEnabled[secondPeriod] = true

                                  return {
                                    ...c,
                                    smaPeriods: newPeriods,
                                    smaVisibility: newVisibility,
                                    smaChannelUpperPercent: newUpperPercent,
                                    smaChannelLowerPercent: newLowerPercent,
                                    smaChannelUpperEnabled: newUpperEnabled,
                                    smaChannelLowerEnabled: newLowerEnabled
                                  }
                                }
                                return c
                              })
                            )

                            // Trigger comprehensive simulation for both new SMAs with explicit bounds
                            // Use setTimeout to ensure React state has updated
                            setTimeout(() => {
                              // Double-check the state has updated by reading it fresh
                              setCharts(prevCharts => {
                                const updatedChart = prevCharts.find(c => c.id === chart.id)
                                if (updatedChart && updatedChart.smaPeriods.length >= currentLength + 2) {
                                  // State has updated, now trigger simulations
                                  setTimeout(() => {
                                    // First SMA (with upper bound) - index is currentLength
                                    handleComprehensiveSimulation(chart.id, currentLength, { upper: true, lower: false }, globalZoomRange)
                                    // Second SMA (with lower bound) - index is currentLength + 1
                                    setTimeout(() => {
                                      handleComprehensiveSimulation(chart.id, currentLength + 1, { upper: false, lower: true }, globalZoomRange)
                                    }, 300)
                                  }, 50)
                                }
                                return prevCharts // Don't modify, just read
                              })
                            }, 100)
                          }
                        }}
                        className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                        title="Add two SMA lines with auto-optimized bounds"
                      >
                        <Plus className="w-4 h-4" />
                        Add SMA
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChartIndicator(chart.id, 'showRSI', !chart.showRSI)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.showRSI
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                      >
                        RSI
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChartIndicator(chart.id, 'showMACD', !chart.showMACD)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.showMACD
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                      >
                        MACD
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChartIndicator(chart.id, 'showStatistics', !chart.showStatistics)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${chart.showStatistics
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                      >
                        Statistic
                      </button>
                    </div>
                  </div>}
                </div>
                {!chart.collapsed && <div className="pr-0 md:pr-14 relative">
                  {/* Loading overlay when fetching comparison stock */}
                  {(loadingComparisonStocks[chart.id] || loadingMktGap[chart.id]) && (
                    <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 rounded">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
                        <p className="text-slate-200 font-medium">
                          {loadingMktGap[chart.id] ? 'Loading SPY Data...' : `Loading ${loadingComparisonStocks[chart.id]}...`}
                        </p>
                      </div>
                    </div>
                  )}
                  <PriceChart
                    prices={chart.data.prices}
                    indicators={chart.data.indicators}
                    signals={chart.data.signals}
                    syncedMouseDate={syncedMouseDate}
                    setSyncedMouseDate={setSyncedMouseDate}
                    smaPeriods={chart.smaPeriods}
                    smaVisibility={chart.smaVisibility}
                    smaChannelUpperPercent={chart.smaChannelUpperPercent}
                    smaChannelLowerPercent={chart.smaChannelLowerPercent}
                    smaChannelUpperEnabled={chart.smaChannelUpperEnabled}
                    smaChannelLowerEnabled={chart.smaChannelLowerEnabled}
                    smaOptimalTouches={chart.smaOptimalTouches}
                    onToggleSma={(period) => toggleSmaVisibility(chart.id, period)}
                    onDeleteSma={(period) => deleteSma(chart.id, period)}
                    volumeColorEnabled={chart.volumeColorEnabled}
                    volumeColorMode={chart.volumeColorMode}
                    volumeProfileEnabled={chart.volumeProfileEnabled}
                    volumeProfileMode={chart.volumeProfileMode}
                    volumeProfileManualRanges={chart.volumeProfileManualRanges}
                    onVolumeProfileManualRangeChange={(range) => updateVolumeProfileManualRange(chart.id, range)}
                    onVolumeProfileRangeRemove={(rangeIndex) => removeVolumeProfileRange(chart.id, rangeIndex)}
                    volumeProfileV2Enabled={chart.volumeProfileV2Enabled}
                    volumeProfileV2StartDate={chart.volumeProfileV2StartDate}
                    volumeProfileV2EndDate={chart.volumeProfileV2EndDate}
                    volumeProfileV2RefreshTrigger={chart.volumeProfileV2RefreshTrigger}
                    volumeProfileV2Params={chart.volumeProfileV2Params}
                    volumeProfileV2BreakoutThreshold={chart.volumeProfileV2BreakoutThreshold}
                    onVolumeProfileV2StartChange={(value) => updateVolumeProfileV2Start(chart.id, value)}
                    onVolumeProfileV2EndChange={(value) => updateVolumeProfileV2End(chart.id, value)}
                    volumeProfileV3Enabled={chart.volumeProfileV3Enabled}
                    volumeProfileV3RefreshTrigger={chart.volumeProfileV3RefreshTrigger}
                    volumeProfileV3RegressionThreshold={chart.volumeProfileV3RegressionThreshold}
                    onVolumeProfileV3RegressionThresholdChange={(value) => updateVolumeProfileV3RegressionThreshold(chart.id, value)}
                    spyData={chart.spyData}
                    performanceComparisonEnabled={chart.performanceComparisonEnabled}
                    performanceComparisonBenchmark={chart.performanceComparisonBenchmark}
                    performanceComparisonDays={chart.performanceComparisonDays}
                    comparisonMode={chart.comparisonMode}
                    comparisonStocks={chart.comparisonStocks}
                    slopeChannelEnabled={chart.slopeChannelEnabled}
                    slopeChannelVolumeWeighted={chart.slopeChannelVolumeWeighted}
                    slopeChannelZones={chart.slopeChannelZones}
                    slopeChannelDataPercent={chart.slopeChannelDataPercent}
                    slopeChannelWidthMultiplier={chart.slopeChannelWidthMultiplier}
                    onSlopeChannelParamsChange={(params) => updateSlopeChannelParams(chart.id, params)}
                    revAllChannelEnabled={chart.revAllChannelEnabled}
                    revAllChannelEndIndex={chart.revAllChannelEndIndex}
                    onRevAllChannelEndChange={(value) => updateRevAllChannelEnd(chart.id, value)}
                    revAllChannelRefreshTrigger={chart.revAllChannelRefreshTrigger}
                    revAllChannelVolumeFilterEnabled={chart.revAllChannelVolumeFilterEnabled}
                    manualChannelEnabled={chart.manualChannelEnabled}
                    manualChannelDragMode={chart.manualChannelDragMode}
                    zoomMode={chart.zoomMode}
                    linearRegressionEnabled={chart.linearRegressionEnabled}
                    linearRegressionSelections={chart.linearRegressionSelections || []}
                    onAddLinearRegressionSelection={(selection) => addLinearRegressionSelection(chart.id, selection)}
                    onClearLinearRegressionSelections={() => clearLinearRegressionSelections(chart.id)}
                    onRemoveLinearRegressionSelection={(index) => removeLinearRegressionSelection(chart.id, index)}
                    bestChannelEnabled={chart.bestChannelEnabled}
                    bestChannelVolumeFilterEnabled={chart.bestChannelVolumeFilterEnabled}
                    bestStdevEnabled={chart.bestStdevEnabled}
                    bestStdevVolumeFilterEnabled={chart.bestStdevVolumeFilterEnabled}
                    bestStdevRefreshTrigger={chart.bestStdevRefreshTrigger}
                    mktGapOpenEnabled={chart.mktGapOpenEnabled}
                    mktGapOpenCount={chart.mktGapOpenCount}
                    mktGapOpenRefreshTrigger={chart.mktGapOpenRefreshTrigger}
                    loadingMktGap={loadingMktGap[chart.id]}
                    resLnEnabled={chart.resLnEnabled}
                    resLnRange={chart.resLnRange}
                    resLnRefreshTrigger={chart.resLnRefreshTrigger}
                    vsSpyVolEnabled={chart.vsSpyVolEnabled}
                    vsSpyVolBackDays={chart.vsSpyVolBackDays}
                    chartHeight={chartHeight}
                    days={days}
                    zoomRange={globalZoomRange}
                    onZoomChange={updateGlobalZoom}
                    onExtendPeriod={extendTimePeriod}
                    rsiSimulationResult={rsiSimulationResults[chart.id]}
                    chartId={chart.id}
                    simulatingSma={simulatingSma}
                    onSimulateComplete={(smaIndex, optimalValue) => {
                      const smaKey = `${chart.id}-${smaIndex}`
                      setSimulatingSma(prev => {
                        const newState = { ...prev }
                        delete newState[smaKey]
                        return newState
                      })
                      if (optimalValue !== null && optimalValue !== undefined && !isNaN(optimalValue)) {
                        handleSimulateSma(chart.id, smaIndex, optimalValue)
                      }
                    }}
                    simulatingBreakoutThreshold={simulatingBreakoutThreshold[chart.id]}
                    onBreakoutThresholdSimulateComplete={(optimalValue, optimalSMA) => {
                      setSimulatingBreakoutThreshold(prev => {
                        const newState = { ...prev }
                        delete newState[chart.id]
                        return newState
                      })
                      if (optimalValue !== null && optimalValue !== undefined && !isNaN(optimalValue)) {
                        handleSimulateBreakoutThreshold(chart.id, optimalValue, optimalSMA)
                      }
                    }}
                  />

                  {/* SMA Slider Controls */}
                  {!chart.collapsed && chart.smaPeriods && chart.smaPeriods.length > 0 && !chart.volumeProfileV3Enabled && (
                    <div className="mt-3 px-2 flex flex-wrap gap-2">
                      {chart.smaPeriods.map((period, index) => {
                        const smaKey = `${chart.id}-${index}`
                        const isSimulating = simulatingSma[smaKey]
                        const upperPercent = chart.smaChannelUpperPercent?.[period] ?? 5
                        const lowerPercent = chart.smaChannelLowerPercent?.[period] ?? 5
                        return (
                          <div key={index} className="flex items-center gap-2 bg-slate-700/50 p-2 rounded flex-1 min-w-fit">
                            {/* SMA Period Control */}
                            <span className="text-sm text-slate-300 w-12">SMA</span>
                            <button
                              onMouseDown={() => startSmaButtonHold(chart.id, index, 'decrement')}
                              onMouseUp={stopSmaButtonHold}
                              onMouseLeave={stopSmaButtonHold}
                              onTouchStart={() => startSmaButtonHold(chart.id, index, 'decrement')}
                              onTouchEnd={stopSmaButtonHold}
                              disabled={period <= 3 || isSimulating}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Decrease SMA period"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="range"
                              min="3"
                              max="200"
                              value={period || 10}
                              onChange={(e) => {
                                const rawValue = parseInt(e.target.value)
                                const snappedValue = snapToValidSmaValue(rawValue)
                                const newPeriods = [...chart.smaPeriods]
                                newPeriods[index] = snappedValue
                                updateSmaPeriods(chart.id, newPeriods)
                              }}
                              disabled={isSimulating}
                              className="w-20 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <button
                              onMouseDown={() => startSmaButtonHold(chart.id, index, 'increment')}
                              onMouseUp={stopSmaButtonHold}
                              onMouseLeave={stopSmaButtonHold}
                              onTouchStart={() => startSmaButtonHold(chart.id, index, 'increment')}
                              onTouchEnd={stopSmaButtonHold}
                              disabled={period >= 200 || isSimulating}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Increase SMA period"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-slate-400 w-7 text-right">{period}</span>

                            {/* Add UpperBound Button - only show if neither bound is enabled */}
                            {!chart.smaChannelUpperEnabled?.[period] && !chart.smaChannelLowerEnabled?.[period] && (
                              <button
                                onClick={() => toggleSmaChannelBound(chart.id, period, 'upper')}
                                className="px-2 py-1 text-xs rounded font-medium bg-green-600/70 text-white hover:bg-green-600 transition-colors whitespace-nowrap"
                                title="Add upper bound channel"
                              >
                                Add UpperBound
                              </button>
                            )}

                            {/* Upper % Control */}
                            {chart.smaChannelUpperEnabled?.[period] && (
                              <>
                                <div className="flex items-center gap-1 ml-2">
                                  <ArrowUp className="w-3 h-3 text-green-400" />
                                  <span className="text-xs text-slate-400">Upper</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={upperPercent}
                                  onChange={(e) => {
                                    updateSmaChannelPercent(chart.id, period, 'upper', parseFloat(e.target.value))
                                  }}
                                  className="w-20 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span className="text-xs text-slate-400 w-9 text-right">{upperPercent.toFixed(1)}%</span>
                                <button
                                  onClick={() => toggleSmaChannelBound(chart.id, period, 'upper')}
                                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                                  title="Remove upper bound"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            {/* Add LowerBound Button - only show if neither bound is enabled */}
                            {!chart.smaChannelUpperEnabled?.[period] && !chart.smaChannelLowerEnabled?.[period] && (
                              <button
                                onClick={() => toggleSmaChannelBound(chart.id, period, 'lower')}
                                className="px-2 py-1 text-xs rounded font-medium bg-red-600/70 text-white hover:bg-red-600 transition-colors whitespace-nowrap"
                                title="Add lower bound channel"
                              >
                                Add LowerBound
                              </button>
                            )}

                            {/* Lower % Control */}
                            {chart.smaChannelLowerEnabled?.[period] && (
                              <>
                                <div className="flex items-center gap-1">
                                  <ArrowDown className="w-3 h-3 text-red-400" />
                                  <span className="text-xs text-slate-400">Lower</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={lowerPercent}
                                  onChange={(e) => {
                                    updateSmaChannelPercent(chart.id, period, 'lower', parseFloat(e.target.value))
                                  }}
                                  className="w-20 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span className="text-xs text-slate-400 w-9 text-right">{lowerPercent.toFixed(1)}%</span>
                                <button
                                  onClick={() => toggleSmaChannelBound(chart.id, period, 'lower')}
                                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                                  title="Remove lower bound"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            {/* Sim Bound Button - optimizes bounds only (only show if at least one bound is enabled) */}
                            {(chart.smaChannelUpperEnabled?.[period] || chart.smaChannelLowerEnabled?.[period]) && (
                              <button
                                onClick={() => {
                                  const chartData = charts.find(c => c.id === chart.id)
                                  if (chartData && chartData.data && chartData.data.prices) {
                                    // Calculate SMA data
                                    const prices = chartData.data.prices
                                    const smaData = []
                                    for (let i = 0; i < prices.length; i++) {
                                      if (i + period - 1 >= prices.length) {
                                        smaData.push(null)
                                      } else {
                                        let sum = 0
                                        for (let j = 0; j < period; j++) {
                                          sum += prices[i + j].close
                                        }
                                        smaData.push(sum / period)
                                      }
                                    }
                                    const enabledBounds = {
                                      upper: chart.smaChannelUpperEnabled?.[period] ?? false,
                                      lower: chart.smaChannelLowerEnabled?.[period] ?? false
                                    }
                                    const result = simulateSmaChannelPercent(chart.id, period, prices, smaData, enabledBounds, globalZoomRange)
                                    if (enabledBounds.upper) {
                                      updateSmaChannelPercent(chart.id, period, 'upper', result.upper)
                                    }
                                    if (enabledBounds.lower) {
                                      updateSmaChannelPercent(chart.id, period, 'lower', result.lower)
                                    }
                                  // Save optimal touch counts
                                  setCharts(prevCharts =>
                                    prevCharts.map(c => {
                                      if (c.id === chart.id) {
                                        return {
                                          ...c,
                                          smaOptimalTouches: {
                                            ...c.smaOptimalTouches,
                                            [period]: {
                                              upper: result.upperTouches,
                                              lower: result.lowerTouches,
                                              total: result.totalTouches
                                            }
                                          }
                                        }
                                      }
                                      return c
                                    })
                                  )
                                }
                              }}
                                className="px-2 py-1 text-xs rounded font-medium bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                                title={`Simulate optimal channel % to touch most turning points (${getTolerance(period)}% tolerance for SMA${period})`}
                              >
                                Sim Bound
                              </button>
                            )}

                            {/* Comprehensive Sim Button - optimizes SMA period AND bounds (only show if at least one bound is enabled) */}
                            {(chart.smaChannelUpperEnabled?.[period] || chart.smaChannelLowerEnabled?.[period]) && (() => {
                              const compKey = `${chart.id}-${index}`
                              const isSimulatingComp = simulatingComprehensive[compKey]
                              return (
                                <button
                                  onClick={() => handleComprehensiveSimulation(chart.id, index, null, globalZoomRange)}
                                  disabled={isSimulatingComp}
                                  className={`px-2 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${isSimulatingComp
                                    ? 'bg-purple-600 text-white cursor-wait'
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                    }`}
                                  title="Simulate optimal SMA period + channel bounds to touch most turning points"
                                >
                                  {isSimulatingComp ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Sim Bound and SMA'
                                  )}
                                </button>
                              )
                            })()}

                            {/* SMA Value Sim Button (only for Vol Prf V2) */}
                            {chart.volumeProfileV2Enabled && (
                              <button
                                onClick={() => {
                                  setSimulatingSma(prev => ({ ...prev, [smaKey]: index }))
                                }}
                                disabled={isSimulating}
                                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${isSimulating
                                  ? 'bg-yellow-600 text-white cursor-wait'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                                  }`}
                                title="Simulate optimal SMA value based on P&L"
                              >
                                {isSimulating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'SimV'
                                )}
                              </button>
                            )}

                            {/* Delete Button */}
                            <button
                              onClick={() => deleteSma(chart.id, period)}
                              disabled={isSimulating}
                              className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                              title="Remove SMA"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}

                      {/* Breakout Threshold Slider Control (inline with SMA sliders, only shown when Vol Prf V2 is active) */}
                      {chart.volumeProfileV2Enabled && (() => {
                        const thresholdValues = [5, 6, 7, 8, 10, 12, 15, 18, 22, 24, 27, 30, 33]
                        const currentValue = chart.volumeProfileV2BreakoutThreshold || 6
                        const currentIndex = thresholdValues.indexOf(currentValue)
                        const validIndex = currentIndex >= 0 ? currentIndex : thresholdValues.findIndex(v => v >= currentValue)
                        const actualIndex = validIndex >= 0 ? validIndex : 0

                        return (
                          <div className="flex items-center gap-2 bg-slate-700/50 p-2 rounded w-full md:w-[400px]">
                            <span className="text-sm text-slate-300 whitespace-nowrap w-16">Brk Th</span>
                            <button
                              onClick={() => {
                                if (actualIndex > 0) {
                                  const newValue = thresholdValues[actualIndex - 1]
                                  updateBreakoutThreshold(chart.id, newValue)
                                }
                              }}
                              disabled={actualIndex <= 0 || simulatingBreakoutThreshold[chart.id]}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Decrease breakout threshold"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="range"
                              min="0"
                              max={thresholdValues.length - 1}
                              step="1"
                              value={actualIndex}
                              onChange={(e) => {
                                const newIndex = parseInt(e.target.value)
                                const newValue = thresholdValues[newIndex]
                                updateBreakoutThreshold(chart.id, newValue)
                              }}
                              disabled={simulatingBreakoutThreshold[chart.id]}
                              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <button
                              onClick={() => {
                                if (actualIndex < thresholdValues.length - 1) {
                                  const newValue = thresholdValues[actualIndex + 1]
                                  updateBreakoutThreshold(chart.id, newValue)
                                }
                              }}
                              disabled={actualIndex >= thresholdValues.length - 1 || simulatingBreakoutThreshold[chart.id]}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Increase breakout threshold"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-slate-400 w-8 text-right">{currentValue}%</span>
                            <button
                              onClick={() => {
                                setSimulatingBreakoutThreshold(prev => ({ ...prev, [chart.id]: true }))
                              }}
                              disabled={simulatingBreakoutThreshold[chart.id]}
                              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${simulatingBreakoutThreshold[chart.id]
                                ? 'bg-yellow-600 text-white cursor-wait'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                              title="Simulate optimal breakout threshold based on P&L"
                            >
                              {simulatingBreakoutThreshold[chart.id] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Sim'
                              )}
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>}

                {/* Loading Spinner */}
                {loading && (
                  <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-20 z-50">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent"></div>
                  </div>
                )}
                {/* Time Period Selector - Right Side (Desktop) / Bottom (Mobile) */}
                {!chart.collapsed && (
                  <div className="absolute top-1/2 right-0 -translate-y-1/2 hidden md:block" style={{ zIndex: 5 }}>
                    <div className="flex flex-col gap-0 bg-slate-900/95 rounded border border-slate-700 backdrop-blur-sm shadow-lg overflow-hidden">
                      {timeRanges.map((range) => (
                        <button
                          type="button"
                          key={range.label}
                          onClick={() => changeTimeRange(range.days)}
                          className={`px-2 py-1 text-xs font-bold transition-all whitespace-nowrap border-0 ${days === range.days
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          style={{ minWidth: '44px' }}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Period Selector - Mobile Bottom */}
                {!chart.collapsed && (
                  <div className="flex justify-end mt-2 md:hidden">
                    <div className="inline-flex gap-1 bg-slate-900 p-2 rounded-lg border border-slate-700">
                      {timeRanges.map((range) => (
                        <button
                          type="button"
                          key={range.label}
                          onClick={() => changeTimeRange(range.days)}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${days === range.days
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Technical Indicators */}
              {!chart.collapsed && (chart.showRSI || chart.showMACD) && (
                <div className="bg-slate-800 p-2 md:p-6 rounded-lg border-0 md:border md:border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 text-slate-100">Technical Indicators</h3>
                  <IndicatorsChart
                    indicators={chart.data.indicators}
                    prices={chart.data.prices}
                    showRSI={chart.showRSI}
                    showMACD={chart.showMACD}
                    syncedMouseDate={syncedMouseDate}
                    setSyncedMouseDate={setSyncedMouseDate}
                    zoomRange={globalZoomRange}
                    onZoomChange={updateGlobalZoom}
                    onExtendPeriod={extendTimePeriod}
                    chartId={chart.id}
                    onRSISimulationResult={(result) => setRsiSimulationResults(prev => ({ ...prev, [chart.id]: result }))}
                  />
                </div>
              )}

              {/* Statistics */}
              {!chart.collapsed && chart.showStatistics && (
                <div className="bg-slate-800 p-2 md:p-6 rounded-lg border-0 md:border md:border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 text-slate-100">Statistics</h3>
                  <StatisticsCharts
                    stockData={chart.data.prices}
                    zoomRange={globalZoomRange}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Last Channel Configuration Dialog */}
      {slopeChannelDialogOpen && editingSlopeChannelChartId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeSlopeChannelDialog}>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Configure Last Channel</h3>
              <button
                onClick={closeSlopeChannelDialog}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const chart = charts.find(c => c.id === editingSlopeChannelChartId)
              if (!chart) return null

              return (
                <div className="space-y-4">
                  {/* Show Best Last Channel Checkbox */}
                  <div className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg">
                    <input
                      type="checkbox"
                      id="showBestLastChannel"
                      checked={chart.slopeChannelEnabled}
                      onChange={() => toggleSlopeChannel(editingSlopeChannelChartId)}
                      className="w-5 h-5 text-purple-600 bg-slate-600 border-slate-500 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    />
                    <label htmlFor="showBestLastChannel" className="text-slate-100 cursor-pointer flex-1">
                      Show Best Last Channel
                    </label>
                  </div>

                  {/* Show Best Last Channel with Volume Weight Checkbox */}
                  <div className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg">
                    <input
                      type="checkbox"
                      id="volumeWeighted"
                      checked={chart.slopeChannelVolumeWeighted}
                      onChange={() => toggleSlopeChannelVolumeWeighted(editingSlopeChannelChartId)}
                      className="w-5 h-5 text-purple-600 bg-slate-600 border-slate-500 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    />
                    <label htmlFor="volumeWeighted" className="text-slate-100 cursor-pointer flex-1">
                      Volume Weighted (ignore bottom 20% volume)
                    </label>
                  </div>

                  {/* Configuration Parameters */}
                  {chart.slopeChannelEnabled && (
                    <>
                      {/* Number of Zones */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-300">
                          Number of Zones (3-10)
                        </label>
                        <input
                          type="number"
                          min="3"
                          max="10"
                          value={chart.slopeChannelZones}
                          onChange={(e) => {
                            const value = parseInt(e.target.value)
                            if (!isNaN(value) && value >= 3 && value <= 10) {
                              updateSlopeChannelZones(editingSlopeChannelChartId, value)
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <p className="text-xs text-slate-400">
                          Divides the channel into parallel zones showing volume distribution
                        </p>
                      </div>

                      {/* Info about on-chart controls */}
                      <div className="p-3 bg-slate-700 rounded-lg border border-slate-600">
                        <p className="text-xs text-slate-300">
                          <strong>Tip:</strong> Lookback period and channel width controls are available on the chart for real-time adjustment.
                        </p>
                      </div>
                    </>
                  )}

                  <div className="pt-3 border-t border-slate-700">
                    <button
                      onClick={closeSlopeChannelDialog}
                      className="w-full px-4 py-2 bg-slate-700 text-slate-100 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default StockAnalyzer
