import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings, ChevronDown, ChevronUp, RefreshCw, Filter, Menu } from 'lucide-react'
import PriceChart from './PriceChart'
import IndicatorsChart from './IndicatorsChart'
import SignalsList from './SignalsList'
import { apiCache } from '../utils/apiCache'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STOCK_HISTORY_KEY = 'stockSearchHistory'

function StockAnalyzer() {
  const [symbol, setSymbol] = useState('')
  const [days, setDays] = useState('365')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [charts, setCharts] = useState([])
  const [syncedMouseDate, setSyncedMouseDate] = useState(null)
  const [stockHistory, setStockHistory] = useState([])
  const [displayColumns, setDisplayColumns] = useState(1)
  const [chartHeight, setChartHeight] = useState(460) // Increased by 15% from 400
  const [slopeChannelDialogOpen, setSlopeChannelDialogOpen] = useState(false)
  const [editingSlopeChannelChartId, setEditingSlopeChannelChartId] = useState(null)
  const [globalZoomRange, setGlobalZoomRange] = useState({ start: 0, end: null })
  const [loadingComparisonStocks, setLoadingComparisonStocks] = useState({}) // Track loading state per chart
  const [loadingMktGap, setLoadingMktGap] = useState({}) // Track loading state for Mkt Gap data
  const [mobileControlsVisible, setMobileControlsVisible] = useState({}) // Track mobile controls visibility per chart

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

  const saveToHistory = (stockSymbol) => {
    const updatedHistory = [stockSymbol, ...stockHistory.filter(s => s !== stockSymbol)].slice(0, 10)
    setStockHistory(updatedHistory)
    localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(updatedHistory))
  }

  const analyzeStock = async (symbolToAnalyze = null) => {
    // Check if symbolToAnalyze is a string (not an event object)
    const targetSymbol = (typeof symbolToAnalyze === 'string') ? symbolToAnalyze : symbol

    if (!targetSymbol.trim()) {
      setError('Please enter a stock symbol')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const upperSymbol = targetSymbol.toUpperCase()

      // Use the currently selected period for fetching
      // Smart cache will automatically use longer cached periods if available
      const requestedDays = days

      // Try to get from cache first (smart loading will check for longer periods)
      let data = apiCache.get(upperSymbol, requestedDays)

      if (data) {
        console.log(`[Cache] ✅ Cache available for ${upperSymbol}:${requestedDays}`)
      } else {
        console.log(`[Cache] ❌ Cache MISS for ${upperSymbol}:${requestedDays}, fetching from server...`)
        const response = await axios.get(`${API_URL}/analyze`, {
          params: {
            symbol: upperSymbol,
            days: requestedDays
          }
        })
        data = response.data

        // Store in cache
        apiCache.set(upperSymbol, requestedDays, data)
      }

      // Log cache statistics
      apiCache.logStats()

      // Save to history
      saveToHistory(upperSymbol)

      // Add new chart to the array
      const newChart = {
        id: Date.now(),
        symbol: upperSymbol,
        data: data,
        showRSI: false,
        showMACD: false,
        smaPeriods: [],
        smaVisibility: {},
        volumeColorEnabled: false,
        volumeColorMode: 'absolute', // 'absolute' or 'relative-spy'
        volumeProfileEnabled: false,
        volumeProfileMode: 'auto', // 'auto' or 'manual'
        volumeProfileManualRanges: [], // Array of { startDate, endDate }
        volumeProfileV2Enabled: false,
        volumeProfileV2StartDate: null,
        volumeProfileV2EndDate: null,
        spyData: null,
        performanceComparisonEnabled: false,
        performanceComparisonBenchmark: 'SPY',
        performanceComparisonDays: 30,
        comparisonMode: 'line', // 'color' or 'line'
        comparisonStocks: [], // Array of { symbol, data }
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
      setCharts(prevCharts => [newChart, ...prevCharts])

      // Show all data since it's already trimmed to the requested period
      setTimeout(() => {
        setGlobalZoomRange({ start: 0, end: null })
      }, 100)

      // Clear input if not clicked from history
      if (!symbolToAnalyze) {
        setSymbol('')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze stock. Please check the symbol and try again.')
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
          const response = await axios.get(`${API_URL}/analyze`, {
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
          const response = await axios.get(`${API_URL}/analyze`, {
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
        const response = await axios.get(`${API_URL}/analyze`, {
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
        const response = await axios.get(`${API_URL}/analyze`, {
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
      // Use the requested period - smart cache will use longer cached periods if available
      const requestedDays = newDays

      // Check if any chart needs SPY data (for volume comparison, performance comparison, or mkt gap open)
      const needsSpy = charts.some(chart => chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled || chart.mktGapOpenEnabled)
      let spyDataForPeriod = null

      if (needsSpy) {
        // Fetch SPY data once for all charts that need it (smart loading will check cache)
        spyDataForPeriod = apiCache.get('SPY', requestedDays)
        if (!spyDataForPeriod) {
          console.log(`[Cache] ❌ Cache MISS for SPY:${requestedDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: 'SPY',
              days: requestedDays
            }
          })
          spyDataForPeriod = response.data
          apiCache.set('SPY', requestedDays, spyDataForPeriod)
        } else {
          console.log(`[Cache] ✅ Cache available for SPY:${requestedDays}`)
        }
      }

      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first (smart loading will check for longer periods)
        let data = apiCache.get(chart.symbol, requestedDays)

        if (data) {
          console.log(`[Cache] ✅ Cache available for ${chart.symbol}:${requestedDays}`)
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${chart.symbol}:${requestedDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: chart.symbol,
              days: requestedDays
            }
          })
          data = response.data

          // Store in cache
          apiCache.set(chart.symbol, requestedDays, data)
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

      // After data is loaded, show all data since it's already trimmed to requested period
      // Wait for next tick to ensure charts are updated
      setTimeout(() => {
        // Reset zoom to show all data (data is already trimmed to requested period)
        setGlobalZoomRange({ start: 0, end: null })
      }, 100)
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
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="e.g., AAPL, TSLA, MSFT"
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
              <div className="bg-slate-800 p-2 md:p-6 pr-0 rounded-lg border-0 md:border md:border-slate-700 relative">
                {/* Collapse and Close buttons */}
                <div className="absolute top-4 right-4 flex gap-2">
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

                <div className="flex items-center justify-between mb-4 pr-24">
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
                    onVolumeProfileV2StartChange={(value) => updateVolumeProfileV2Start(chart.id, value)}
                    onVolumeProfileV2EndChange={(value) => updateVolumeProfileV2End(chart.id, value)}
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
                  />

                  {/* SMA Slider Controls */}
                  {!chart.collapsed && chart.smaPeriods && chart.smaPeriods.length > 0 && (
                    <div className="mt-3 space-y-2 px-2">
                      {chart.smaPeriods.map((period, index) => (
                        <div key={index} className="flex items-center gap-3 bg-slate-700/50 p-2 rounded">
                          <span className="text-sm text-slate-300 w-16">SMA {period}</span>
                          <input
                            type="range"
                            min="5"
                            max="200"
                            step="5"
                            value={period}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value)
                              const newPeriods = [...chart.smaPeriods]
                              newPeriods[index] = newValue
                              updateSmaPeriods(chart.id, newPeriods)
                            }}
                            className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-thumb"
                          />
                          <span className="text-xs text-slate-400 w-8 text-right">{period}</span>
                          <button
                            onClick={() => deleteSma(chart.id, period)}
                            className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                            title="Remove SMA"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>}

                {/* Loading Spinner */}
                {loading && (
                  <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70 z-50">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-white"></div>
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
