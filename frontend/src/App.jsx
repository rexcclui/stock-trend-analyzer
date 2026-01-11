import { useEffect, useState } from 'react'
import { TrendingUp, BarChart3, Activity, Waves, Bug, BarChart2, Filter, Database, X, AlertCircle, Trash2, RefreshCcw, Clock } from 'lucide-react'
import StockAnalyzer from './components/StockAnalyzer'
import BacktestResults from './components/BacktestResults'
import V3BacktestResults from './components/V3BacktestResults'
import VolumeScreening from './components/VolumeScreening'
import StockFiltering from './components/StockFiltering'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [selectedParams, setSelectedParams] = useState(null)
  const [volumeSymbol, setVolumeSymbol] = useState(null)
  const [backtestSymbol, setBacktestSymbol] = useState(null)
  const [v3BacktestSymbol, setV3BacktestSymbol] = useState(null)
  const [volumeImport, setVolumeImport] = useState(null)
  const [filterImport, setFilterImport] = useState(null)
  const [storageUsage, setStorageUsage] = useState(null)
  const [storageQuota, setStorageQuota] = useState(null)
  const [showGlobalQueueModal, setShowGlobalQueueModal] = useState(false)
  const [allScheduleJobs, setAllScheduleJobs] = useState([])

  const loadAllScheduleQueues = () => {
    const queues = []

    // Load from Stock Filter
    try {
      const filterQueue = localStorage.getItem('stockFilterScheduleQueue')
      if (filterQueue) {
        const parsed = JSON.parse(filterQueue)
        if (Array.isArray(parsed)) {
          queues.push(...parsed.map(job => ({ ...job, source: 'Stock Filter', sourceKey: 'stockFilterScheduleQueue' })))
        }
      }
    } catch (error) {
      console.error('Failed to load Stock Filter schedule queue', error)
    }

    // Load from V2 Backtest
    try {
      const backtestQueue = localStorage.getItem('backtestScheduleQueue')
      if (backtestQueue) {
        const parsed = JSON.parse(backtestQueue)
        if (Array.isArray(parsed)) {
          queues.push(...parsed.map(job => ({ ...job, source: 'V2 Backtest', sourceKey: 'backtestScheduleQueue' })))
        }
      }
    } catch (error) {
      console.error('Failed to load V2 Backtest schedule queue', error)
    }

    // Load from V3 Backtest
    try {
      const v3Queue = localStorage.getItem('v3BacktestScheduleQueue')
      if (v3Queue) {
        const parsed = JSON.parse(v3Queue)
        if (Array.isArray(parsed)) {
          queues.push(...parsed.map(job => ({ ...job, source: 'V3 Backtest', sourceKey: 'v3BacktestScheduleQueue' })))
        }
      }
    } catch (error) {
      console.error('Failed to load V3 Backtest schedule queue', error)
    }

    // Load from Volume Screening
    try {
      const volumeQueue = localStorage.getItem('volumeScreeningScheduleQueue')
      if (volumeQueue) {
        const parsed = JSON.parse(volumeQueue)
        if (Array.isArray(parsed)) {
          queues.push(...parsed.map(job => ({ ...job, source: 'Volume Screening', sourceKey: 'volumeScreeningScheduleQueue' })))
        }
      }
    } catch (error) {
      console.error('Failed to load Volume Screening schedule queue', error)
    }

    setAllScheduleJobs(queues)
    return queues
  }

  const removeJobFromGlobalQueue = (job) => {
    try {
      const queueData = localStorage.getItem(job.sourceKey)
      if (queueData) {
        const queue = JSON.parse(queueData)
        const filtered = queue.filter(j => j.id !== job.id)
        localStorage.setItem(job.sourceKey, JSON.stringify(filtered))
        loadAllScheduleQueues()
      }
    } catch (error) {
      console.error('Failed to remove job from queue', error)
    }
  }

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

  // Load schedule queues on mount to show badge count
  useEffect(() => {
    loadAllScheduleQueues()
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

  // Handle clicking on chart icon to view in technical analysis with volume profile v2
  const handleAnalyzeWithVolProf = (symbol) => {
    setSelectedSymbol(symbol)
    setSelectedParams({ forceVolumeProfileV2: true })
    setActiveTab('analyze')
  }

  const handleVolumeBulkAdd = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return

    setVolumeImport({ entries, timestamp: Date.now() })
    setActiveTab('volume')
  }

  const handleFilterBulkAdd = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return

    setFilterImport({ entries, timestamp: Date.now() })
    setActiveTab('filtering')
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

        <div className="absolute right-0 top-0 flex items-center gap-2">
          <button
            onClick={() => {
              loadAllScheduleQueues()
              setShowGlobalQueueModal(true)
            }}
            className="flex items-center gap-1 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md px-2.5 py-1.5 shadow-md transition-colors relative"
            title="Show all scheduled jobs from all tabs"
            aria-label="Show all scheduled jobs"
          >
            <Database className="w-4 h-4" />
            Show Queue
            {allScheduleJobs.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {allScheduleJobs.length}
              </span>
            )}
          </button>
          <button
            onClick={exportLocalStorage}
            className="flex items-center gap-1 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md px-2.5 py-1.5 shadow-md transition-colors"
            title="Export LocalStorage contents"
            aria-label="Export LocalStorage contents"
          >
            <Bug className="w-4 h-4" />
            Debug export
          </button>
        </div>
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
              V2 Backtest
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
            <button
              onClick={() => setActiveTab('filtering')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'filtering'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900'
                  : 'text-slate-300 hover:text-purple-400 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-5 h-5" />
              Stock Filtering
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-0 md:p-6">
            {/* Keep all components mounted so cached volume data hydrates even before the tab is visible */}
            <div style={{ display: activeTab === 'analyze' ? 'block' : 'none' }}>
              <StockAnalyzer selectedSymbol={selectedSymbol} selectedParams={selectedParams} />
            </div>
            <div style={{ display: activeTab === 'backtest' ? 'block' : 'none' }}>
              <BacktestResults
                onStockSelect={handleStockSelect}
                onVolumeSelect={handleVolumeSelect}
                onVolumeBulkAdd={handleVolumeBulkAdd}
                triggerBacktest={backtestSymbol}
                onBacktestProcessed={() => setBacktestSymbol(null)}
              />
            </div>
            <div style={{ display: activeTab === 'v3backtest' ? 'block' : 'none' }}>
              <V3BacktestResults
                onStockSelect={handleStockSelect}
                onVolumeSelect={handleVolumeSelect}
                onVolumeBulkAdd={handleVolumeBulkAdd}
                onFilterBulkAdd={handleFilterBulkAdd}
                triggerBacktest={v3BacktestSymbol}
                onBacktestProcessed={() => setV3BacktestSymbol(null)}
              />
            </div>
            <div style={{ display: activeTab === 'volume' ? 'block' : 'none' }}>
              <VolumeScreening
                onStockSelect={handleStockSelect}
                triggerSymbol={volumeSymbol}
                onSymbolProcessed={() => setVolumeSymbol(null)}
                onBacktestSelect={handleBacktestSelect}
                onV3BacktestSelect={handleV3BacktestSelect}
                bulkImport={volumeImport}
                onImportProcessed={handleVolumeImportProcessed}
              />
            </div>
            <div style={{ display: activeTab === 'filtering' ? 'block' : 'none' }}>
              <StockFiltering
                onV3BacktestSelect={handleV3BacktestSelect}
                onAnalyzeWithVolProf={handleAnalyzeWithVolProf}
                onV2BacktestSelect={handleBacktestSelect}
                onVolumeBulkAdd={handleVolumeBulkAdd}
                bulkImport={filterImport}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-400 text-sm">
          <p>Data provided by Financial Modeling Prep | For educational purposes only</p>
        </div>
      </div>

      {/* Global Schedule Queue Modal */}
      {showGlobalQueueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 max-w-5xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-200">
                All Scheduled Jobs ({allScheduleJobs.length})
              </h3>
              <button
                onClick={() => setShowGlobalQueueModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {allScheduleJobs.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No scheduled jobs in queue</p>
                <p className="text-sm mt-1">Schedule jobs from Stock Filter, V2 Backtest, V3 Backtest, or Volume Screening tabs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allScheduleJobs
                  .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime))
                  .map((job) => {
                    const scheduledDate = new Date(job.scheduledTime)
                    const isPast = scheduledDate < new Date()

                    return (
                      <div
                        key={`${job.sourceKey}-${job.id}`}
                        className={`bg-slate-700/50 p-4 rounded-lg border ${
                          isPast ? 'border-yellow-600/50' : 'border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            {/* Source Badge */}
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600/30 border border-purple-500/50 rounded text-xs font-medium text-purple-300">
                                {job.source === 'Stock Filter' && <Filter className="w-3 h-3" />}
                                {job.source === 'V2 Backtest' && <BarChart3 className="w-3 h-3" />}
                                {job.source === 'V3 Backtest' && <Waves className="w-3 h-3" />}
                                {job.source === 'Volume Screening' && <Activity className="w-3 h-3" />}
                                {job.source}
                              </span>
                              <span className={`text-xs font-medium ${isPast ? 'text-yellow-400' : 'text-green-400'}`}>
                                <Clock className="w-3 h-3 inline mr-1" />
                                {scheduledDate.toLocaleString()}
                                {isPast && ' (Pending execution)'}
                              </span>
                            </div>

                            {/* Job Details */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              {/* Stock Filter specific */}
                              {job.market && (
                                <>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Market</div>
                                    <div className="text-white font-medium">{job.market}</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Period</div>
                                    <div className="text-white font-medium">{job.period}</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Threshold</div>
                                    <div className="text-white font-medium">{job.threshold}%</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Stock Limit</div>
                                    <div className="text-white font-medium">
                                      {job.stockLimit === -1 ? 'ALL' : job.stockLimit}
                                    </div>
                                  </div>
                                </>
                              )}

                              {/* V2/V3 Backtest specific */}
                              {job.days && (
                                <>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Period</div>
                                    <div className="text-white font-medium">
                                      {job.days >= 1825 ? '5Y' : job.days >= 730 ? '2Y' : job.days >= 365 ? '1Y' : `${job.days}D`}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-xs mb-1">Scan Limit</div>
                                    <div className="text-white font-medium">
                                      {job.scanLimit === -1 ? 'ALL' : job.scanLimit}
                                    </div>
                                  </div>
                                  {job.symbols && (
                                    <div>
                                      <div className="text-slate-400 text-xs mb-1">Symbols</div>
                                      <div className="text-white font-medium">
                                        {job.symbols.split(/[\n,;]+/).filter(s => s.trim()).length} stocks
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Volume Screening specific */}
                              {job.symbolsList && (
                                <div className="col-span-2">
                                  <div className="text-slate-400 text-xs mb-1">Symbols</div>
                                  <div className="text-white font-medium">
                                    {job.symbolsList.length} stocks
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => removeJobFromGlobalQueue(job)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                              title="Remove job"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-300">
                  Jobs will run automatically at their scheduled time. Keep this browser tab open for scheduled scans to execute.
                  Each job runs once and is removed from the queue after completion. To edit a job, delete it here and reschedule from the respective tab.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
