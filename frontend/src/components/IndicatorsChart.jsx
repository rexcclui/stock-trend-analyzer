import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

function IndicatorsChart({ indicators }) {
  const chartData = [...indicators].reverse().map(ind => ({
    date: ind.date,
    rsi: ind.rsi,
    macd: ind.macd,
    macdSignal: ind.macdSignal,
    macdHistogram: ind.macdHistogram,
  }))

  return (
    <div className="space-y-6">
      {/* RSI Chart */}
      <div>
        <h4 className="text-md font-semibold mb-2">RSI (Relative Strength Index)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              interval={Math.floor(chartData.length / 10)}
            />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <ReferenceLine y={70} stroke="red" strokeDasharray="3 3" label="Overbought" />
            <ReferenceLine y={30} stroke="green" strokeDasharray="3 3" label="Oversold" />
            <Line
              type="monotone"
              dataKey="rsi"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="RSI"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* MACD Chart */}
      <div>
        <h4 className="text-md font-semibold mb-2">MACD (Moving Average Convergence Divergence)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              interval={Math.floor(chartData.length / 10)}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <ReferenceLine y={0} stroke="gray" />
            <Line
              type="monotone"
              dataKey="macd"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="MACD"
            />
            <Line
              type="monotone"
              dataKey="macdSignal"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              name="Signal"
            />
            <Line
              type="monotone"
              dataKey="macdHistogram"
              stroke="#10b981"
              strokeWidth={1}
              dot={false}
              name="Histogram"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default IndicatorsChart
