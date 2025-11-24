import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useRef, useEffect, useCallback, useState } from 'react'

function RSIChart({ indicators, syncedMouseDate, setSyncedMouseDate, zoomRange, onZoomChange, onExtendPeriod }) {
  const chartRef = useRef(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Ensure data is properly reversed and matches expected format
  const chartData = indicators.slice().reverse().map(ind => ({
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

    // Calculate cursor position for cursor-anchored zoom
    let cursorRatio = 0.5 // Default to center if we can't determine cursor position
    const chartElement = chartRef.current
    if (chartElement) {
      const rect = chartElement.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const chartWidth = rect.width
      if (chartWidth > 0) {
        // Calculate cursor position as ratio (0.0 = left edge, 1.0 = right edge)
        cursorRatio = Math.max(0, Math.min(1, mouseX / chartWidth))
      }
    }

    if (delta < 0) {
      // Scroll up - Zoom in (show less data)
      const newRange = Math.max(10, currentRange - zoomAmount)

      // Calculate the data index under cursor before zoom
      const cursorDataIndex = zoomRange.start + (cursorRatio * currentRange)

      // Calculate new start so cursor stays at same position
      let newStart = Math.round(cursorDataIndex - (cursorRatio * newRange))
      newStart = Math.max(0, Math.min(chartData.length - newRange, newStart))

      const newEnd = Math.min(chartData.length, newStart + newRange)
      onZoomChange({ start: newStart, end: newEnd })
    } else {
      // Scroll down - Zoom out (show more data)
      // Check if already at full zoom with a small tolerance
      const isAtStart = zoomRange.start === 0
      const isAtEnd = zoomRange.end === null || Math.abs(zoomRange.end - chartData.length) <= 1
      const isFullyZoomedOut = isAtStart && isAtEnd && currentRange >= chartData.length - 2

      if (isFullyZoomedOut && onExtendPeriod) {
        // Only extend if we're truly showing all available data
        onExtendPeriod()
      } else {
        const newRange = Math.min(chartData.length, currentRange + zoomAmount)

        // Calculate the data index under cursor before zoom
        const cursorDataIndex = zoomRange.start + (cursorRatio * currentRange)

        // Calculate new start so cursor stays at same position
        let newStart = Math.round(cursorDataIndex - (cursorRatio * newRange))
        newStart = Math.max(0, newStart)

        let newEnd = Math.min(chartData.length, newStart + newRange)

        // Adjust if we hit the right boundary
        if (newEnd === chartData.length && newRange < chartData.length) {
          newStart = chartData.length - newRange
        }

        // If we've reached full view, set end to null
        if (newStart === 0 && newEnd === chartData.length) {
          onZoomChange({ start: 0, end: null })
        } else {
          onZoomChange({ start: newStart, end: newEnd })
        }
      }
    }
  }, [zoomRange, chartData.length, onZoomChange, onExtendPeriod, chartRef])

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

  // Track window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
          margin={{ top: 5, right: 30, left: isMobile ? 0 : 20, bottom: 5 }}
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
          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} stroke="#475569" width={isMobile ? 40 : 60} />
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
