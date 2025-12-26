import React from 'react'

/**
 * Custom component to render Volume Profile V3 - Windowed analysis with break detection
 * Displays volume profile bars with dynamic price ranges per window (15-20 zones based on data points / 15)
 * Detects breaks when ALL conditions are met:
 * - Volume weight < 10% AND 8% less than any of previous 5 zones
 * - Break up: previous high-volume zone has lower price than current zone
 * - Break up: no zones with higher volume in 5 zones above (clear upward path)
 * - Break down: previous high-volume zone has higher price than current zone
 * - Break down: no zones with higher volume in 5 zones below (clear downward path)
 * Shows break up/down arrows and resets window after break
 *
 * @param {Object} props - Component props
 * @param {boolean} props.volumeProfileV3Enabled - Whether volume profile V3 is enabled
 * @param {Array} props.volumeProfileV3Data - Volume profile data with windows and price zones
 * @param {Array} props.displayPrices - Price data for display
 * @param {Object} props.zoomRange - Current zoom range {start, end}
 * @param {Object} props.volV3HoveredBar - Currently hovered bar state
 * @param {Function} props.setVolV3HoveredBar - Setter for hovered bar state
 * @param {Array} props.volumeProfileV3Breaks - Break signals array
 * @param {Object} props.v3PL - P&L statistics for V3 trading strategy
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 * @param {Object} props.offset - Chart offset dimensions from recharts
 */
export const CustomVolumeProfileV3 = ({
  volumeProfileV3Enabled,
  volumeProfileV3Data,
  displayPrices,
  zoomRange,
  volV3HoveredBar,
  setVolV3HoveredBar,
  volumeProfileV3Breaks,
  v3PL,
  xAxisMap,
  yAxisMap,
  offset
}) => {
  const [hoveredSell, setHoveredSell] = React.useState(null)

  if (!volumeProfileV3Enabled || volumeProfileV3Data.length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  // Get visible data to create clip path excluding price line area
  const reversedDisplayPrices = [...displayPrices].reverse()
  const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

  // Create path for price line to use as clip exclusion
  const priceLinePath = visibleData.map((price, idx) => {
    const x = xAxis.scale(price.date)
    const y = yAxis.scale(price.close)
    return idx === 0 ? `M ${x},${y}` : `L ${x},${y}`
  }).join(' ')

  return (
    <g>
      <defs>
        {/* Define a clip path that excludes a buffer around the price line */}
        <clipPath id="volPrfV3-clip">
          <rect x={offset.left} y={offset.top} width={offset.width} height={offset.height} />
        </clipPath>

        {/* Mask that creates a buffer zone around the price line */}
        <mask id="volPrfV3-mask">
          {/* White rectangle = visible */}
          <rect x={offset.left} y={offset.top} width={offset.width} height={offset.height} fill="white" />
          {/* Black stroke along price line = hidden (4px buffer) */}
          <path d={priceLinePath} stroke="black" strokeWidth="4" fill="none" />
        </mask>
      </defs>

      <g clipPath="url(#volPrfV3-clip)" mask="url(#volPrfV3-mask)">
        {volumeProfileV3Data
          .filter((window, idx) => idx === volumeProfileV3Data.length - 1) // Only render the current/active window
          .map((window) => {
            const windowIdx = volumeProfileV3Data.length - 1 // Use actual window index for keys
            if (!window || !window.dataPoints || window.dataPoints.length === 0) return null

            return (
              <g key={`volume-profile-v3-window-${windowIdx}`}>
              {window.dataPoints.map((point, pointIdx) => {
                if (!point || !point.priceZones) return null

                // Get X position for this data point
                const pointX = xAxis.scale(point.date)
                if (pointX === undefined) return null

                // Calculate bar width (distance to next point or a small default)
                let barWidth = 3 // default width
                if (pointIdx < window.dataPoints.length - 1) {
                  const nextPointX = xAxis.scale(window.dataPoints[pointIdx + 1].date)
                  if (nextPointX !== undefined) {
                    barWidth = Math.abs(nextPointX - pointX)
                  }
                }

                return (
                  <g key={`volume-profile-v3-window-${windowIdx}-point-${pointIdx}`}>
                    {point.priceZones.map((zone, zoneIdx) => {
                      // Skip zones with no volume
                      if (zone.volumeWeight === 0) return null

                      // Calculate y positions based on price range
                      const yTop = yAxis.scale(zone.maxPrice)
                      const yBottom = yAxis.scale(zone.minPrice)
                      const height = Math.abs(yBottom - yTop)

                      // Normalize weight to reach max color at 25% (0.25)
                      const normalizedWeight = Math.min(1, zone.volumeWeight / 0.25)

                      // Map volume weight to Hue: 0 (Red) -> 240 (Blue)
                      const hue = Math.floor(normalizedWeight * 240)

                      // Saturation: Keep high for vivid colors
                      const saturation = 90 + (normalizedWeight * 10)

                      // Lightness: Red is brighter, Blue is darker
                      const lightness = 60 - (normalizedWeight * 30)

                      // Opacity
                      const opacity = 0.2 + (Math.pow(normalizedWeight, 0.5) * 0.75)

                      const isHovered = volV3HoveredBar?.windowIdx === windowIdx &&
                                       volV3HoveredBar?.pointIdx === pointIdx &&
                                       volV3HoveredBar?.zoneIdx === zoneIdx

                      return (
                        <rect
                          key={`volume-profile-v3-window-${windowIdx}-point-${pointIdx}-zone-${zoneIdx}`}
                          x={pointX - barWidth / 2}
                          y={yTop}
                          width={barWidth}
                          height={height}
                          fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                          stroke={isHovered ? '#10b981' : 'none'}
                          strokeWidth={isHovered ? 2 : 0}
                          opacity={isHovered ? Math.min(opacity + 0.2, 1) : opacity}
                          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                          onMouseEnter={() => {
                            setVolV3HoveredBar({
                              windowIdx,
                              pointIdx,
                              zoneIdx,
                              volumeWeight: zone.volumeWeight,
                              minPrice: zone.minPrice,
                              maxPrice: zone.maxPrice,
                              x: pointX,
                              y: yTop + height / 2
                            })
                          }}
                          onMouseLeave={() => {
                            setVolV3HoveredBar(null)
                          }}
                        />
                      )
                    })}
                  </g>
                )
              })}

              {/* Window boundary marker - show vertical line at start of window (except first window) */}
              {windowIdx > 0 && window.dataPoints.length > 0 && (() => {
                const windowStartDate = window.dataPoints[0]?.date
                const x = xAxis.scale(windowStartDate)
                if (x === undefined) return null

                return (
                  <g>
                    <line
                      x1={x}
                      y1={offset.top}
                      x2={x}
                      y2={offset.top + offset.height}
                      stroke="#9333ea"
                      strokeWidth={2}
                      strokeDasharray="8,4"
                      opacity={0.7}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={x + 5}
                      y={offset.top + 15}
                      fill="#9333ea"
                      fontSize="10"
                      fontWeight="700"
                      style={{ pointerEvents: 'none' }}
                    >
                      Window {windowIdx + 1}
                    </text>
                  </g>
                )
              })()}
            </g>
          )
        })}
      </g>

      {/* Tooltip for hovered bar */}
      {volV3HoveredBar && (
        <g>
          {(() => {
            const chartRightEdge = offset.left + offset.width
            const tooltipWidthEstimate = 170
            const prefersLeftSide = volV3HoveredBar.x + tooltipWidthEstimate > chartRightEdge

            const tooltipX = prefersLeftSide
              ? Math.max(offset.left + 8, volV3HoveredBar.x - 15)
              : volV3HoveredBar.x + 15
            const textAnchor = prefersLeftSide ? 'end' : 'start'

            return (
              <>
                <text
                  x={tooltipX}
                  y={volV3HoveredBar.y - 30}
                  fill="#10b981"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor={textAnchor}
                  style={{ pointerEvents: 'none' }}
                >
                  Vol % {(volV3HoveredBar.volumeWeight * 100).toFixed(1)}%
                </text>
                <text
                  x={tooltipX}
                  y={volV3HoveredBar.y - 15}
                  fill="#cbd5e1"
                  fontSize="11"
                  textAnchor={textAnchor}
                  style={{ pointerEvents: 'none' }}
                >
                  Px: ${volV3HoveredBar.minPrice.toFixed(2)} - ${volV3HoveredBar.maxPrice.toFixed(2)}
                </text>
              </>
            )
          })()}
        </g>
      )}

      {/* Buy signals - long green up arrows with B */}
      {v3PL?.buySignals?.map((signal, idx) => {
        const x = xAxis.scale(signal.date)
        const y = yAxis.scale(signal.price)

        if (x === undefined || y === undefined) return null

        return (
          <g key={`buy-arrow-${idx}`}>
            {/* Long vertical arrow line */}
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={y - 40}
              stroke="#10b981"
              strokeWidth={2}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            {/* Arrow head */}
            <path
              d={`M ${x},${y} L ${x - 6},${y - 10} L ${x + 6},${y - 10} Z`}
              fill="#10b981"
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            {/* B label at end */}
            <text
              x={x}
              y={y - 45}
              fill="#10b981"
              fontSize="16"
              fontWeight="bold"
              textAnchor="middle"
              stroke="white"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ pointerEvents: 'none' }}
            >
              B
            </text>
          </g>
        )
      })}

      {/* Sell signals - long down arrows with S (orange for cutoff, red for breakdown) */}
      {v3PL?.sellSignals?.map((signal, idx) => {
        const x = xAxis.scale(signal.date)
        const y = yAxis.scale(signal.price)

        if (x === undefined || y === undefined) return null

        // Cutoff sells are orange, breakdown sells are red
        const fillColor = signal.isCutoff ? "#f59e0b" : "#ef4444"
        const isHovered = hoveredSell === idx

        return (
          <g key={`sell-arrow-${idx}`}>
            {/* Long vertical arrow line */}
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={y + 40}
              stroke={fillColor}
              strokeWidth={2}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            {/* Arrow head */}
            <path
              d={`M ${x},${y} L ${x - 6},${y + 10} L ${x + 6},${y + 10} Z`}
              fill={fillColor}
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            {/* S label at end */}
            <text
              x={x}
              y={y + 55}
              fill={fillColor}
              fontSize="16"
              fontWeight="bold"
              textAnchor="middle"
              stroke="white"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ pointerEvents: 'none' }}
            >
              S
            </text>
            {/* Large invisible hover area covering entire arrow and label */}
            <rect
              x={x - 50}
              y={y - 10}
              width={100}
              height={80}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'help' }}
              onMouseEnter={() => setHoveredSell(idx)}
              onMouseLeave={() => setHoveredSell(null)}
            />
            {/* Tooltip on hover */}
            {isHovered && signal.reason && (() => {
              // Position tooltip to the left if near right edge
              const chartRightEdge = offset.left + offset.width
              const tooltipWidth = Math.max(200, signal.reason.length * 6)
              const showLeft = x + tooltipWidth + 30 > chartRightEdge

              const tooltipX = showLeft ? x - tooltipWidth - 10 : x + 25
              const tooltipTextX = showLeft ? tooltipX + 5 : x + 30

              return (
                <g>
                  <rect
                    x={tooltipX}
                    y={y + 25}
                    width={tooltipWidth}
                    height={40}
                    fill="rgba(0, 0, 0, 0.95)"
                    stroke={fillColor}
                    strokeWidth={2}
                    rx={5}
                    style={{ pointerEvents: 'none' }}
                  />
                  <text
                    x={tooltipTextX}
                    y={y + 45}
                    fill="white"
                    fontSize="13"
                    fontWeight="600"
                    textAnchor="start"
                    style={{ pointerEvents: 'none' }}
                  >
                    {signal.reason}
                  </text>
                </g>
              )
            })()}
          </g>
        )
      })}

      {/* Support line - separate segments per trade showing trailing stop (cutoff price) */}
      {v3PL?.cutoffPrices && v3PL.cutoffPrices.length > 0 && (() => {
        // Group cutoff points by tradeId
        const tradeSegments = {}
        v3PL.cutoffPrices.forEach(point => {
          const tradeId = point.tradeId || 0
          if (!tradeSegments[tradeId]) {
            tradeSegments[tradeId] = []
          }
          tradeSegments[tradeId].push(point)
        })

        return (
          <g>
            {/* Render each trade's support line separately */}
            {Object.entries(tradeSegments).map(([tradeId, points]) => {
              const pathSegments = []

              for (let i = 0; i < points.length; i++) {
                const point = points[i]
                const x = xAxis.scale(point.date)
                const y = yAxis.scale(point.price)

                if (x === undefined || y === undefined) continue

                if (i === 0) {
                  pathSegments.push(`M ${x},${y}`)
                } else {
                  // Draw horizontal line from previous point, then vertical to current point
                  const prevPoint = points[i - 1]
                  const prevX = xAxis.scale(prevPoint.date)
                  const prevY = yAxis.scale(prevPoint.price)

                  if (prevX !== undefined && prevY !== undefined) {
                    // Horizontal line at previous price level until current date
                    pathSegments.push(`L ${x},${prevY}`)
                    // Vertical line to current price level (support update)
                    pathSegments.push(`L ${x},${y}`)
                  }
                }
              }

              const pathD = pathSegments.join(' ')

              return (
                <path
                  key={`support-line-${tradeId}`}
                  d={pathD}
                  stroke="#FFD700"
                  strokeWidth={2}
                  fill="none"
                  opacity={0.8}
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Mark support update points with small circles and ATH resets with vertical lines */}
            {v3PL.supportUpdates?.map((update, idx) => {
              const x = xAxis.scale(update.date)
              const y = yAxis.scale(update.price)

              if (x === undefined || y === undefined) return null

              const isATHReset = update.reason?.includes('All-time high')

              return (
                <g key={`support-mark-${idx}`}>
                  {/* Vertical line for ATH window resets */}
                  {isATHReset && (
                    <line
                      x1={x}
                      y1={offset.top}
                      x2={x}
                      y2={offset.top + offset.height}
                      stroke="#FFD700"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                      opacity={0.6}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {/* Circle marker */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isATHReset ? 4 : 2}
                    fill="#FFD700"
                    stroke="white"
                    strokeWidth={isATHReset ? 3 : 2}
                    opacity={1}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Label for ATH resets */}
                  {isATHReset && (
                    <text
                      x={x}
                      y={offset.top - 5}
                      fill="#FFD700"
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      ATH Reset
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })()}

      {/* P&L Stats Display */}
      {volumeProfileV3Enabled && v3PL && v3PL.tradingSignals > 0 && (() => {
        // Determine trend direction from visible prices
        const reversedDisplayPrices = [...displayPrices].reverse()
        const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

        const isDowntrend = visibleData.length > 0 &&
          visibleData[0].close > visibleData[visibleData.length - 1].close

        // Position at bottom left if downtrend, top left if uptrend
        const xPos = offset.left + 10
        const textAnchor = 'start'

        // For downtrend: position at bottom-left (top-right to bottom-left diagonal)
        // For uptrend: position at top-left
        const yPos1 = isDowntrend ? offset.top + offset.height - 54 : offset.top + 20
        const yPos2 = isDowntrend ? offset.top + offset.height - 36 : offset.top + 38
        const yPos3 = isDowntrend ? offset.top + offset.height - 20 : offset.top + 54

        return (
          <g>
            <text
              x={xPos}
              y={yPos1}
              fill={v3PL.totalPL >= 0 ? '#10b981' : '#ef4444'}
              fontSize="14"
              fontWeight="700"
              textAnchor={textAnchor}
              style={{ pointerEvents: 'none' }}
            >
              V3 P&L: {v3PL.totalPL >= 0 ? '+' : ''}{v3PL.totalPL.toFixed(2)}%
            </text>
            <text
              x={xPos}
              y={yPos2}
              fill="#6ee7b7"
              fontSize="11"
              textAnchor={textAnchor}
              style={{ pointerEvents: 'none' }}
            >
              Signals: {v3PL.tradingSignals.toFixed(1)} | Win: {v3PL.winRate.toFixed(1)}%
            </text>
            <text
              x={xPos}
              y={yPos3}
              fill={v3PL.marketChange >= 0 ? '#6ee7b7' : '#ef4444'}
              fontSize="10"
              textAnchor={textAnchor}
              style={{ pointerEvents: 'none' }}
            >
              Market: {v3PL.marketChange >= 0 ? '+' : ''}{v3PL.marketChange.toFixed(2)}% | α: {((v3PL.totalPL - v3PL.marketChange) >= 0 ? '+' : '')}{(v3PL.totalPL - v3PL.marketChange).toFixed(2)}%
            </text>
          </g>
        )
      })()}
    </g>
  )
}
