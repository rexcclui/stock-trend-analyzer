import { useState } from 'react'
import axios from 'axios'
import { Search, Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import PriceChart from './PriceChart'
import IndicatorsChart from './IndicatorsChart'
import SignalsList from './SignalsList'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function StockAnalyzer() {
  const [symbol, setSymbol] = useState('')
  const [days, setDays] = useState('365')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [showRSI, setShowRSI] = useState(false)
  const [showMACD, setShowMACD] = useState(false)
  const [syncedMouseDate, setSyncedMouseDate] = useState(null)

  const analyzeStock = async () => {
    if (!symbol.trim()) {
      setError('Please enter a stock symbol')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const response = await axios.get(`${API_URL}/analyze`, {
        params: {
          symbol: symbol.toUpperCase(),
          days: days
        }
      })
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze stock. Please check the symbol and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      analyzeStock()
    }
  }

  const changeTimeRange = async (newDays) => {
    if (!symbol.trim() || !data) return

    setDays(newDays)
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get(`${API_URL}/analyze`, {
        params: {
          symbol: symbol.toUpperCase(),
          days: newDays
        }
      })
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze stock. Please check the symbol and try again.')
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

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Stock Symbol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="e.g., AAPL, TSLA, MSFT"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={analyzeStock}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Analyze
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {data && (
        <div className="space-y-6">
          {/* Price Chart */}
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold mb-4 text-slate-100">Price Chart with Signals</h3>
            <PriceChart
              prices={data.prices}
              indicators={data.indicators}
              signals={data.signals}
              syncedMouseDate={syncedMouseDate}
              setSyncedMouseDate={setSyncedMouseDate}
            />

            {/* Controls: Time Range + Indicators */}
            <div className="flex justify-between items-center mt-6 flex-wrap gap-4">
              {/* Time Range Selector */}
              <div className="flex gap-2 flex-wrap">
                {timeRanges.map((range) => (
                  <button
                    key={range.label}
                    onClick={() => changeTimeRange(range.days)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      days === range.days
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>

              {/* Indicator Toggle Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRSI(!showRSI)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    showRSI
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  RSI
                </button>
                <button
                  onClick={() => setShowMACD(!showMACD)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    showMACD
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  MACD
                </button>
              </div>
            </div>
          </div>

          {/* Technical Indicators */}
          {(showRSI || showMACD) && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <h3 className="text-lg font-semibold mb-4 text-slate-100">Technical Indicators</h3>
              <IndicatorsChart
                indicators={data.indicators}
                showRSI={showRSI}
                showMACD={showMACD}
                syncedMouseDate={syncedMouseDate}
                setSyncedMouseDate={setSyncedMouseDate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StockAnalyzer
