import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate }) {
  // Combine data
  const chartData = prices.map((price, index) => {
    return {
      date: price.date,
      close: price.close,
    }
  }).reverse() // Show oldest to newest

  // Prepare signal markers
  const buySignals = signals
    .filter(s => s.type === 'BUY')
    .map(s => {
      const priceData = prices.find(p => p.date === s.date)
      return {
        date: s.date,
        price: s.price,
        close: priceData?.close || s.price,
        type: 'BUY'
      }
    })

  const sellSignals = signals
    .filter(s => s.type === 'SELL')
    .map(s => {
      const priceData = prices.find(p => p.date === s.date)
      return {
        date: s.date,
        price: s.price,
        close: priceData?.close || s.price,
        type: 'SELL'
      }
    })

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 p-3 border border-slate-600 rounded shadow-lg">
          <p className="font-semibold text-slate-100">{payload[0].payload.date}</p>
          <p className="text-sm text-slate-300">Close: ${payload[0].payload.close?.toFixed(2)}</p>
        </div>
      )
    }
    return null
  }

  const handleMouseMove = (e) => {
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
  }

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            interval={Math.floor(chartData.length / 10)}
            stroke="#475569"
          />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8' }} stroke="#475569" />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8' }} />
          {syncedMouseDate && (
            <ReferenceLine
              x={syncedMouseDate}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          <Line
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="Close Price"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Buy/Sell Markers */}
      <div className="flex gap-4 mt-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-sm text-slate-300">Buy Signals: {buySignals.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-sm text-slate-300">Sell Signals: {sellSignals.length}</span>
        </div>
      </div>
    </div>
  )
}

export default PriceChart
