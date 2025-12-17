import { useEffect, useState } from 'react'
import { TrendingUp, BarChart3, Activity, Waves, Bug, BarChart2 } from 'lucide-react'
import StockAnalyzer from './components/StockAnalyzer'
import BacktestResults from './components/BacktestResults'
import V3BacktestResults from './components/V3BacktestResults'
import VolumeScreening from './components/VolumeScreening'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [selectedParams, setSelectedParams] = useState(null)
  const [volumeSymbol, setVolumeSymbol] = useState(null)
  const [backtestSymbol, setBacktestSymbol] = useState(null)
  const [v3BacktestSymbol, setV3BacktestSymbol] = useState(null)
  const [volumeImport, setVolumeImport] = useState(null)
  const [storageUsage, setStorageUsage] = useState(null)
  const [storageQuota, setStorageQuota] = useState(null)

  const measureLocalStorageUsage = () => {
    if (typeof window === 'undefined' || !window.localStorage) return null

    try {
      let totalSizeBytes = 0

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key) continue

        const value = localStorage.getItem(key) ?? ''
        totalSizeBytes += new Blob([key, value]).size
      }

      return totalSizeBytes
    } catch (error) {
      console.warn('Unable to measure LocalStorage usage', error)
      return null
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadStorageEstimate = async () => {
      let usage = null
      let quota = null

      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const estimate = await navigator.storage.estimate()
          if (!isMounted) return

          usage = typeof estimate.usage === 'number' && estimate.usage > 0 ? estimate.usage : null
          quota = typeof estimate.quota === 'number' ? estimate.quota : null
        } catch (error) {
          console.warn('Unable to estimate storage usage', error)
        }
      }

      if (!usage) {
        usage = measureLocalStorageUsage()
      }

      if (isMounted) {
        setStorageUsage(usage)
        setStorageQuota(quota && quota < 2 * 1024 * 1024 * 1024 ? quota : null)
      }
    }

    loadStorageEstimate()

    return () => {
      isMounted = false
    }
  }, [])

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

  const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return null

    if (bytes < 1024) return `${bytes.toFixed(0)} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const storageUsageLabel = formatBytes(storageUsage)
  const storageQuotaLabel = formatBytes(storageQuota)

  // Handle clicking on a stock in backtest results
  const handleStockSelect = (symbol, optimalParams) => {
    setSelectedSymbol(symbol)
    setSelectedParams(optimalParams)
    setActiveTab('analyze')
  }

  // Handle clicking on volume icon in backtest results
  const handleVolumeSelect = (symbol, days) => {
    setVolumeSymbol({ symbol, days })
    setActiveTab('volume')
  }

  const handleVolumeBulkAdd = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return

    setVolumeImport({ entries, timestamp: Date.now() })
    setActiveTab('volume')
  }

  const handleBacktestSelect = (symbol, days) => {
    setBacktestSymbol({ symbol, days })
    setActiveTab('backtest')
  }

  const handleV3BacktestSelect = (symbol, days) => {
    setV3BacktestSymbol({ symbol, days })
    setActiveTab('v3backtest')
  }

  const handleVolumeImportProcessed = () => {
    setVolumeImport(null)
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
        {storageUsageLabel && (
          <div className="absolute right-0 top-10 text-[10px] text-slate-300 bg-slate-800 border border-slate-700 rounded px-2 py-1 shadow-md">
            LocalStorage size: {storageUsageLabel}
            {storageQuotaLabel ? ` / ${storageQuotaLabel} quota` : ''}
          </div>
        )}

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
              onClick={() => setActiveTab('v3backtest')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'v3backtest'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900'
                  : 'text-slate-300 hover:text-purple-400 hover:bg-slate-700'
              }`}
            >
              <BarChart2 className="w-5 h-5" />
              V3 Backtest
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
            {activeTab === 'analyze' && (
              <StockAnalyzer selectedSymbol={selectedSymbol} selectedParams={selectedParams} />
            )}
            {activeTab === 'backtest' && (
              <BacktestResults
                onStockSelect={handleStockSelect}
                onVolumeSelect={handleVolumeSelect}
                onVolumeBulkAdd={handleVolumeBulkAdd}
                triggerBacktest={backtestSymbol}
                onBacktestProcessed={() => setBacktestSymbol(null)}
              />
            )}
            {activeTab === 'v3backtest' && (
              <V3BacktestResults
                onStockSelect={handleStockSelect}
                onVolumeSelect={handleVolumeSelect}
                onVolumeBulkAdd={handleVolumeBulkAdd}
                triggerBacktest={v3BacktestSymbol}
                onBacktestProcessed={() => setV3BacktestSymbol(null)}
              />
            )}
            {activeTab === 'volume' && (
              <VolumeScreening
                onStockSelect={handleStockSelect}
                triggerSymbol={volumeSymbol}
                onSymbolProcessed={() => setVolumeSymbol(null)}
                onBacktestSelect={handleBacktestSelect}
                bulkImport={volumeImport}
                onImportProcessed={handleVolumeImportProcessed}
              />
            )}
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
