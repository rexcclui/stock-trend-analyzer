import React, { useState } from 'react'
import { Search, TrendingUp, Info } from 'lucide-react'
import VolumeProfileStatisticalAnalysisExample from './VolumeProfileStatisticalAnalysisExample'

const VolumeProfileStatsTab = () => {
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [priceData, setPriceData] = useState(null)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    if (!symbol) return

    setLoading(true)
    setError(null)

    try {
      // Fetch stock data from backend
      const response = await fetch(
        `http://localhost:8080/api/analyze?symbol=${symbol}&days=365`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }

      const data = await response.json()

      // Transform to format needed by volume profile analysis
      const transformed = data.prices.map(p => ({
        date: p.date,
        close: p.close,
        high: p.high,
        low: p.low,
        volume: p.volume
      }))

      setPriceData(transformed)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <TrendingUp size={32} />
          Volume Profile Statistical Analysis
        </h1>
        <p className="text-purple-100">
          Analyze POC, Value Area, High/Low Volume Nodes, and generate trading signals
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter stock symbol (e.g., AAPL)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && fetchData()}
              className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading || !symbol}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Search size={20} />
            {loading ? 'Loading...' : 'Analyze'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            Error: {error}
          </div>
        )}
      </div>

      {/* Info Box */}
      {!priceData && (
        <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-6">
          <div className="flex gap-3">
            <Info size={24} className="text-blue-400 flex-shrink-0 mt-1" />
            <div className="text-blue-200">
              <h3 className="font-semibold mb-2">About Volume Profile Statistics</h3>
              <ul className="space-y-1 text-sm">
                <li><strong>POC (Point of Control):</strong> Price with highest volume - strong support/resistance</li>
                <li><strong>Value Area:</strong> Price range containing 70% of volume - fair value zone</li>
                <li><strong>HVN (High Volume Nodes):</strong> Strong support/resistance levels</li>
                <li><strong>LVN (Low Volume Nodes):</strong> Thin zones where price moves quickly</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {priceData && (
        <VolumeProfileStatisticalAnalysisExample
          priceData={priceData}
          benchmarkData={null}
        />
      )}
    </div>
  )
}

export default VolumeProfileStatsTab
