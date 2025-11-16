import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useRef, useEffect, useCallback } from 'react'

function RSIChart({ indicators, syncedMouseDate, setSyncedMouseDate, zoomRange, onZoomChange, onExtendPeriod }) {
  const chartRef = useRef(null)

  const chartData = [...indicators].reverse().map(ind => ({
    date: ind.date,
    rsi: ind.rsi,
  }))

  // Apply zoom range to chart data
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    if (!onZoomChange) return

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
      onZoomChange({ start: newStart, end: newEnd })
    } else {
      // Scroll down - Zoom out (show more data)
      // Check if already at full zoom
      const isFullyZoomedOut = zoomRange.start === 0 && (zoomRange.end === null || zoomRange.end === chartData.length)

      if (isFullyZoomedOut) {
        // Try to extend to next time period
        if (onExtendPeriod) {
          onExtendPeriod()
        }
      } else {
        const newRange = Math.min(chartData.length, currentRange + zoomAmount)
        const expansion = newRange - currentRange
        const newStart = Math.max(0, zoomRange.start - Math.floor(expansion / 2))
        const newEnd = Math.min(chartData.length, newStart + newRange)

        // If we've reached full view, set end to null
        if (newStart === 0 && newEnd === chartData.length) {
          onZoomChange({ start: 0, end: null })
        } else {
          onZoomChange({ start: newStart, end: newEnd })
        }
      }
    }
  }, [zoomRange, chartData.length, onZoomChange, onExtendPeriod])

  // Add wheel event listener
  useEffect(() => {
    const chartElement = chartRef.current
    if (chartElement) {
      chartElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        chartElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [handleWheel])

  const handleMouseMove = (e) => {
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
  }

  return (
    <div ref={chartRef}>
      <h4 className="text-md font-semibold mb-2 text-slate-200">RSI (Relative Strength Index)</h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={visibleChartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            interval={Math.floor(visibleChartData.length / 10)}
            stroke="#475569"
          />
          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8' }} stroke="#475569" />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }} />
          <Legend wrapperStyle={{ color: '#94a3b8' }} />
          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Overbought", fill: '#94a3b8' }} />
          <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Oversold", fill: '#94a3b8' }} />
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
            dataKey="rsi"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="RSI"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default RSIChart
