import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {signals.map((signal, index) => (
        <div
          key={index}
          className={`p-4 border rounded-lg ${getSignalColor(signal.type)} flex items-center justify-between`}
        >
          <div className="flex items-center gap-3 flex-1">
            {getSignalIcon(signal.type)}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{signal.type}</span>
                <span className="text-sm opacity-75">{signal.date}</span>
              </div>
              <p className="text-sm mt-1">{signal.reason}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold">${signal.price.toFixed(2)}</p>
            <p className={`text-xs ${getConfidenceColor(signal.confidence)}`}>
              {(signal.confidence * 100).toFixed(0)}% confidence
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SignalsList
