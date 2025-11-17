import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings, ChevronDown, ChevronUp } from 'lucide-react'
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
  const [chartHeight, setChartHeight] = useState(400)
  const [smaDialogOpen, setSmaDialogOpen] = useState(false)
  const [editingSmaChartId, setEditingSmaChartId] = useState(null)
  const [slopeChannelDialogOpen, setSlopeChannelDialogOpen] = useState(false)
  const [editingSlopeChannelChartId, setEditingSlopeChannelChartId] = useState(null)
  const [globalZoomRange, setGlobalZoomRange] = useState({ start: 0, end: null })

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

      // Fetch 2x the requested days to allow panning backwards in time
      const requestedDays = parseInt(days)
      const fetchDays = Math.min(requestedDays * 2, 3650) // Fetch 2x but cap at max

      // Try to get from cache first
      let data = apiCache.get(upperSymbol, fetchDays.toString())

      if (data) {
        console.log(`[Cache] ✅ Cache HIT for ${upperSymbol}:${fetchDays}`)
      } else {
        console.log(`[Cache] ❌ Cache MISS for ${upperSymbol}:${fetchDays}, fetching from server...`)
        const response = await axios.get(`${API_URL}/analyze`, {
          params: {
            symbol: upperSymbol,
            days: fetchDays
          }
        })
        data = response.data

        // Store in cache
        apiCache.set(upperSymbol, fetchDays.toString(), data)
      }

      // Log cache statistics
      apiCache.logStats()

      // Save to history
      saveToHistory(upperSymbol)

      // Calculate initial zoom range to show only the requested period
      const totalDataPoints = data.prices?.length || 0
      const displayDataPoints = Math.min(requestedDays, totalDataPoints)
      const zoomStart = Math.max(0, totalDataPoints - displayDataPoints)

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
        spyData: null,
        performanceComparisonEnabled: false,
        performanceComparisonBenchmark: 'SPY',
        performanceComparisonDays: 30,
        slopeChannelEnabled: false,
        slopeChannelVolumeWeighted: false,
        slopeChannelZones: 8,
        slopeChannelDataPercent: 30,
        slopeChannelWidthMultiplier: 2.5,
        findAllChannelEnabled: false,
        manualChannelEnabled: false,
        collapsed: false
      }
      setCharts(prevCharts => [...prevCharts, newChart])

      // Set initial zoom to show only the requested period (leaving older data for panning)
      setGlobalZoomRange({ start: zoomStart, end: null })

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

  const toggleFindAllChannel = (chartId) => {
    setCharts(prevCharts =>
      prevCharts.map(chart => {
        if (chart.id === chartId) {
          return {
            ...chart,
            findAllChannelEnabled: !chart.findAllChannelEnabled
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

  const cycleVolumeColorMode = async (chartId) => {
    const chart = charts.find(c => c.id === chartId)
    if (!chart) return

    const modes = ['absolute', 'relative-spy']
    const currentIndex = modes.indexOf(chart.volumeColorMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]

    // If switching to relative-spy mode and we don't have SPY data, fetch it
    if (nextMode === 'relative-spy' && !chart.spyData) {
      try {
        // Fetch 2x the requested days to match main chart data
        const requestedDays = parseInt(days)
        const fetchDays = Math.min(requestedDays * 2, 3650)

        // Check cache first
        let spyData = apiCache.get('SPY', fetchDays.toString())

        if (!spyData) {
          console.log(`[Cache] ❌ Cache MISS for SPY:${fetchDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: 'SPY',
              days: fetchDays
            }
          })
          spyData = response.data
          apiCache.set('SPY', fetchDays.toString(), spyData)
        } else {
          console.log(`[Cache] ✅ Cache HIT for SPY:${fetchDays}`)
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
      // Fetch 2x the requested days to match main chart data
      const requestedDays = parseInt(days)
      const fetchDays = Math.min(requestedDays * 2, 3650)

      // Check cache first
      let benchmarkData = apiCache.get(benchmarkSymbol, fetchDays.toString())

      if (!benchmarkData) {
        console.log(`[Cache] ❌ Cache MISS for ${benchmarkSymbol}:${fetchDays}, fetching from server...`)
        const response = await axios.get(`${API_URL}/analyze`, {
          params: {
            symbol: benchmarkSymbol,
            days: fetchDays
          }
        })
        benchmarkData = response.data
        apiCache.set(benchmarkSymbol, fetchDays.toString(), benchmarkData)
      } else {
        console.log(`[Cache] ✅ Cache HIT for ${benchmarkSymbol}:${fetchDays}`)
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

    // Fetch 2x the requested days to allow panning backwards in time
    const requestedDays = parseInt(newDays)
    const fetchDays = Math.min(requestedDays * 2, 3650) // Fetch 2x but cap at max

    // Update all charts with the new time range
    try {
      // Check if any chart needs SPY data (for volume comparison or performance comparison)
      const needsSpy = charts.some(chart => chart.volumeColorMode === 'relative-spy' || chart.performanceComparisonEnabled)
      let spyDataForPeriod = null

      if (needsSpy) {
        // Fetch SPY data once for all charts that need it
        spyDataForPeriod = apiCache.get('SPY', fetchDays.toString())
        if (!spyDataForPeriod) {
          console.log(`[Cache] ❌ Cache MISS for SPY:${fetchDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: 'SPY',
              days: fetchDays
            }
          })
          spyDataForPeriod = response.data
          apiCache.set('SPY', fetchDays.toString(), spyDataForPeriod)
        } else {
          console.log(`[Cache] ✅ Cache HIT for SPY:${fetchDays}`)
        }
      }

      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first
        let data = apiCache.get(chart.symbol, fetchDays.toString())

        if (data) {
          console.log(`[Cache] ✅ Cache HIT for ${chart.symbol}:${fetchDays}`)
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${chart.symbol}:${fetchDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: chart.symbol,
              days: fetchDays
            }
          })
          data = response.data

          // Store in cache
          apiCache.set(chart.symbol, fetchDays.toString(), data)
        }

        return { id: chart.id, data }
      })

      const results = await Promise.all(updatePromises)

      // Log cache statistics
      apiCache.logStats()

      // Calculate initial zoom range to show only the requested period
      const firstResult = results[0]
      if (firstResult?.data) {
        const totalDataPoints = firstResult.data.prices?.length || 0
        const displayDataPoints = Math.min(requestedDays, totalDataPoints)
        const zoomStart = Math.max(0, totalDataPoints - displayDataPoints)
        setGlobalZoomRange({ start: zoomStart, end: null })
      } else {
        setGlobalZoomRange({ start: 0, end: null })
      }

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
              <div className="flex flex-col">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Time Period
                </label>
                <div className="flex gap-1 flex-wrap">
                  {timeRanges.map((range) => (
                    <button
                      type="button"
                      key={range.label}
                      onClick={() => changeTimeRange(range.days)}
                      className={`px-2 py-1 text-sm rounded font-medium transition-colors ${
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
              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 relative">
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
                        onClick={() => togglePerformanceComparison(chart.id)}
                        className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                          chart.performanceComparisonEnabled
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                        title="Highlight top 20% and bottom 20% performance variance vs benchmark"
                      >
                        vs Perf
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
                          <input
                            type="number"
                            value={chart.performanceComparisonDays}
                            onChange={(e) => {
                              const value = parseInt(e.target.value)
                              if (!isNaN(value) && value > 0 && value <= 365) {
                                setCharts(prevCharts =>
                                  prevCharts.map(c =>
                                    c.id === chart.id
                                      ? { ...c, performanceComparisonDays: value }
                                      : c
                                  )
                                )
                              }
                            }}
                            min="1"
                            max="365"
                            placeholder="30"
                            className="w-14 px-2 py-1 text-xs bg-slate-600 border border-slate-500 text-slate-100 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                            title="Lookback days"
                          />
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openSlopeChannelDialog(chart.id)}
                      className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                      title="Configure Slope Channel"
                    >
                      <Settings className="w-4 h-4" />
                      Slope Channel
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFindAllChannel(chart.id)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.findAllChannelEnabled
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      title="Find All Channels"
                    >
                      Find All Channel
                    </button>
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
                {!chart.collapsed && <PriceChart
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
                  spyData={chart.spyData}
                  performanceComparisonEnabled={chart.performanceComparisonEnabled}
                  performanceComparisonBenchmark={chart.performanceComparisonBenchmark}
                  performanceComparisonDays={chart.performanceComparisonDays}
                  slopeChannelEnabled={chart.slopeChannelEnabled}
                  slopeChannelVolumeWeighted={chart.slopeChannelVolumeWeighted}
                  slopeChannelZones={chart.slopeChannelZones}
                  slopeChannelDataPercent={chart.slopeChannelDataPercent}
                  slopeChannelWidthMultiplier={chart.slopeChannelWidthMultiplier}
                  onSlopeChannelParamsChange={(params) => updateSlopeChannelParams(chart.id, params)}
                  findAllChannelEnabled={chart.findAllChannelEnabled}
                  manualChannelEnabled={chart.manualChannelEnabled}
                  chartHeight={chartHeight}
                  days={days}
                  zoomRange={globalZoomRange}
                  onZoomChange={updateGlobalZoom}
                  onExtendPeriod={extendTimePeriod}
                />}
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

      {/* Slope Channel Configuration Dialog */}
      {slopeChannelDialogOpen && editingSlopeChannelChartId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeSlopeChannelDialog}>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Configure Slope Channel</h3>
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
