import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter, ScatterChart, ZAxis } from 'recharts'

function PriceChart({ prices, indicators, signals }) {
  // Combine data
  const chartData = prices.map((price, index) => {
    const indicator = indicators[index] || {}
    return {
      date: price.date,
      close: price.close,
      sma20: indicator.sma20 || null,
      sma50: indicator.sma50 || null,
      sma200: indicator.sma200 || null,
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
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold">{payload[0].payload.date}</p>
          <p className="text-sm text-gray-600">Close: ${payload[0].payload.close?.toFixed(2)}</p>
          {payload[0].payload.sma20 && (
            <p className="text-sm text-blue-600">SMA20: ${payload[0].payload.sma20.toFixed(2)}</p>
          )}
          {payload[0].payload.sma50 && (
            <p className="text-sm text-orange-600">SMA50: ${payload[0].payload.sma50.toFixed(2)}</p>
          )}
          {payload[0].payload.sma200 && (
            <p className="text-sm text-purple-600">SMA200: ${payload[0].payload.sma200.toFixed(2)}</p>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            interval={Math.floor(chartData.length / 10)}
          />
          <YAxis domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="Close Price"
          />
          <Line
            type="monotone"
            dataKey="sma20"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            name="SMA 20"
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="sma50"
            stroke="#f97316"
            strokeWidth={1.5}
            dot={false}
            name="SMA 50"
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="sma200"
            stroke="#a855f7"
            strokeWidth={1.5}
            dot={false}
            name="SMA 200"
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Buy/Sell Markers */}
      <div className="flex gap-4 mt-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-600">Buy Signals: {buySignals.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-sm text-gray-600">Sell Signals: {sellSignals.length}</span>
        </div>
      </div>
    </div>
  )
}

export default PriceChart
