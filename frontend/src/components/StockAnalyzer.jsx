import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings, ChevronDown, ChevronUp, RefreshCw, Filter, Menu, ZoomIn } from 'lucide-react'
import PriceChart from './PriceChart'
import IndicatorsChart from './IndicatorsChart'
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
// Always fetch more data than displayed to enable smooth panning
function getFetchPeriod(displayDays) {
  const days = parseInt(displayDays)

  // 7D → fetch 3M (90 days)
  if (days <= 7) return '90'

  // 1M (30) → fetch 6M (180 days)
  if (days <= 30) return '180'

  // 6M (180) → fetch 3Y (1095 days)
  if (days <= 180) return '1095'

  // 1Y (365) → fetch 3Y (1095 days)
  if (days <= 365) return '1095'

  // 3Y (1095) → fetch 5Y (1825 days)
  if (days <= 1095) return '1825'

  // 5Y (1825) and above → fetch MAX (3650 days for 10Y)
  return '3650'
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

      console.log(`[Input] Processing ${symbols.length} symbol(s):`, symbols.join(', '))

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

          if (data) {
            console.log(`[Cache] ✅ Cache available for ${upperSymbol}:${fetchDays}`)
          } else {
            console.log(`[Cache] ❌ Cache MISS for ${upperSymbol}:${fetchDays}, fetching from server...`)
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
            smaPeriods: defaultSMAs,
            smaVisibility: defaultSMAVisibility,
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
            volumeProfileV3Enabled: params?.volumeProfileV3Enabled || false,
            volumeProfileV3RefreshTrigger: 0,
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

        // Set initial zoom to show only the display period (not all fetched data)
        setTimeout(() => {
          const displayDaysNum = parseInt(displayDays)
          const fetchDaysNum = parseInt(fetchDays)

          if (displayDaysNum < fetchDaysNum && newCharts.length > 0) {
            // We fetched more data than we want to display
            // Use the first chart's data length to calculate the ratio
            const actualDataLength = newCharts[0].data.prices.length
            const displayRatio = displayDaysNum / fetchDaysNum

            // Show only the most recent portion based on the ratio
            // For example: 1Y/3Y = 0.333, so show the most recent 33.3% of data
            const startIndex = Math.floor(actualDataLength * (1 - displayRatio))
            setGlobalZoomRange({ start: startIndex, end: null })
          } else {
            // Show all fetched data
            setGlobalZoomRange({ start: 0, end: null })
          }
        }, 100)
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
          newPeriods.forEach(period => {
            newVisibility[period] = chart.smaVisibility?.[period] ?? true
          })
          return { ...chart, smaPeriods: newPeriods, smaVisibility: newVisibility }
        }
        return chart
      })
    )
  }

  const handleSimulateSma = (chartId, smaIndex, optimalValue) => {
    console.log(`[Simulate] Optimal SMA value for chart ${chartId}, index ${smaIndex}: ${optimalValue}`)
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const newPeriods = [...chart.smaPeriods]
          newPeriods[smaIndex] = optimalValue
          const newVisibility = {}
          newPeriods.forEach(period => {
            newVisibility[period] = chart.smaVisibility?.[period] ?? true
          })
          return { ...chart, smaPeriods: newPeriods, smaVisibility: newVisibility }
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

  const deleteSma = (chartId, period) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          const newPeriods = chart.smaPeriods.filter(p => p !== period)
          const newVisibility = { ...chart.smaVisibility }
          delete newVisibility[period]
          return {
            ...chart,
            smaPeriods: newPeriods,
            smaVisibility: newVisibility
          }
        }
        return chart
      })
    )
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
            newPeriods[index] = newValue
            const newVisibility = {}
            newPeriods.forEach(period => {
              newVisibility[period] = c.smaVisibility?.[period] ?? true
            })
            return { ...c, smaPeriods: newPeriods, smaVisibility: newVisibility }
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
          console.log(`[Cache] ❌ Cache MISS for SPY:${days}, fetching from server...`)
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: days
            }
          })
          spyData = response.data
          apiCache.set('SPY', days, spyData)
        } else {
          console.log(`[Cache] ✅ Cache HIT for SPY:${days}`)
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
          console.log(`[Cache] ❌ Cache MISS for SPY:${days}, fetching from server...`)
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: days
            }
          })
          spyData = response.data
          apiCache.set('SPY', days, spyData)
        } else {
          console.log(`[Cache] ✅ Cache HIT for SPY:${days}`)
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
        console.log(`[Cache] ❌ Cache MISS for ${benchmarkSymbol}:${days}, fetching from server...`)
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: {
            symbol: benchmarkSymbol,
            days: days
          }
        })
        benchmarkData = response.data
        apiCache.set(benchmarkSymbol, days, benchmarkData)
      } else {
        console.log(`[Cache] ✅ Cache HIT for ${benchmarkSymbol}:${days}`)
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

  const addComparisonStock = async (chartId, symbol) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    console.log(`[Comparison] Adding comparison stock: ${symbol}`)

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
        console.log(`[Cache] ❌ Cache MISS for ${symbol}:${maxDays}, fetching from server...`)
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: {
            symbol: symbol,
            days: maxDays
          }
        })
        stockData = response.data
        apiCache.set(symbol, maxDays, stockData)
      } else {
        console.log(`[Cache] ✅ Cache HIT for ${symbol}:${maxDays}`)
      }

      console.log(`[Comparison] Successfully added ${symbol} to comparison stocks`)

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

    // Show loading spinner during data fetch
    setLoading(true)

    // Update all charts with the new time range
    try {
      // Smart pre-loading: fetch more data than displayed
      const displayDays = newDays
      const fetchDays = getFetchPeriod(newDays)

      // Check if any chart needs SPY data (for volume comparison, performance comparison, or mkt gap open)
      const needsSpy = charts.some(chart => chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled || chart.mktGapOpenEnabled)
      let spyDataForPeriod = null

      if (needsSpy) {
        // Fetch SPY data using smart loading
        spyDataForPeriod = apiCache.get('SPY', fetchDays)
        if (!spyDataForPeriod) {
          console.log(`[Cache] ❌ Cache MISS for SPY:${fetchDays}, fetching from server...`)
          const response = await axios.get(joinUrl(API_URL, '/analyze'), {
            params: {
              symbol: 'SPY',
              days: fetchDays  // Fetch more data for SPY too
            }
          })
          spyDataForPeriod = response.data
          apiCache.set('SPY', fetchDays, spyDataForPeriod)
        } else {
          console.log(`[Cache] ✅ Cache available for SPY:${fetchDays}`)
        }
      }

      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first using fetch period
        let data = apiCache.get(chart.symbol, fetchDays)

        if (data) {
          console.log(`[Cache] ✅ Cache available for ${chart.symbol}:${fetchDays}`)
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${chart.symbol}:${fetchDays}, fetching from server...`)
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

          // Update SPY data if chart is in relative-spy mode, performance comparison mode, or mkt gap open mode
          if ((chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled || chart.mktGapOpenEnabled) && spyDataForPeriod) {
            updates.spyData = spyDataForPeriod
          }

          return updatedData ? { ...chart, ...updates } : chart
        })
      )

      // After data is loaded, set initial zoom to show only the display period (not all fetched data)
      // Use the freshly fetched results instead of stale charts state
      const displayDaysNum = parseInt(displayDays)
      const fetchDaysNum = parseInt(fetchDays)

      if (displayDaysNum < fetchDaysNum && results.length > 0) {
        // We fetched more data than we want to display
        // Use the first result's actual data length to calculate the ratio
        const firstResult = results[0]
        if (firstResult && firstResult.data && firstResult.data.prices) {
          const actualDataLength = firstResult.data.prices.length
          const displayRatio = displayDaysNum / fetchDaysNum

          // Show only the most recent portion based on the ratio
          const startIndex = Math.floor(actualDataLength * (1 - displayRatio))
          setGlobalZoomRange({ start: startIndex, end: null })
        } else {
          setGlobalZoomRange({ start: 0, end: null })
        }
      } else {
        // Show all fetched data
        setGlobalZoomRange({ start: 0, end: null })
      }
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
                    <h3 className="text-lg font-semibold text-slate-100">{chart.symbol}</h3>
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
                                console.log(`[Input] Key pressed: ${e.key}, value: ${e.target.value}`)
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                  const symbol = e.target.value.toUpperCase().trim()
                                  console.log(`[Input] Enter pressed, adding symbol: ${symbol}`)
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
                          if (currentLength < 5) {
                            const defaultPeriod = defaultPeriods[currentLength] || 30
                            const newPeriods = [...(chart.smaPeriods || []), defaultPeriod]
                            updateSmaPeriods(chart.id, newPeriods)
                          }
                        }}
                        className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                        title="Add SMA Line"
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
                    onVolumeProfileV2StartChange={(value) => updateVolumeProfileV2Start(chart.id, value)}
                    onVolumeProfileV2EndChange={(value) => updateVolumeProfileV2End(chart.id, value)}
                    volumeProfileV3Enabled={chart.volumeProfileV3Enabled}
                    volumeProfileV3RefreshTrigger={chart.volumeProfileV3RefreshTrigger}
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
                    chartHeight={chartHeight}
                    days={days}
                    zoomRange={globalZoomRange}
                    onZoomChange={updateGlobalZoom}
                    onExtendPeriod={extendTimePeriod}
                    chartId={chart.id}
                    simulatingSma={simulatingSma}
                    onSimulateComplete={(smaIndex, optimalValue) => {
                      const smaKey = `${chart.id}-${smaIndex}`
                      setSimulatingSma(prev => {
                        const newState = { ...prev }
                        delete newState[smaKey]
                        return newState
                      })
                      if (optimalValue !== null) {
                        handleSimulateSma(chart.id, smaIndex, optimalValue)
                      }
                    }}
                  />

                  {/* SMA Slider Controls */}
                  {!chart.collapsed && chart.smaPeriods && chart.smaPeriods.length > 0 && (
                    <div className="mt-3 px-2 flex flex-wrap gap-2">
                      {chart.smaPeriods.map((period, index) => {
                        const smaKey = `${chart.id}-${index}`
                        const isSimulating = simulatingSma[smaKey]
                        return (
                          <div key={index} className="flex items-center gap-2 bg-slate-700/50 p-2 rounded w-full md:w-[400px]">
                            <span className="text-sm text-slate-300 w-16">SMA {period}</span>
                            <button
                              onMouseDown={() => startSmaButtonHold(chart.id, index, 'decrement')}
                              onMouseUp={stopSmaButtonHold}
                              onMouseLeave={stopSmaButtonHold}
                              onTouchStart={() => startSmaButtonHold(chart.id, index, 'decrement')}
                              onTouchEnd={stopSmaButtonHold}
                              disabled={period <= 3 || isSimulating}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Decrease SMA period (hold to repeat)"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="range"
                              min="3"
                              max="200"
                              value={period}
                              onChange={(e) => {
                                const rawValue = parseInt(e.target.value)
                                const snappedValue = snapToValidSmaValue(rawValue)
                                const newPeriods = [...chart.smaPeriods]
                                newPeriods[index] = snappedValue
                                updateSmaPeriods(chart.id, newPeriods)
                              }}
                              disabled={isSimulating}
                              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <button
                              onMouseDown={() => startSmaButtonHold(chart.id, index, 'increment')}
                              onMouseUp={stopSmaButtonHold}
                              onMouseLeave={stopSmaButtonHold}
                              onTouchStart={() => startSmaButtonHold(chart.id, index, 'increment')}
                              onTouchEnd={stopSmaButtonHold}
                              disabled={period >= 200 || isSimulating}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Increase SMA period (hold to repeat)"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-slate-400 w-8 text-right">{period}</span>
                            {chart.volumeProfileV2Enabled && (
                              <button
                                onClick={() => {
                                  setSimulatingSma(prev => ({ ...prev, [smaKey]: index }))
                                }}
                                disabled={isSimulating}
                                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                                  isSimulating
                                    ? 'bg-yellow-600 text-white cursor-wait'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                                title="Simulate optimal SMA value based on P&L"
                              >
                                {isSimulating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Sim'
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => deleteSma(chart.id, period)}
                              disabled={isSimulating}
                              className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Remove SMA"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
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
                    showRSI={chart.showRSI}
                    showMACD={chart.showMACD}
                    syncedMouseDate={syncedMouseDate}
                    setSyncedMouseDate={setSyncedMouseDate}
                    zoomRange={globalZoomRange}
                    onZoomChange={updateGlobalZoom}
                    onExtendPeriod={extendTimePeriod}
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
