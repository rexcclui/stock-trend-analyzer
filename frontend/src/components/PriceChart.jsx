import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, chartHeight = 400, days = '365' }) {
  const [zoomRange, setZoomRange] = useState({ start: 0, end: null })
  const chartContainerRef = useRef(null)

  // Reset zoom when prices change
  useEffect(() => {
    setZoomRange({ start: 0, end: null })
  }, [prices.length])

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

  // Apply zoom range to chart data
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // Handle mouse wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY
    const zoomFactor = 0.1 // 10% zoom per scroll
    const currentRange = endIndex - zoomRange.start
    const zoomAmount = Math.max(1, Math.floor(currentRange * zoomFactor))

    if (delta < 0) {
      // Scroll up - Zoom in (show less data)
      const newRange = Math.max(10, currentRange - zoomAmount)
      const reduction = currentRange - newRange
      const newStart = Math.min(chartData.length - newRange, zoomRange.start + Math.floor(reduction / 2))
      const newEnd = Math.min(chartData.length, newStart + newRange)
      setZoomRange({ start: newStart, end: newEnd })
    } else {
      // Scroll down - Zoom out (show more data)
      const newRange = Math.min(chartData.length, currentRange + zoomAmount)
      const expansion = newRange - currentRange
      const newStart = Math.max(0, zoomRange.start - Math.floor(expansion / 2))
      const newEnd = Math.min(chartData.length, newStart + newRange)

      // If we've reached full view, set end to null
      if (newStart === 0 && newEnd === chartData.length) {
        setZoomRange({ start: 0, end: null })
      } else {
        setZoomRange({ start: newStart, end: newEnd })
      }
    }
  }

  // Add wheel event listener
  useEffect(() => {
    const chartElement = chartContainerRef.current
    if (chartElement) {
      chartElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        chartElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [zoomRange, chartData.length])

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

  const CustomXAxisTick = ({ x, y, payload, index }) => {
    const currentDate = payload.value
    const isLongPeriod = parseInt(days) >= 1095 // 3Y or more
    const isShortPeriod = parseInt(days) < 365 // Less than 1Y

    let color = '#94a3b8' // Default color

    if (index > 0 && currentDate) {
      // Find the current data point index
      const currentDataIndex = visibleChartData.findIndex(d => d.date === currentDate)

      if (currentDataIndex > 0) {
        const prevDate = visibleChartData[currentDataIndex - 1]?.date

        if (prevDate) {
          const current = new Date(currentDate)
          const previous = new Date(prevDate)

          if (isLongPeriod) {
            // For >= 3Y, change color when year changes
            if (current.getFullYear() !== previous.getFullYear()) {
              color = '#3b82f6' // Blue for year change
            }
          } else if (isShortPeriod) {
            // For < 1Y, change color when month changes
            if (current.getMonth() !== previous.getMonth()) {
              color = '#10b981' // Green for month change
            }
          }
        }
      }
    }

    return (
      <text
        x={x}
        y={y}
        dy={16}
        textAnchor="middle"
        fill={color}
        fontSize={12}
      >
        {currentDate}
      </text>
    )
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
    <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight }}>
      <ResponsiveContainer>
        <LineChart
          data={visibleChartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="date"
            tick={<CustomXAxisTick />}
            interval={Math.floor(visibleChartData.length / 10)}
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
