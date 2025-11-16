import { useState } from 'react'
import { TrendingUp, BarChart3, Activity } from 'lucide-react'
import StockAnalyzer from './components/StockAnalyzer'
import BacktestResults from './components/BacktestResults'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('analyze')

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="w-12 h-12 text-white" />
            <h1 className="text-4xl md:text-5xl font-bold text-white">
              Stock Trend Analyzer
            </h1>
          </div>
          <p className="text-white/80 text-lg">
            Analyze stock trends, identify buy/sell opportunities, and backtest trading strategies
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-800 rounded-lg shadow-lg mb-6 border border-slate-700">
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('analyze')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'analyze'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900'
                  : 'text-slate-300 hover:text-purple-400 hover:bg-slate-700'
              }`}
            >
              <Activity className="w-5 h-5" />
              Technical Analysis
            </button>
            <button
              onClick={() => setActiveTab('backtest')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'backtest'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900'
                  : 'text-slate-300 hover:text-purple-400 hover:bg-slate-700'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Backtesting
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'analyze' && <StockAnalyzer />}
            {activeTab === 'backtest' && <BacktestResults />}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-400 text-sm">
          <p>Data provided by Financial Modeling Prep | For educational purposes only</p>
        </div>
      </div>
    </div>
  )
}

export default App
