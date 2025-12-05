import { useState } from 'react'
import { TrendingUp, BarChart3, Activity, Waves, Bug } from 'lucide-react'
import StockAnalyzer from './components/StockAnalyzer'
import BacktestResults from './components/BacktestResults'
import VolumeScreening from './components/VolumeScreening'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [selectedParams, setSelectedParams] = useState(null)
  const [volumeSymbol, setVolumeSymbol] = useState(null)

  const exportLocalStorage = () => {
    if (typeof window === 'undefined') return

    const entries = []
    let totalSizeBytes = 0

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue

      const value = localStorage.getItem(key) ?? ''
      const sizeBytes = new Blob([value]).size

      entries.push({ key, value, sizeBytes })
      totalSizeBytes += sizeBytes
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      totalSizeBytes,
      entries,
    }

    const exportName = `localStorage-export-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Handle clicking on a stock in backtest results
  const handleStockSelect = (symbol, optimalParams) => {
    setSelectedSymbol(symbol)
    setSelectedParams(optimalParams)
    setActiveTab('analyze')
  }

  // Handle clicking on volume icon in backtest results
  const handleVolumeSelect = (symbol) => {
    setVolumeSymbol(symbol)
    setActiveTab('volume')
  }

  return (
    <div className="min-h-screen p-0 md:p-8">
      <div className="w-full relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="w-12 h-12 text-white" />
            <h1 className="text-4xl md:text-5xl font-bold text-white">
              Stock Trend Analyzer
            </h1>
          </div>
        </div>

        <button
          onClick={exportLocalStorage}
          className="absolute right-0 top-0 flex items-center gap-1 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md px-2.5 py-1.5 shadow-md transition-colors"
          title="Export LocalStorage contents"
          aria-label="Export LocalStorage contents"
        >
          <Bug className="w-4 h-4" />
          Debug export
        </button>

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
            <button
              onClick={() => setActiveTab('volume')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'volume'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900'
                  : 'text-slate-300 hover:text-purple-400 hover:bg-slate-700'
              }`}
            >
              <Waves className="w-5 h-5" />
              Volume Screening
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-0 md:p-6">
            {/* Keep all components mounted so cached volume data hydrates even before the tab is visible */}
            <div style={{ display: activeTab === 'analyze' ? 'block' : 'none' }}>
              <StockAnalyzer selectedSymbol={selectedSymbol} selectedParams={selectedParams} />
            </div>
            <div style={{ display: activeTab === 'backtest' ? 'block' : 'none' }}>
              <BacktestResults onStockSelect={handleStockSelect} onVolumeSelect={handleVolumeSelect} />
            </div>
            <div style={{ display: activeTab === 'volume' ? 'block' : 'none' }}>
              <VolumeScreening onStockSelect={handleStockSelect} triggerSymbol={volumeSymbol} onSymbolProcessed={() => setVolumeSymbol(null)} />
            </div>
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
