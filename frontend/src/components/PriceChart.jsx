import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { X } from 'lucide-react'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma }) {
  // Calculate SMA for a given period
  const calculateSMA = (data, period) => {
    const smaData = []
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        smaData.push(null)
      } else {
        let sum = 0
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close
        }
        smaData.push(sum / period)
      }
    }
    return smaData
  }

  // Pre-calculate all SMAs
  const smaCache = {}
  smaPeriods.forEach(period => {
    smaCache[period] = calculateSMA(prices, period)
  })

  // Combine data
  const chartData = prices.map((price, index) => {
    const indicator = indicators[index] || {}
    const dataPoint = {
      date: price.date,
      close: price.close,
    }

    // Add SMA data for each period
    smaPeriods.forEach(period => {
      const smaKey = `sma${period}`
      // Try backend data first, fall back to frontend calculation
      dataPoint[smaKey] = indicator[smaKey] || smaCache[period][index]
    })

    return dataPoint
  }).reverse() // Show oldest to newest

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-slate-800 p-3 border border-slate-600 rounded shadow-lg">
          <p className="font-semibold text-slate-100">{data.date}</p>
          <p className="text-sm text-slate-300">Close: ${data.close?.toFixed(2)}</p>
          {smaPeriods.map(period => {
            const smaKey = `sma${period}`
            const smaValue = data[smaKey]
            if (smaValue && smaVisibility[period]) {
              return (
                <p key={period} className="text-sm" style={{ color: getSmaColor(period) }}>
                  SMA{period}: ${smaValue.toFixed(2)}
                </p>
              )
            }
            return null
          })}
        </div>
      )
    }
    return null
  }

  const getSmaColor = (period) => {
    const colors = ['#3b82f6', '#f97316', '#10b981', '#f59e0b', '#ec4899']
    const index = smaPeriods.indexOf(period) % colors.length
    return colors[index]
  }

  const handleMouseMove = (e) => {
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
  }

  const CustomLegend = ({ payload }) => {
    return (
      <div className="flex justify-center gap-4 mt-2 flex-wrap">
        {payload.map((entry, index) => {
          const isSma = entry.dataKey.startsWith('sma')
          const period = isSma ? parseInt(entry.dataKey.replace('sma', '')) : null
          const isVisible = isSma ? smaVisibility[period] : true

          return (
            <div
              key={`item-${index}`}
              className="flex items-center gap-2 px-2 py-1 rounded transition-all"
            >
              <button
                onClick={() => {
                  if (isSma && onToggleSma) {
                    onToggleSma(period)
                  }
                }}
                className={`flex items-center gap-2 ${
                  isSma ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
                disabled={!isSma}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: entry.color,
                    borderRadius: '50%',
                    opacity: isVisible ? 1 : 0.3
                  }}
                />
                <span className={`text-sm text-slate-300 ${!isVisible ? 'line-through opacity-50' : ''}`}>
                  {entry.value}
                </span>
              </button>
              {isSma && onDeleteSma && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSma(period)
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Delete SMA line"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
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
          <Legend content={<CustomLegend />} />
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
          {smaPeriods.map((period, index) => {
            const smaKey = `sma${period}`
            const isVisible = smaVisibility[period]

            return (
              <Line
                key={smaKey}
                type="monotone"
                dataKey={smaKey}
                stroke={getSmaColor(period)}
                strokeWidth={1.5}
                dot={false}
                name={`SMA ${period}`}
                strokeDasharray="5 5"
                hide={!isVisible}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default PriceChart
