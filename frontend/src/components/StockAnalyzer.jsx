import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown, AlertCircle, X, Settings } from 'lucide-react'
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

      // Try to get from cache first
      let data = apiCache.get(upperSymbol, days)

      if (data) {
        console.log(`[Cache] ✅ Cache HIT for ${upperSymbol}:${days}`)
      } else {
        console.log(`[Cache] ❌ Cache MISS for ${upperSymbol}:${days}, fetching from server...`)
        const response = await axios.get(`${API_URL}/analyze`, {
          params: {
            symbol: upperSymbol,
            days: days
          }
        })
        data = response.data

        // Store in cache
        apiCache.set(upperSymbol, days, data)
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
        slopeChannelEnabled: false,
        slopeChannelZones: 5
      }
      setCharts(prevCharts => [...prevCharts, newChart])

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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      analyzeStock()
    }
  }

  const changeTimeRange = async (newDays) => {
    setDays(newDays)
    setError(null)
    setGlobalZoomRange({ start: 0, end: null }) // Reset global zoom when changing periods

    // Update all charts with the new time range
    try {
      const updatePromises = charts.map(async (chart) => {
        // Try to get from cache first
        let data = apiCache.get(chart.symbol, newDays)

        if (data) {
          console.log(`[Cache] ✅ Cache HIT for ${chart.symbol}:${newDays}`)
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${chart.symbol}:${newDays}, fetching from server...`)
          const response = await axios.get(`${API_URL}/analyze`, {
            params: {
              symbol: chart.symbol,
              days: newDays
            }
          })
          data = response.data

          // Store in cache
          apiCache.set(chart.symbol, newDays, data)
        }

        return { id: chart.id, data }
      })

      const results = await Promise.all(updatePromises)

      // Log cache statistics
      apiCache.logStats()

      setCharts(prevCharts =>
        prevCharts.map(chart => {
          const updatedData = results.find(r => r.id === chart.id)
          return updatedData ? { ...chart, data: updatedData.data } : chart
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
                    onClick={() => setChartHeight(prev => Math.max(200, prev - 50))}
                    className="p-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg hover:bg-slate-600 transition-colors"
                    title="Decrease height"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
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
                {/* Close button */}
                <button
                  onClick={() => removeChart(chart.id)}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Remove chart"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center justify-between mb-4 pr-12">
                  <h3 className="text-lg font-semibold text-slate-100">{chart.symbol}</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openSlopeChannelDialog(chart.id)}
                      className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                      title="Configure Slope Channel"
                    >
                      <Settings className="w-4 h-4" />
                      Slope Channel
                    </button>
                    <button
                      onClick={() => openSmaDialog(chart.id)}
                      className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                      title="Configure SMA"
                    >
                      <Settings className="w-4 h-4" />
                      SMA
                    </button>
                    <button
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
                      onClick={() => updateChartIndicator(chart.id, 'showMACD', !chart.showMACD)}
                      className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                        chart.showMACD
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      MACD
                    </button>
                  </div>
                </div>
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
                  slopeChannelEnabled={chart.slopeChannelEnabled}
                  slopeChannelZones={chart.slopeChannelZones}
                  chartHeight={chartHeight}
                  days={days}
                  zoomRange={globalZoomRange}
                  onZoomChange={updateGlobalZoom}
                  onExtendPeriod={extendTimePeriod}
                />
              </div>

              {/* Technical Indicators */}
              {(chart.showRSI || chart.showMACD) && (
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

                  {/* Number of Zones */}
                  {chart.slopeChannelEnabled && (
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
                        The channel will be divided into parallel zones with volume-weighted colors
                      </p>
                    </div>
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
