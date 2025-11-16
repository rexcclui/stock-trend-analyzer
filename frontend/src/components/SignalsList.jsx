import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

function SignalsList({ signals }) {
  if (!signals || signals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No trading signals detected for this period.
      </div>
    )
  }

  const getSignalIcon = (type) => {
    switch (type) {
      case 'BUY':
        return <TrendingUp className="w-5 h-5 text-green-600" />
      case 'SELL':
        return <TrendingDown className="w-5 h-5 text-red-600" />
      default:
        return <Minus className="w-5 h-5 text-gray-600" />
    }
  }

  const getSignalColor = (type) => {
    switch (type) {
      case 'BUY':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'SELL':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-orange-600'
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
