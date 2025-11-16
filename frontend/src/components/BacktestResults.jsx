import { useState } from 'react'
import axios from 'axios'
import { Search, Loader2, TrendingUp, TrendingDown, DollarSign, Target, Percent } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function BacktestResults() {
  const [symbol, setSymbol] = useState('')
  const [days, setDays] = useState('365')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const runBacktest = async () => {
    if (!symbol.trim()) {
      setError('Please enter a stock symbol')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const response = await axios.get(`${API_URL}/backtest`, {
        params: {
          symbol: symbol.toUpperCase(),
          days: days
        }
      })
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run backtest. Please check the symbol and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      runBacktest()
    }
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stock Symbol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="e.g., AAPL, TSLA, MSFT"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backtest Period
            </label>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="90">3 Months</option>
              <option value="180">6 Months</option>
              <option value="365">1 Year</option>
              <option value="730">2 Years</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={runBacktest}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Run Backtest
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {data && data.backtestResult && (
        <div className="space-y-6">
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Total Return</p>
                  <p className={`text-2xl font-bold mt-2 ${data.backtestResult.totalReturn >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(data.backtestResult.totalReturn)}
                  </p>
                  <p className={`text-sm mt-1 ${data.backtestResult.totalReturnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(data.backtestResult.totalReturnPercentage)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Win Rate</p>
                  <p className="text-2xl font-bold mt-2 text-blue-900">
                    {data.backtestResult.winRate.toFixed(1)}%
                  </p>
                  <p className="text-sm mt-1 text-blue-600">
                    {data.backtestResult.winningTrades}W / {data.backtestResult.losingTrades}L
                  </p>
                </div>
                <Target className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Total Trades</p>
                  <p className="text-2xl font-bold mt-2 text-purple-900">
                    {data.backtestResult.totalTrades}
                  </p>
                  <p className="text-sm mt-1 text-purple-600">
                    Signals: {data.totalSignals}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600">Profit Factor</p>
                  <p className="text-2xl font-bold mt-2 text-orange-900">
                    {data.backtestResult.profitFactor.toFixed(2)}
                  </p>
                  <p className="text-sm mt-1 text-orange-600">
                    Sharpe: {data.backtestResult.sharpeRatio.toFixed(2)}
                  </p>
                </div>
                <Percent className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Initial Capital</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data.backtestResult.initialCapital)}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Final Capital</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data.backtestResult.finalCapital)}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Max Drawdown</p>
              <p className="text-xl font-bold text-red-600">
                {data.backtestResult.maxDrawdown.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Trade Statistics */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Trade Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-2">Average Win</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(data.backtestResult.averageWin)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Average Loss</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(data.backtestResult.averageLoss)}
                </p>
              </div>
            </div>
          </div>

          {/* Trades List */}
          {data.backtestResult.trades && data.backtestResult.trades.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">Trade History</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exit Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entry Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Exit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shares</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit/Loss</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Return %</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.backtestResult.trades.map((trade, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{trade.entryDate}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{trade.exitDate}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">${trade.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">${trade.exitPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{trade.shares}</td>
                        <td className={`px-4 py-3 text-sm font-semibold text-right ${trade.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(trade.profit)}
                        </td>
                        <td className={`px-4 py-3 text-sm font-semibold text-right ${trade.profitPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPercent(trade.profitPercentage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BacktestResults
