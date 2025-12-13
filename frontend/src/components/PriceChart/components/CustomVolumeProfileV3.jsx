import React from 'react'

/**
 * Custom component to render Volume Profile V3 - Windowed analysis with break detection
 * Displays volume profile bars with 10 price ranges per window
 * Detects breaks when volume weight < 10% and 8% less than previous slot
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
        {volumeProfileV3Data.map((window, windowIdx) => {
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

      {/* Buy signals - green up arrows */}
      {v3PL?.buySignals?.map((signal, idx) => {
        const x = xAxis.scale(signal.date)
        const y = yAxis.scale(signal.price)

        if (x === undefined || y === undefined) return null

        return (
          <g key={`buy-arrow-${idx}`} transform={`translate(${x}, ${y})`}>
            <path
              d="M 0,-8 L 6,0 L -6,0 Z"
              fill="#10b981"
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}

      {/* Sell signals - red down arrows (breakdown) and orange (stop-loss) */}
      {v3PL?.sellSignals?.map((signal, idx) => {
        const x = xAxis.scale(signal.date)
        const y = yAxis.scale(signal.price)

        if (x === undefined || y === undefined) return null

        // Stop-loss sells are orange, breakdown sells are red
        const fillColor = signal.isStopLoss ? "#f59e0b" : "#ef4444"

        return (
          <g key={`sell-arrow-${idx}`} transform={`translate(${x}, ${y})`}>
            <path
              d="M 0,8 L 6,0 L -6,0 Z"
              fill={fillColor}
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}

      {/* P&L Stats Display */}
      {volumeProfileV3Enabled && v3PL && v3PL.tradingSignals > 0 && (
        <g>
          <text
            x={offset.left + 10}
            y={offset.top + 20}
            fill={v3PL.totalPL >= 0 ? '#10b981' : '#ef4444'}
            fontSize="14"
            fontWeight="700"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            V3 P&L: {v3PL.totalPL >= 0 ? '+' : ''}{v3PL.totalPL.toFixed(2)}%
          </text>
          <text
            x={offset.left + 10}
            y={offset.top + 38}
            fill="#6ee7b7"
            fontSize="11"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            Signals: {v3PL.tradingSignals.toFixed(1)} | Win: {v3PL.winRate.toFixed(1)}%
          </text>
          <text
            x={offset.left + 10}
            y={offset.top + 54}
            fill="#6ee7b7"
            fontSize="10"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            Market: {v3PL.marketChange >= 0 ? '+' : ''}{v3PL.marketChange.toFixed(2)}% | α: {((v3PL.totalPL - v3PL.marketChange) >= 0 ? '+' : '')}{(v3PL.totalPL - v3PL.marketChange).toFixed(2)}%
          </text>
        </g>
      )}
    </g>
  )
}
