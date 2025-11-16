import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

function IndicatorsChart({ indicators, showRSI = true, showMACD = true }) {
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
      {showRSI && <div>
        <h4 className="text-md font-semibold mb-2 text-slate-200">RSI (Relative Strength Index)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              interval={Math.floor(chartData.length / 10)}
              stroke="#475569"
            />
            <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8' }} stroke="#475569" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }} />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Overbought", fill: '#94a3b8' }} />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Oversold", fill: '#94a3b8' }} />
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
      </div>}

      {/* MACD Chart */}
      {showMACD && <div>
        <h4 className="text-md font-semibold mb-2 text-slate-200">MACD (Moving Average Convergence Divergence)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              interval={Math.floor(chartData.length / 10)}
              stroke="#475569"
            />
            <YAxis tick={{ fill: '#94a3b8' }} stroke="#475569" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }} />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <ReferenceLine y={0} stroke="#64748b" />
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
      </div>}
    </div>
  )
}

export default IndicatorsChart
