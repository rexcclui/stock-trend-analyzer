import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts'
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import RSIStrategyPanel from './RSIStrategyPanel'

function RSIChart({ indicators, prices, syncedMouseDate, setSyncedMouseDate, zoomRange, onZoomChange, onExtendPeriod }) {
  const chartRef = useRef(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [strategyParams, setStrategyParams] = useState({
    period: 14,
    overbought: 70,
    oversold: 30
  })
  const [simulationResult, setSimulationResult] = useState(null)

  // Ensure data is properly reversed and matches expected format (chronological - oldest first)
  const chartData = indicators.slice().reverse().map(ind => ({
    date: ind.date,
    rsi: ind.rsi,
  }))

  // Prepare price data in chronological order (oldest first) for strategy simulation
  const priceData = prices ? prices.slice().reverse().map(p => ({
    date: p.date,
    close: p.close
  })) : []

  // Apply zoom range to chart data
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // Create chart data with holding status for colored line segments
  const enhancedChartData = useMemo(() => {
    if (!simulationResult || !simulationResult.tradeDetails) {
      return visibleChartData.map(d => ({ ...d, holding: false }))
    }

    // Create a map of dates when we're holding
    const holdingDates = new Set()
    simulationResult.tradeDetails.forEach(trade => {
      // Find all dates between buy and sell
      let inTrade = false
      for (const dataPoint of visibleChartData) {
        if (dataPoint.date === trade.buyDate) {
          inTrade = true
        }
        if (inTrade) {
          holdingDates.add(dataPoint.date)
        }
        // For open trades, sellDate contains " (open)" so we check startsWith
        if (trade.sellDate && dataPoint.date === trade.sellDate.replace(' (open)', '')) {
          inTrade = false
        }
      }
    })

    return visibleChartData.map(d => ({
      ...d,
      holding: holdingDates.has(d.date),
      rsiHolding: holdingDates.has(d.date) ? d.rsi : null,
      rsiNotHolding: !holdingDates.has(d.date) ? d.rsi : null
    }))
  }, [visibleChartData, simulationResult])

  // Get buy/sell signal points for markers
  const buyPoints = useMemo(() => {
    if (!simulationResult?.buySignals) return []
    return simulationResult.buySignals.map(signal => ({
      date: signal.date,
      rsi: signal.rsi
    }))
  }, [simulationResult])

  const sellPoints = useMemo(() => {
    if (!simulationResult?.sellSignals) return []
    return simulationResult.sellSignals.map(signal => ({
      date: signal.date,
      rsi: signal.rsi
    }))
  }, [simulationResult])

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

  const handleParametersChange = useCallback((params) => {
    setStrategyParams(params)
  }, [])

  const handleSimulationResult = useCallback((result) => {
    setSimulationResult(result)
  }, [])

  // Custom dot renderer for buy signals
  const renderBuyDot = (props) => {
    const { cx, cy } = props
    if (cx === undefined || cy === undefined) return null
    return (
      <polygon
        points={`${cx},${cy - 8} ${cx - 6},${cy + 4} ${cx + 6},${cy + 4}`}
        fill="#10b981"
        stroke="#059669"
        strokeWidth={1}
      />
    )
  }

  // Custom dot renderer for sell signals
  const renderSellDot = (props) => {
    const { cx, cy } = props
    if (cx === undefined || cy === undefined) return null
    return (
      <polygon
        points={`${cx},${cy + 8} ${cx - 6},${cy - 4} ${cx + 6},${cy - 4}`}
        fill="#ef4444"
        stroke="#dc2626"
        strokeWidth={1}
      />
    )
  }

  return (
    <div ref={chartRef}>
      <h4 className="text-md font-semibold mb-2 text-slate-200">RSI (Relative Strength Index)</h4>
      <div className="relative">
        {/* Strategy Panel - positioned top left of chart */}
        <RSIStrategyPanel
          priceData={priceData}
          zoomRange={zoomRange}
          onParametersChange={handleParametersChange}
          onSimulationResult={handleSimulationResult}
        />

        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={enhancedChartData}
            margin={{ top: 5, right: 30, left: isMobile ? 0 : 20, bottom: 5 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              interval={Math.floor(enhancedChartData.length / 10)}
              stroke="#475569"
            />
            <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} stroke="#475569" width={isMobile ? 40 : 60} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }} />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <ReferenceLine
              y={strategyParams.overbought}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: `Overbought (${strategyParams.overbought})`, fill: '#94a3b8', fontSize: 11 }}
            />
            <ReferenceLine
              y={strategyParams.oversold}
              stroke="#10b981"
              strokeDasharray="3 3"
              label={{ value: `Oversold (${strategyParams.oversold})`, fill: '#94a3b8', fontSize: 11 }}
            />
            {syncedMouseDate && (
              <ReferenceLine
                x={syncedMouseDate}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {/* RSI line when NOT holding - purple */}
            <Line
              type="monotone"
              dataKey="rsiNotHolding"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="RSI"
              connectNulls={false}
            />
            {/* RSI line when holding - orange/yellow */}
            <Line
              type="monotone"
              dataKey="rsiHolding"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="RSI (holding)"
              connectNulls={false}
              legendType="none"
            />
            {/* Full RSI line for continuity (very thin, same as not holding) */}
            <Line
              type="monotone"
              dataKey="rsi"
              stroke="#8b5cf6"
              strokeWidth={0.5}
              strokeOpacity={0.3}
              dot={false}
              legendType="none"
            />
            {/* Buy signal markers */}
            {buyPoints.map((point, idx) => (
              <ReferenceDot
                key={`buy-${idx}`}
                x={point.date}
                y={point.rsi}
                shape={renderBuyDot}
              />
            ))}
            {/* Sell signal markers */}
            {sellPoints.map((point, idx) => (
              <ReferenceDot
                key={`sell-${idx}`}
                x={point.date}
                y={point.rsi}
                shape={renderSellDot}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default RSIChart
