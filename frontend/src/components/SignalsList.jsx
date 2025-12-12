import { TrendingUp, TrendingDown, Minus, Zap, Activity, BarChart3, Target } from 'lucide-react'

function SignalsList({ signals }) {
  if (!signals || signals.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No trading signals detected for this period.
      </div>
    )
  }

  const getSignalIcon = (type) => {
    switch (type) {
      case 'BUY':
        return <TrendingUp className="w-5 h-5 text-green-400" />
      case 'SELL':
        return <TrendingDown className="w-5 h-5 text-red-400" />
      default:
        return <Minus className="w-5 h-5 text-slate-400" />
    }
  }

  const getSignalColor = (type) => {
    switch (type) {
      case 'BUY':
        return 'bg-green-900/30 border-green-700 text-green-200'
      case 'SELL':
        return 'bg-red-900/30 border-red-700 text-red-200'
      default:
        return 'bg-slate-700/30 border-slate-600 text-slate-300'
    }
  }

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-400'
    if (confidence >= 0.6) return 'text-yellow-400'
    return 'text-orange-400'
  }

  const getSignalBadge = (signal) => {
    // Check if this is a volume breakthrough signal
    const isVolumeSignal = signal.reason?.includes('Volume Breakthrough')
    const isPotentialBreak = signal.reason?.includes('POTENTIAL BREAK')

    if (isPotentialBreak) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">
          <Zap className="w-3 h-3 mr-1" />
          BREAKTHROUGH
        </span>
      )
    }

    if (isVolumeSignal) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-600/80 text-white">
          <Activity className="w-3 h-3 mr-1" />
          Volume
        </span>
      )
    }

    return null
  }

  const getVolumeMetrics = (signal) => {
    // Parse volume metrics from signal reason
    // E.g., "Volume Breakthrough Up (3.2% weight, -8.1% drop)"
    const weightMatch = signal.reason?.match(/(\d+\.?\d*)% weight/)
    const dropMatch = signal.reason?.match(/([-+]?\d+\.?\d*)% drop/)

    if (!weightMatch && !dropMatch) return null

    return (
      <div className="flex gap-2 text-xs mt-2">
        {weightMatch && (
          <div className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3 text-slate-400" />
            <span className="text-slate-300">
              {weightMatch[1]}% volume weight
            </span>
          </div>
        )}
        {dropMatch && (
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-amber-400" />
            <span className={Number(dropMatch[1]) < 0 ? 'text-amber-300' : 'text-slate-300'}>
              {dropMatch[1]}% drop
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {signals.map((signal, index) => (
        <div
          key={index}
          className={`p-4 border rounded-lg ${getSignalColor(signal.type)} hover:scale-[1.01] transition-transform`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {getSignalIcon(signal.type)}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{signal.type}</span>
                  {getSignalBadge(signal)}
                  <span className="text-sm opacity-75">{signal.date}</span>
                </div>
                <p className="text-sm mt-1">{signal.reason}</p>
                {getVolumeMetrics(signal)}
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">${signal.price.toFixed(2)}</p>
              <p className={`text-xs flex items-center gap-1 justify-end ${getConfidenceColor(signal.confidence)}`}>
                <Target className="w-3 h-3" />
                {(signal.confidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SignalsList
