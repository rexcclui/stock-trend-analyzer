import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings, ChevronDown, ChevronUp, RefreshCw, Filter } from 'lucide-react'
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
  const [smaDialogOpen, setSmaDialogOpen] = useState(false)
  const [editingSmaChartId, setEditingSmaChartId] = useState(null)
  const [slopeChannelDialogOpen, setSlopeChannelDialogOpen] = useState(false)
  const [editingSlopeChannelChartId, setEditingSlopeChannelChartId] = useState(null)
  const [globalZoomRange, setGlobalZoomRange] = useState({ start: 0, end: null })
  const [loadingComparisonStocks, setLoadingComparisonStocks] = useState({}) // Track loading state per chart

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

      // Always fetch maximum data (3650 days) to have full history available
      const maxDays = '3650'

      // Try to get from cache first
      let data = apiCache.get(upperSymbol, maxDays)

      if (data) {
        console.log(`[Cache] ✅ Cache HIT for ${upperSymbol}:${maxDays}`)
      } else {
        console.log(`[Cache] ❌ Cache MISS for ${upperSymbol}:${maxDays}, fetching from server...`)
        const response = await axios.get(`${API_URL}/analyze`, {
          params: {
            symbol: upperSymbol,
            days: maxDays
          }
        })
        data = response.data

        // Store in cache
        apiCache.set(upperSymbol, maxDays, data)
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
        manualChannelEnabled: false,
        manualChannelDragMode: false,
        bestChannelEnabled: false,
        bestChannelVolumeFilterEnabled: false,
        collapsed: false
      }
      setCharts(prevCharts => [...prevCharts, newChart])

      // Auto-zoom to selected period after adding chart
      setTimeout(() => {
        if (data.prices) {
          const totalDataPoints = data.prices.length
          const daysNum = parseInt(days)
          let targetDataPoints = totalDataPoints

          if (daysNum <= 7) {
            targetDataPoints = Math.min(7, totalDataPoints)
          } else if (daysNum <= 30) {
            targetDataPoints = Math.min(22, totalDataPoints)
          } else if (daysNum <= 90) {
            targetDataPoints = Math.min(63, totalDataPoints)
          } else if (daysNum <= 180) {
            targetDataPoints = Math.min(126, totalDataPoints)
          } else if (daysNum <= 365) {
            targetDataPoints = Math.min(252, totalDataPoints)
          } else if (daysNum <= 1095) {
            targetDataPoints = Math.min(756, totalDataPoints)
          } else if (daysNum <= 1825) {
            targetDataPoints = Math.min(1260, totalDataPoints)
          }

          if (targetDataPoints < totalDataPoints) {
            // Show most recent data by setting start to show last N data points
            const startIndex = totalDataPoints - targetDataPoints
            setGlobalZoomRange({ start: startIndex, end: null })
          } else {
            // Show all data if selected period >= total available data
            setGlobalZoomRange({ start: 0, end: null })
          }
        }
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

  const openSmaDialog = (chartId) => {
    setEditingSmaChartId(chartId)
    setSmaDialogOpen(true)
  }

  const closeSmaDialog = () => {
    setSmaDialogOpen(false)
    setEditingSmaChartId(null)
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

  const updateRevAllChannelEnd = (chartId, endIndex) => {
    setCharts(prevCharts =>
      prevCharts.map(chart =>
        chart.id === chartId
          ? { ...chart, revAllChannelEndIndex: endIndex }
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

    // Update all charts with the new time range
    try {
      // Always fetch maximum data (3650 days) to have full history available
      const maxDays = '3650'

      // Check if any chart needs SPY data (for volume comparison or performance comparison)
      const needsSpy = charts.some(chart => chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled)
      let spyDataForPeriod = null

      if (needsSpy) {
        // Fetch SPY data once for all charts that need it
        spyDataForPeriod = apiCache.get('SPY', maxDays)
        if (!spyDataForPeriod) {
          console.log(`[Cache] ❌ Cache MISS for SPY:${maxDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: 'SPY',
              days: maxDays
            }
          })
          spyDataForPeriod = response.data
          apiCache.set('SPY', maxDays, spyDataForPeriod)
        } else {
          console.log(`[Cache] ✅ Cache HIT for SPY:${maxDays}`)
        }
      }

      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first - always fetch max data
        let data = apiCache.get(chart.symbol, maxDays)

        if (data) {
          console.log(`[Cache] ✅ Cache HIT for ${chart.symbol}:${maxDays}`)
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${chart.symbol}:${maxDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: chart.symbol,
              days: maxDays
            }
          })
          data = response.data

          // Store in cache
          apiCache.set(chart.symbol, maxDays, data)
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

          // Update SPY data if chart is in relative-spy mode or performance comparison mode
          if ((chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled) && spyDataForPeriod) {
            updates.spyData = spyDataForPeriod
          }

          return updatedData ? { ...chart, ...updates } : chart
        })
      )

      // After data is loaded, calculate zoom range based on selected period
      // Wait for next tick to ensure charts are updated
      setTimeout(() => {
        if (results.length > 0 && results[0].data.prices) {
          const totalDataPoints = results[0].data.prices.length

          // Calculate approximate data points for the selected period
          // Assuming roughly 252 trading days per year
          const daysNum = parseInt(newDays)
          let targetDataPoints = totalDataPoints // Default to all data

          if (daysNum <= 7) {
            targetDataPoints = Math.min(7, totalDataPoints)
          } else if (daysNum <= 30) {
            targetDataPoints = Math.min(22, totalDataPoints) // ~22 trading days in a month
          } else if (daysNum <= 90) {
            targetDataPoints = Math.min(63, totalDataPoints) // ~63 trading days in 3 months
          } else if (daysNum <= 180) {
            targetDataPoints = Math.min(126, totalDataPoints) // ~126 trading days in 6 months
          } else if (daysNum <= 365) {
            targetDataPoints = Math.min(252, totalDataPoints) // ~252 trading days in 1 year
          } else if (daysNum <= 1095) {
            targetDataPoints = Math.min(756, totalDataPoints) // ~756 trading days in 3 years
          } else if (daysNum <= 1825) {
            targetDataPoints = Math.min(1260, totalDataPoints) // ~1260 trading days in 5 years
          }
          // else: Max - show all data

          // Set zoom to show only the target period (most recent data)
          if (targetDataPoints < totalDataPoints) {
            // Show most recent data by setting start to show last N data points
            const startIndex = totalDataPoints - targetDataPoints
            setGlobalZoomRange({ start: startIndex, end: null })
          } else {
            // Show all data if selected period >= total available data
            setGlobalZoomRange({ start: 0, end: null })
          }
        }
      }, 100)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update charts.')
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
              <div className="flex flex-col">
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
              <div className="bg-slate-800 p-6 pr-0 rounded-lg border border-slate-700 relative">
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
                  <h3 className="text-lg font-semibold text-slate-100">{chart.symbol}</h3>
                  {!chart.collapsed && <div className="flex gap-2">
                    <div className="flex gap-1 items-center">
                      <button
                        type="button"
                        onClick={() => toggleVolumeColor(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                          chart.volumeColorEnabled
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                        title="Highlight high volume (top 20%) and low volume (bottom 20%)"
                      >
                        Volume Color
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
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                          chart.volumeProfileEnabled
                            ? 'bg-yellow-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                        title="Show horizontal volume profile"
                      >
                        Volume Profile
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
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                              chart.volumeProfileMode === 'auto'
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
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                              chart.volumeProfileMode === 'manual'
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
                        onClick={() => {
                          setCharts(prevCharts =>
                            prevCharts.map(c =>
                              c.id === chart.id
                                ? { ...c, comparisonMode: c.comparisonMode === 'color' ? 'line' : 'color' }
                                : c
                            )
                          )
                        }}
                        className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                          chart.comparisonMode === 'color'
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
                            className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                              chart.performanceComparisonEnabled
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
                      Last Channel
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRevAllChannel(chart.id)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.revAllChannelEnabled
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      title="All Channels"
                    >
                      All Channel
                    </button>
                    {chart.revAllChannelEnabled && (
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
                    )}
                    <button
                      type="button"
                      onClick={() => toggleManualChannel(chart.id)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.manualChannelEnabled
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      title="Manual Channel - Draw rectangle to select data range"
                    >
                      Manual Channel
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
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            !chart.manualChannelDragMode
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
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            chart.manualChannelDragMode
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
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.bestChannelEnabled
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
                        className={`px-2 py-1 text-sm rounded transition-colors ${
                          chart.bestChannelVolumeFilterEnabled
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
                      onClick={() => openSmaDialog(chart.id)}
                      className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                      title="Configure SMA"
                    >
                      <Settings className="w-4 h-4" />
                      SMA
                    </button>
                    <button
                      type="button"
                      onClick={() => updateChartIndicator(chart.id, 'showRSI', !chart.showRSI)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.showRSI
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      RSI
                    </button>
                    <button
                      type="button"
                      onClick={() => updateChartIndicator(chart.id, 'showMACD', !chart.showMACD)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.showMACD
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      MACD
                    </button>
                  </div>}
                </div>
                {!chart.collapsed && <div className="pr-0 md:pr-14 relative">
                  {/* Loading overlay when fetching comparison stock */}
                  {loadingComparisonStocks[chart.id] && (
                    <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 rounded">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
                        <p className="text-slate-200 font-medium">Loading {loadingComparisonStocks[chart.id]}...</p>
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
                    manualChannelEnabled={chart.manualChannelEnabled}
                    manualChannelDragMode={chart.manualChannelDragMode}
                    bestChannelEnabled={chart.bestChannelEnabled}
                    bestChannelVolumeFilterEnabled={chart.bestChannelVolumeFilterEnabled}
                    chartHeight={chartHeight}
                    days={days}
                    zoomRange={globalZoomRange}
                    onZoomChange={updateGlobalZoom}
                    onExtendPeriod={extendTimePeriod}
                  />
                </div>}

                {/* Time Period Selector - Right Side (Desktop) / Bottom (Mobile) */}
                {!chart.collapsed && (
                  <div className="absolute top-1/2 right-0 -translate-y-1/2 hidden md:block" style={{ zIndex: 5 }}>
                    <div className="flex flex-col gap-0 bg-slate-900/95 rounded border border-slate-700 backdrop-blur-sm shadow-lg overflow-hidden">
                      {timeRanges.map((range) => (
                        <button
                          type="button"
                          key={range.label}
                          onClick={() => changeTimeRange(range.days)}
                          className={`px-2 py-1 text-xs font-bold transition-all whitespace-nowrap border-0 ${
                            days === range.days
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
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            days === range.days
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
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
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

      {/* SMA Configuration Dialog */}
      {smaDialogOpen && editingSmaChartId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeSmaDialog}>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Configure SMA Lines</h3>
              <button
                onClick={closeSmaDialog}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const chart = charts.find(c => c.id === editingSmaChartId)
              if (!chart) return null

              const tempPeriods = [...chart.smaPeriods]

              return (
                <div className="space-y-3">
                  {tempPeriods.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-2">No SMA lines configured. Click below to add one.</p>
                  ) : (
                    tempPeriods.map((period, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={period}
                          onChange={(e) => {
                            const value = e.target.value
                            const parsed = parseInt(value)
                            if (value === '' || (!isNaN(parsed) && parsed >= 1 && parsed <= 200)) {
                              const newPeriods = [...tempPeriods]
                              newPeriods[index] = value === '' ? '' : parsed
                              updateSmaPeriods(editingSmaChartId, newPeriods)
                            }
                          }}
                          placeholder="Period (1-200)"
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => {
                            const newPeriods = tempPeriods.filter((_, i) => i !== index)
                            updateSmaPeriods(editingSmaChartId, newPeriods)
                          }}
                          className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          title="Remove SMA"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}

                  {tempPeriods.length < 5 && (
                    <button
                      onClick={() => {
                        const defaultPeriods = [20, 30, 50, 100, 200]
                        const defaultPeriod = defaultPeriods[tempPeriods.length] || 30
                        const newPeriods = [...tempPeriods, defaultPeriod]
                        updateSmaPeriods(editingSmaChartId, newPeriods)
                      }}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add SMA Line
                    </button>
                  )}

                  <div className="pt-3 border-t border-slate-700">
                    <button
                      onClick={closeSmaDialog}
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
